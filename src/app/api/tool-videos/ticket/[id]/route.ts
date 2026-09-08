import { NextRequest, NextResponse } from "next/server";
import { requireCertificationAccess } from "@/lib/api-auth";
import { findToolVideo, mintTicket } from "@/lib/tool-videos";

/**
 * GET /api/tool-videos/ticket/{id}
 *
 * Trades a session for a fifteen-minute ticket to one video. This is where
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

    const { ticket, expiresAt } = mintTicket(id, access.userId);
    return NextResponse.json({
      url: `/api/tool-videos/file/${encodeURIComponent(id)}?t=${encodeURIComponent(ticket)}`,
      title: video.title,
      label: video.label,
      num: video.num,
      group: video.group,
      mimeType: video.mimeType,
      sizeBytes: video.sizeBytes,
      expiresAt,
    });
  } catch (error) {
    console.error("Tool video ticket failed:", error);
    return NextResponse.json({ error: "Could not open that video" }, { status: 500 });
  }
}
