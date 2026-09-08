import { describeDriveFile, fileInsideFolder, listDriveFolder, type DriveListedFile } from "./drive";

/**
 * The Process Tools Videos — the per-tool walkthroughs the Digital
 * Facilitators' Guide links to, served through the portal instead of Drive.
 *
 * Andrew, 8 Sept 2026: the guide's links should "check portal access, then
 * display the handout … as quick as possible, so that if someone is
 * facilitating live in the room and they click on the link, it quickly
 * recognizes them and displays the handout they want." And on the videos:
 * "can they remain in Google Drive with access given through the portal?"
 *
 * They can. Nothing is copied. The folder ("Pivvot Vision Framing > Training
 * (Videos & Docs) > Process Tools Videos", `GOOGLE_TOOL_VIDEOS_FOLDER_ID`) is
 * shared with the portal's service account and read live, the same way the
 * handout library is — so a video renamed or replaced in Drive is renamed or
 * replaced here with no other step. Once these routes serve them, the files'
 * own "anyone with the link" sharing can be switched off; that switch is the
 * actual gate.
 *
 * Two things differ from the handouts:
 *
 * 1. **A video tag cannot send a session header.** The page asks for a
 *    short-lived ticket with its session (`/api/tool-videos/ticket/{id}`),
 *    and the file route accepts the ticket in the query string instead. A
 *    ticket names one file and one person, is signed with a server secret,
 *    and dies after fifteen minutes — long enough to watch, useless to pass
 *    around.
 * 2. **The file route honours Range**, or seeking would not work. See
 *    `fetchDriveFileRange`.
 */

export type ToolVideo = DriveListedFile & { group: string; groupOrder: number };

export type ToolVideoGroup = {
  id: string;
  name: string;
  order: number;
  videos: ToolVideo[];
};

type Cached = { at: number; groups: ToolVideoGroup[]; byId: Map<string, ToolVideo> };
let cache: Cached | null = null;
const TTL_MS = 5 * 60_000;

function folderId(): string {
  const id = process.env.GOOGLE_TOOL_VIDEOS_FOLDER_ID;
  if (!id) throw new Error("GOOGLE_TOOL_VIDEOS_FOLDER_ID is not set");
  return id;
}

/** The folder, grouped by module subfolder, video files only. Cached briefly. */
export async function listToolVideos(fresh = false): Promise<ToolVideoGroup[]> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.groups;

  const raw = await listDriveFolder(folderId());
  const groups: ToolVideoGroup[] = raw
    .map((g) => ({
      id: g.id,
      name: g.name,
      order: g.order,
      videos: g.files
        .filter((f) => f.mimeType.startsWith("video/"))
        .map((f) => ({ ...f, group: g.name, groupOrder: g.order })),
    }))
    .filter((g) => g.videos.length > 0);

  const byId = new Map<string, ToolVideo>();
  for (const g of groups) for (const v of g.videos) byId.set(v.id, v);
  cache = { at: Date.now(), groups, byId };
  return groups;
}

/**
 * One video by Drive id, or null — which is the authorization boundary: a
 * file that is not in the folder is not served, whatever its id.
 *
 * Answered from the listing when one is warm, otherwise by walking up from
 * the file to the folder (`fileInsideFolder`): a few hundred milliseconds
 * against ten seconds for a cold full listing, which matters because this
 * is the path a guide link takes.
 */
export async function findToolVideo(id: string): Promise<ToolVideo | null> {
  const hit = cache?.byId.get(id);
  if (hit) return hit;

  const meta = await fileInsideFolder(id, folderId());
  if (!meta || !meta.mimeType.startsWith("video/")) return null;

  const group = meta.folders[0] ?? { id: folderId(), name: "" };
  const groupOrder = (() => {
    const m = group.name.match(/^\s*(\d+)/);
    return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
  })();
  const { title, num, label } = describeDriveFile(meta.name);
  return {
    id: meta.id,
    name: meta.name,
    title,
    num,
    label,
    mimeType: meta.mimeType,
    sizeBytes: meta.sizeBytes,
    modifiedTime: meta.modifiedTime,
    order: num ? parseFloat(num) : Number.MAX_SAFE_INTEGER,
    group: group.name,
    groupOrder,
  };
}

/* The ticket helpers live in file-ticket.ts (the keynote downloads use them too). */
export { mintTicket, verifyTicket } from "./file-ticket";
