import { NextRequest, NextResponse } from "next/server";
import { requireCertificationAccess } from "@/lib/api-auth";
import { findToolVideo, mintTicket } from "@/lib/tool-videos";
import { toolVideoShelf } from "@/lib/video-shelf";

/**
 * The player re-requests the ticketed URL for every slice of the film, so
 * the ticket has to last the whole showing. Fifteen minutes cut the longer
 * walkthroughs off partway and killed any video left paused through a
 * discussion. If one does run out, the players re-mint once and resume
 * (lib/tool-videos-client.ts).
 */
const VIDEO_TICKET_TTL_MS = 4 * 60 * 60_000; // a paused film through a half-day session; the longest is 36.5 min

/**
 * GET /api/tool-videos/ticket/{id}
 *
 * Trades a session for a four-hour ticket to one video. This is where
 * the access check happens; the file route only checks the ticket. A video
 * tag cannot carry an Authorization header, which is the whole reason the
 * two steps exist.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await requireCertificationAccess(req);
    if (!access.ok) return access.response;

    const video = await findToolVideo(id);
    if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { ticket, expiresAt } = mintTicket(id, access.userId, VIDEO_TICKET_TTL_MS);
    // Which Training Videos tab the film is on, for the full-screen page's
    // back link. Null for an unnumbered film in a module folder: whether that
    // is a copy of one of the Video Clips takes the whole listing, ten
    // seconds cold, and a guide link does not wait on that. The page asks
    // for the listing once the player is up (open/[kind]/[id]/page.tsx).
    return NextResponse.json({
      url: `/api/tool-videos/file/${encodeURIComponent(id)}?t=${encodeURIComponent(ticket)}`,
      title: video.title,
      label: video.label,
      num: video.num,
      group: video.group,
      shelf: toolVideoShelf(video, null),
      mimeType: video.mimeType,
      sizeBytes: video.sizeBytes,
      expiresAt,
    });
  } catch (error) {
    console.error("Tool video ticket failed:", error);
    return NextResponse.json({ error: "Could not open that video" }, { status: 500 });
  }
}
