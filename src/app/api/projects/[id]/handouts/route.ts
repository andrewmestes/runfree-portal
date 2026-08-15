import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/api-auth";
import { isDriveConfigured, listTemplateHandouts } from "@/lib/drive";

/**
 * The handout library for a project, read live from Drive.
 *
 * Nothing is copied into the database: whatever is in the folder is what the
 * church sees, so Andrew editing a PDF in Drive updates every engagement at
 * once with no sync step. The folder comes from the project's TEMPLATE
 * (`templates.handouts_folder_id`), because every Pivvot church reads the
 * same RunFree-branded set — see migration 013.
 *
 * Not cached. The CVF portal caches its equivalent in a module-level global,
 * which is safe there only because every certified framer is entitled to
 * byte-identical content; its own CLAUDE.md warns in as many words that the
 * pattern must not be copied into this portal. Even though the handout list
 * happens to be identical across Pivvot projects today, caching it here would
 * bake in an assumption that stops being true the first time a template gets
 * its own folder — and no local test would catch it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  const access = await requireProjectAccess(request, projectId);
  if (!access.ok) return access.response;

  if (!isDriveConfigured()) {
    // An explicit, quiet signal rather than a 500: the page renders fine
    // without handouts, and a missing service-account key is a deploy
    // problem, not something to surface as an error to a church.
    return NextResponse.json({ configured: false, byModule: {}, extras: [], notebooks: [] });
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
    return NextResponse.json({ configured: true, byModule: {}, extras: [], notebooks: [] });
  }

  try {
    const handouts = await listTemplateHandouts(folderId);
    return NextResponse.json({ configured: true, ...handouts });
  } catch (err) {
    console.error("Handout listing failed:", err);
    return NextResponse.json({ error: "Could not read the handout library" }, { status: 502 });
  }
}
