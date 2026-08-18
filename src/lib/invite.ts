import { supabaseAdmin } from "./supabase";

/**
 * What happened when we tried to invite someone.
 *
 * `already_has_login` is a success, not a failure: Supabase rejects inviting
 * an existing user, and there'd be nothing to invite them to — they can
 * already sign in. Adding someone back to a project after they'd previously
 * been removed from every project is exactly this case.
 */
export type InviteOutcome =
  | "sent"
  | "already_has_login"
  | "skipped"
  | "failed";

export type InviteResult = {
  outcome: InviteOutcome;
  error: string | null;
};

/**
 * Send a portal invitation so someone gets a login.
 *
 * This only creates the auth.users row (via GoTrue, which is what fires
 * `handle_new_user` and provisions their `profiles` row). It grants no
 * project access by itself — whoever calls this is responsible for a
 * separate `project_members` insert, before or after the invite is accepted.
 * Splitting those keeps this function reusable for both "add a client to one
 * project" and "add a coach who'll create their own."
 *
 * Never throws. A mail outage must not be indistinguishable from "nothing
 * happened" — the caller needs the outcome so it can report "added, but the
 * invite email failed, try resending" rather than claiming one went out that
 * didn't.
 */
export async function invitePerson(
  email: string,
  origin: string
): Promise<InviteResult> {
  const cleanEmail = email.trim().toLowerCase();

  try {
    const { data: userList, error: listErr } =
      await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });

    // A failed lookup must not become a blind invite: the call would fail
    // anyway for an existing user, and reporting that as a mail problem
    // would send the admin chasing the wrong thing.
    if (listErr) {
      return { outcome: "failed", error: listErr.message };
    }

    const hasLogin = (userList?.users || []).some(
      (u) => u.email?.toLowerCase() === cleanEmail
    );

    if (hasLogin) return { outcome: "already_has_login", error: null };

    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      cleanEmail,
      { redirectTo: `${origin}/auth/callback` }
    );

    if (error) return { outcome: "failed", error: error.message };

    return { outcome: "sent", error: null };
  } catch (err) {
    return {
      outcome: "failed",
      error: err instanceof Error ? err.message : "Could not send invitation",
    };
  }
}

/**
 * The certification routes came over from the CVF portal calling this
 * inviteFramer. It is the same function — one invite path, whether the
 * person is joining a church project or the certification programme — so it
 * is an alias rather than a second copy that could drift.
 */
export const inviteFramer = invitePerson;

/**
 * Keep the portal's permission in step with the certification list.
 *
 * Being on `certified_framers` and being allowed to SEE the certification
 * content are two different records — the first is the GoHighLevel-synced
 * roster, the second is `profiles.account_role` (migration 031). Before the
 * merge only the first existed, so every path that added or removed a framer
 * updated one and left the other alone. The visible symptom would be someone
 * getting a welcome email, signing in, and finding an empty portal.
 *
 * Deliberately conservative in both directions:
 *
 *  - granting never demotes. An admin or RunFree team member who is also
 *    certified must not be knocked down to 'framer' by a tag sync.
 *  - revoking only touches 'framer' and 'framer_subscribed'. Removing the
 *    certified tag from a RunFree admin should not lock them out of the
 *    portal they run.
 *
 * A missing profile is not an error: someone can be on the roster before they
 * ever sign in, and the row appears when they do.
 */
export async function syncCertificationRole(
  email: string,
  grant: boolean
): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, account_role")
    .ilike("email", cleanEmail)
    .maybeSingle();

  if (!profile) return;

  if (grant) {
    if (profile.account_role === "client") {
      await supabaseAdmin
        .from("profiles")
        .update({ account_role: "framer" })
        .eq("id", profile.id);
    }
    return;
  }

  if (profile.account_role === "framer" || profile.account_role === "framer_subscribed") {
    await supabaseAdmin
      .from("profiles")
      .update({ account_role: "client" })
      .eq("id", profile.id);
  }
}
