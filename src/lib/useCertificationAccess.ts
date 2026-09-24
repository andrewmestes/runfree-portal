"use client";

import { useEffect, useState } from "react";
import { hasCertificationAccess } from "./auth";

/**
 * Whether to offer the certification side at all — the header link, the
 * sidebar link, the Help section.
 *
 * These places used to read `profile.certification_access || is_staff`, a
 * third rule beside the pages' and the APIs'. They now ask the same question
 * the hub, /open and every certification API ask, through
 * hasCertificationAccess(), so a link is shown exactly when the place it goes
 * to will open.
 *
 * False until the answer arrives, and on any failure: a link that appears a
 * moment late costs nothing, one that leads to "This area is for Certified
 * Vision Framers" is the bug this replaces.
 */
export function useCertificationAccess(): boolean {
  return useCertificationAccessState() ?? false;
}

/**
 * The same answer, with "not known yet" kept distinct (null) — for a page
 * whose layout depends on it, like Help's back link, which would otherwise
 * show "← Your projects" for a moment to a framer who has none.
 */
export function useCertificationAccessState(): boolean | null {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    hasCertificationAccess()
      .then((ok) => {
        if (!cancelled) setAllowed(ok);
      })
      .catch(() => {
        if (!cancelled) setAllowed(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return allowed;
}
