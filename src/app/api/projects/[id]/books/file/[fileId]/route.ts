import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/api-auth";
import { fetchDriveFile } from "@/lib/drive";
import { listBooksLibrary, isDriveConfigured } from "@/lib/books";

/**
 * GET /api/projects/{id}/books/file/{driveId}
 *
 * The bytes of one book file, for a project member. Gated on membership
 * rather than certification access, for the reason in the sibling route.
 *
 * The id is checked against the library before Drive is ever asked, so this
 * cannot be turned into a proxy for arbitrary Drive files. Note the allowlist
 * spans standalone as well as books and extras — omitting it is exactly what
 * broke Innovating Discipleship on the certification side.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id: projectId, fileId } = await params;

  const access = await requireProjectAccess(request, projectId);
  if (!access.ok) return access.response;

  if (!isDriveConfigured() || !process.env.GOOGLE_BOOKS_FOLDER_ID) {
    return NextResponse.json({ error: "Books are not configured" }, { status: 503 });
  }

  let known: Set<string>;
  try {
    const library = await listBooksLibrary();
    known = new Set(
      [...library.books, ...library.standalone].flatMap((b) =>
        [b.fullBook, b.visualSummary, ...b.chapters, ...b.other]
          .filter(Boolean)
          .map((f) => f!.id)
      )
    );
    library.extras.forEach((f) => known.add(f.id));
  } catch (err) {
    console.error("Books listing failed:", err);
    return NextResponse.json({ error: "Could not read the books library" }, { status: 502 });
  }

  if (!known.has(fileId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const file = await fetchDriveFile(fileId);
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
    return NextResponse.json({ error: "Could not fetch the file" }, { status: 502 });
  }
}
