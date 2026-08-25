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
 *
 * Cached, unlike the project handouts route beside it, and the difference is
 * deliberate. Handouts come from the project's TEMPLATE folder, so caching
 * them across projects would bake in an assumption that stops being true the
 * first time a template gets its own folder. The books folder is a single
 * global env var: every caller reads byte-identical content by construction,
 * so there is no per-project variance for a cache to leak.
 */
type Cached = { at: number; payload: unknown };
let cache: Cached | null = null;
const TTL_MS = 60_000;

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
    if (cache && Date.now() - cache.at < TTL_MS) {
      return NextResponse.json({ ...(cache.payload as object), configured: true, cached: true });
    }

    const library = await listBooksLibrary();
    cache = { at: Date.now(), payload: library };

    return NextResponse.json({ ...library, configured: true, cached: false });
  } catch (error) {
    console.error("Project books listing failed:", error);
    return NextResponse.json({ error: "Could not read the books library" }, { status: 502 });
  }
}
