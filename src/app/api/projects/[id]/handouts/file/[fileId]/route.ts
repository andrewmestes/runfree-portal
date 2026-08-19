import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/api-auth";
import { fetchDriveFile, isDriveConfigured, listTemplateHandouts } from "@/lib/drive";

/**
 * Stream one handout.
 *
 * THE LIST REBUILD BELOW IS THE AUTHORIZATION BOUNDARY, NOT WASTED WORK.
 * The requested id has to appear in the library this project can actually
 * reach; anything else 404s. Without it, any signed-in member of any project
 * could ask the service account — which can read the whole shared drive — for
 * an arbitrary Drive id, and get it. The CVF portal learned this one the same
 * way and its CLAUDE.md says plainly not to cache or skip this call.
 *
 * Two "obvious optimizations" that must not be applied here, both verified in
 * production on the CVF side:
 *   - Adding Content-Length: the browser waits for exact declared bytes a
 *     stream doesn't deliver, and every PDF preview hangs.
 *   - Range/206 support: measured slower despite fewer bytes, nine round
 *     trips replacing one.
 */
/**
 * The combined module handouts are 8–19MB each, and this route re-lists the
 * whole Drive library before streaming (that listing IS the authorization
 * boundary — see below). Next's default cap is 15 seconds, which the big ones
 * were exceeding: every combined handout failed with "could not be opened"
 * while the individual sheets, a few hundred KB each, always worked.
 */
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id: projectId, fileId } = await params;

  const access = await requireProjectAccess(request, projectId);
  if (!access.ok) return access.response;

  if (!isDriveConfigured()) {
    return NextResponse.json({ error: "Drive is not configured" }, { status: 503 });
  }

  const { data: project, error } = await access.client
    .from("projects")
    .select("templates(handouts_folder_id)")
    .eq("id", projectId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const template = project?.templates as unknown as { handouts_folder_id: string | null } | null;
  const folderId = template?.handouts_folder_id ?? null;
  if (!folderId) {
    return NextResponse.json({ error: "No handout library for this project" }, { status: 404 });
  }

  let known: Set<string>;
  try {
    const handouts = await listTemplateHandouts(folderId);
    known = new Set<string>([
      ...Object.values(handouts.byModule).flatMap((m) => [
        ...(m.combined ? [m.combined.id] : []),
        ...m.sheets.map((s) => s.id),
      ]),
      ...handouts.extras.flatMap((g) => g.files.map((f) => f.id)),
      ...handouts.notebooks.map((n) => n.id),
    ]);
  } catch (err) {
    console.error("Handout listing failed:", err);
    return NextResponse.json({ error: "Could not read the handout library" }, { status: 502 });
  }

  if (!known.has(fileId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const file = await fetchDriveFile(fileId);
    return new NextResponse(file.body, {
      headers: {
        "Content-Type": file.mimeType,
        // inline so a PDF opens in the browser's viewer rather than landing
        // in Downloads — a church team reads these during a session.
        "Content-Disposition": `inline; filename="${file.filename.replace(/"/g, "")}"`,
        // Private: the URL is only meaningful to someone who passed the check
        // above, and a shared cache must never hold it.
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    console.error("Handout fetch failed:", err);
    return NextResponse.json({ error: "Could not fetch that file" }, { status: 502 });
  }
}
