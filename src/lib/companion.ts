import { google } from "googleapis";

/**
 * The Certification Companion Guide — Will's orientation document for a
 * cohort ("the bird's-eye view of how we orient you to use Pivvot Vision
 * Framing"), 22 Sept 2026. Andrew: "i want it added to the certification
 * resources side of the portal as a separate card on the dashboard."
 *
 * Same live-mirror shape as the Digital Facilitator's Guide (lib/guide.ts):
 * the current guide is the most recently modified PDF sitting directly in
 * `GOOGLE_CERT_FOLDER_ID` — "Certification Handouts", the folder ABOVE the
 * module handouts — so a new edition dropped there is live with nothing to
 * re-upload. Folders are ignored: the module handouts live in a sub-folder
 * of this one and are served by lib/drive.ts.
 *
 * The service account has to be able to see that folder. The handouts
 * sub-folder was shared on its own, which does not reach its parent; share
 * "Certification Handouts" itself (Viewer) or this lists as empty.
 */

const FOLDER_MIME = "application/vnd.google-apps.folder";

export type CompanionFile = {
  id: string;
  name: string;
  title: string;
  mimeType: string;
  sizeBytes: number | null;
  modifiedTime: string | null;
  /** Drive's content hash — the ETag the file route hands the browser. */
  md5: string | null;
};

export function isCompanionConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY && process.env.GOOGLE_CERT_FOLDER_ID);
}

function getDriveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set");
  const credentials = JSON.parse(raw) as { client_email: string; private_key: string };
  if (credentials.private_key?.includes("\\n")) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return google.drive({ version: "v3", auth });
}

/** The current Companion Guide: the newest PDF directly in the folder. */
export async function getCompanionGuide(): Promise<CompanionFile | null> {
  const folderId = process.env.GOOGLE_CERT_FOLDER_ID;
  if (!folderId) throw new Error("GOOGLE_CERT_FOLDER_ID is not set");

  const res = await getDriveClient().files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,size,modifiedTime,md5Checksum)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 100,
  });

  let pdfs = (res.data.files || []).filter(
    (f) => f.mimeType !== FOLDER_MIME && (f.mimeType === "application/pdf" || /\.pdf$/i.test(f.name || ""))
  );
  // Andrew shared the FILE rather than the folder (22 Sept), which makes the
  // folder listing empty while the guide itself is perfectly readable. A file
  // shared on its own reports no parents, so it cannot be found by folder;
  // fall back to the one name it will always carry.
  if (pdfs.length === 0) {
    const byName = await getDriveClient().files.list({
      q: `name contains 'Companion Guide' and mimeType = 'application/pdf' and trashed = false`,
      fields: "files(id,name,mimeType,size,modifiedTime,md5Checksum)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 20,
    });
    pdfs = byName.data.files || [];
  }
  if (pdfs.length === 0) return null;
  pdfs.sort((a, b) => new Date(b.modifiedTime || 0).getTime() - new Date(a.modifiedTime || 0).getTime());

  const f = pdfs[0];
  return {
    id: f.id!,
    name: f.name!,
    // "Pivvot-Certification-Companion-Guide" → "Pivvot Certification Companion Guide"
    title: (f.name || "").replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[-_]+/g, " ").trim(),
    mimeType: f.mimeType!,
    sizeBytes: f.size ? Number(f.size) : null,
    modifiedTime: f.modifiedTime || null,
    md5: f.md5Checksum || null,
  };
}

/**
 * The lookup, held for a minute. Andrew: "the companion guide takes a while
 * to load in the cert hub." Each open was four Drive round trips in a row —
 * the folder listing (empty, see above), the name search, a metadata read,
 * then the bytes — before the first byte moved. Now the first three happen
 * once a minute, and a new edition in Drive is still live within that.
 */
const TTL_MS = 60_000;
let cached: { at: number; value: Promise<CompanionFile | null> } | null = null;

export function getCompanionGuideCached(): Promise<CompanionFile | null> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.value;
  const value = getCompanionGuide().catch((err) => {
    if (cached?.value === value) cached = null;
    throw err;
  });
  cached = { at: now, value };
  return value;
}

/**
 * The bytes. Held in memory against the content hash: the lookup above
 * refreshes the hash once a minute, so a new edition in Drive replaces the
 * copy here within that, and every open in between never touches Drive.
 * One guide, about a megabyte — a bytes cache is cheaper than a round trip.
 */
let bytes: { md5: string; body: ArrayBuffer } | null = null;

export async function readCompanionGuide(file: CompanionFile): Promise<ArrayBuffer> {
  if (bytes && file.md5 && bytes.md5 === file.md5) return bytes.body;
  const res = await getDriveClient().files.get(
    { fileId: file.id, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );
  const body = res.data as ArrayBuffer;
  if (file.md5) bytes = { md5: file.md5, body };
  return body;
}
