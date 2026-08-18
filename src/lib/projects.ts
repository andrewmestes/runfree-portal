import { createUserClient, type Database } from "./supabase";

export type ProjectRole = "viewer" | "editor" | "admin";

type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];
type DeliverableRow = Database["public"]["Tables"]["deliverables"]["Row"];
type TemplateResourceRow = Database["public"]["Tables"]["template_resources"]["Row"];

export type ProjectMember = {
  profileId: string;
  role: ProjectRole;
  /** Their title where they work. No permissions attached — see migration 010. */
  orgRole: string | null;
  isLead: boolean;
  /** Splits the roster into the RunFree side and the church's side. */
  isStaff: boolean;
  fullName: string | null;
  email: string;
  avatarPath: string | null;
};

export type VisionStackLayer = {
  slug: string;
  name: string;
  blurb: string | null;
  position: number;
  icon_path: string | null;
};

/**
 * What a prepare card offers, not what it may contain — see migration 022.
 * A card of the wrong kind shows the wrong inputs; it never hides a row.
 */
export type PrepGroupKind = "dates" | "checklist" | "reading" | "files" | "notes";

export type PrepGroup = {
  id: string;
  section: string;
  key: string;
  title: string;
  description: string | null;
  kind: PrepGroupKind;
  position: number;
};

export type PrepItem = {
  id: string;
  project_id: string;
  group_id: string;
  title: string;
  notes: string | null;
  due_on: string | null;
  external_url: string | null;
  file_path: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
  is_done: boolean;
  position: number;
};

export type ChurchContact = {
  id: string;
  project_id: string;
  full_name: string;
  email: string | null;
  title: string | null;
  position: number;
};

export type ProjectDetail = {
  id: string;
  name: string;
  visibility: "private" | "team";
  createdBy: string;
  archivedAt: string | null;
  logoPath: string | null;
  location: string | null;
  websiteUrl: string | null;
  about: string | null;
  priorities: string | null;
  prioritiesUpdatedAt: string | null;
  template: {
    id: string;
    name: string;
    slug: string;
    structure: unknown;
    hasVisionStack: boolean;
    isGroup: boolean;
  } | null;
  /** Per-module notes, keyed by section. */
  sectionNotes: Record<string, string>;
  members: ProjectMember[];
  sessions: SessionRow[];
  deliverables: DeliverableRow[];
  resources: TemplateResourceRow[];
  stackLayers: VisionStackLayer[];
  /** The prepare buckets this template declares, in render order. */
  prepGroups: PrepGroup[];
  /** This project's own prepare rows, across every group. */
  prepItems: PrepItem[];
  /**
   * The church roster — name, email, title. Deliberately NOT project_members:
   * being on the roster grants no access and sends no email. See migration
   * 026.
   */
  contacts: ChurchContact[];
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
    .select("*, templates(id, name, slug, structure, has_vision_stack, is_group)")
    .eq("id", projectId)
    .maybeSingle();

  if (projectErr) throw projectErr;
  if (!project) return null;

  const [
    membersRes,
    sessionsRes,
    deliverablesRes,
    resourcesRes,
    layersRes,
    notesRes,
    prepGroupsRes,
    prepItemsRes,
    contactsRes,
  ] = await Promise.all([
    client
      .from("project_members")
      .select("profile_id, role, org_role, is_lead, profiles(full_name, email, is_staff, avatar_path)")
      .eq("project_id", projectId),
    // Date first, because that is how a coach thinks about ten sessions
    // delivered over months. position only breaks ties — two sessions on one
    // day, or sessions not yet dated, which sort last rather than leading the
    // list with blanks.
    client
      .from("sessions")
      .select("*")
      .eq("project_id", projectId)
      .order("held_on", { ascending: true, nullsFirst: false })
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
    client.from("vision_stack_layers").select("*").order("position", { ascending: true }),
    client.from("section_notes").select("section, body").eq("project_id", projectId),
    project.template_id
      ? client
          .from("template_prep_groups")
          .select("*")
          .eq("template_id", project.template_id)
          .order("position", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    client
      .from("prep_items")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true }),
    client
      .from("church_contacts")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true }),
  ]);

  if (membersRes.error) throw membersRes.error;
  if (sessionsRes.error) throw sessionsRes.error;
  if (deliverablesRes.error) throw deliverablesRes.error;
  if (resourcesRes.error) throw resourcesRes.error;
  if (layersRes.error) throw layersRes.error;
  if (notesRes.error) throw notesRes.error;
  if (prepGroupsRes.error) throw prepGroupsRes.error;
  if (prepItemsRes.error) throw prepItemsRes.error;
  if (contactsRes.error) throw contactsRes.error;

  const t = project.templates as unknown as
    | {
        id: string;
        name: string;
        slug: string;
        structure: unknown;
        has_vision_stack: boolean;
        is_group: boolean;
      }
    | null;
  const template = t
    ? {
        id: t.id,
        name: t.name,
        slug: t.slug,
        structure: t.structure,
        hasVisionStack: t.has_vision_stack,
        isGroup: t.is_group,
      }
    : null;

  return {
    id: project.id,
    name: project.name,
    visibility: project.visibility,
    createdBy: project.created_by,
    archivedAt: project.archived_at,
    logoPath: project.logo_path,
    location: project.location,
    websiteUrl: project.website_url,
    about: project.about,
    priorities: project.priorities,
    prioritiesUpdatedAt: project.priorities_updated_at,
    template,
    sectionNotes: Object.fromEntries(
      (notesRes.data ?? []).map((n) => [n.section, n.body ?? ""])
    ),
    members: (membersRes.data ?? []).map((m) => {
      const profile = m.profiles as unknown as {
        full_name: string | null;
        email: string;
        is_staff: boolean;
        avatar_path: string | null;
      } | null;
      return {
        profileId: m.profile_id,
        role: m.role,
        orgRole: m.org_role,
        isLead: m.is_lead,
        isStaff: profile?.is_staff ?? false,
        fullName: profile?.full_name ?? null,
        email: profile?.email ?? "",
        avatarPath: profile?.avatar_path ?? null,
      };
    }),
    sessions: sessionsRes.data ?? [],
    deliverables: deliverablesRes.data ?? [],
    resources: (resourcesRes.data as TemplateResourceRow[]) ?? [],
    stackLayers: (layersRes.data as VisionStackLayer[]) ?? [],
    prepGroups: (prepGroupsRes.data as PrepGroup[]) ?? [],
    prepItems: (prepItemsRes.data as PrepItem[]) ?? [],
    contacts: (contactsRes.data as ChurchContact[]) ?? [],
  };
}

/**
 * The roster as CSV — "in case we need to copy and paste all of the emails to
 * send them all an email or easily add them to a group of contacts."
 *
 * Two escaping concerns, not one:
 *
 * 1. Quoting. A job title like 'Pastor, "Family Life"' otherwise shifts every
 *    subsequent column.
 * 2. Formula injection. Excel and Sheets evaluate a cell beginning with
 *    = + - @ (or tab/CR) as a formula, so a name typed as
 *    `=HYPERLINK("http://evil","click")` becomes a live link in a file
 *    RunFree opens and forwards. These fields are typed by church admins
 *    rather than the public, but a roster is exactly the kind of file that
 *    gets mailed around, and prefixing a quote costs nothing.
 */
export function membersToCsv(members: ProjectMember[]): string {
  const escape = (v: string | null) => {
    const raw = v ?? "";
    const neutralised = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return `"${neutralised.replace(/"/g, '""')}"`;
  };
  const rows = [
    ["Name", "Email", "Role at church", "Portal access"],
    ...members.map((m) => [m.fullName, m.email, m.orgRole, m.role]),
  ];
  return rows.map((r) => r.map((c) => escape(c as string | null)).join(",")).join("\r\n");
}

/**
 * An href we're willing to put in the DOM. Returns null for anything that
 * isn't plain http(s) — notably `javascript:` and `data:`, which would
 * otherwise execute when a client clicked a church's "website".
 *
 * These values are entered by staff, not the public, so this is defence in
 * depth rather than a known hole — but the cost is one function and the
 * failure mode is script execution in every project member's browser.
 */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
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

/**
 * Every section this project can file something under: the template's declared
 * outline first, then anything already in use that the template didn't name.
 *
 * Deriving this from content alone — which is what the session form did — meant
 * a brand-new project offered nothing, and a Younique or Meta Performance
 * project offered nothing ever, since neither uses "Mod #N" headings and the
 * module rail is what supplied the list.
 */
export function availableSections(detail: ProjectDetail): string[] {
  const declared = sectionOrderFromStructure(detail.template?.structure);
  const inUse = [
    ...detail.resources.map((r) => r.section),
    ...detail.sessions.map((s) => s.section),
    ...detail.deliverables.map((d) => d.section),
  ].filter((s): s is string => !!s);

  return [...new Set([...declared, ...inUse])];
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

  // The person creating an engagement is the one running it, until someone
  // says otherwise. Without this the hero's "led by …" line and the
  // highlighted lead card never render on any project created in the browser
  // — they only ever worked on Athena because that row was set by hand.
  const { error: memberErr } = await client
    .from("project_members")
    .insert({ project_id: project.id, profile_id: creatorId, role: "admin", is_lead: true });
  if (memberErr) throw memberErr;

  // Stamp the template's deliverables onto the new project.
  //
  // This has to happen AFTER the membership insert, not before: write_deliverables
  // requires the caller to be an editor or admin ON THIS PROJECT, and until the
  // row above exists they are neither. Ordering it the other way fails RLS on a
  // project the same person just created, which reads like a permissions bug and
  // is really a sequencing one.
  //
  // Failure here is reported rather than swallowed. A project with no
  // deliverables looks finished — the module rail renders, because handouts and
  // videos are keyed by template — and only reveals itself when someone opens
  // the Vision Stack and finds four empty layers.
  if (input.templateId) {
    await stampTemplateMembers(accessToken, project.id, input.templateId);
    await stampTemplateDeliverables(accessToken, project.id, input.templateId);
    await stampTemplatePrepItems(accessToken, project.id, input.templateId);
  }

  return { id: project.id };
}

/**
 * Add the RunFree people a template says belong on every engagement of its
 * kind — Will and Brooke on Pivvot.
 *
 * Runs after the creator's own membership for the same reason stamping
 * deliverables does: insert_members only lets an ADMIN ON THIS PROJECT add
 * anyone, and until that first row exists the creator is not one.
 *
 * Failure is swallowed rather than thrown. A project missing Brooke's contact
 * card is a cosmetic gap the team section can fix in two clicks; a project
 * that failed to create because of it is not.
 */
export async function stampTemplateMembers(
  accessToken: string,
  projectId: string,
  templateId: string
): Promise<{ added: number }> {
  const client = createUserClient(accessToken);

  const { data: rows, error } = await client
    .from("template_members")
    .select("profile_id, role, org_role")
    .eq("template_id", templateId)
    .order("position", { ascending: true });

  if (error || !rows?.length) return { added: 0 };

  const { error: insertErr } = await client.from("project_members").insert(
    rows.map((r) => ({
      project_id: projectId,
      profile_id: r.profile_id,
      role: r.role,
      org_role: r.org_role,
    }))
  );

  if (insertErr) {
    console.error("Could not add the template's RunFree team:", insertErr.message);
    return { added: 0 };
  }
  return { added: rows.length };
}

/**
 * Copy a template's deliverable scaffolding onto a project.
 *
 * Separated out so it can be re-run: if the bulk insert fails partway, or a
 * project was created before templates carried deliverables at all, this
 * fills in what is missing without duplicating what is already there.
 * Matching on title is safe here because it is scoped to one project.
 */
export async function stampTemplateDeliverables(
  accessToken: string,
  projectId: string,
  templateId: string
): Promise<{ added: number }> {
  const client = createUserClient(accessToken);

  const [{ data: templateRows, error: tplErr }, { data: existing, error: exErr }] =
    await Promise.all([
      client
        .from("template_deliverables")
        .select("title, section, kind, stack_layer, position")
        .eq("template_id", templateId)
        .order("position", { ascending: true }),
      client.from("deliverables").select("title").eq("project_id", projectId),
    ]);

  if (tplErr) throw tplErr;
  if (exErr) throw exErr;
  if (!templateRows?.length) return { added: 0 };

  const already = new Set((existing ?? []).map((d) => (d.title ?? "").toLowerCase()));
  const toInsert = templateRows
    .filter((r) => !already.has(r.title.toLowerCase()))
    .map((r) => ({
      project_id: projectId,
      title: r.title,
      section: r.section,
      kind: r.kind,
      stack_layer: r.stack_layer,
      position: r.position,
      // Deliberately unpublished: the scaffolding is the coach's worklist, and
      // a church should see a deliverable once it holds their actual work, not
      // as two dozen empty placeholders on day one.
      published_at: null,
    }));

  if (toInsert.length === 0) return { added: 0 };

  const { error } = await client.from("deliverables").insert(toInsert);
  if (error) throw error;

  return { added: toInsert.length };
}

export async function createSession(
  accessToken: string,
  projectId: string,
  input: { title: string; section: string | null; held_on?: string | null }
) {
  const client = createUserClient(accessToken);

  // Continue from the highest position in use rather than defaulting to 0.
  // Every session sharing position 0 is what made the numbered circles in the
  // session list unstable between page loads.
  const { data: last } = await client
    .from("sessions")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await client
    .from("sessions")
    .insert({
      project_id: projectId,
      title: input.title,
      section: input.section,
      held_on: input.held_on ?? null,
      position: (last?.position ?? -1) + 1,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Save the "what your team is doing right now" note.
 *
 * The timestamp is set here rather than by a trigger so the page can say when
 * it was last changed — a priority from two months ago is worse than none,
 * and the date is what tells a church which it is.
 */
export async function updatePriorities(
  accessToken: string,
  projectId: string,
  priorities: string
) {
  const client = createUserClient(accessToken);
  const { error } = await client
    .from("projects")
    .update({
      priorities: priorities.trim() || null,
      priorities_updated_at: priorities.trim() ? new Date().toISOString() : null,
    })
    .eq("id", projectId);
  if (error) throw error;
}

/** Notes, next steps or homework attached to one module. */
export async function saveSectionNote(
  accessToken: string,
  projectId: string,
  section: string,
  body: string
) {
  const client = createUserClient(accessToken);
  const { error } = await client
    .from("section_notes")
    .upsert(
      { project_id: projectId, section, body: body.trim() || null, updated_at: new Date().toISOString() },
      { onConflict: "project_id,section" }
    );
  if (error) throw error;
}

/** A person's headshot. One face per person, reused across every engagement. */
export async function updateAvatar(accessToken: string, profileId: string, path: string) {
  const client = createUserClient(accessToken);
  const { error } = await client.from("profiles").update({ avatar_path: path }).eq("id", profileId);
  if (error) throw error;
}

export async function deleteSession(accessToken: string, sessionId: string) {
  const client = createUserClient(accessToken);
  const { error } = await client.from("sessions").delete().eq("id", sessionId);
  if (error) throw error;
}

/**
 * Hand the lead-navigator flag to one member.
 *
 * Cleared everywhere on this project first, because a partial unique index
 * (migration 016) allows exactly one true row per project — setting the new
 * one while the old is still flagged violates it. Two statements rather than
 * one, and the clear has to win the race, so it is awaited rather than
 * fired alongside.
 */
export async function setLeadNavigator(
  accessToken: string,
  projectId: string,
  profileId: string | null
) {
  const client = createUserClient(accessToken);

  const { error: clearErr } = await client
    .from("project_members")
    .update({ is_lead: false })
    .eq("project_id", projectId)
    .eq("is_lead", true);
  if (clearErr) throw clearErr;

  if (!profileId) return;

  const { error } = await client
    .from("project_members")
    .update({ is_lead: true })
    .eq("project_id", projectId)
    .eq("profile_id", profileId);
  if (error) throw error;
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

/**
 * Archive hides a finished engagement from the project list without touching
 * a single row of its content — the church's whole Vision Frame is still
 * there if it is ever un-archived. This is the one to reach for.
 */
export async function setProjectArchived(
  accessToken: string,
  projectId: string,
  archived: boolean
) {
  const client = createUserClient(accessToken);
  const { error } = await client
    .from("projects")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", projectId);
  if (error) throw error;
}

/**
 * Delete is permanent and cascades: sessions, deliverables, prep items,
 * roster, membership, and every uploaded image and PDF belonging to the
 * project go with it. Storage objects are removed first, because once the
 * project row is gone the RLS policies that authorise deleting its files no
 * longer resolve and the bucket keeps them forever.
 */
export async function deleteProject(accessToken: string, projectId: string) {
  const client = createUserClient(accessToken);

  const { data: files } = await client.storage.from("deliverable-images").list(projectId, {
    limit: 1000,
  });
  if (files && files.length > 0) {
    await client.storage
      .from("deliverable-images")
      .remove(files.map((f) => `${projectId}/${f.name}`));
  }

  const { error } = await client.from("projects").delete().eq("id", projectId);
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/* Church roster                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Roster rows only. None of these functions can grant access or send mail —
 * that is project_members, and it stays a separate, deliberate action.
 */
export async function createContact(
  accessToken: string,
  projectId: string,
  input: { full_name: string; email?: string | null; title?: string | null },
  siblings: { position: number }[] = []
) {
  const client = createUserClient(accessToken);
  const position = siblings.reduce((max, s) => Math.max(max, s.position), -1) + 1;
  const { error } = await client
    .from("church_contacts")
    .insert({ ...input, project_id: projectId, position });
  if (error) throw error;
}

export async function updateContact(
  accessToken: string,
  contactId: string,
  patch: { full_name?: string; email?: string | null; title?: string | null }
) {
  const client = createUserClient(accessToken);
  const { error } = await client.from("church_contacts").update(patch).eq("id", contactId);
  if (error) throw error;
}

export async function deleteContact(accessToken: string, contactId: string) {
  const client = createUserClient(accessToken);
  const { error } = await client.from("church_contacts").delete().eq("id", contactId);
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/* Preparation items                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Add a row to one prepare card. Position is `max + 1` within the group
 * rather than `length`, for the reason migration 016 spells out for sessions:
 * after a delete, `length` collides with a position still in use and the two
 * rows then sort by whichever the database happens to return first.
 */
export async function createPrepItem(
  accessToken: string,
  projectId: string,
  groupId: string,
  input: {
    title: string;
    notes?: string | null;
    due_on?: string | null;
    external_url?: string | null;
    file_path?: string | null;
    file_name?: string | null;
    file_mime?: string | null;
    file_size?: number | null;
  },
  siblings: { position: number }[] = []
) {
  const client = createUserClient(accessToken);
  const position = siblings.reduce((max, s) => Math.max(max, s.position), -1) + 1;
  const { data, error } = await client
    .from("prep_items")
    .insert({ ...input, project_id: projectId, group_id: groupId, position })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Patch one field or several. Every prepare card edits through here — a date
 * card writes `due_on`, a checklist writes `is_done`, a notes card writes
 * `notes` — so there is one write path to reason about instead of five.
 */
export async function updatePrepItem(
  accessToken: string,
  itemId: string,
  patch: {
    title?: string;
    notes?: string | null;
    due_on?: string | null;
    external_url?: string | null;
    file_path?: string | null;
    file_name?: string | null;
    file_mime?: string | null;
    file_size?: number | null;
    is_done?: boolean;
  }
) {
  const client = createUserClient(accessToken);
  const { error } = await client.from("prep_items").update(patch).eq("id", itemId);
  if (error) throw error;
}

export async function deletePrepItem(accessToken: string, itemId: string) {
  const client = createUserClient(accessToken);
  const { error } = await client.from("prep_items").delete().eq("id", itemId);
  if (error) throw error;
}

export async function reorderPrepItems(accessToken: string, orderedIds: string[]) {
  const client = createUserClient(accessToken);
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      client.from("prep_items").update({ position: index }).eq("id", id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

/**
 * Copy a template's default prepare rows onto a new project, the same way
 * stampTemplateDeliverables and stampTemplateMembers do. Without this a new
 * Pivvot engagement would open with the pre-reading card empty, and someone
 * would have to retype Will's three books for every church.
 */
export async function stampTemplatePrepItems(
  accessToken: string,
  projectId: string,
  templateId: string
) {
  const client = createUserClient(accessToken);

  const { data: groups, error: groupsErr } = await client
    .from("template_prep_groups")
    .select("id")
    .eq("template_id", templateId);
  if (groupsErr) throw groupsErr;
  if (!groups || groups.length === 0) return;

  const { data: defaults, error: defaultsErr } = await client
    .from("template_prep_items")
    .select("group_id, title, notes, external_url, position")
    .in(
      "group_id",
      groups.map((g) => g.id)
    );
  if (defaultsErr) throw defaultsErr;
  if (!defaults || defaults.length === 0) return;

  const { error } = await client.from("prep_items").insert(
    defaults.map((d) => ({
      project_id: projectId,
      group_id: d.group_id,
      title: d.title,
      notes: d.notes,
      external_url: d.external_url,
      position: d.position,
    }))
  );
  if (error) throw error;
}

export async function createDeliverable(
  accessToken: string,
  projectId: string,
  input: Omit<Database["public"]["Tables"]["deliverables"]["Insert"], "project_id">
) {
  const client = createUserClient(accessToken);
  const { data, error } = await client
    .from("deliverables")
    .insert({ ...input, project_id: projectId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Name a session photo — "Coffee Shop Questions chart" — or clear the name. */
export async function setDeliverableCaption(
  accessToken: string,
  deliverableId: string,
  caption: string
) {
  const client = createUserClient(accessToken);
  const { error } = await client
    .from("deliverables")
    .update({ caption: caption.trim() || null })
    .eq("id", deliverableId);
  if (error) throw error;
}

export async function deleteDeliverable(accessToken: string, deliverableId: string) {
  const client = createUserClient(accessToken);
  const { error } = await client.from("deliverables").delete().eq("id", deliverableId);
  if (error) throw error;
}

/**
 * Persist a hand-arranged order. Andrew: "it would be really nice if we could
 * just click and drag and drop and reorganize the order of certain images
 * once they're uploaded."
 *
 * Writes every row rather than only the moved one — a single drag shifts the
 * index of everything between the old and new slot, and updating just the
 * dragged row would leave duplicate positions that sort unpredictably.
 */
export async function reorderDeliverables(accessToken: string, orderedIds: string[]) {
  const client = createUserClient(accessToken);
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      client.from("deliverables").update({ position: index }).eq("id", id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
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

/** Their title at the church, and whether they're the RunFree lead on this engagement. */
export async function updateMemberDetails(
  accessToken: string,
  projectId: string,
  profileId: string,
  patch: { org_role?: string | null; is_lead?: boolean }
) {
  const client = createUserClient(accessToken);
  const { error } = await client
    .from("project_members")
    .update(patch)
    .eq("project_id", projectId)
    .eq("profile_id", profileId);
  if (error) throw error;
}

/** Church profile — name, logo, where they are, who they are. Gated by manage_projects RLS. */
export async function updateProject(
  accessToken: string,
  projectId: string,
  patch: Database["public"]["Tables"]["projects"]["Update"]
) {
  const client = createUserClient(accessToken);
  const { error } = await client.from("projects").update(patch).eq("id", projectId);
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
