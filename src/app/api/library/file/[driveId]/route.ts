import { NextRequest, NextResponse } from "next/server";
import { requireCertificationAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import {
  fetchDriveFile,
  fileInsideFolder,
  isDriveConfigured,
} from "@/lib/drive";

/**
 * GET /api/library/file/{driveId}
 *
 * The only path to a file's bytes. Verifies the session and the certified
 * framers allowlist, confirms the requested file is actually inside the shared
 * library folder, then streams the live bytes from Drive.
 */
/**
 * The combined module handouts are 8–19MB each, and this route re-lists the
 * whole Drive library before streaming (that listing IS the authorization
 * boundary — see below). Next's default cap is 15 seconds, which the big ones
 * were exceeding: every combined handout failed with "could not be opened"
 * while the individual sheets, a few hundred KB each, always worked.
 */
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ driveId: string }> }
) {
  try {
    const { driveId } = await params;

    const access = await requireCertificationAccess(req);
    if (!access.ok) return access.response;

    if (!isDriveConfigured()) {
      return NextResponse.json(
        { error: "Drive is not configured on the server" },
        { status: 503 }
      );
    }

    // Only serve files that belong to the shared library — the service
    // account reads several folders, and a handout link must not become a
    // way to read the others. Checked by walking up from the file rather
    // than listing the whole library: this route is what a Digital
    // Facilitator's Guide link opens, from the front of a room, and the
    // full listing took several seconds on a cold instance.
    //
    // The walk and the fetch start together — each is a second or so of
    // sequential Google calls, and nothing is sent until the walk says yes.
    // A file the walk rejects has its stream cancelled unread.
    const [known, fetched] = await Promise.all([
      fileInsideFolder(driveId, process.env.GOOGLE_DRIVE_FOLDER_ID!),
      fetchDriveFile(driveId).catch(() => null),
    ]);

    if (!known || !fetched) {
      if (fetched) void fetched.body.cancel().catch(() => {});
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const file = fetched;

    return new NextResponse(file.body, {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${file.filename.replace(
          /"/g,
          ""
        )}"`,
        "Cache-Control": "private, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Drive fetch failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not fetch the file",
      },
      { status: 500 }
    );
  }
}
