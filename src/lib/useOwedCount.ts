"use client";

import { useEffect, useState } from "react";
import { supabase, createUserClient } from "./supabase";

/**
 * How many unfinished things RunFree owes, across every engagement the caller
 * can see.
 *
 * Shared between the header and the project sidebar, which both show the
 * badge and would otherwise each grow their own copy of the query — the
 * failure mode this codebase keeps hitting whenever one thing is rendered in
 * two places.
 *
 * Deliberately non-blocking: it runs after paint and both callers render fine
 * without it. A badge is worth one cheap indexed query; it is not worth
 * delaying a page.
 */
export function useOwedCount(enabled: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || cancelled) return;

      const { count: n } = await createUserClient(session.access_token)
        .from("project_tasks")
        .select("id", { count: "exact", head: true })
        .eq("owner", "runfree")
        .eq("is_done", false);

      if (!cancelled) setCount(n ?? 0);
    })().catch(() => {
      // A missing badge is not worth a broken header.
    });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return count;
}
