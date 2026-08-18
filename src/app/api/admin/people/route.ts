import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * DELETE /api/admin/people?id=<profile id>
 *
 * Removes a person from the portal entirely: their login, their profile,
 * their project memberships and their certification-roster row.
 *
 * Andrew: "I don't see an easy way to remove people from the admin portal."
 * There wasn't one — the framers screen could drop someone off the
 * certification list, which left the account behind, and nothing could remove
 * an account at all. Deleting an auth user needs the service role, so it has
 * to be a route rather than a call from the browser.
 *
 * Two refusals, both deliberate:
 *
 *  - you cannot delete yourself, which is the accident most likely to lock
 *    the last admin out of their own portal;
 *  - you cannot delete the owner, whose am_owner() is the escape hatch every
 *    other policy defers to.
 *
 * project_members and church_contacts cascade from the profile. certified_
 * framers does not — it is keyed by email, not by profile id — so it is
 * cleared explicitly.
 */
export async function DELETE(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const { data: me } = await supabaseAdmin
    .from("profiles")
    .select("account_role, is_owner")
    .eq("id", user.id)
    .maybeSingle();

  if (!(me?.is_owner || me?.account_role === "admin")) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Which person?" }, { status: 400 });
  }

  if (id === user.id) {
    return NextResponse.json(
      { error: "You cannot remove your own account" },
      { status: 400 }
    );
  }

  const { data: target } = await supabaseAdmin
    .from("profiles")
    .select("email, is_owner")
    .eq("id", id)
    .maybeSingle();

  if (!target) return NextResponse.json({ error: "No such person" }, { status: 404 });
  if (target.is_owner) {
    return NextResponse.json(
      { error: "The portal owner cannot be removed" },
      { status: 400 }
    );
  }

  // Roster first: it is keyed by email, so it would be orphaned rather than
  // cascaded once the profile is gone.
  await supabaseAdmin.from("certified_framers").delete().ilike("email", target.email);

  // Deleting the auth user cascades the profile, its memberships and its
  // roster-independent rows.
  const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, removed: target.email });
}
