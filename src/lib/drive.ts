import { google } from "googleapis";
import { Readable } from "node:stream";

/**
 * Google Drive access via a service account.
 *
 * The portal never stores a copy of a file — it stores the Drive file ID and
 * fetches the live bytes on each request. Editing the file in Drive is
 * therefore reflected immediately, with no sync step.
 *
 * Files stay fully private in Drive: they are shared only with the service
 * account, so there is no public URL. Access is gated by RLS-checked project
 * membership before this module is ever called.
 *
 * One service account serves every project folder — which folder a project
 * reads comes from that project's own `drive_folder_id` column, never from
 * an environment variable. A single CVF-style env var would mean one deploy
 * could only ever serve one church.
 */

// Google-native files can't be downloaded directly; they must be exported.
const EXPORT_AS: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": {
    mime: "application/pdf",
    ext: "pdf",
  },
  "application/vnd.google-apps.presentation": {
    mime: "application/pdf",
    ext: "pdf",
  },
  "application/vnd.google-apps.drawing": {
    mime: "application/pdf",
    ext: "pdf",
  },
  "application/vnd.google-apps.spreadsheet": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: "xlsx",
  },
};

export function isDriveConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
}

function getDriveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set");
  }

  let credentials: { client_email: string; private_key: string };
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON — paste the whole service account key file as one line"
    );
  }

  // Env vars often arrive with the private key's newlines escaped.
  if (credentials.private_key?.includes("\\n")) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  return google.drive({ version: "v3", auth });
}

export type DriveFile = {
  /** Web stream, so large files aren't buffered in the function's memory. */
  body: ReadableStream;
  mimeType: string;
  filename: string;
};

/**
 * Fetch the current contents of a Drive file as a stream.
 *
 * Streaming matters here: buffering the whole file would blow past the
 * serverless response-body limit on anything large. Streamed responses
 * aren't subject to that cap.
 *
 * Google Docs/Slides/Sheets are exported (Docs and Slides to PDF); everything
 * else is passed through untouched.
 */
export async function fetchDriveFile(fileId: string): Promise<DriveFile> {
  const drive = getDriveClient();

  const meta = await drive.files.get({
    fileId,
    fields: "name,mimeType",
    supportsAllDrives: true,
  });

  const sourceMime = meta.data.mimeType || "application/octet-stream";
  const name = meta.data.name || "download";
  const exportTarget = EXPORT_AS[sourceMime];

  if (exportTarget) {
    const res = await drive.files.export(
      { fileId, mimeType: exportTarget.mime },
      { responseType: "stream" }
    );

    return {
      body: Readable.toWeb(res.data as Readable) as ReadableStream,
      mimeType: exportTarget.mime,
      filename: `${name}.${exportTarget.ext}`,
    };
  }

  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "stream" }
  );

  return {
    body: Readable.toWeb(res.data as Readable) as ReadableStream,
    mimeType: sourceMime,
    filename: name,
  };
}

export { extractDriveId } from "./drive-id";

export type DriveListedFile = {
  id: string;
  name: string;
  /** Display title: extension removed. */
  title: string;
  /** The leading "01" / "03.1", split out so the UI can style it. */
  num: string | null;
  /** Title without the leading number. */
  label: string;
  mimeType: string;
  sizeBytes: number | null;
  modifiedTime: string | null;
  /** Sort key taken from a leading number in the filename, if present. */
  order: number;
};

export type DriveFolderGroup = {
  id: string;
  name: string;
  order: number;
  files: DriveListedFile[];
};

const FOLDER_MIME = "application/vnd.google-apps.folder";

function leadingNumber(name: string): number {
  const m = name.match(/^\s*(\d+)/);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
}

function toTitle(filename: string): string {
  return filename.replace(/\.[a-z0-9]{1,5}$/i, "").trim();
}

/**
 * The "01" / "03.1" prefix, split out so it can be styled separately.
 *
 * The separator goes with the number, not the label. Files are named two
 * ways in these folders — "01 Welcome.pdf" and "01 - Funnel Fusion
 * Handouts.pdf" — and keeping the dash left the second rendering as
 * "- Funnel Fusion Handouts" once the number was pulled out to its own
 * element.
 */
function splitNumber(title: string): { num: string | null; rest: string } {
  const m = title.match(/^\s*(\d+(?:\.\d+)?)\s*[-–—]?\s*(.*)$/);
  if (!m || !m[2]) return { num: null, rest: title };
  return { num: m[1], rest: m[2] };
}

/**
 * True for the timestamped export twins Drive accumulates
 * ("Session Notes 10.34.07 AM.pdf").
 */
function isTimestampedExport(name: string): boolean {
  return /\d{1,2}\.\d{2}\.\d{2}\s*(AM|PM)\.[a-z0-9]+$/i.test(name);
}

/**
 * Read a project's Drive folder and return it grouped by subfolder.
 *
 * This IS the file list for that project — the portal keeps no copy, so
 * whatever is in Drive is what its members see. Adding, renaming, or
 * removing a file in Drive needs no action here. `rootId` comes from
 * `projects.drive_folder_id`; there is no environment-level default.
 */
export async function listDriveFolder(rootId: string): Promise<DriveFolderGroup[]> {
  const drive = getDriveClient();

  // Walk the tree with scoped queries, one level at a time.
  //
  // Two approaches were tried against the real folder and both failed in
  // ways that produce an EMPTY LIBRARY WITH A 200 OK and nothing logged,
  // which is why this is spelled out:
  //
  //  1. A flat `q: "trashed = false"` (what the CVF portal does) defaults to
  //     corpora='user' — My Drive plus explicitly-shared items. It does not
  //     span a shared drive even with includeItemsFromAllDrives. Against
  //     this folder it returned 194 unrelated files and zero children of the
  //     root, at the same moment a scoped query returned the 10 real ones.
  //
  //  2. Adding corpora='drive' + driveId fixes the corpus but throws
  //     "The attempted action requires shared drive membership" — the
  //     service account has been shared this FOLDER, it is not a MEMBER of
  //     the RunFree Team shared drive. Making it a member is an
  //     administrative change nobody should need for a read-only portal.
  //
  // So: `'<id>' in parents`, which works on a per-folder grant, applied
  // breadth-first. Drive has no recursive form of it, which is exactly why
  // scoping a single query to the root would silently drop every nested
  // module — the failure the CVF portal's own notes warn about. Walking is
  // that warning's actual answer.
  //
  // Depth is bounded because a cycle in Drive is impossible but a
  // mis-shared folder tree could still be enormous, and an unbounded walk
  // inside a request is how a page hangs instead of failing.
  const all: {
    id: string;
    name: string;
    mimeType: string;
    parents?: string[];
    size?: string;
    modifiedTime?: string;
  }[] = [];

  const MAX_DEPTH = 3; // root > module folder > nested group. Deeper is not used.
  const seen = new Set<string>([rootId]);
  let frontier = [rootId];

  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth++) {
    const next: string[] = [];

    // One query per folder, deliberately NOT batched with `or`.
    //
    // Batching reads naturally — "'a' in parents or 'b' in parents" — and
    // Drive accepts it without complaint, but against this shared drive it
    // returned ZERO results for folders that each return their files fine
    // when asked individually. Verified: the root's 10 subfolders were found
    // by a single-id query, then the batched follow-up for those same 10 ids
    // returned nothing at all. Another silent empty, so it is not used.
    //
    // The cost is one request per folder — about eleven for this tree, run
    // concurrently per level — which is not worth trading for a query shape
    // that fails quietly.
    const results = await Promise.all(
      frontier.map(async (parentId) => {
        const q = `'${parentId}' in parents and trashed = false`;
        const out: typeof all = [];
        let pageToken: string | undefined;
        do {
          const res = await drive.files.list({
            pageSize: 1000,
            pageToken,
            q,
            fields:
              "nextPageToken, files(id,name,mimeType,parents,size,modifiedTime)",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          });
          out.push(...((res.data.files || []) as typeof all));
          pageToken = res.data.nextPageToken || undefined;
        } while (pageToken);
        return out;
      })
    );

    for (const f of results.flat()) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      all.push(f);
      if (f.mimeType === FOLDER_MIME) next.push(f.id);
    }

    frontier = next;
  }

  const folders = all.filter((f) => f.mimeType === FOLDER_MIME);
  const files = all.filter((f) => f.mimeType !== FOLDER_MIME);

  // Hide a timestamped export when a cleaner twin of the same doc exists.
  const canonical = new Set(
    files
      .filter((f) => !isTimestampedExport(f.name))
      .map((f) => toTitle(f.name).toLowerCase())
  );

  const childrenOf = (folderId: string) =>
    files
      .filter((f) => (f.parents || []).includes(folderId))
      .filter(
        (f) =>
          !isTimestampedExport(f.name) ||
          !canonical.has(toTitle(f.name).toLowerCase())
      )
      .map<DriveListedFile>((f) => {
        const title = toTitle(f.name);
        const { num, rest } = splitNumber(title);
        return {
          id: f.id,
          name: f.name,
          title,
          num,
          label: rest,
          mimeType: f.mimeType,
          sizeBytes: f.size ? Number(f.size) : null,
          modifiedTime: f.modifiedTime || null,
          order: leadingNumber(f.name),
        };
      })
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

  const subfolders = folders.filter((f) => (f.parents || []).includes(rootId));

  const groups: DriveFolderGroup[] = subfolders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    order: leadingNumber(folder.name),
    files: childrenOf(folder.id),
  }));

  // Files sitting loose in the root become their own group.
  const loose = childrenOf(rootId);
  if (loose.length) {
    groups.push({
      id: rootId,
      name: "General",
      order: Number.MAX_SAFE_INTEGER,
      files: loose,
    });
  }

  return groups
    .filter((g) => g.files.length > 0)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/* -------------------------------------------------------------------------- */
/* Handouts                                                                    */
/* -------------------------------------------------------------------------- */

export type ModuleHandouts = {
  /** The one combined PDF for this module, if there is one. */
  combined: DriveListedFile | null;
  /** The individual sheets, from the numbered module folder. */
  sheets: DriveListedFile[];
};

export type TemplateHandouts = {
  /** Keyed by module number, 1-6. */
  byModule: Record<number, ModuleHandouts>;
  /** Named groups that aren't a numbered module — Field Guide, Additional Handouts. */
  extras: DriveFolderGroup[];
  /** Whole-process documents, e.g. the full Pivvot Notebook. */
  notebooks: DriveListedFile[];
};

/**
 * A shouted-out warning about the shared folder, because it decides who sees
 * what:
 *
 * Every Pivvot engagement reads ONE folder, so anything dropped in it is
 * visible to every church running the process. That is the point for the
 * standard handouts — one PDF updated in Drive updates everyone — but it
 * makes a client-specific file a leak of that client's name to every other
 * client. `Combined Handouts` already holds one:
 * "Pivvot Notebook - JUNE 14 2026 (Christ Chapel).pdf".
 *
 * So the rule for whole-process notebooks is deterministic and documented
 * rather than clever: a file with a PARENTHESISED SUFFIX is treated as
 * belonging to one church and is never surfaced. Naming a file
 * "... (Christ Chapel).pdf" is how you keep it private; leaving the
 * parentheses off is how you publish it to everyone. Per-module combined
 * handouts are matched on their leading number instead, so this rule never
 * touches them.
 */
function isClientSpecific(name: string): boolean {
  return /\([^)]+\)\s*\.[a-z0-9]{1,5}$/i.test(name);
}

/** Sheets that duplicate the module's own combined PDF, by title. */
function sameTitle(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The handout library for a template, arranged the way the project page shows
 * it: one combined PDF leading each module, its individual sheets beneath.
 *
 * Mirrors the CVF side's structure because the Drive folders mirror each
 * other — "1 - Funnel Fusion" holds the sheets, "Combined Handouts" holds
 * "01 - Funnel Fusion Handouts.pdf". Both are matched on their leading
 * number, so renaming the descriptive part of either is safe.
 */
export async function listTemplateHandouts(rootId: string): Promise<TemplateHandouts> {
  const groups = await listDriveFolder(rootId);

  const combinedGroup = groups.find((g) => /combined handouts/i.test(g.name));
  const byModule: Record<number, ModuleHandouts> = {};

  for (const group of groups) {
    // "1 - Funnel Fusion" … "6 - Horizon Storyline". 0 (Field Guide) and 7
    // (Vision Stack) are deliberately not modules on the project page.
    if (group.order < 1 || group.order > 6) continue;
    byModule[group.order] = { combined: null, sheets: group.files };
  }

  for (const file of combinedGroup?.files ?? []) {
    // "01 - Funnel Fusion Handouts.pdf" -> module 1.
    if (file.order < 1 || file.order > 6) continue;
    const entry = (byModule[file.order] ??= { combined: null, sheets: [] });
    entry.combined = file;
    // Don't list the same document twice under one module.
    entry.sheets = entry.sheets.filter((s) => !sameTitle(s.title, file.title));
  }

  const notebooks = (combinedGroup?.files ?? []).filter(
    (f) => f.order === Number.MAX_SAFE_INTEGER && !isClientSpecific(f.name)
  );

  const extras = groups.filter(
    (g) => (g.order < 1 || g.order > 6) && !/combined handouts/i.test(g.name)
  );

  return { byModule, extras, notebooks };
}
