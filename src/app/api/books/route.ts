import { NextRequest, NextResponse } from "next/server";
import { requireCertificationAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { listBooksLibrary, isDriveConfigured } from "@/lib/books";

/**
 * GET /api/books
 *
 * Same shape as /api/library: a live read of the Books folder in Drive,
 * gated the same way. The listing is held for a minute in lib/books, so a
 * burst of page loads doesn't hammer the Drive API. Pass ?fresh=1 to re-read
 * Drive.
 *
 * No cache of its own. It used to keep one on top of the library's, so
 * ?fresh=1 skipped this one and was then handed the library's minute-old
 * listing, and a Drive change could take two minutes to appear.
 */

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
    const library = await listBooksLibrary({ fresh });

    return NextResponse.json(library);
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
