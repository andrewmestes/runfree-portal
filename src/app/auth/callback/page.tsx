"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/**
 * Landing spot after Google sign-in and after an invite link. The Supabase
 * client picks the session up out of the URL on its own; this waits for it and
 * moves people along.
 */
export default function AuthCallbackPage() {
  const [failed, setFailed] = useState(false);
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

    async function settle() {
      for (let attempt = 0; attempt < 20; attempt++) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled) return;

        if (session) {
          router.replace("/");
          return;
        }

        await new Promise((r) => setTimeout(r, 250));
      }

      if (!cancelled) setFailed(true);
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
                href="/auth/login"
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
