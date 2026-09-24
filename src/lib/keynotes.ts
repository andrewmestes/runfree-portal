import { google } from "googleapis";

/**
 * Keynote presentations — the decks a certified framer stands up and teaches
 * from, in both formats a laptop might need.
 *
 * Andrew: "there are two presentations and a keynote and powerpoint file for
 * each. display accordingly."
 *
 * The Drive folder is shaped exactly that way and this reads that shape
 * rather than a manifest:
 *
 *   Keynote Presentations/
 *     God Dreams Ted Talk.key
 *     12 Vision Templates.key
 *     God Dreams Ted Talk.pdf        ← optional: the slides exported to PDF
 *     PowerPoint/
 *       God Dreams Ted Talk.pptx
 *       12 Vision Templates.pptx
 *
 * So a **presentation** is a name, and it carries up to three files. The
 * PDF is what the portal can actually SHOW: a .key or .pptx only downloads,
 * so `/open/keynote` previews the PDF when one exists (Keynote: File →
 * Export To → PDF, dropped beside the .key) and keeps the Keynote and
 * PowerPoint downloads a button away. Andrew, 8 Sept 2026: "they're seeing
 * the PDF presented to them in the portal, but they have the option to
 * download the actual presentation." Pairing is
 * by base name rather than by position or a stored mapping, which means
 * adding a third deck is dropping two files into Drive and nothing else —
 * the same live-mirror philosophy as the books shelf and the facilitator's
 * guide.
 *
 * A deck with only one of the two formats still renders. When this was
 * written the PowerPoint folder was empty, so both presentations showed
 * Keynote alone; dropping the .pptx files in makes the second button appear
 * with no deploy.
 */

const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Where the PowerPoint conversions live, as a direct child of the folder. */
const POWERPOINT_SUBFOLDER = "powerpoint";

/** And where the PDF exports live, when they are not beside the .key. */
const PDF_SUBFOLDER = "pdfs";

export type KeynoteFormat = {
  id: string;
  /** The Drive filename, extension and all. */
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  modifiedTime: string | null;
  /** Drive's content hash — the file route's ETag. Null for Google-native files. */
  md5: string | null;
};

export type Presentation = {
  /** Base name without the extension or a trailing "- RunFree" — the deck's title. */
  title: string;
  /** Stable key for React and for ordering. */
  slug: string;
  keynote: KeynoteFormat | null;
  powerpoint: KeynoteFormat | null;
  /** The slides as a PDF, if one has been exported beside the deck. */
  pdf: KeynoteFormat | null;
};

export function isDriveConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
}

function getDriveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set");

  let credentials: { client_email: string; private_key: string };
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON");
  }
  if (credentials.private_key?.includes("\\n")) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return google.drive({ version: "v3", auth });
}

/** Filename minus its extension. */
function baseName(name: string): string {
  return name.replace(/\.[a-z0-9]{1,6}$/i, "").trim();
}

/**
 * The title a framer reads. Drive names one deck "Top 10 Reasons for Radical
 * Simplicity - RunFree"; on the card the "- RunFree" wrapped onto a line of
 * its own and headed the viewer too. Every deck here is RunFree's, so the
 * suffix says nothing. Only the title drops it — the join key and slug still
 * come from the filename, so pairing is unchanged.
 */
function displayTitle(name: string): string {
  return baseName(name).replace(/\s*[-–—]\s*RunFree\s*$/i, "").trim();
}

/**
 * The join key.
 *
 * Deliberately forgiving: a deck exported to PowerPoint often picks up a
 * different case, a stray double space, or a hyphen where the Keynote used an
 * en dash. Matching on the raw filename would silently split one presentation
 * into two cards, each missing a format, which looks like a bug in the page
 * rather than a typo in Drive.
 */
function joinKey(name: string): string {
  return baseName(name)
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toFormat(f: {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  size?: string | null;
  modifiedTime?: string | null;
  md5Checksum?: string | null;
}): KeynoteFormat {
  return {
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType || "application/octet-stream",
    sizeBytes: f.size ? Number(f.size) : null,
    modifiedTime: f.modifiedTime || null,
    md5: f.md5Checksum || null,
  };
}

async function listChildren(folderId: string) {
  const drive = getDriveClient();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,size,modifiedTime,md5Checksum)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    orderBy: "name",
    pageSize: 200,
  });
  return res.data.files || [];
}

/**
 * The service account, for error messages.
 *
 * Naming it turns "no presentations" into an instruction: this folder has to
 * be shared with that address, and nobody can guess it from a blank page.
 */
function serviceAccountEmail(): string {
  try {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "{}").client_email || "the portal service account";
  } catch {
    return "the portal service account";
  }
}

/**
 * The listing, held for a minute — the same memo as `listBooksLibrary`.
 *
 * The page, the ticket and the file route each walked the folder afresh
 * (three Drive lists, 1.4–4.3 s), so "View the slides" paid for the walk
 * twice before the first byte of the PDF. Sixty seconds still shows a deck
 * dropped into Drive on the next visit.
 */
const LISTING_TTL_MS = 60_000;
let listingCache: { at: number; value: Promise<Presentation[]> } | null = null;

export function listPresentations(): Promise<Presentation[]> {
  const now = Date.now();
  if (listingCache && now - listingCache.at < LISTING_TTL_MS) return listingCache.value;
  const value = listPresentationsUncached().catch((err) => {
    // A failed walk must not be served for a minute.
    if (listingCache?.value === value) listingCache = null;
    throw err;
  });
  listingCache = { at: now, value };
  return value;
}

/** Every presentation in the folder, each with whichever formats exist. */
async function listPresentationsUncached(): Promise<Presentation[]> {
  const folderId = process.env.GOOGLE_KEYNOTES_FOLDER_ID;
  if (!folderId) throw new Error("GOOGLE_KEYNOTES_FOLDER_ID is not set");

  const top = await listChildren(folderId);

  // A folder the service account cannot see lists as EMPTY rather than
  // erroring — `files.list` filtered by a parent it has no rights to just
  // returns nothing. That is indistinguishable from an empty folder on the
  // page, so an empty result gets one confirming read: if the folder itself
  // is unreadable, say so instead of rendering "no presentations yet".
  if (top.length === 0) {
    try {
      await getDriveClient().files.get({
        fileId: folderId,
        fields: "id",
        supportsAllDrives: true,
      });
    } catch {
      throw new Error(
        `The Keynote Presentations folder is not shared with ${serviceAccountEmail()}. ` +
          "Share that folder with this address (Viewer is enough) and the decks appear here."
      );
    }
  }

  const subfolder = async (name: string) => {
    const hit = top.find(
      (f) => f.mimeType === FOLDER_MIME && (f.name || "").trim().toLowerCase() === name
    );
    return hit?.id ? await listChildren(hit.id) : [];
  };
  // The exports landed in their own folder rather than beside each .key, which
  // is the tidier shape and the one Andrew used. Both are read, so a PDF sits
  // wherever it was put. The two lists are independent, so they run together.
  const [ppts, pdfs] = await Promise.all([subfolder(POWERPOINT_SUBFOLDER), subfolder(PDF_SUBFOLDER)]);

  const decks = new Map<string, Presentation>();

  const put = (
    f: (typeof top)[number],
    slot: "keynote" | "powerpoint" | "pdf"
  ) => {
    if (f.mimeType === FOLDER_MIME || !f.id || !f.name) return;
    const key = joinKey(f.name);
    if (!key) return;
    const existing = decks.get(key);
    if (existing) {
      // Two files of the same format under one name: keep the newer, so a
      // re-export sitting beside its original does not produce a card whose
      // download is the stale one.
      const current = existing[slot];
      if (
        !current ||
        new Date(f.modifiedTime || 0) > new Date(current.modifiedTime || 0)
      ) {
        existing[slot] = toFormat(f);
      }
      return;
    }
    decks.set(key, {
      title: displayTitle(f.name),
      slug: key.replace(/ /g, "-"),
      keynote: slot === "keynote" ? toFormat(f) : null,
      powerpoint: slot === "powerpoint" ? toFormat(f) : null,
      pdf: slot === "pdf" ? toFormat(f) : null,
    });
  };

  const isPdf = (f: (typeof top)[number]) =>
    f.mimeType === "application/pdf" || /\.pdf$/i.test(f.name || "");
  for (const f of top) put(f, isPdf(f) ? "pdf" : "keynote");
  for (const f of ppts) put(f, isPdf(f) ? "pdf" : "powerpoint");
  for (const f of pdfs) put(f, "pdf");

  return [...decks.values()].sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * One file of one deck, by Drive id — or null if it is not in this folder.
 *
 * The download route checks against this rather than trusting its path
 * parameter — the same guard `/api/books/file` uses, and for the same reason:
 * without it, an authenticated framer could read any file the service account
 * can see, which is the whole shared drive. The same memoised listing that
 * proves the id belongs here also carries the file's hash for the ETag.
 */
export async function findPresentationFile(id: string): Promise<KeynoteFormat | null> {
  for (const d of await listPresentations()) {
    for (const f of [d.keynote, d.powerpoint, d.pdf]) {
      if (f?.id === id) return f;
    }
  }
  return null;
}
