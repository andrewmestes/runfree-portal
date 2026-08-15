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
