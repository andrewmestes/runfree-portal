import { NextResponse } from "next/server";
import { createUserClient, supabaseAdmin } from "@/lib/supabase";
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }
  const accessToken = authHeader.slice("Bearer ".length);

  // ---------------------------------------------------------------------
  // Establish WHO is calling before touching anything with the service role.
  //
  // This used to sit below the profile lookup and the invite, and that was a
  // real, exploitable hole: the only check was that the header *started with*
  // "Bearer ", so `Authorization: Bearer x` reached invitePerson(), which
  // creates an auth.users row and sends a real email. The RLS-gated insert at
  // the bottom did reject the forged caller — but only after the account and
  // the email already existed. Verified against a running server: a garbage
  // token returned 403 having already executed the service-role lookup.
  //
  // Because auth.users is SHARED with the live Certified Vision Framers
  // portal, that made this endpoint an unauthenticated way to both spam
  // arbitrary addresses from RunFree's domain and pollute another product's
  // user table — and it quietly reintroduced the self-signup path that
  // lib/auth.ts and CLAUDE.md say this portal deliberately does not have.
  //
  // Passing the JWT explicitly to getUser() validates it against the auth
  // server rather than trusting anything client-side.
  const client = createUserClient(accessToken);
  const {
    data: { user },
    error: authErr,
  } = await client.auth.getUser(accessToken);
  if (authErr || !user) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }

  if (!UUID_RE.test(projectId)) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  // Pre-gate: may this caller administer THIS project? Queried through their
  // own token, so RLS is still what answers.
  //
  // This is a pre-gate, not the authorization itself — the project_members
  // insert below deliberately runs as the caller too, so insert_members'
  // admin-only policy stays the authoritative check. Do not delete this as
  // "redundant": without it, a signed-in viewer on any project could still
  // reach invitePerson() and mint accounts, which the RLS insert would then
  // reject too late to matter.
  const [{ data: membership }, { data: me }] = await Promise.all([
    client
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("profile_id", user.id)
      .maybeSingle(),
    client.from("profiles").select("is_owner").eq("id", user.id).maybeSingle(),
  ]);

  if (membership?.role !== "admin" && !me?.is_owner) {
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
