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
    .select("*, templates(name, slug)")
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
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
