/**
 * Row-level security verification, run against the real Supabase project —
 * not mocks. Implements the "Things to verify before trusting this" list in
 * docs/data-model.md, the gaps this fork closed beyond that doc (templates
 * RLS, deliverables draft gating), and the viewer/editor/admin permission
 * model plus template_resources / deliverable-image storage added in
 * migrations 005-007.
 *
 * Every assertion queries through `createUserClient(accessToken)`, i.e. the
 * same anon-key + user-JWT path a real PostgREST/Storage call takes — this is
 * deliberately not testing application code, it's testing what the database
 * itself will and won't return.
 *
 * Run with: npm run test:rls
 */
// Run via `npm run test:rls`, which passes --env-file=.env.local. That has
// to happen at the node CLI level, not in-script: this file's static
// imports (below) are hoisted and evaluate lib/supabase.ts — which reads
// process.env at import time — before any in-file env-loading code would
// get a chance to run.
import { createClient } from "@supabase/supabase-js";
import { createUserClient, supabaseAdmin, type Database } from "../src/lib/supabase";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!url || !anonKey || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const RUN = Date.now();
const PASSWORD = "test-password-only-for-rls-suite-1234!";
const BUCKET = "deliverable-images";

type TestUser = { id: string; email: string; accessToken: string };

const results: { name: string; ok: boolean; detail?: string }[] = [];

function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
}

async function createTestUser(
  label: string,
  flags: { is_staff?: boolean; is_owner?: boolean }
): Promise<TestUser> {
  const email = `rls-test-${label}-${RUN}@example.com`;

  const { data: created, error: createErr } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: `RLS Test ${label}` },
    });
  if (createErr || !created.user) {
    throw new Error(`createUser(${label}) failed: ${createErr?.message}`);
  }

  // handle_new_user already inserted the profiles row as a plain client;
  // service role bypasses manage_profiles' owner-only check to set flags.
  if (flags.is_staff || flags.is_owner) {
    const { error: updateErr } = await supabaseAdmin
      .from("profiles")
      .update({ is_staff: !!flags.is_staff, is_owner: !!flags.is_owner })
      .eq("id", created.user.id);
    if (updateErr) throw new Error(`profile update(${label}) failed: ${updateErr.message}`);
  }

  // A throwaway client per user, purely to exchange a password for a JWT —
  // this is the "sign in as them" step, distinct from the client used to
  // run the actual assertions.
  const signInClient = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signedIn, error: signInErr } =
    await signInClient.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInErr || !signedIn.session) {
    throw new Error(`sign-in(${label}) failed: ${signInErr?.message}`);
  }

  return { id: created.user.id, email, accessToken: signedIn.session.access_token };
}

async function main() {
  const cleanupUserIds: string[] = [];
  const cleanupProjectIds: string[] = [];
  const cleanupTemplateIds: string[] = [];
  const cleanupStoragePaths: string[] = [];

  try {
    // -----------------------------------------------------------------
    // Seed: two private projects each with an admin + viewer, one
    // non-staff person made 'editor' on project A (the Pivvot Coaching
    // scenario — a client who leads their own process), a team-wide
    // project, and a staff member who belongs to nothing.
    // -----------------------------------------------------------------
    const owner = await createTestUser("owner", { is_owner: true, is_staff: true });
    const adminA = await createTestUser("admin-a", { is_staff: true });
    const adminB = await createTestUser("admin-b", { is_staff: true });
    const viewerA = await createTestUser("viewer-a", {});
    const viewerB = await createTestUser("viewer-b", {});
    const selfLeadEditor = await createTestUser("self-lead-editor", {}); // non-staff
    const staffOutsider = await createTestUser("staff-outsider", { is_staff: true });
    cleanupUserIds.push(
      owner.id, adminA.id, adminB.id, viewerA.id, viewerB.id,
      selfLeadEditor.id, staffOutsider.id
    );

    const { data: projectA, error: projAErr } = await supabaseAdmin
      .from("projects")
      .insert({ name: `RLS Test A ${RUN}`, visibility: "private", created_by: adminA.id })
      .select()
      .single();
    if (projAErr || !projectA) throw new Error(`seed project A failed: ${projAErr?.message}`);
    cleanupProjectIds.push(projectA.id);

    const { data: projectB, error: projBErr } = await supabaseAdmin
      .from("projects")
      .insert({ name: `RLS Test B ${RUN}`, visibility: "private", created_by: adminB.id })
      .select()
      .single();
    if (projBErr || !projectB) throw new Error(`seed project B failed: ${projBErr?.message}`);
    cleanupProjectIds.push(projectB.id);

    const { data: projectTeam, error: projTeamErr } = await supabaseAdmin
      .from("projects")
      .insert({ name: `RLS Test Team ${RUN}`, visibility: "team", created_by: owner.id })
      .select()
      .single();
    if (projTeamErr || !projectTeam) throw new Error(`seed team project failed: ${projTeamErr?.message}`);
    cleanupProjectIds.push(projectTeam.id);

    const { error: membersErr } = await supabaseAdmin.from("project_members").insert([
      { project_id: projectA.id, profile_id: adminA.id, role: "admin" },
      { project_id: projectA.id, profile_id: viewerA.id, role: "viewer" },
      { project_id: projectA.id, profile_id: selfLeadEditor.id, role: "editor" },
      { project_id: projectB.id, profile_id: adminB.id, role: "admin" },
      { project_id: projectB.id, profile_id: viewerB.id, role: "viewer" },
    ]);
    if (membersErr) throw new Error(`seed members failed: ${membersErr.message}`);

    const { data: sessionPublished, error: sessPubErr } = await supabaseAdmin
      .from("sessions")
      .insert({ project_id: projectA.id, title: "Published session", published_at: new Date(0).toISOString() })
      .select()
      .single();
    if (sessPubErr || !sessionPublished) throw new Error(`seed published session failed: ${sessPubErr?.message}`);

    const { error: sessDraftErr } = await supabaseAdmin
      .from("sessions")
      .insert({ project_id: projectA.id, title: "Draft session", published_at: null });
    if (sessDraftErr) throw new Error(`seed draft session failed: ${sessDraftErr.message}`);

    const { error: delivDraftErr } = await supabaseAdmin
      .from("deliverables")
      .insert({ project_id: projectA.id, title: "Draft deliverable", published_at: null });
    if (delivDraftErr) throw new Error(`seed draft deliverable failed: ${delivDraftErr.message}`);

    // -----------------------------------------------------------------
    // 1. Viewer on project A gets zero rows querying project B.
    // -----------------------------------------------------------------
    {
      const client = createUserClient(viewerA.accessToken);
      const { data } = await client.from("projects").select("*").eq("id", projectB.id);
      record("1. viewer A sees 0 rows for project B", (data?.length ?? -1) === 0, `got ${data?.length}`);
    }

    // -----------------------------------------------------------------
    // 2. Staff, not a member of a private project, gets zero rows.
    // -----------------------------------------------------------------
    {
      const client = createUserClient(staffOutsider.accessToken);
      const { data } = await client.from("projects").select("*").eq("id", projectA.id);
      record("2. non-member staff sees 0 rows for private project A", (data?.length ?? -1) === 0, `got ${data?.length}`);
    }

    // -----------------------------------------------------------------
    // 3. That same staff member DOES see a team-wide project.
    // -----------------------------------------------------------------
    {
      const client = createUserClient(staffOutsider.accessToken);
      const { data } = await client.from("projects").select("*").eq("id", projectTeam.id);
      record("3. non-member staff sees the team-wide project", data?.length === 1, `got ${data?.length}`);
    }

    // -----------------------------------------------------------------
    // 4. Viewer sees no unpublished session; the admin on that project does.
    // -----------------------------------------------------------------
    {
      const asViewer = createUserClient(viewerA.accessToken);
      const { data: viewerSessions } = await asViewer
        .from("sessions")
        .select("*")
        .eq("project_id", projectA.id);
      record(
        "4a. viewer A sees only the published session",
        viewerSessions?.length === 1 && viewerSessions[0].title === "Published session",
        `got ${viewerSessions?.map((s) => s.title).join(", ")}`
      );

      const asAdmin = createUserClient(adminA.accessToken);
      const { data: adminSessions } = await asAdmin
        .from("sessions")
        .select("*")
        .eq("project_id", projectA.id);
      record("4b. admin A sees both sessions, including the draft", adminSessions?.length === 2, `got ${adminSessions?.length}`);
    }

    // -----------------------------------------------------------------
    // 5. Staff creates a project and is a member of it immediately, as admin.
    // -----------------------------------------------------------------
    {
      const asAdmin = createUserClient(adminA.accessToken);
      const { data: newProject, error: createErr } = await asAdmin
        .from("projects")
        .insert({ name: `RLS Test Self-Created ${RUN}`, visibility: "private", created_by: adminA.id })
        .select()
        .single();

      if (createErr || !newProject) {
        record("5. staff creates a project", false, createErr?.message);
      } else {
        cleanupProjectIds.push(newProject.id);
        const { error: selfAddErr } = await asAdmin
          .from("project_members")
          .insert({ project_id: newProject.id, profile_id: adminA.id, role: "admin" });
        const { data: readBack } = await asAdmin
          .from("projects")
          .select("*")
          .eq("id", newProject.id);
        record(
          "5. staff creates a project and is a member of it immediately as admin",
          !selfAddErr && readBack?.length === 1,
          selfAddErr?.message
        );
      }
    }

    // -----------------------------------------------------------------
    // 6. A viewer (non-staff) cannot create a project at all.
    // -----------------------------------------------------------------
    {
      const asViewer = createUserClient(viewerA.accessToken);
      const { error } = await asViewer
        .from("projects")
        .insert({ name: `RLS Test Should Fail ${RUN}`, visibility: "private", created_by: viewerA.id });
      record("6. non-staff viewer cannot create a project", !!error, error ? "correctly rejected" : "insert unexpectedly succeeded");
    }

    // -----------------------------------------------------------------
    // 7. Revoking membership takes effect on the next request.
    // -----------------------------------------------------------------
    {
      const beforeClient = createUserClient(viewerA.accessToken);
      const { data: before } = await beforeClient.from("projects").select("*").eq("id", projectA.id);

      const { error: revokeErr } = await supabaseAdmin
        .from("project_members")
        .delete()
        .eq("project_id", projectA.id)
        .eq("profile_id", viewerA.id);
      if (revokeErr) throw new Error(`revoke failed: ${revokeErr.message}`);

      const afterClient = createUserClient(viewerA.accessToken);
      const { data: after } = await afterClient.from("projects").select("*").eq("id", projectA.id);

      record(
        "7. revoked membership hides the project on the very next request",
        before?.length === 1 && after?.length === 0,
        `before=${before?.length} after=${after?.length}`
      );

      // Restore — later checks still need viewerA on project A.
      const { error: restoreErr } = await supabaseAdmin
        .from("project_members")
        .insert({ project_id: projectA.id, profile_id: viewerA.id, role: "viewer" });
      if (restoreErr) throw new Error(`restore membership failed: ${restoreErr.message}`);
    }

    // -----------------------------------------------------------------
    // Bonus 8: a member can read the template their OWN project runs on,
    // and no other.
    //
    // This previously asserted the opposite — "non-staff project member
    // cannot read templates" — which encoded a real bug as correct
    // behaviour. templates was staff-only from migration 001, so for every
    // actual church client the `projects, templates(...)` join in
    // getProjectDetail resolved to null and the handouts route read a null
    // folder id. The Vision Stack card and the entire handout library were
    // invisible to the people the portal is for, silently, while any staff
    // account saw a complete page. Migration 024 closed it; these checks now
    // pin the behaviour that migration exists to guarantee.
    // -----------------------------------------------------------------
    let sharedTemplateId: string | null = null;
    {
      const { data: template, error: seedTemplateErr } = await supabaseAdmin
        .from("templates")
        .insert({ name: `RLS Test Template ${RUN}`, slug: `rls-test-template-${RUN}` })
        .select()
        .single();
      if (seedTemplateErr || !template) throw new Error(`seed template failed: ${seedTemplateErr?.message}`);
      sharedTemplateId = template.id;
      cleanupTemplateIds.push(template.id);

      // The grant is membership-derived, so projectA has to actually be on
      // this template before viewerA can see it.
      await supabaseAdmin.from("projects").update({ template_id: sharedTemplateId }).eq("id", projectA.id);

      const asViewer = createUserClient(viewerA.accessToken);
      const { data: viewerView } = await asViewer
        .from("templates")
        .select("*")
        .eq("slug", `rls-test-template-${RUN}`);
      record(
        "8a. member CAN read the template their own project runs on",
        viewerView?.length === 1,
        `got ${viewerView?.length}`
      );

      const asStaff = createUserClient(staffOutsider.accessToken);
      const { data: staffView } = await asStaff
        .from("templates")
        .select("*")
        .eq("slug", `rls-test-template-${RUN}`);
      record("8b. staff can read templates", staffView?.length === 1, `got ${staffView?.length}`);

      // The grant is their own template, not the catalogue.
      const asOutsider = createUserClient(viewerB.accessToken);
      const { data: outsiderView } = await asOutsider
        .from("templates")
        .select("*")
        .eq("slug", `rls-test-template-${RUN}`);
      record(
        "8c. member of a different project cannot read this template",
        (outsiderView?.length ?? -1) === 0,
        `got ${outsiderView?.length}`
      );

      // The handout folder id is the field the handouts route reads through
      // the caller's own token. If this is ever null for a member again, the
      // entire library goes quietly missing.
      const { data: folderView } = await asViewer
        .from("templates")
        .select("handouts_folder_id")
        .eq("id", sharedTemplateId)
        .maybeSingle();
      record(
        "8d. member can read handouts_folder_id (the silent-empty-library guard)",
        folderView !== null,
        folderView === null ? "row invisible to member" : "visible"
      );
    }

    // -----------------------------------------------------------------
    // Bonus 9: deliverables mirror sessions' draft gating — the other gap
    // this migration closed beyond data-model.md's stated policy.
    // -----------------------------------------------------------------
    {
      const asViewer = createUserClient(viewerA.accessToken);
      const { data: viewerDeliverables } = await asViewer
        .from("deliverables")
        .select("*")
        .eq("project_id", projectA.id);
      record(
        "9. viewer does not see the unpublished deliverable",
        (viewerDeliverables?.length ?? -1) === 0,
        `got ${viewerDeliverables?.length}`
      );
    }

    // -----------------------------------------------------------------
    // 10. A viewer cannot write a session or a deliverable.
    // -----------------------------------------------------------------
    {
      const asViewer = createUserClient(viewerA.accessToken);
      const { error: sessErr } = await asViewer
        .from("sessions")
        .insert({ project_id: projectA.id, title: "Viewer should not be able to write this" });
      record("10a. viewer cannot create a session", !!sessErr, sessErr ? "correctly rejected" : "insert unexpectedly succeeded");

      const { error: delivErr } = await asViewer
        .from("deliverables")
        .insert({ project_id: projectA.id, title: "Viewer should not be able to write this" });
      record("10b. viewer cannot create a deliverable", !!delivErr, delivErr ? "correctly rejected" : "insert unexpectedly succeeded");
    }

    // -----------------------------------------------------------------
    // 11. A non-staff person granted 'editor' on their own project CAN
    // write — this is the Pivvot Coaching case: a client leading their own
    // process needs to write session notes without being RunFree staff.
    // -----------------------------------------------------------------
    {
      const asEditor = createUserClient(selfLeadEditor.accessToken);
      const { data: session, error } = await asEditor
        .from("sessions")
        .insert({ project_id: projectA.id, title: "Self-led session", section: "Mod #1 FUNNEL FUSION" })
        .select()
        .single();
      record(
        "11. non-staff editor can write a session on their own project",
        !error && !!session,
        error?.message
      );
    }

    // -----------------------------------------------------------------
    // 12/13. Membership management is admin-only — an editor cannot add or
    // remove members, but an admin can. This is the actual reason three
    // tiers exist instead of two.
    // -----------------------------------------------------------------
    {
      const asEditor = createUserClient(selfLeadEditor.accessToken);
      const { error: editorAddErr } = await asEditor
        .from("project_members")
        .insert({ project_id: projectA.id, profile_id: staffOutsider.id, role: "viewer" });
      record(
        "12. editor cannot add a project member",
        !!editorAddErr,
        editorAddErr ? "correctly rejected" : "insert unexpectedly succeeded"
      );

      const asAdmin = createUserClient(adminA.accessToken);
      const { error: adminAddErr } = await asAdmin
        .from("project_members")
        .insert({ project_id: projectA.id, profile_id: staffOutsider.id, role: "viewer" });
      record("13. admin can add a project member", !adminAddErr, adminAddErr?.message);
    }

    // -----------------------------------------------------------------
    // 14. Admin can promote a member's role in place (the new
    // update_members policy — previously there was no UPDATE policy at
    // all on project_members).
    // -----------------------------------------------------------------
    {
      const asAdmin = createUserClient(adminA.accessToken);
      const { error: promoteErr } = await asAdmin
        .from("project_members")
        .update({ role: "editor" })
        .eq("project_id", projectA.id)
        .eq("profile_id", staffOutsider.id);
      record("14. admin can promote a member's role", !promoteErr, promoteErr?.message);
    }

    // -----------------------------------------------------------------
    // 15. template_resources: visible to a project member on a matching
    // template, invisible to someone with no project on that template.
    // -----------------------------------------------------------------
    {
      await supabaseAdmin.from("projects").update({ template_id: sharedTemplateId }).eq("id", projectA.id);
      const { data: resource, error: seedResourceErr } = await supabaseAdmin
        .from("template_resources")
        .insert({
          template_id: sharedTemplateId!,
          section: "PROCESS OVERVIEW",
          kind: "handout",
          title: `RLS Test Resource ${RUN}`,
        })
        .select()
        .single();
      if (seedResourceErr || !resource) throw new Error(`seed template_resource failed: ${seedResourceErr?.message}`);

      const asViewer = createUserClient(viewerA.accessToken);
      const { data: viewerSees } = await asViewer
        .from("template_resources")
        .select("*")
        .eq("id", resource.id);
      record(
        "15a. member of a project on this template can read its template_resources",
        viewerSees?.length === 1,
        `got ${viewerSees?.length}`
      );

      const asOutsider = createUserClient(viewerB.accessToken);
      const { data: outsiderSees } = await asOutsider
        .from("template_resources")
        .select("*")
        .eq("id", resource.id);
      record(
        "15b. non-member on a different template cannot read template_resources",
        (outsiderSees?.length ?? -1) === 0,
        `got ${outsiderSees?.length}`
      );
    }

    // -----------------------------------------------------------------
    // 16. Deliverable image storage: editor/admin can upload into their own
    // project's folder, a viewer cannot, and a member of a different
    // project cannot even read what's there.
    // -----------------------------------------------------------------
    {
      const path = `${projectA.id}/rls-test-${RUN}.txt`;
      const body = new Blob([`rls test ${RUN}`], { type: "text/plain" });

      const asViewer = createUserClient(viewerA.accessToken);
      const { error: viewerUploadErr } = await asViewer.storage.from(BUCKET).upload(path, body);
      record(
        "16a. viewer cannot upload a deliverable image",
        !!viewerUploadErr,
        viewerUploadErr ? "correctly rejected" : "upload unexpectedly succeeded"
      );

      const asAdmin = createUserClient(adminA.accessToken);
      const { error: adminUploadErr } = await asAdmin.storage.from(BUCKET).upload(path, body, { upsert: true });
      record("16b. admin can upload a deliverable image", !adminUploadErr, adminUploadErr?.message);
      if (!adminUploadErr) cleanupStoragePaths.push(path);

      const asOutsider = createUserClient(viewerB.accessToken);
      const { error: outsiderDownloadErr } = await asOutsider.storage.from(BUCKET).download(path);
      record(
        "16c. member of a different project cannot read this project's uploaded image",
        !!outsiderDownloadErr,
        outsiderDownloadErr ? "correctly rejected" : "download unexpectedly succeeded"
      );

      const { error: sameProjectDownloadErr } = await asViewer.storage.from(BUCKET).download(path);
      record(
        "16d. a viewer ON the project can still read the uploaded image",
        !sameProjectDownloadErr,
        sameProjectDownloadErr?.message
      );

      // 16e/16f — private prep documents (migration 036). Marking a prep item
      // private hid its ROW while leaving the FILE readable to every member;
      // the rule keys on the second path segment, so what is being proved
      // here is that the path convention and the policy still agree. If
      // uploadPrepFile ever stops writing to {project}/private/, 16f is the
      // check that fails instead of a confidential document quietly leaking.
      const privatePath = `${projectA.id}/private/rls-test-${RUN}.txt`;
      const { error: privateUploadErr } = await asAdmin.storage
        .from(BUCKET)
        .upload(privatePath, body, { upsert: true });
      record(
        "16e. admin can upload a private prep document",
        !privateUploadErr,
        privateUploadErr?.message
      );
      if (!privateUploadErr) cleanupStoragePaths.push(privatePath);

      const { error: viewerPrivateErr } = await asViewer.storage.from(BUCKET).download(privatePath);
      record(
        "16f. a viewer on the project CANNOT read a private prep document",
        !!viewerPrivateErr,
        viewerPrivateErr ? "correctly rejected" : "private document was readable by a viewer"
      );

      const { error: adminPrivateErr } = await asAdmin.storage.from(BUCKET).download(privatePath);
      record(
        "16g. an admin can read a private prep document",
        !adminPrivateErr,
        adminPrivateErr?.message
      );
    }

    // -----------------------------------------------------------------
    // 16h-16k. Pinning a project (migration 038). Any member may pin their
    // OWN membership row; nobody may reach anyone else's, and the function
    // must not become a back door into `role`.
    // -----------------------------------------------------------------
    {
      const asViewer = createUserClient(viewerA.accessToken);
      const { error: pinErr } = await asViewer.rpc("set_project_pinned", {
        p_project_id: projectA.id,
        p_pinned: true,
      });
      record("16h. a viewer can pin their own project", !pinErr, pinErr?.message);

      const { data: pinnedRow } = await supabaseAdmin
        .from("project_members")
        .select("pinned_at, role")
        .eq("project_id", projectA.id)
        .eq("profile_id", viewerA.id)
        .single();
      record(
        "16i. pinning set pinned_at and left role alone",
        !!pinnedRow?.pinned_at && pinnedRow?.role === "viewer",
        `pinned_at=${!!pinnedRow?.pinned_at} role=${pinnedRow?.role}`
      );

      // A project they are not a member of must be refused, not silently
      // ignored — silence would read to the app as success.
      const { error: foreignErr } = await asViewer.rpc("set_project_pinned", {
        p_project_id: projectB.id,
        p_pinned: true,
      });
      record(
        "16j. cannot pin a project you are not a member of",
        !!foreignErr,
        foreignErr ? "correctly rejected" : "unexpectedly succeeded"
      );

      const { error: unpinErr } = await asViewer.rpc("set_project_pinned", {
        p_project_id: projectA.id,
        p_pinned: false,
      });
      const { data: unpinned } = await supabaseAdmin
        .from("project_members")
        .select("pinned_at")
        .eq("project_id", projectA.id)
        .eq("profile_id", viewerA.id)
        .single();
      record(
        "16k. unpinning clears it",
        !unpinErr && unpinned?.pinned_at === null,
        unpinErr?.message ?? `pinned_at=${unpinned?.pinned_at}`
      );
    }

    // -----------------------------------------------------------------
    // 17. Preparation cards (migration 022). The group is template-scoped
    // and follows template_resources' visibility; the items are
    // project-scoped, readable by anyone who can see the project — there is
    // no draft state here — and writable only by editors and admins.
    // -----------------------------------------------------------------
    {
      const { data: group, error: seedGroupErr } = await supabaseAdmin
        .from("template_prep_groups")
        .insert({
          template_id: sharedTemplateId!,
          section: "CHURCH PREPARATION",
          key: `rls-test-${RUN}`,
          title: `RLS Test Group ${RUN}`,
          kind: "checklist",
        })
        .select()
        .single();
      if (seedGroupErr || !group) throw new Error(`seed prep group failed: ${seedGroupErr?.message}`);

      const asViewer = createUserClient(viewerA.accessToken);
      const asOutsider = createUserClient(viewerB.accessToken);
      const asAdmin = createUserClient(adminA.accessToken);

      const { data: viewerGroups } = await asViewer
        .from("template_prep_groups")
        .select("*")
        .eq("id", group.id);
      record(
        "17a. project member can read their template's prep groups",
        viewerGroups?.length === 1,
        `got ${viewerGroups?.length}`
      );

      const { data: outsiderGroups } = await asOutsider
        .from("template_prep_groups")
        .select("*")
        .eq("id", group.id);
      record(
        "17b. non-member cannot read another template's prep groups",
        (outsiderGroups?.length ?? -1) === 0,
        `got ${outsiderGroups?.length}`
      );

      const { error: viewerInsertErr } = await asViewer.from("prep_items").insert({
        project_id: projectA.id,
        group_id: group.id,
        title: "viewer should not be able to add this",
      });
      record(
        "17c. viewer cannot add a prep item",
        !!viewerInsertErr,
        viewerInsertErr ? "correctly rejected" : "insert unexpectedly succeeded"
      );

      const { data: item, error: adminInsertErr } = await asAdmin
        .from("prep_items")
        .insert({
          project_id: projectA.id,
          group_id: group.id,
          title: `RLS Test Item ${RUN}`,
        })
        .select()
        .single();
      record("17d. admin can add a prep item", !adminInsertErr, adminInsertErr?.message);

      if (item) {
        const { data: viewerItems } = await asViewer
          .from("prep_items")
          .select("*")
          .eq("id", item.id);
        record(
          "17e. viewer can read the prep item (no draft state on prep work)",
          viewerItems?.length === 1,
          `got ${viewerItems?.length}`
        );

        const { data: outsiderItems } = await asOutsider
          .from("prep_items")
          .select("*")
          .eq("id", item.id);
        record(
          "17f. non-member cannot read another project's prep items",
          (outsiderItems?.length ?? -1) === 0,
          `got ${outsiderItems?.length}`
        );

        // A viewer ticking a checkbox is the most likely accidental write in
        // this whole feature, so it gets its own check rather than being
        // assumed from 17c.
        const { error: viewerToggleErr } = await asViewer
          .from("prep_items")
          .update({ is_done: true })
          .eq("id", item.id);
        const { data: afterToggle } = await asAdmin
          .from("prep_items")
          .select("is_done")
          .eq("id", item.id)
          .single();
        record(
          "17g. viewer cannot tick a prep item done",
          !!viewerToggleErr || afterToggle?.is_done === false,
          viewerToggleErr ? "correctly rejected" : `is_done=${afterToggle?.is_done}`
        );
      }
    }

    // -----------------------------------------------------------------
    // 18. project_tasks (030). Homework is created by coaches, but TICKED
    // by the church — who are viewers. RLS cannot restrict an UPDATE to one
    // column, so ticking goes through set_task_done(). These checks pin
    // both halves: a viewer may flip is_done and may NOT edit or delete.
    // -----------------------------------------------------------------
    {
      const asAdmin = createUserClient(adminA.accessToken);
      const asViewer = createUserClient(viewerA.accessToken);
      const asOutsider = createUserClient(viewerB.accessToken);

      const { data: task, error: createErr } = await asAdmin
        .from("project_tasks")
        .insert({ project_id: projectA.id, title: `RLS Test Task ${RUN}` })
        .select()
        .single();
      record("18a. editor/admin can create a task", !createErr, createErr?.message);

      const { error: viewerCreateErr } = await asViewer
        .from("project_tasks")
        .insert({ project_id: projectA.id, title: "viewer should not create this" });
      record(
        "18b. viewer cannot create a task",
        !!viewerCreateErr,
        viewerCreateErr ? "correctly rejected" : "insert unexpectedly succeeded"
      );

      if (task) {
        const { error: tickErr } = await asViewer.rpc("set_task_done", {
          p_task_id: task.id,
          p_done: true,
        });
        const { data: after } = await asAdmin
          .from("project_tasks")
          .select("is_done, completed_at")
          .eq("id", task.id)
          .single();
        // Reversed by migration 039. A project has a dozen viewers and one
        // person running it; a task ticked by whoever clicked first told the
        // coach nothing. Completion is now a statement by someone
        // accountable for the engagement.
        record(
          "18c. viewer CANNOT tick a task done (039)",
          !!tickErr && after?.is_done !== true,
          tickErr ? "correctly rejected" : `unexpectedly ticked: is_done=${after?.is_done}`
        );

        const asProjectEditor = createUserClient(selfLeadEditor.accessToken);
        const { error: editorTickErr } = await asProjectEditor.rpc("set_task_done", {
          p_task_id: task.id,
          p_done: true,
        });
        const { data: afterEditor } = await asAdmin
          .from("project_tasks")
          .select("is_done, completed_at, title")
          .eq("id", task.id)
          .single();
        record(
          "18c2. an editor CAN tick a task done",
          !editorTickErr && afterEditor?.is_done === true && !!afterEditor?.completed_at,
          editorTickErr ? editorTickErr.message : `is_done=${afterEditor?.is_done}`
        );

        const { error: renameErr } = await asViewer
          .from("project_tasks")
          .update({ title: "viewer renamed this" })
          .eq("id", task.id);
        const { data: afterRename } = await asAdmin
          .from("project_tasks")
          .select("title")
          .eq("id", task.id)
          .single();
        record(
          "18d. viewer cannot rename a task",
          !!renameErr || afterRename?.title !== "viewer renamed this",
          renameErr ? "correctly rejected" : `title=${afterRename?.title}`
        );

        const { error: outsiderTickErr } = await asOutsider.rpc("set_task_done", {
          p_task_id: task.id,
          p_done: false,
        });
        record(
          "18e. non-member cannot tick another project's task",
          !!outsiderTickErr,
          outsiderTickErr ? "correctly rejected" : "rpc unexpectedly succeeded"
        );
      }
    }


    // -----------------------------------------------------------------
    // 19. account_role (031). The subscription tier is the point here: a
    // framer running their own clients must not see RunFree's team-wide
    // projects, and RunFree must not see theirs except by membership.
    // This is Andrew's "subscription-model admins must not see team-wide
    // projects", pinned.
    // -----------------------------------------------------------------
    {
      const subscribed = await createTestUser("framer-sub", {});
      cleanupUserIds.push(subscribed.id);
      await supabaseAdmin
        .from("profiles")
        .update({ account_role: "framer_subscribed" })
        .eq("id", subscribed.id);

      const asSubscribed = createUserClient(subscribed.accessToken);

      const { data: teamSeen } = await asSubscribed
        .from("projects")
        .select("id")
        .eq("id", projectTeam.id);
      record(
        "19a. subscribed framer cannot see RunFree's team-wide project",
        (teamSeen?.length ?? -1) === 0,
        `got ${teamSeen?.length}`
      );

      // Their own project, created by them, is theirs.
      const { data: ownProject, error: ownErr } = await supabaseAdmin
        .from("projects")
        .insert({
          name: `RLS Framer Own ${RUN}`,
          visibility: "private",
          created_by: subscribed.id,
        })
        .select()
        .single();
      if (ownProject) cleanupProjectIds.push(ownProject.id);
      record("19b. subscribed framer's own project is created", !ownErr, ownErr?.message);

      if (ownProject) {
        const { data: mine } = await asSubscribed
          .from("projects")
          .select("id")
          .eq("id", ownProject.id);
        record(
          "19c. subscribed framer sees their own client project",
          mine?.length === 1,
          `got ${mine?.length}`
        );

        // RunFree staff who are not members do NOT get it for free.
        const asStaff = createUserClient(staffOutsider.accessToken);
        const { data: staffSees } = await asStaff
          .from("projects")
          .select("id")
          .eq("id", ownProject.id);
        record(
          "19d. RunFree staff cannot see a framer's private client project",
          (staffSees?.length ?? -1) === 0,
          `got ${staffSees?.length}`
        );
      }

      // The trigger keeps the legacy booleans in step for the live CVF app.
      const { data: flags } = await supabaseAdmin
        .from("profiles")
        .select("is_staff, is_owner, certification_access")
        .eq("id", subscribed.id)
        .single();
      record(
        "19e. account_role syncs the legacy flags the CVF app still reads",
        flags?.certification_access === true && flags?.is_owner === false,
        `cert=${flags?.certification_access} owner=${flags?.is_owner} staff=${flags?.is_staff}`
      );
    }


    // -----------------------------------------------------------------
    // 20. Powerful, not omniscient (032). An admin can SEE a subscribed
    // framer's client project, because that is the tier RunFree sells and
    // has to support. An admin canNOT see a RunFree team member's private
    // project — Andrew: "there's still privacy we'd like to keep for runfree
    // team members' projects."
    // -----------------------------------------------------------------
    {
      const siteAdmin = await createTestUser("site-admin", {});
      const subFramer = await createTestUser("sub-framer-2", {});
      cleanupUserIds.push(siteAdmin.id, subFramer.id);
      await supabaseAdmin.from("profiles").update({ account_role: "admin" }).eq("id", siteAdmin.id);
      await supabaseAdmin
        .from("profiles")
        .update({ account_role: "framer_subscribed" })
        .eq("id", subFramer.id);

      const { data: framerProject } = await supabaseAdmin
        .from("projects")
        .insert({
          name: `RLS Framer Support ${RUN}`,
          visibility: "private",
          created_by: subFramer.id,
        })
        .select()
        .single();
      if (framerProject) cleanupProjectIds.push(framerProject.id);

      const asSiteAdmin = createUserClient(siteAdmin.accessToken);

      if (framerProject) {
        const { data: seen } = await asSiteAdmin
          .from("projects")
          .select("id")
          .eq("id", framerProject.id);
        record(
          "20a. admin CAN see a subscribed framer's project (support access)",
          seen?.length === 1,
          `got ${seen?.length}`
        );
      }

      // projectB belongs to RunFree's adminB and siteAdmin is not a member.
      const { data: staffPrivate } = await asSiteAdmin
        .from("projects")
        .select("id")
        .eq("id", projectB.id);
      record(
        "20b. admin cannot see a RunFree member's private project",
        (staffPrivate?.length ?? -1) === 0,
        `got ${staffPrivate?.length}`
      );

      // The admin still holds content authority without being owner.
      const { error: tmplErr } = await asSiteAdmin
        .from("templates")
        .update({ description: `touched ${RUN}` })
        .eq("id", sharedTemplateId!);
      record(
        "20c. admin can edit templates without being owner",
        !tmplErr,
        tmplErr?.message
      );

      const { data: adminFlags } = await supabaseAdmin
        .from("profiles")
        .select("is_owner")
        .eq("id", siteAdmin.id)
        .single();
      record(
        "20d. account_role 'admin' does NOT grant is_owner",
        adminFlags?.is_owner === false,
        `is_owner=${adminFlags?.is_owner}`
      );
    }


    // -----------------------------------------------------------------
    // 21. A profile created AFTER a certified_framers row inherits the
    // certification role (033).
    //
    // This is the Megan Estes bug. She was tagged in GoHighLevel, the roster
    // row was written, the invite created her auth user 377ms later, and the
    // profile trigger's default won — she arrived as a 'client' with a
    // welcome email and an empty portal. Reordering the app calls alone does
    // not cover it: someone can be rostered months before they accept, and a
    // self-signup has no app code in the path at all.
    // -----------------------------------------------------------------
    {
      const email = `rls-test-preroster-${RUN}@example.com`;

      // Roster first, exactly as the webhook does it.
      const { error: rosterErr } = await supabaseAdmin
        .from("certified_framers")
        .insert({ email, name: `RLS Preroster ${RUN}` });
      record("21a. roster row can be created before any account", !rosterErr, rosterErr?.message);

      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "RLS Preroster" },
      });
      if (created?.user) cleanupUserIds.push(created.user.id);
      record("21b. the account is then created", !createErr, createErr?.message);

      if (created?.user) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("account_role, certification_access")
          .eq("id", created.user.id)
          .single();
        record(
          "21c. the new profile inherits 'framer', not the 'client' default",
          profile?.account_role === "framer" && profile?.certification_access === true,
          `role=${profile?.account_role} cert=${profile?.certification_access}`
        );
      }

      await supabaseAdmin.from("certified_framers").delete().eq("email", email);
    }


    // -----------------------------------------------------------------
    // 22. An admin cannot promote themselves to owner (035).
    //
    // 032 split am_owner() from am_admin() so admins would be powerful but
    // not omniscient, and cleared is_owner on the three new admins. But the
    // same migration widened manage_profiles to am_admin(), and RLS has no
    // column-level check — so the policy that lets an admin change someone's
    // ROLE also let them change is_owner, restoring the bypass in one line
    // from the browser console.
    // -----------------------------------------------------------------
    {
      const siteAdmin2 = await createTestUser("owner-guard", {});
      cleanupUserIds.push(siteAdmin2.id);
      await supabaseAdmin.from("profiles").update({ account_role: "admin" }).eq("id", siteAdmin2.id);

      const asAdmin2 = createUserClient(siteAdmin2.accessToken);

      const { error: selfPromote } = await asAdmin2
        .from("profiles")
        .update({ is_owner: true })
        .eq("id", siteAdmin2.id);
      const { data: after } = await supabaseAdmin
        .from("profiles")
        .select("is_owner")
        .eq("id", siteAdmin2.id)
        .single();
      record(
        "22a. an admin cannot grant themselves is_owner",
        !!selfPromote || after?.is_owner === false,
        selfPromote ? "correctly rejected" : `is_owner=${after?.is_owner}`
      );

      // The legitimate power still works: changing someone else's role.
      const { error: roleErr } = await asAdmin2
        .from("profiles")
        .update({ account_role: "framer" })
        .eq("id", viewerA.id);
      record("22b. an admin can still change an account role", !roleErr, roleErr?.message);
      await supabaseAdmin.from("profiles").update({ account_role: "client" }).eq("id", viewerA.id);
    }

    // -----------------------------------------------------------------
    // 23. listMyProjects' embed must be a LEFT join.
    //
    // A query shape rather than a policy, but exactly the regression this
    // suite exists to catch: every policy says "yes" and the row still
    // vanishes. PostgREST's `!inner` drops parent rows whose embedded child
    // was filtered away, and a plain embed is ALSO promoted to an inner join
    // as soon as you filter on an embedded column — only an explicit `!left`
    // keeps the parent.
    //
    // projectTeam is the case that matters: visibility 'team', so
    // can_see_project lets staff and the owner read it (032), but the owner
    // has no project_members row on it. With `!inner` it disappeared from the
    // home page and the sidebar switcher entirely.
    //
    // Note this is NOT about private projects. Migration 032
    // ("admins powerful not omniscient") deliberately removed the blanket
    // owner bypass, so the owner cannot see someone else's private project
    // and is not supposed to.
    // -----------------------------------------------------------------
    {
      const asOwner = createUserClient(owner.accessToken);


      const { data: mine, error: mineErr } = await asOwner
        .from("projects")
        .select("*, project_members!left(pinned_at, profile_id)")
        .is("archived_at", null)
        .eq("project_members.profile_id", owner.id);

      const ids = (mine ?? []).map((r) => r.id);
      record(
        "23a. the owner sees a project they are not a member of",
        !mineErr && ids.includes(projectTeam.id),
        mineErr?.message ??
          `returned ${ids.length} projects, team project present=${ids.includes(projectTeam.id)}`
      );

      // And the embed still holds only the caller's own membership, which is
      // what `project_members[0]` in listMyProjects relies on.
      const rowA = (mine ?? []).find((r) => r.id === projectTeam.id) as
        | { project_members?: { profile_id: string }[] }
        | undefined;
      const others = (rowA?.project_members ?? []).filter((m) => m.profile_id !== owner.id);
      record(
        "23b. the embed carries no one else's membership rows",
        others.length === 0,
        `foreign membership rows embedded: ${others.length}`
      );
    }

    // -----------------------------------------------------------------
    // 24. Task owner (041).
    //
    // The column carries a real distinction — the church's homework versus
    // what RunFree owes them — and two things have to hold for the /my-work
    // view to be trustworthy: the default must be "church", so no existing
    // row silently becomes something we owe, and the constraint must refuse
    // anything outside the two values, so a typo cannot quietly create a
    // third category that nothing queries for.
    // -----------------------------------------------------------------
    {
      const asAdminA = createUserClient(adminA.accessToken);

      const { data: defaulted } = await asAdminA
        .from("project_tasks")
        .insert({ project_id: projectA.id, title: `RLS owner default ${RUN}` })
        .select("id, owner")
        .single();
      record(
        "24a. a new task defaults to owner 'church'",
        (defaulted as { owner?: string } | null)?.owner === "church",
        `owner=${(defaulted as { owner?: string } | null)?.owner}`
      );

      const { data: explicit } = await asAdminA
        .from("project_tasks")
        .insert({ project_id: projectA.id, title: `RLS owner runfree ${RUN}`, owner: "runfree" })
        .select("id, owner")
        .single();
      record(
        "24b. a task can be marked as owed by RunFree",
        (explicit as { owner?: string } | null)?.owner === "runfree",
        `owner=${(explicit as { owner?: string } | null)?.owner}`
      );

      const { error: badOwner } = await asAdminA
        .from("project_tasks")
        .insert({ project_id: projectA.id, title: `RLS owner bogus ${RUN}`, owner: "nobody" as never });
      record(
        "24c. an unknown owner is rejected by the constraint",
        !!badOwner,
        badOwner ? "correctly rejected" : "ACCEPTED — the check constraint is missing"
      );

      // A viewer reads tasks through can_see_project, so what we owe them is
      // visible to them. That is intended: seeing what RunFree owes, in the
      // same list and just as accountable, is the point.
      const asViewerA = createUserClient(viewerA.accessToken);
      const { data: seen } = await asViewerA
        .from("project_tasks")
        .select("id, owner")
        .eq("project_id", projectA.id)
        .eq("owner", "runfree");
      record(
        "24d. a viewer can see what RunFree owes on their project",
        (seen ?? []).length > 0,
        `${(seen ?? []).length} runfree-owned task(s) visible`
      );

      for (const row of [defaulted, explicit]) {
        const id = (row as { id?: string } | null)?.id;
        if (id) await supabaseAdmin.from("project_tasks").delete().eq("id", id);
      }
    }

  } finally {
    // ---------------------------------------------------------------------
    // Cleanup — storage objects and templates first (no FK relationship to
    // worry about there), then projects (created_by has no ON DELETE
    // CASCADE, so a profile can't be deleted while it still owns a
    // project), then users (cascades to profiles and project_members).
    // ---------------------------------------------------------------------
    if (cleanupStoragePaths.length > 0) {
      await supabaseAdmin.storage.from(BUCKET).remove(cleanupStoragePaths);
    }
    for (const id of cleanupTemplateIds) {
      await supabaseAdmin.from("templates").delete().eq("id", id);
    }
    for (const id of cleanupProjectIds) {
      await supabaseAdmin.from("projects").delete().eq("id", id);
    }
    for (const id of cleanupUserIds) {
      await supabaseAdmin.auth.admin.deleteUser(id);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    console.log(`Failed: ${failed.map((f) => f.name).join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("RLS suite crashed:", err);
  process.exit(1);
});
