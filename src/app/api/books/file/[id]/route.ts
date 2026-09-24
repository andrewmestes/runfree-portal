import { NextRequest, NextResponse } from "next/server";
import { requireCertificationAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchDriveFile } from "@/lib/drive";
import { listBooksLibrary, isDriveConfigured, type BookFile } from "@/lib/books";
import { contentDisposition } from "@/lib/content-disposition";

/**
 * GET /api/books/file/{driveId}
 *
 * Gated the same way as /api/library/file — session, allowlist, and a check
 * that the requested id is actually part of the books library before it's
 * ever handed to Drive.
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

    const library = await listBooksLibrary();
    // Every shelf, INCLUDING the standalone one-file books. Leaving those out
    // is what broke Innovating Discipleship the moment it was lifted from
    // `extras` onto the shelf: the allowlist stopped containing its id, so a
    // file that had always been readable started 404ing. Any new bucket on
    // BooksLibrary has to be added here too.
    const known = new Map<string, BookFile>();
    for (const b of [...library.books, ...library.standalone]) {
      for (const f of [b.fullBook, b.visualSummary, ...b.chapters, ...b.other]) {
        if (f) known.set(f.id, f);
      }
    }
    library.extras.forEach((f) => known.set(f.id, f));

    const entry = known.get(id);
    if (!entry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const file = await fetchDriveFile(id);
    // Named by the library's title, not the Drive filename. /open/book takes
    // its header from this, so it read "Problem_Statement_Deck" and
    // "Ch13_Values" where the shelf now says "Problem Statement Deck" and
    // "Church Unique - Chapter 13 - Values". The extension is still the
    // file's own, which covers a Google Doc exported as .pdf. The header
    // helper makes it safe to send whatever the title holds.
    const ext = file.filename.match(/\.[a-z0-9]{1,5}$/i)?.[0] ?? "";
    const filename = `${entry.title.trim() || "Document"}${ext}`;

    return new NextResponse(file.body, {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": contentDisposition("inline", filename),
        "Cache-Control": "private, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Book file fetch failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not fetch the file",
      },
      { status: 500 }
    );
  }
}
