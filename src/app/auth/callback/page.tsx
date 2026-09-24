"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { takeNext } from "@/lib/auth";

/**
 * Landing spot after Google sign-in and after an invite link. The Supabase
 * client picks the session up out of the URL on its own; this waits for it and
 * moves people along.
 */
export default function AuthCallbackPage() {
  const [failed, setFailed] = useState(false);
  const [retryHref, setRetryHref] = useState("/auth/login");
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    /**
     * An invited person has a session but no password — the invite link is
     * the only thing that ever let them in. Dropping them straight on the
     * home page left them one sign-out away from being locked out for good,
     * since self-signup is disabled and they'd have nothing to sign in with.
     * Send them to set a password first, which is also what the invite
     * email promises.
     */
    if (window.location.hash.includes("type=invite")) {
      window.location.replace(`/auth/reset-password${window.location.hash}`);
      return;
    }
    // The token-hash shape of the same invite (the email templates emit it
    // once they use {{ .TokenHash }}; see reset-password/page.tsx for why).
    // Nothing has been spent yet — pass it along untouched.
    const query = new URLSearchParams(window.location.search);
    if (query.get("token_hash")) {
      if (!query.get("type")) query.set("type", "invite");
      window.location.replace(`/auth/reset-password?${query.toString()}`);
      return;
    }
    // A verify that failed before it got here (link already opened by a
    // mail scanner, or expired) arrives as #error_code=otp_expired; send it
    // where the message lives rather than spinning for five seconds and
    // saying "didn't complete". Any other error is not a spent link: with
    // self-signup disabled, Google sign-in from an address the portal does
    // not know comes back as error_code=signup_disabled, and forwarding that
    // to reset-password told a framer "This reset link is invalid or has
    // expired" when they had never asked for one. Those go back to sign-in,
    // which says what actually happened.
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const errorCode = hashParams.get("error_code") || query.get("error_code");
    if (errorCode) {
      if (errorCode === "otp_expired") {
        window.location.replace(
          `/auth/reset-password${window.location.hash || `?${query.toString()}`}`
        );
      } else {
        const next = takeNext();
        const p = new URLSearchParams({ error: errorCode });
        if (next !== "/") p.set("next", next);
        window.location.replace(`/auth/login?${p.toString()}`);
      }
      return;
    }

    async function settle() {
      for (let attempt = 0; attempt < 20; attempt++) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled) return;

        if (session) {
          // A guide link that sent someone through Google sign-in left its
          // path here; otherwise this is "/".
          router.replace(takeNext());
          return;
        }

        await new Promise((r) => setTimeout(r, 250));
      }

      if (!cancelled) {
        // Keep the guide link or shelf page for the second attempt.
        const n = takeNext();
        setRetryHref(n === "/" ? "/auth/login" : `/auth/login?next=${encodeURIComponent(n)}`);
        setFailed(true);
      }
    }

    settle();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-runfree-indigo/40 px-4">
      <div className="text-center">
        <div className="mx-auto mb-4 h-1.5 w-24 rounded-full bg-runfree-grad" />
        {failed ? (
          <>
            <p className="font-display text-lg font-semibold text-runfree-ink">
              That didn&rsquo;t complete
            </p>
            <p className="mt-2 text-sm text-gray-600">
              Sign-in didn&rsquo;t finish.{" "}
              <a
                href={retryHref}
                className="font-medium text-runfree-magentaDeep hover:underline"
              >
                Try again
              </a>
              .
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-500">Signing you in…</p>
        )}
      </div>
    </div>
  );
}
