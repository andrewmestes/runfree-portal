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
    fields: "files(id,name,mimeType,size,modifiedTime)",
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
  };
}

export { isDriveConfigured };
