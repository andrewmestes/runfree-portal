import { supabase, createUserClient } from "./supabase";

export async function getCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

/**
 * Thrown when we genuinely could not find out whether someone has a profile,
 * as opposed to finding out that they don't.
 *
 * Those two need to look different to the caller: "you're signed in but
 * nothing provisioned you yet" is a real answer worth showing, while a
 * dropped connection is not. Collapsing both to null is what told a certified
 * framer their access was pending when their wifi dropped — see
 * docs/forking-guide.md.
 */
export class ProfileLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileLookupError";
  }
}

/**
 * The signed-in user's own profile row, queried as themselves so RLS's
 * `read_profiles` policy (self, owner, or fellow project member) applies —
 * for your own row that's just `id = auth.uid()`.
 *
 * Every authenticated user has a profile by the time they can sign in: the
 * `handle_new_user` trigger creates one the moment their auth.users row
 * exists. A missing row here means the trigger didn't fire, not that access
 * is pending — there's no separate allowlist step in this model the way
 * there was for certified_framers.
 */
export async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Error fetching profile:", error);
    throw new ProfileLookupError(error.message);
  }

  return data;
}

export async function isStaff() {
  const profile = await getCurrentProfile();
  return profile?.is_staff ?? false;
}

export async function isOwner() {
  const profile = await getCurrentProfile();
  return profile?.is_owner ?? false;
}

export async function loginWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

/**
 * Removed on purpose — this portal has no self-signup, same as CVF. Access
 * follows being added to a project: a coach or the owner invites someone,
 * which is what creates their login. Keeping a signUp() helper around
 * invited a future caller to reintroduce a path the product doesn't want.
 */

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** Google sign-in vouches for the address, so an invited email can't be claimed by someone else. */
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: { prompt: "select_account" },
    },
  });

  if (error) throw error;
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  });

  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/**
 * Projects visible to the signed-in user, queried as themselves so
 * `read_projects` (backed by `can_see_project`) does the filtering — their
 * own projects plus anything team-wide if they're staff, everything if
 * they're the owner. There is no server-side "if staff, select *" branch to
 * get wrong; the database is the only place that decision is made.
 */
export async function listMyProjects() {
  const session = await getCurrentSession();
  if (!session) return [];

  const client = createUserClient(session.access_token);
  const { data, error } = await client
    .from("projects")
    .select("*, templates(name, slug), project_members!left(pinned_at, profile_id)")
    .is("archived_at", null)
    .eq("project_members.profile_id", session.user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  /**
   * Pinned first, most recently pinned at the top of that group, then
   * everything else newest-first as before.
   *
   * The sort is here rather than in the query because pinned_at lives on the
   * caller's own membership row, and PostgREST cannot order a parent by an
   * embedded child's column.
   *
   * The embed must be `!left`, explicitly. Two PostgREST behaviours combine
   * here: `!inner` drops parent rows whose embedded child was filtered away,
   * AND a plain embed is promoted to an inner join the moment you filter on
   * an embedded column. So both `project_members(...)` and
   * `project_members!inner(...)` lose parents; only `!left` keeps them.
   *
   * That matters because a person can be able to read a project without
   * having a membership row on it: `can_see_project` (032) grants staff and
   * the owner any project with `visibility = 'team'`. Those came back with no
   * embedded row and the join threw the whole project away — gone from the
   * home page and the sidebar switcher while every policy still said yes.
   * tests/rls.test.ts 23a covers exactly this, and fails with `!inner`.
   *
   * The one-row guarantee comes from the FILTER, not the join type, so
   * `project_members[0]` is still unambiguously the caller's own row.
   *
   * (This is not about private projects. 032 — "admins powerful not
   * omniscient" — deliberately removed the blanket owner bypass, so the owner
   * cannot see someone else's private project and should not.)
   */
  const rows = (data ?? []) as (Record<string, unknown> & {
    project_members?: { pinned_at: string | null }[];
  })[];

  return rows
    .map((r) => ({ ...r, pinned_at: r.project_members?.[0]?.pinned_at ?? null }))
    .sort((a, b) => {
      if (!!a.pinned_at !== !!b.pinned_at) return a.pinned_at ? -1 : 1;
      if (a.pinned_at && b.pinned_at) return a.pinned_at < b.pinned_at ? 1 : -1;
      return 0;
    });
}

/** Pin or unpin a project for the signed-in user. See migration 038. */
export async function setProjectPinned(projectId: string, pinned: boolean) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Not signed in");
  const client = createUserClient(session.access_token);
  const { error } = await client.rpc("set_project_pinned", {
    p_project_id: projectId,
    p_pinned: pinned,
  });
  if (error) throw error;
}

/**
 * The certified-framer record for the signed-in user, or null.
 *
 * Ported during the portal merge so the certification pages keep working
 * unchanged. `certified_framers` is CVF's table and is read-only from here;
 * whether someone may SEE those pages is decided by profiles.account_role
 * (migration 031), not by this row — a RunFree admin has no framer row and
 * still gets in.
 */
export async function getCurrentFramer() {
  const user = await getCurrentUser();
  if (!user?.email) return null;

  // maybeSingle, not single: "no row" is an ordinary answer here.
  const { data, error } = await supabase
    .from("certified_framers")
    .select("*")
    .eq("email", user.email)
    .maybeSingle();

  if (error) {
    console.error("Error fetching framer:", error);
    return null;
  }
  return data;
}

/**
 * Admin, for a client component.
 *
 * True for the merged model (profiles.account_role = 'admin') OR the CVF-era
 * flag (certified_framers.is_admin), so the ported admin screens keep working
 * for people who have one and not the other. A RunFree admin has no framer
 * row; an old CVF admin may have no account_role yet.
 */
export async function isPortalAdmin(): Promise<boolean> {
  const profile = await getCurrentProfile();
  if (profile && (profile as { account_role?: string }).account_role === "admin") return true;
  if (profile && (profile as { is_owner?: boolean }).is_owner) return true;

  const framer = (await getCurrentFramer()) as { is_admin?: boolean } | null;
  return Boolean(framer?.is_admin);
}

/**
 * May this person see the certification library?
 *
 * The merge rewrote the SERVER gate (requireCertificationAccess) to accept an
 * account_role of admin / runfree_team / framer / framer_subscribed, or the
 * legacy certified_framers row. The five certification PAGES kept the old
 * client-side test — "is there a roster row?" — so a RunFree admin with no
 * row was shown the nav links by the header and then bounced to / on arrival.
 * Same question, same answer, one place.
 */
export async function hasCertificationAccess(): Promise<boolean> {
  const profile = (await getCurrentProfile()) as
    | { account_role?: string; is_owner?: boolean; certification_access?: boolean }
    | null;

  if (profile?.is_owner) return true;
  if (
    profile?.account_role &&
    ["admin", "runfree_team", "framer", "framer_subscribed"].includes(profile.account_role)
  ) {
    return true;
  }
  if (profile?.certification_access) return true;

  return Boolean(await getCurrentFramer());
}
