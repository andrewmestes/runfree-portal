/**
 * Create a real project for a staff member from a script, the way the New
 * Project page would: createProject() stamps it, then the template's default
 * highlights are seeded, then it is handed to its owner (creator, admin,
 * lead).
 *
 * A script cannot sign in as Andrew, so a throwaway staff account runs the
 * page's own code and is deleted afterwards. The page's highlight seeding
 * fetches relative /api paths, which only a browser resolves, so those go to
 * the dev server (`base`, normally http://localhost:3001) while it runs.
 *
 * Safe to re-run: an existing project with the same name and template is
 * reused, and the owner check runs every time (a run that stopped halfway
 * once left a project with no lead).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createProject } from "../../src/lib/projects";
import { seedDefaultHighlights } from "../../src/lib/highlights";

const STAMP_EMAIL = "project-stamp@example.com";
const STAMP_PASSWORD = "project-stamp-only-not-a-real-account-5823!";

export async function stampProjectFor(opts: {
  admin: SupabaseClient;
  templateId: string;
  name: string;
  ownerId: string;
  visibility: "team" | "private";
  go: boolean;
  base: string;
  log: (line: string) => void;
}): Promise<string | null> {
  const { admin, templateId, name, ownerId, visibility, go, base, log } = opts;

  const { data: found, error } = await admin
    .from("projects")
    .select("id")
    .eq("name", name)
    .eq("template_id", templateId);
  if (error) throw error;
  if ((found ?? []).length > 1) throw new Error(`${found!.length} projects are called "${name}"`);

  let id: string | null = found?.[0]?.id ?? null;
  if (id) log(`project       exists  ${id}`);
  else if (!go) log(`project       would create "${name}" and seed its default highlights`);
  else id = await create();

  if (!id) {
    log(`owner         would make creator, admin and lead`);
    return null;
  }
  await ensureOwner(id);
  return id;

  async function create(): Promise<string> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    let stamp = list.users.find((u) => u.email === STAMP_EMAIL) ?? null;
    if (!stamp) {
      const made = await admin.auth.admin.createUser({
        email: STAMP_EMAIL, password: STAMP_PASSWORD, email_confirm: true, user_metadata: { name: "Project Stamp" },
      });
      if (made.error) throw made.error;
      stamp = made.data.user;
    }
    const stampId = stamp!.id;
    try {
      // Staff, so insert_projects lets it create one; a certification role,
      // so /api/books answers the highlight seeding.
      const up = await admin
        .from("profiles")
        .update({ is_staff: true, account_role: "runfree_team", full_name: "Project Stamp" })
        .eq("id", stampId);
      if (up.error) throw up.error;
      const c = createClient(url, anon, { auth: { persistSession: false } });
      const si = await c.auth.signInWithPassword({ email: STAMP_EMAIL, password: STAMP_PASSWORD });
      if (si.error) throw si.error;
      const token = si.data.session!.access_token;

      const { id: newId } = await createProject(token, stampId, {
        name, visibility, templateId, isGroup: null,
      });
      log(`project       created ${newId}`);

      const { data: tpl } = await admin.from("templates").select("ui").eq("id", templateId).single();
      const defaults = ((tpl?.ui ?? {}) as { default_highlights?: string[] }).default_highlights ?? [];
      const realFetch = globalThis.fetch;
      globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
        realFetch(typeof input === "string" && input.startsWith("/") ? `${base}${input}` : input, init)) as typeof fetch;
      try {
        const n = await seedDefaultHighlights(token, newId, defaults, templateId);
        log(`highlights    ${n} of ${defaults.length}`);
      } finally {
        globalThis.fetch = realFetch;
      }

      // The stamp is the lead, and a project has exactly one
      // (one_lead_per_project), so its row goes before the owner's arrives.
      const del = await admin.from("project_members").delete().eq("project_id", newId).eq("profile_id", stampId);
      if (del.error) throw del.error;
      const own = await admin.from("projects").update({ created_by: ownerId }).eq("id", newId);
      if (own.error) throw own.error;
      return newId;
    } finally {
      // projects.created_by has no cascade: an account that still owns a
      // project must stay until that is fixed.
      const { data: still } = await admin.from("projects").select("id").eq("created_by", stampId);
      if (still?.length) {
        log(`!! ${STAMP_EMAIL} still created ${still.length} project(s); left in place`);
      } else {
        const gone = await admin.auth.admin.deleteUser(stampId); // the profile row cascades
        if (gone.error) log(`!! could not delete ${STAMP_EMAIL}: ${gone.error.message}`);
      }
    }
  }

  async function ensureOwner(projectId: string) {
    const { data: me, error: meErr } = await admin
      .from("project_members")
      .select("role, is_lead")
      .eq("project_id", projectId)
      .eq("profile_id", ownerId);
    if (meErr) throw meErr;
    if (me?.[0]?.role === "admin" && me[0].is_lead) {
      log(`owner         admin and lead`);
    } else if (!go) {
      log(`owner         would make admin and lead`);
    } else {
      const steps = [
        await admin.from("projects").update({ created_by: ownerId }).eq("id", projectId),
        await admin.from("project_members").update({ is_lead: false }).eq("project_id", projectId).neq("profile_id", ownerId),
        await admin.from("project_members").upsert(
          { project_id: projectId, profile_id: ownerId, role: "admin", is_lead: true },
          { onConflict: "project_id,profile_id" }
        ),
      ];
      const bad = steps.find((s) => s.error);
      if (bad?.error) throw bad.error;
      log(`owner         now admin and lead`);
    }
    if (go) {
      // Highlights the stamp added lost their author when it was deleted.
      const h = await admin.from("project_highlights").update({ created_by: ownerId })
        .eq("project_id", projectId).is("created_by", null);
      if (h.error) throw h.error;
    }
  }
}
