import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchDriveFile } from "@/lib/drive";
import { listBooksLibrary, isDriveConfigured } from "@/lib/books";

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

    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user?.email) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { data: framer } = await supabaseAdmin
      .from("certified_framers")
      .select("id")
      .eq("email", user.email)
      .single();

    if (!framer) {
      return NextResponse.json(
        { error: "Not a certified Vision Framer" },
        { status: 403 }
      );
    }

    if (!isDriveConfigured()) {
      return NextResponse.json(
        { error: "Drive is not configured on the server" },
        { status: 503 }
      );
    }

    const library = await listBooksLibrary();
    const known = new Set(
      library.books.flatMap((b) =>
        [b.fullBook, b.visualSummary, ...b.chapters, ...b.other]
          .filter(Boolean)
          .map((f) => f!.id)
      )
    );
    library.extras.forEach((f) => known.add(f.id));

    if (!known.has(id)) {
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
