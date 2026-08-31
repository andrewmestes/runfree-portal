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
 *     PowerPoint/
 *       God Dreams Ted Talk.pptx
 *       12 Vision Templates.pptx
 *
 * So a **presentation** is a name, and it carries up to two files. Pairing is
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

export type KeynoteFormat = {
  id: string;
  /** The Drive filename, extension and all. */
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  modifiedTime: string | null;
};

export type Presentation = {
  /** Base name with the extension stripped — the deck's title. */
  title: string;
  /** Stable key for React and for ordering. */
  slug: string;
  keynote: KeynoteFormat | null;
  powerpoint: KeynoteFormat | null;
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
}): KeynoteFormat {
  return {
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType || "application/octet-stream",
    sizeBytes: f.size ? Number(f.size) : null,
    modifiedTime: f.modifiedTime || null,
  };
}

async function listChildren(folderId: string) {
  const drive = getDriveClient();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,size,modifiedTime)",
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

/** Every presentation in the folder, each with whichever formats exist. */
export async function listPresentations(): Promise<Presentation[]> {
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

  const pptFolder = top.find(
    (f) =>
      f.mimeType === FOLDER_MIME &&
      (f.name || "").trim().toLowerCase() === POWERPOINT_SUBFOLDER
  );
  const ppts = pptFolder?.id ? await listChildren(pptFolder.id) : [];

  const decks = new Map<string, Presentation>();

  const put = (
    f: (typeof top)[number],
    slot: "keynote" | "powerpoint"
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
      title: baseName(f.name),
      slug: key.replace(/ /g, "-"),
      keynote: slot === "keynote" ? toFormat(f) : null,
      powerpoint: slot === "powerpoint" ? toFormat(f) : null,
    });
  };

  for (const f of top) put(f, "keynote");
  for (const f of ppts) put(f, "powerpoint");

  return [...decks.values()].sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Every Drive id this feature is allowed to serve.
 *
 * The download route checks against this rather than trusting its path
 * parameter — the same guard `/api/books/file` uses, and for the same reason:
 * without it, an authenticated framer could read any file the service account
 * can see, which is the whole shared drive.
 */
export async function listPresentationFileIds(): Promise<Set<string>> {
  const decks = await listPresentations();
  const ids = new Set<string>();
  for (const d of decks) {
    if (d.keynote) ids.add(d.keynote.id);
    if (d.powerpoint) ids.add(d.powerpoint.id);
  }
  return ids;
}
