import { NextRequest, NextResponse } from "next/server";
import { requireCertificationAccess } from "@/lib/api-auth";
import { getCompanionGuideCached, isCompanionConfigured, readCompanionGuide } from "@/lib/companion";

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

    const current = await getCompanionGuideCached();
    if (!current || (id !== "current" && current.id !== id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Drive's content hash is the ETag. A repeat open sends it back and gets
    // a 304 with no bytes; between opens the browser serves its own copy for
    // five minutes without asking. A new edition changes the hash, so the
    // guide is never stale by more than that.
    const etag = current.md5 ? `"${current.md5}"` : null;
    const cacheHeaders: Record<string, string> = {
      "Cache-Control": "private, max-age=300, must-revalidate",
      ...(etag ? { ETag: etag } : {}),
    };
    if (etag && req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: cacheHeaders });
    }

    const body = await readCompanionGuide(current);
    return new NextResponse(body, {
      status: 200,
      headers: {
        ...cacheHeaders,
        "Content-Type": current.mimeType,
        "Content-Disposition": `inline; filename="${current.name.replace(/"/g, "")}"`,
        "Content-Length": String(body.byteLength),
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
