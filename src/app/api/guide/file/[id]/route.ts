import { NextRequest, NextResponse } from "next/server";
import { requireCertificationAccess } from "@/lib/api-auth";
import { getFacilitatorGuideCached, isDriveConfigured, readFacilitatorGuide } from "@/lib/guide";

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

    const current = await getFacilitatorGuideCached();
    if (!current || current.id !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Drive's content hash is the ETag. A repeat open sends it back and gets
    // a 304 with no bytes; between opens the browser serves its own copy for
    // five minutes without asking. A new edition changes the hash.
    const etag = current.md5 ? `"${current.md5}"` : null;
    const cacheHeaders: Record<string, string> = {
      "Cache-Control": "private, max-age=300, must-revalidate",
      ...(etag ? { ETag: etag } : {}),
    };
    if (etag && req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: cacheHeaders });
    }

    const { body, length } = await readFacilitatorGuide(current);
    return new NextResponse(body, {
      status: 200,
      headers: {
        ...cacheHeaders,
        "Content-Type": current.mimeType,
        "Content-Disposition": `inline; filename="${current.name.replace(/"/g, "")}"`,
        ...(length ? { "Content-Length": String(length) } : {}),
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
