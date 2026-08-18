import { NextResponse } from "next/server";
import { createUserClient, supabaseAdmin, type Database } from "./supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The one place a route establishes who is calling and what they may see.
 *
 * This exists because of a specific warning in the CVF portal's CLAUDE.md:
 * over there the same ~25 lines of token-plus-allowlist checking are pasted
 * into all eleven API routes with no shared helper, so "a new route that
 * forgets to paste it in is silently public". That is a latent hole waiting
 * on whoever adds route twelve. Here there is one helper, it returns a
 * discriminated result, and forgetting to use it means having no client to
 * query with — the failure is loud instead of silent.
 *
 * It also fixes the sharper version of that bug this portal actually shipped:
 * the members route checked only that the header STARTED WITH "Bearer " and
 * then did real work — sending invite mail — before the RLS-gated write
 * finally rejected the forged caller.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ProjectAccess =
  | { ok: true; userId: string; client: SupabaseClient<Database>; canEdit: boolean; isAdmin: boolean }
  | { ok: false; response: NextResponse };

/**
 * Resolve the caller and confirm they can see `projectId`.
 *
 * Visibility is decided by RLS, not by this function: it selects the project
 * through the caller's own token, so a private project they aren't a member
 * of simply returns no row. There is no branch here that could accidentally
 * be more generous than the policy.
 */
export async function requireProjectAccess(
  request: Request,
  projectId: string
): Promise<ProjectAccess> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Missing bearer token" }, { status: 401 }),
    };
  }
  const accessToken = authHeader.slice("Bearer ".length);

  const client = createUserClient(accessToken);
  const {
    data: { user },
    error: authErr,
  } = await client.auth.getUser(accessToken);
  if (authErr || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid or expired session" }, { status: 401 }),
    };
  }

  if (!UUID_RE.test(projectId)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid project id" }, { status: 400 }),
    };
  }

  // RLS answers this. No row means no access, whatever the reason.
  const { data: project, error: projectErr } = await client
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();

  if (projectErr) {
    return {
      ok: false,
      response: NextResponse.json({ error: projectErr.message }, { status: 500 }),
    };
  }
  if (!project) {
    // Deliberately the same shape as a genuine 404: telling a stranger that a
    // project exists but is private is itself a small leak.
    return {
      ok: false,
      response: NextResponse.json({ error: "Project not found" }, { status: 404 }),
    };
  }

  const [{ data: membership }, { data: me }] = await Promise.all([
    client
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("profile_id", user.id)
      .maybeSingle(),
    client.from("profiles").select("is_owner").eq("id", user.id).maybeSingle(),
  ]);

  const isOwner = !!me?.is_owner;
  const role = membership?.role ?? null;

  return {
    ok: true,
    userId: user.id,
    client,
    canEdit: isOwner || role === "editor" || role === "admin",
    isAdmin: isOwner || role === "admin",
  };
}

/**
 * Gate for the certification content routes (/api/books, /api/videos,
 * /api/library, /api/guide and their file handlers).
 *
 * These eight routes came over from the CVF portal each carrying its own
 * copy of the same check — the exact pattern that portal's own notes warn
 * about, where a new route that forgets to paste it in is silently public.
 * One helper now, so there is one place to be right.
 *
 * It also fixes what the copied check got wrong after the merge: it asked
 * only "is there a certified_framers row?", which is a CVF-era question. A
 * RunFree team member or a subscribed framer has certification access by
 * their account_role and may have no legacy row at all. Either signal opens
 * the door; the legacy row stays accepted so nothing that works today stops.
 */
export async function requireCertificationAccess(
  request: Request
): Promise<
  | { ok: true; userId: string; email: string }
  | { ok: false; response: NextResponse }
> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not signed in" }, { status: 401 }),
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user?.email) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid session" }, { status: 401 }),
    };
  }

  const [{ data: profile }, { data: framer }] = await Promise.all([
    supabaseAdmin.from("profiles").select("account_role").eq("id", user.id).maybeSingle(),
    supabaseAdmin.from("certified_framers").select("id").eq("email", user.email).maybeSingle(),
  ]);

  const byRole =
    profile?.account_role != null &&
    ["admin", "runfree_team", "framer", "framer_subscribed"].includes(profile.account_role);

  if (!byRole && !framer) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "No certification access on this account" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, userId: user.id, email: user.email };
}
