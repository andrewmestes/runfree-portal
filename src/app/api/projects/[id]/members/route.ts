import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireProjectAccess } from "@/lib/api-auth";
import { invitePerson } from "@/lib/invite";

const VALID_ROLES = new Set(["viewer", "editor", "admin"]);

/**
 * Add someone to a project by email — the one operation that genuinely can't
 * be done from the browser under RLS. read_profiles only lets you see your
 * own row, the owner's, or a fellow project member's; a project admin adding
 * someone brand new to the portal has no relationship with them yet, so
 * there is no policy that could ever let them SELECT that profile. The
 * lookup (and, for a new person, the invite that creates their auth.users
 * row) has to run as the service role.
 *
 * The actual project_members write does NOT use the service role — it goes
 * through the caller's own token, so insert_members' admin-only check is
 * what decides whether this succeeds, not application code re-deriving that
 * same rule here.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  // One shared path for "who is calling, and may they see this project" —
  // see lib/api-auth.ts for why that is a helper and not inline here.
  const access = await requireProjectAccess(request, projectId);
  if (!access.ok) return access.response;
  const client = access.client;

  // Pre-gate: adding people is admin-only. This runs BEFORE any service-role
  // work, which is the whole point — invitePerson() creates an auth.users row
  // and sends real mail, and it used to be reachable by anyone who sent a
  // header starting with "Bearer ". The project_members insert below still
  // runs as the caller, so insert_members' RLS policy stays the authoritative
  // check; this only stops a non-admin reaching the invite at all. Do not
  // remove it as redundant.
  if (!access.isAdmin) {
    return NextResponse.json(
      { error: "Only a project admin can add people to this project" },
      { status: 403 }
    );
  }

  let body: { email?: string; role?: string; orgRole?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const role = body.role;
  const orgRole = body.orgRole?.trim() || null;
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  if (!role || !VALID_ROLES.has(role)) {
    return NextResponse.json({ error: "role must be viewer, editor, or admin" }, { status: 400 });
  }

  const { data: existingProfile, error: lookupErr } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }

  let profileId = existingProfile?.id ?? null;
  let invited = false;

  if (!profileId) {
    // Known limitation, matching BRIEF.md's "Invitation emails need solving
    // separately": this sends Supabase's one project-wide email template,
    // currently branded for Certified Vision Framers. A church client will
    // get a certification-flavored email until that's replaced with
    // generateLink() + a portal-specific send.
    const origin = new URL(request.url).origin;
    const result = await invitePerson(email, origin);
    if (result.outcome === "failed") {
      return NextResponse.json({ error: result.error ?? "Invite failed" }, { status: 500 });
    }
    invited = result.outcome === "sent";

    const { data: newProfile, error: reloadErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (reloadErr || !newProfile) {
      return NextResponse.json(
        { error: reloadErr?.message ?? "Invited, but no profile appeared yet — try again in a moment" },
        { status: 500 }
      );
    }
    profileId = newProfile.id;
  }

  const { error: insertErr } = await client
    .from("project_members")
    .insert({
      project_id: projectId,
      profile_id: profileId,
      role: role as "viewer" | "editor" | "admin",
      org_role: orgRole,
    });

  if (insertErr) {
    if (insertErr.code === "23505") {
      return NextResponse.json({ error: "Already a member of this project" }, { status: 409 });
    }
    // Most commonly insert_members' RLS check failing — the caller isn't an
    // admin on this project.
    return NextResponse.json({ error: insertErr.message }, { status: 403 });
  }

  return NextResponse.json({ profileId, invited });
}

/**
 * PATCH — correct the email address on a person who was added with the wrong one.
 *
 * Andrew, on the Athena roster: "the email I had for this dude ended in
 * @gmail, but it's incorrect. It's supposed to be @hotmail. Is there an easy
 * way to update people's email?" Today the only route is Remove and re-add,
 * which leaves a dead login and a dead invite behind, and still sends the
 * second invite to whatever was typed the second time.
 *
 * An email here is a LOGIN, not a contact detail — changing it changes who
 * can get into the account — so this is deliberately narrower than the rest
 * of member management:
 *
 *   - project admin only, same gate as adding someone; AND
 *   - only for someone who has NEVER SIGNED IN, unless the caller is the
 *     portal owner.
 *
 * That second rule is the one doing the security work. Without it, a project
 * admin could point a colleague's account at an address they control and
 * then "reset the password" into it. Restricted to accounts that have never
 * been used, there is nothing to take over — which is exactly and only the
 * typo case this exists for. Someone who has actually signed in changes
 * their own address, or asks the owner.
 *
 * Both halves of the identity move together: auth.users (the login) and
 * profiles.email (what the portal reads). Updating one without the other is
 * how you get a person who can sign in and then cannot see themselves.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  const access = await requireProjectAccess(request, projectId);
  if (!access.ok) return access.response;

  if (!access.isAdmin) {
    return NextResponse.json(
      { error: "Only a project admin can change someone's email" },
      { status: 403 }
    );
  }

  let body: { profileId?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const profileId = body.profileId?.trim();
  const email = body.email?.trim().toLowerCase();

  if (!profileId) return NextResponse.json({ error: "profileId is required" }, { status: 400 });
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  // Scoped to THIS project. A project admin may correct a typo on someone in
  // the room with them, not on any account in the portal that they happen to
  // know the id of.
  const { data: membership, error: memberErr } = await supabaseAdmin
    .from("project_members")
    .select("profile_id")
    .eq("project_id", projectId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 500 });
  if (!membership) {
    return NextResponse.json({ error: "That person is not on this project" }, { status: 404 });
  }

  const { data: target, error: targetErr } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, last_seen_at, is_owner")
    .eq("id", profileId)
    .maybeSingle();
  if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: "No such person" }, { status: 404 });

  if (email === target.email?.toLowerCase()) {
    return NextResponse.json({ error: "That is already their email" }, { status: 400 });
  }

  // Two independent signals for "has this account ever been used". last_seen_at
  // is ours and only set by a page load; last_sign_in_at is GoTrue's and is set
  // the moment they authenticate. Either one means hands off.
  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(profileId);
  const hasBeenUsed = Boolean(target.last_seen_at) || Boolean(authUser?.user?.last_sign_in_at);

  const { data: caller } = await supabaseAdmin
    .from("profiles")
    .select("is_owner")
    .eq("id", access.userId)
    .maybeSingle();
  const callerIsOwner = Boolean(caller?.is_owner);

  if (hasBeenUsed && !callerIsOwner) {
    return NextResponse.json(
      {
        error:
          "They have already signed in, so only they can change their own email — ask them to update it, or ask the portal owner.",
      },
      { status: 403 }
    );
  }

  // Someone else already owns this address. profiles.email is unique, so the
  // write would fail anyway; saying which collision it is beats a raw 23505.
  const { data: clash } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (clash && clash.id !== profileId) {
    return NextResponse.json(
      { error: "Someone else in the portal already uses that email" },
      { status: 409 }
    );
  }

  // The login first. `email_confirm` skips GoTrue's confirm-the-change mail,
  // which would go to an address the person has never seen and cannot act on;
  // an admin fixing a typo on an unused invite is the confirmation.
  const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(profileId, {
    email,
    email_confirm: true,
  });
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });

  const { error: profileErr } = await supabaseAdmin
    .from("profiles")
    .update({ email })
    .eq("id", profileId);
  if (profileErr) {
    // The login moved and the profile did not. Say so plainly rather than
    // reporting a clean success over a half-applied identity change.
    return NextResponse.json(
      {
        error: `The login moved to ${email} but their profile did not update: ${profileErr.message}. Tell Andrew before they try to sign in.`,
      },
      { status: 500 }
    );
  }

  /**
   * Get them a way in at the NEW address.
   *
   * Not inviteUserByEmail — GoTrue refuses to invite an account that already
   * exists, and this one does. A password link is what actually sends, and it
   * works for someone setting a first password as well as someone resetting
   * one. This is the same conclusion the framers route wrote up at length
   * after a "successful" resend delivered nothing.
   */
  const origin = new URL(request.url).origin;
  const { error: linkErr } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/reset-password`,
  });

  return NextResponse.json({
    ok: true,
    email,
    previousEmail: target.email,
    emailed: !linkErr,
    // Not an error: the address is corrected either way, and the admin can
    // send another link from the same row. Only the mail step failed.
    emailError: linkErr?.message ?? null,
  });
}
