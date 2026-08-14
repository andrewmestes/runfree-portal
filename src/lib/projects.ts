import { createUserClient, type Database } from "./supabase";

export type ProjectRole = "viewer" | "editor" | "admin";

type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];
type DeliverableRow = Database["public"]["Tables"]["deliverables"]["Row"];
type TemplateResourceRow = Database["public"]["Tables"]["template_resources"]["Row"];

export type ProjectMember = {
  profileId: string;
  role: ProjectRole;
  fullName: string | null;
  email: string;
};

export type ProjectDetail = {
  id: string;
  name: string;
  visibility: "private" | "team";
  createdBy: string;
  archivedAt: string | null;
  template: { id: string; name: string; slug: string; structure: unknown } | null;
  members: ProjectMember[];
  sessions: SessionRow[];
  deliverables: DeliverableRow[];
  resources: TemplateResourceRow[];
};

/**
 * Everything one project page needs, in one round trip per table. Runs
 * through the caller's own RLS-scoped client, so a viewer transparently gets
 * published-only rows and a non-member gets nothing — there is no
 * "if staff, fetch differently" branch to get wrong here.
 */
export async function getProjectDetail(
  accessToken: string,
  projectId: string
): Promise<ProjectDetail | null> {
  const client = createUserClient(accessToken);

  const { data: project, error: projectErr } = await client
    .from("projects")
    .select("*, templates(id, name, slug, structure)")
    .eq("id", projectId)
    .maybeSingle();

  if (projectErr) throw projectErr;
  if (!project) return null;

  const [membersRes, sessionsRes, deliverablesRes, resourcesRes] = await Promise.all([
    client
      .from("project_members")
      .select("profile_id, role, profiles(full_name, email)")
      .eq("project_id", projectId),
    client
      .from("sessions")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true }),
    client
      .from("deliverables")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true }),
    project.template_id
      ? client
          .from("template_resources")
          .select("*")
          .eq("template_id", project.template_id)
          .order("position", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (membersRes.error) throw membersRes.error;
  if (sessionsRes.error) throw sessionsRes.error;
  if (deliverablesRes.error) throw deliverablesRes.error;
  if (resourcesRes.error) throw resourcesRes.error;

  const template = project.templates as unknown as
    | { id: string; name: string; slug: string; structure: unknown }
    | null;

  return {
    id: project.id,
    name: project.name,
    visibility: project.visibility,
    createdBy: project.created_by,
    archivedAt: project.archived_at,
    template,
    members: (membersRes.data ?? []).map((m) => {
      const profile = m.profiles as unknown as { full_name: string | null; email: string } | null;
      return {
        profileId: m.profile_id,
        role: m.role,
        fullName: profile?.full_name ?? null,
        email: profile?.email ?? "",
      };
    }),
    sessions: sessionsRes.data ?? [],
    deliverables: deliverablesRes.data ?? [],
    resources: (resourcesRes.data as TemplateResourceRow[]) ?? [],
  };
}

/** Group a list of section-labeled rows in template-declared order, then by first appearance. */
export function groupBySection<T extends { section: string | null }>(
  items: T[],
  sectionOrder: string[] = []
): Array<{ section: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.section ?? "General";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  const ordered = [...sectionOrder.filter((s) => groups.has(s))];
  for (const key of groups.keys()) {
    if (!ordered.includes(key)) ordered.push(key);
  }

  return ordered.map((section) => ({ section, items: groups.get(section)! }));
}

/** templates.structure's declared shape — an ordered outline of section names. */
export function sectionOrderFromStructure(structure: unknown): string[] {
  if (
    structure &&
    typeof structure === "object" &&
    "sections" in structure &&
    Array.isArray((structure as { sections: unknown }).sections)
  ) {
    return (structure as { sections: unknown[] }).sections.filter(
      (s): s is string => typeof s === "string"
    );
  }
  return [];
}

export type TemplateSummary = { id: string; name: string; slug: string; description: string | null };

/** Staff-only per read_templates — used to populate the "start from a template" picker. */
export async function listTemplates(accessToken: string): Promise<TemplateSummary[]> {
  const client = createUserClient(accessToken);
  const { data, error } = await client
    .from("templates")
    .select("id, name, slug, description")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Staff creates a project — from a template, or blank ("loose structure").
 * Two writes, both through the caller's own token: create_projects requires
 * is_staff, and the self-insert-as-admin is what insert_members' first
 * branch exists for. If the membership insert fails after the project
 * insert succeeds, the project is still valid and visible to the owner —
 * this never leaves an access-controlled orphan, just an unusually
 * unlucky staff member who needs to be re-added by the owner.
 */
export async function createProject(
  accessToken: string,
  creatorId: string,
  input: { name: string; visibility: "private" | "team"; templateId: string | null }
): Promise<{ id: string }> {
  const client = createUserClient(accessToken);

  const { data: project, error: projectErr } = await client
    .from("projects")
    .insert({
      name: input.name,
      visibility: input.visibility,
      template_id: input.templateId,
      created_by: creatorId,
    })
    .select("id")
    .single();
  if (projectErr || !project) throw projectErr ?? new Error("Project creation returned nothing");

  const { error: memberErr } = await client
    .from("project_members")
    .insert({ project_id: project.id, profile_id: creatorId, role: "admin" });
  if (memberErr) throw memberErr;

  return { id: project.id };
}

export async function createSession(
  accessToken: string,
  projectId: string,
  input: { title: string; section: string | null }
) {
  const client = createUserClient(accessToken);
  const { data, error } = await client
    .from("sessions")
    .insert({ project_id: projectId, title: input.title, section: input.section })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSession(
  accessToken: string,
  sessionId: string,
  patch: Database["public"]["Tables"]["sessions"]["Update"]
) {
  const client = createUserClient(accessToken);
  const { data, error } = await client
    .from("sessions")
    .update(patch)
    .eq("id", sessionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createDeliverable(
  accessToken: string,
  projectId: string,
  input: { title: string; section: string | null }
) {
  const client = createUserClient(accessToken);
  const { data, error } = await client
    .from("deliverables")
    .insert({ project_id: projectId, title: input.title, section: input.section })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateDeliverable(
  accessToken: string,
  deliverableId: string,
  patch: Database["public"]["Tables"]["deliverables"]["Update"]
) {
  const client = createUserClient(accessToken);
  const { data, error } = await client
    .from("deliverables")
    .update(patch)
    .eq("id", deliverableId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMemberRole(
  accessToken: string,
  projectId: string,
  profileId: string,
  role: ProjectRole
) {
  const client = createUserClient(accessToken);
  const { error } = await client
    .from("project_members")
    .update({ role })
    .eq("project_id", projectId)
    .eq("profile_id", profileId);
  if (error) throw error;
}

export async function removeMember(accessToken: string, projectId: string, profileId: string) {
  const client = createUserClient(accessToken);
  const { error } = await client
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("profile_id", profileId);
  if (error) throw error;
}
