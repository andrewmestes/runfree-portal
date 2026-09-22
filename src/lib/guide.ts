import { google } from "googleapis";

/**
 * Digital Facilitator's Guide — a single live-mirrored file, same philosophy
 * as everything else: no copy is stored, so publishing a new version in
 * Drive is all it takes to update the portal.
 *
 * Archiving old versions needs no special handling here: this only ever
 * queries the DFG folder's DIRECT children. Moving a superseded file into an
 * "Archived" subfolder removes it from that query by construction — there's
 * no exclusion list to maintain.
 */

const FOLDER_MIME = "application/vnd.google-apps.folder";

export type GuideFile = {
  id: string;
  name: string;
  title: string;
  mimeType: string;
  sizeBytes: number | null;
  modifiedTime: string | null;
  /** Drive's content hash — the ETag the file route hands the browser. */
  md5: string | null;
};

function isDriveConfigured(): boolean {
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

/** The current guide: the most recently modified file directly in the folder. */
export async function getFacilitatorGuide(): Promise<GuideFile | null> {
  const folderId = process.env.GOOGLE_DFG_FOLDER_ID;
  if (!folderId) throw new Error("GOOGLE_DFG_FOLDER_ID is not set");

  const drive = getDriveClient();

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,size,modifiedTime,md5Checksum)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 100,
  });

  const files = (res.data.files || []).filter(
    (f) => f.mimeType !== FOLDER_MIME
  );

  if (files.length === 0) return null;

  files.sort(
    (a, b) =>
      new Date(b.modifiedTime || 0).getTime() -
      new Date(a.modifiedTime || 0).getTime()
  );

  const f = files[0];
  return {
    id: f.id!,
    name: f.name!,
    title: (f.name || "").replace(/\.[a-z0-9]{1,5}$/i, "").trim(),
    mimeType: f.mimeType!,
    sizeBytes: f.size ? Number(f.size) : null,
    modifiedTime: f.modifiedTime || null,
    md5: f.md5Checksum || null,
  };
}

/**
 * The lookup, held for a minute. Andrew, 22 Sept: the guide "took a long
 * time to load just now." Opening it was a folder listing, a metadata read
 * and then 16.6 MB streamed through the function, every single time, with
 * the browser told never to keep a copy. The listing now happens once a
 * minute at most; a new edition dropped in Drive is live within that.
 */
const TTL_MS = 60_000;
let cached: { at: number; value: Promise<GuideFile | null> } | null = null;

export function getFacilitatorGuideCached(): Promise<GuideFile | null> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.value;
  const value = getFacilitatorGuide().catch((err) => {
    if (cached?.value === value) cached = null;
    throw err;
  });
  cached = { at: now, value };
  return value;
}

/**
 * The bytes. A warm instance answers from memory, keyed on the content hash
 * so a new edition replaces the copy the minute the lookup sees it. A cold
 * one streams from Drive — the browser starts receiving while Drive is still
 * sending, instead of waiting for the whole file to land here first — and
 * keeps what went past for the next person.
 */
let bytes: { md5: string; body: Buffer } | null = null;

/** A held copy, handed out in 1 MB pieces. Always a stream, never a body —
 *  the platform caps a buffered function response at 4.5 MB; a streamed one
 *  it does not (the same reason drive.ts streams everything). */
function streamFromMemory(body: Buffer): ReadableStream<Uint8Array> {
  const CHUNK = 1024 * 1024;
  let at = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at >= body.byteLength) return controller.close();
      controller.enqueue(new Uint8Array(body.subarray(at, at + CHUNK)));
      at += CHUNK;
    },
  });
}

export async function readFacilitatorGuide(
  file: GuideFile
): Promise<{ body: ReadableStream<Uint8Array>; length: number | null; cached: boolean }> {
  if (bytes && file.md5 && bytes.md5 === file.md5) {
    return { body: streamFromMemory(bytes.body), length: bytes.body.byteLength, cached: true };
  }

  const res = await getDriveClient().files.get(
    { fileId: file.id, alt: "media", supportsAllDrives: true },
    { responseType: "stream" }
  );
  const node = res.data as NodeJS.ReadableStream & { destroy?: () => void };
  const chunks: Buffer[] = [];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      node.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        controller.enqueue(new Uint8Array(chunk));
      });
      node.on("end", () => {
        controller.close();
        if (file.md5) bytes = { md5: file.md5, body: Buffer.concat(chunks) };
      });
      node.on("error", (err) => controller.error(err));
    },
    cancel() {
      node.destroy?.();
    },
  });
  return { body, length: file.sizeBytes, cached: false };
}

export { isDriveConfigured };
