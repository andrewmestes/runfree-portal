import { NextRequest, NextResponse } from "next/server";
import { requireCertificationAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchDriveFile } from "@/lib/drive";
import { getFacilitatorGuide, isDriveConfigured } from "@/lib/guide";

/**
 * GET /api/guide/file/{id}
 *
 * The id is re-validated against a fresh getFacilitatorGuide() lookup rather
 * than trusted from the request — the same "recompute, don't trust" pattern
 * as every other gated file route.
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

    const current = await getFacilitatorGuide();
    if (!current || current.id !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const file = await fetchDriveFile(id);

    return new NextResponse(file.body, {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${file.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Guide file fetch failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not fetch the file" },
      { status: 500 }
    );
  }
}
