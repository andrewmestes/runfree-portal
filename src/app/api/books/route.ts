import { NextRequest, NextResponse } from "next/server";
import { requireCertificationAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { listBooksLibrary, isDriveConfigured } from "@/lib/books";

/**
 * GET /api/books
 *
 * Same shape as /api/library: a live read of the Books folder in Drive,
 * gated the same way, briefly cached so a burst of page loads doesn't hammer
 * the Drive API. Pass ?fresh=1 to bypass the cache.
 */

type Cached = { at: number; payload: unknown };
let cache: Cached | null = null;
const TTL_MS = 60_000;

export async function GET(req: NextRequest) {
  try {
    const access = await requireCertificationAccess(req);
    if (!access.ok) return access.response;

    if (!isDriveConfigured() || !process.env.GOOGLE_BOOKS_FOLDER_ID) {
      return NextResponse.json(
        { error: "Books library is not configured on the server" },
        { status: 503 }
      );
    }

    const fresh = req.nextUrl.searchParams.get("fresh") === "1";

    if (!fresh && cache && Date.now() - cache.at < TTL_MS) {
      return NextResponse.json({ ...(cache.payload as object), cached: true });
    }

    const library = await listBooksLibrary();
    cache = { at: Date.now(), payload: library };

    return NextResponse.json({ ...library, cached: false });
  } catch (error) {
    console.error("Books listing failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not read the books library",
      },
      { status: 500 }
    );
  }
}
