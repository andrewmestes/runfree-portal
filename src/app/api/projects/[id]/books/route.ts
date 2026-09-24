import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/api-auth";
import { listBooksLibrary, isDriveConfigured } from "@/lib/books";

/**
 * GET /api/projects/{id}/books
 *
 * Will's books, for a church on an engagement. Andrew: "we need to add Will's
 * Books to all the Pivvot projects."
 *
 * Same library as /api/books, different gate. That one requires certification
 * access, which a church client does not have and should not need — the books
 * are the reading behind the process they are paying for. Membership of the
 * project is the right question here, so this asks that instead.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const access = await requireProjectAccess(request, projectId);
  if (!access.ok) return access.response;

  if (!isDriveConfigured() || !process.env.GOOGLE_BOOKS_FOLDER_ID) {
    // Quiet, like the handouts route: the panel renders an empty state and a
    // missing key is a deploy problem, not something to shout at a church.
    return NextResponse.json({ configured: false, books: [], extras: [], standalone: [] });
  }

  try {
    const library = await listBooksLibrary();
    return NextResponse.json({ ...library, configured: true });
  } catch (error) {
    console.error("Project books listing failed:", error);
    return NextResponse.json({ error: "Could not read the books library" }, { status: 502 });
  }
}
