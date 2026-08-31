import { NextRequest, NextResponse } from "next/server";
import { requireCertificationAccess } from "@/lib/api-auth";
import { fetchDriveFile } from "@/lib/drive";
import { listPresentationFileIds, isDriveConfigured } from "@/lib/keynotes";

/**
 * GET /api/keynotes/file/{driveId}
 *
 * Gated like /api/books/file: session, certification allowlist, and a check
 * that the id is genuinely part of this feature's folder before it is handed
 * to Drive. Without that last check an authenticated framer could read
 * anything the service account can see.
 *
 * `attachment`, not `inline` — a browser cannot render a .key or a .pptx, so
 * an inline disposition just produces a download with a worse filename.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const access = await requireCertificationAccess(req);
    if (!access.ok) return access.response;

    if (!isDriveConfigured()) {
      return NextResponse.json(
        { error: "Drive is not configured on the server" },
        { status: 503 }
      );
    }

    const allowed = await listPresentationFileIds();
    if (!allowed.has(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const file = await fetchDriveFile(id);

    return new NextResponse(file.body, {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Keynote file fetch failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not fetch the file" },
      { status: 500 }
    );
  }
}
