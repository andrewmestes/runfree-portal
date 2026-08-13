/**
 * Row-level security verification, run against the real Supabase project —
 * not mocks. Implements the "Things to verify before trusting this" list in
 * docs/data-model.md, plus a couple of extra checks for the gaps this fork
 * closed beyond that doc (templates RLS, deliverables draft gating).
 *
 * Every assertion queries through `createUserClient(accessToken)`, i.e. the
 * same anon-key + user-JWT path a real PostgREST call takes — this is
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

  try {
    // -----------------------------------------------------------------
    // Seed: two private projects with their own coach and client, one
    // team-wide project, and a staff member who belongs to nothing.
    // -----------------------------------------------------------------
    const owner = await createTestUser("owner", { is_owner: true, is_staff: true });
    const coachA = await createTestUser("coach-a", { is_staff: true });
    const coachB = await createTestUser("coach-b", { is_staff: true });
    const clientA = await createTestUser("client-a", {});
    const clientB = await createTestUser("client-b", {});
    const staffOutsider = await createTestUser("staff-outsider", { is_staff: true });
    cleanupUserIds.push(
      owner.id, coachA.id, coachB.id, clientA.id, clientB.id, staffOutsider.id
    );

    const { data: projectA, error: projAErr } = await supabaseAdmin
      .from("projects")
      .insert({ name: `RLS Test A ${RUN}`, visibility: "private", created_by: coachA.id })
      .select()
      .single();
    if (projAErr || !projectA) throw new Error(`seed project A failed: ${projAErr?.message}`);
    cleanupProjectIds.push(projectA.id);

    const { data: projectB, error: projBErr } = await supabaseAdmin
      .from("projects")
      .insert({ name: `RLS Test B ${RUN}`, visibility: "private", created_by: coachB.id })
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
      { project_id: projectA.id, profile_id: coachA.id, role: "coach" },
      { project_id: projectA.id, profile_id: clientA.id, role: "client" },
      { project_id: projectB.id, profile_id: coachB.id, role: "coach" },
      { project_id: projectB.id, profile_id: clientB.id, role: "client" },
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
    // 1. Client on project A gets zero rows querying project B.
    // -----------------------------------------------------------------
    {
      const client = createUserClient(clientA.accessToken);
      const { data } = await client.from("projects").select("*").eq("id", projectB.id);
      record("1. client A sees 0 rows for project B", (data?.length ?? -1) === 0, `got ${data?.length}`);
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
    // 4. Client sees no unpublished session; the coach on that project does.
    // -----------------------------------------------------------------
    {
      const asClient = createUserClient(clientA.accessToken);
      const { data: clientSessions } = await asClient
        .from("sessions")
        .select("*")
        .eq("project_id", projectA.id);
      record(
        "4a. client A sees only the published session",
        clientSessions?.length === 1 && clientSessions[0].title === "Published session",
        `got ${clientSessions?.map((s) => s.title).join(", ")}`
      );

      const asCoach = createUserClient(coachA.accessToken);
      const { data: coachSessions } = await asCoach
        .from("sessions")
        .select("*")
        .eq("project_id", projectA.id);
      record("4b. coach A sees both sessions, including the draft", coachSessions?.length === 2, `got ${coachSessions?.length}`);
    }

    // -----------------------------------------------------------------
    // 5. A coach can create a project and is a member of it immediately.
    // -----------------------------------------------------------------
    {
      const asCoach = createUserClient(coachA.accessToken);
      const { data: newProject, error: createErr } = await asCoach
        .from("projects")
        .insert({ name: `RLS Test Self-Created ${RUN}`, visibility: "private", created_by: coachA.id })
        .select()
        .single();

      if (createErr || !newProject) {
        record("5. coach creates a project", false, createErr?.message);
      } else {
        cleanupProjectIds.push(newProject.id);
        const { error: selfAddErr } = await asCoach
          .from("project_members")
          .insert({ project_id: newProject.id, profile_id: coachA.id, role: "coach" });
        const { data: readBack } = await asCoach
          .from("projects")
          .select("*")
          .eq("id", newProject.id);
        record(
          "5. coach creates a project and is a member of it immediately",
          !selfAddErr && readBack?.length === 1,
          selfAddErr?.message
        );
      }
    }

    // -----------------------------------------------------------------
    // 6. A client cannot create a project at all.
    // -----------------------------------------------------------------
    {
      const asClient = createUserClient(clientA.accessToken);
      const { error } = await asClient
        .from("projects")
        .insert({ name: `RLS Test Should Fail ${RUN}`, visibility: "private", created_by: clientA.id });
      record("6. client cannot create a project", !!error, error ? "correctly rejected" : "insert unexpectedly succeeded");
    }

    // -----------------------------------------------------------------
    // 7. Revoking membership takes effect on the next request.
    // -----------------------------------------------------------------
    {
      const beforeClient = createUserClient(clientA.accessToken);
      const { data: before } = await beforeClient.from("projects").select("*").eq("id", projectA.id);

      const { error: revokeErr } = await supabaseAdmin
        .from("project_members")
        .delete()
        .eq("project_id", projectA.id)
        .eq("profile_id", clientA.id);
      if (revokeErr) throw new Error(`revoke failed: ${revokeErr.message}`);

      const afterClient = createUserClient(clientA.accessToken);
      const { data: after } = await afterClient.from("projects").select("*").eq("id", projectA.id);

      record(
        "7. revoked membership hides the project on the very next request",
        before?.length === 1 && after?.length === 0,
        `before=${before?.length} after=${after?.length}`
      );

      // Restore for the deliverables check below, which still needs clientA on project A.
      const { error: restoreErr } = await supabaseAdmin
        .from("project_members")
        .insert({ project_id: projectA.id, profile_id: clientA.id, role: "client" });
      if (restoreErr) throw new Error(`restore membership failed: ${restoreErr.message}`);
    }

    // -----------------------------------------------------------------
    // Bonus 8: templates are staff-only — a gap in data-model.md's own RLS
    // list that this migration closed (see 001_multi_tenant_schema.sql).
    // -----------------------------------------------------------------
    {
      const { error: seedTemplateErr } = await supabaseAdmin
        .from("templates")
        .insert({ name: `RLS Test Template ${RUN}`, slug: `rls-test-template-${RUN}` });
      if (seedTemplateErr) throw new Error(`seed template failed: ${seedTemplateErr.message}`);

      const asClient = createUserClient(clientA.accessToken);
      const { data: clientView } = await asClient
        .from("templates")
        .select("*")
        .eq("slug", `rls-test-template-${RUN}`);
      record("8a. client cannot read templates", (clientView?.length ?? -1) === 0, `got ${clientView?.length}`);

      const asStaff = createUserClient(staffOutsider.accessToken);
      const { data: staffView } = await asStaff
        .from("templates")
        .select("*")
        .eq("slug", `rls-test-template-${RUN}`);
      record("8b. staff can read templates", staffView?.length === 1, `got ${staffView?.length}`);

      await supabaseAdmin.from("templates").delete().eq("slug", `rls-test-template-${RUN}`);
    }

    // -----------------------------------------------------------------
    // Bonus 9: deliverables mirror sessions' draft gating — the other gap
    // this migration closed beyond data-model.md's stated policy.
    // -----------------------------------------------------------------
    {
      const asClient = createUserClient(clientA.accessToken);
      const { data: clientDeliverables } = await asClient
        .from("deliverables")
        .select("*")
        .eq("project_id", projectA.id);
      record(
        "9. client does not see the unpublished deliverable",
        (clientDeliverables?.length ?? -1) === 0,
        `got ${clientDeliverables?.length}`
      );
    }
  } finally {
    // ---------------------------------------------------------------------
    // Cleanup — projects first (created_by has no ON DELETE CASCADE, so a
    // profile can't be deleted while it still owns a project), then users
    // (cascades to profiles and project_members).
    // ---------------------------------------------------------------------
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
