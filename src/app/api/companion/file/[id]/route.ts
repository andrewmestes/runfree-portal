import { NextRequest, NextResponse } from "next/server";
import { requireCertificationAccess } from "@/lib/api-auth";
import { fetchDriveFile } from "@/lib/drive";
import { getCompanionGuide, isCompanionConfigured } from "@/lib/companion";

/**
 * GET /api/companion/file/{id}
 *
 * The Certification Companion Guide's bytes. `{id}` may be the literal
 * `current`, which is what the hub card links to — so the card never has to
 * know a Drive id, and a new edition in Drive is what it opens. Any other id
 * is re-validated against the live lookup, the same "recompute, don't trust"
 * pattern as /api/guide/file.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const access = await requireCertificationAccess(req);
    if (!access.ok) return access.response;

    if (!isCompanionConfigured()) {
      return NextResponse.json({ error: "The Companion Guide is not configured on the server" }, { status: 503 });
    }

    const current = await getCompanionGuide();
    if (!current || (id !== "current" && current.id !== id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const file = await fetchDriveFile(current.id);
    return new NextResponse(file.body, {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${file.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Companion guide fetch failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not fetch the file" },
      { status: 500 }
    );
  }
}
