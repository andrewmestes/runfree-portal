import { NextRequest, NextResponse } from "next/server";
import { contentDisposition } from "@/lib/content-disposition";
import { fetchDriveFileRange } from "@/lib/drive";
import { verifyTicket } from "@/lib/tool-videos";
import { clampRange, driveErrorStatus } from "@/lib/video-range";

/**
 * GET /api/tool-videos/file/{id}?t={ticket}
 *
 * The bytes of one tool video, streamed live from Drive with the browser's
 * Range header passed through — so the player starts within a second and
 * seeking asks only for the slice it needs. The ticket (lib/tool-videos.ts)
 * is the access check; it was minted by the ticket route after the session
 * and the folder membership were both verified.
 *
 * Every range is capped at an 8 MB slice (lib/video-range.ts), which is what
 * keeps a 3.5 GB video inside a serverless function's time limit: a player
 * opening with `bytes=0-`, or Safari asking for `bytes=0-<size-1>`, gets a
 * slice and asks for the next one itself.
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

    const range = clampRange(req.headers.get("range"));
    if (range === "bad") return new NextResponse(null, { status: 416, headers: { "Accept-Ranges": "bytes" } });
    const file = await fetchDriveFileRange(id, range);

    const headers: Record<string, string> = {
      "Content-Type": file.mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "Content-Disposition": contentDisposition("inline", file.filename),
    };
    if (file.contentLength) headers["Content-Length"] = file.contentLength;
    if (file.contentRange) headers["Content-Range"] = file.contentRange;

    return new NextResponse(file.body, { status: file.status, headers });
  } catch (error) {
    if (driveErrorStatus(error) === 416) return new NextResponse(null, { status: 416, headers: { "Accept-Ranges": "bytes" } });
    console.error("Tool video stream failed:", error);
    return NextResponse.json({ error: "Could not play that video" }, { status: 500 });
  }
}
