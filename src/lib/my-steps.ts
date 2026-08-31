"use client";

import { useEffect, useState } from "react";
import { supabase, createUserClient } from "./supabase";
import type { RagStatus } from "./execution";

/**
 * Action steps assigned to me.
 *
 * Andrew: "the Action Steps that are assigned to people, could possibly live
 * in their 'dashboard' as tasks to complete or update, possibly syncing in
 * some way to the team's overall view of the Horizon Storyline. not sure if
 * this could be possible or not."
 *
 * It is possible, and there is nothing to sync — because there is nothing to
 * copy. This reads the same `initiative_steps` rows the Horizon Storyline
 * renders, filtered to the caller. Moving a light here moves it on the board,
 * because it is the same row. The alternative (mirroring steps into
 * `project_tasks`) is exactly the "three different places where they're
 * looking for next steps" problem migrations 040/041 existed to end.
 *
 * Non-blocking, like `useOwedCount`: it runs after paint and every caller
 * renders fine without it.
 */
export type MyStep = {
  id: string;
  description: string;
  status: RagStatus;
  by_when: string | null;
  initiative_id: string;
  project_id: string;
  initiative: { name: string } | null;
  project: { id: string; name: string } | null;
};

/**
 * @param projectId  Scope to one project, or omit for every project the
 *                   caller can see. RLS does the scoping either way — this
 *                   only narrows it further, it never widens it.
 */
export async function listMyActionSteps(
  accessToken: string,
  profileId: string,
  projectId?: string
): Promise<MyStep[]> {
  let q = createUserClient(accessToken)
    .from("initiative_steps")
    .select(
      "id, description, status, by_when, initiative_id, project_id, initiatives(name), projects(name)"
    )
    .eq("assignee_profile_id", profileId)
    .neq("status", "green")
    .order("by_when", { ascending: true, nullsFirst: false });

  if (projectId) q = q.eq("project_id", projectId);

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((r) => {
    const row = r as unknown as {
      id: string;
      description: string;
      status: RagStatus;
      by_when: string | null;
      initiative_id: string;
      project_id: string;
      initiatives: { name: string } | null;
      projects: { name: string } | null;
    };
    return {
      id: row.id,
      description: row.description,
      status: row.status,
      by_when: row.by_when,
      initiative_id: row.initiative_id,
      project_id: row.project_id,
      initiative: row.initiatives,
      project: row.projects ? { id: row.project_id, name: row.projects.name } : null,
    };
  });
}

/** The same list as state, refetchable, for a component that renders it. */
export function useMyActionSteps(profileId: string | null, projectId?: string) {
  const [steps, setSteps] = useState<MyStep[]>([]);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      const rows = await listMyActionSteps(session.access_token, profileId, projectId);
      if (!cancelled) setSteps(rows);
    })().catch(() => {
      // A missing list is not worth a broken dashboard.
    });

    return () => {
      cancelled = true;
    };
  }, [profileId, projectId, nonce]);

  return { steps, refresh: () => setNonce((n) => n + 1) };
}
