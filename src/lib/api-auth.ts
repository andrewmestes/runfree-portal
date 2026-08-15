import { NextResponse } from "next/server";
import { createUserClient, type Database } from "./supabase";
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
