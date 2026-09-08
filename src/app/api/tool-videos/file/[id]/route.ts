import { NextRequest, NextResponse } from "next/server";
import { fetchDriveFileRange } from "@/lib/drive";
import { verifyTicket } from "@/lib/tool-videos";

/**
 * GET /api/tool-videos/file/{id}?t={ticket}
 *
 * The bytes of one tool video, streamed live from Drive with the browser's
 * Range header passed through — so the player starts within a second and
 * seeking asks only for the slice it needs. The ticket (lib/tool-videos.ts)
 * is the access check; it was minted by the ticket route after the session
 * and the folder membership were both verified.
 *
 * Each ranged request is short, which is what keeps a 3.5 GB video inside
 * a serverless function's time limit: the browser never asks for the whole
 * file at once.
 */
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!verifyTicket(id, req.nextUrl.searchParams.get("t"))) {
      return NextResponse.json({ error: "This link has expired — open the video again" }, { status: 401 });
    }

    const range = req.headers.get("range");
    const file = await fetchDriveFileRange(id, range);

    const headers: Record<string, string> = {
      "Content-Type": file.mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${file.filename.replace(/"/g, "")}"`,
    };
    if (file.contentLength) headers["Content-Length"] = file.contentLength;
    if (file.contentRange) headers["Content-Range"] = file.contentRange;

    return new NextResponse(file.body, { status: file.status, headers });
  } catch (error) {
    console.error("Tool video stream failed:", error);
    return NextResponse.json({ error: "Could not play that video" }, { status: 500 });
  }
}
