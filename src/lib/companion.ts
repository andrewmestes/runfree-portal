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
    fields: "files(id,name,mimeType,size,modifiedTime)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 100,
  });

  const pdfs = (res.data.files || []).filter(
    (f) => f.mimeType !== FOLDER_MIME && (f.mimeType === "application/pdf" || /\.pdf$/i.test(f.name || ""))
  );
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
  };
}
