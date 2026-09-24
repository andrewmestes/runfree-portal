import { NextRequest, NextResponse } from "next/server";
import { requireCertificationAccess } from "@/lib/api-auth";
import { isDriveConfigured } from "@/lib/drive";
import { listToolVideos } from "@/lib/tool-videos";

/** A cold Drive walk took 13 s in testing, which can outrun the default limit; 60 matches the other Drive routes. */
export const maxDuration = 60;

/**
 * GET /api/tool-videos
 *
 * The Process Tools Videos folder, grouped by module, for anyone with
 * certification access. Live from Drive (cached five minutes) — see
 * lib/tool-videos.ts.
 */
export async function GET(req: NextRequest) {
  try {
    const access = await requireCertificationAccess(req);
    if (!access.ok) return access.response;

    if (!isDriveConfigured() || !process.env.GOOGLE_TOOL_VIDEOS_FOLDER_ID) {
      return NextResponse.json({ error: "Tool videos are not configured on the server" }, { status: 503 });
    }

    const fresh = req.nextUrl.searchParams.get("fresh") === "1";
    const groups = await listToolVideos(fresh);
    return NextResponse.json({
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        order: g.order,
        videos: g.videos.map((v) => ({
          id: v.id,
          title: v.title,
          num: v.num,
          label: v.label,
          mimeType: v.mimeType,
          sizeBytes: v.sizeBytes,
          durationMs: v.durationMs ?? null,
        })),
      })),
    });
  } catch (error) {
    console.error("Tool video listing failed:", error);
    return NextResponse.json({ error: "Could not load the tool videos" }, { status: 500 });
  }
}
