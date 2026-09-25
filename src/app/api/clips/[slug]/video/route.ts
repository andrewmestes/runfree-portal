import { NextRequest, NextResponse } from "next/server";
import { contentDisposition } from "@/lib/content-disposition";
import { fetchDriveFileRange } from "@/lib/drive";
import { clipShareBySlug } from "@/lib/clip-shares";
import { clampRange, driveErrorStatus } from "@/lib/video-range";

/**
 * GET /api/clips/{slug}/video — the bytes of one Video Clips film for its
 * public /watch/{slug} page, with no sign-in.
 *
 * Only a clip marked `stream` in lib/clip-shares.ts is served — the films
 * with no usable official public version that Andrew chose to share anyway
 * (25 Sept: Mr. Holland's Opus, Smoke, the Hope Baptist film). The Drive id comes from that list, never from the request, so no
 * other file in Drive can be reached through here. Every other clip's page
 * plays or links to the maker's own copy and does not use this route.
 *
 * Same Range handling as /api/tool-videos/file (lib/video-range.ts): every
 * range is capped at an 8 MB slice, so the player starts at once, seeks by
 * range, and no single call streams the whole film.
 */
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const clip = clipShareBySlug.get(slug);
  if (!clip?.stream) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const range = clampRange(req.headers.get("range"));
    if (range === "bad") return new NextResponse(null, { status: 416, headers: { "Accept-Ranges": "bytes" } });
    const file = await fetchDriveFileRange(clip.driveId, range);

    const headers: Record<string, string> = {
      "Content-Type": file.mimeType,
      "Accept-Ranges": "bytes",
      // Public, but short: a film replaced in Drive (Manage versions) shows within the hour.
      "Cache-Control": "public, max-age=3600",
      "Content-Disposition": contentDisposition("inline", `${clip.title}.mp4`),
      "X-Robots-Tag": "noindex",
    };
    if (file.contentLength) headers["Content-Length"] = file.contentLength;
    if (file.contentRange) headers["Content-Range"] = file.contentRange;

    return new NextResponse(file.body, { status: file.status, headers });
  } catch (error) {
    const status = driveErrorStatus(error);
    if (status === 416) return new NextResponse(null, { status: 416, headers: { "Accept-Ranges": "bytes" } });
    if (status === 404) return NextResponse.json({ error: "Not found" }, { status: 404 });
    console.error("Clip stream failed:", error);
    return NextResponse.json({ error: "Could not play that video" }, { status: 500 });
  }
}
