"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { takeResetNext, updatePassword } from "@/lib/auth";
import AuthShell, {
  Field,
  FormError,
  SubmitButton,
} from "@/components/AuthShell";

/**
 * The same screen serves two arrivals: someone resetting a forgotten
 * password, and someone just invited setting one for the first time. Only
 * the wording differs, but telling a brand-new user their "reset link
 * expired" would be baffling — they never had a password to reset.
 *
 * Two link shapes land here, and the difference is the whole story of the
 * September 2026 cohort (Andrew: "none of the 13 were immediately able to
 * access the portal off the first email … some got this over and over
 * every time they tried to reset their password"):
 *
 *   Old shape — Supabase's own verify link, which redirects here with the
 *   session in the URL hash. The token is spent by whoever OPENS the link.
 *   Corporate mail security opens every link in an email seconds after it
 *   arrives — auth.sessions showed one Colombian scanner IP "signing in" as
 *   four different people within forty seconds of the invite going out,
 *   and again each time three of them asked for a reset — so the real
 *   person's click finds the token already used. Nothing on this page can
 *   fix that; it is inherent to the link.
 *
 *   New shape — /auth/reset-password?token_hash=…&type=recovery|invite,
 *   which the email templates emit once they use {{ .TokenHash }}. Opening
 *   the link spends nothing. The token is only verified when a human
 *   submits this form with a password, which no scanner does.
 *
 * Both are handled, so the code can ship before or after the templates
 * change and the old shape keeps working for anyone holding an old email.
 */

type LinkType = "recovery" | "invite";

function readLink(): { tokenHash: string | null; type: LinkType; errorCode: string | null } {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const rawType = query.get("type") || hash.get("type") || "";
  return {
    tokenHash: query.get("token_hash"),
    type: rawType === "invite" ? "invite" : "recovery",
    // Supabase sends a failed verify here as #error_code=otp_expired… —
    // the one honest signal that the link was spent before this click.
    errorCode: hash.get("error_code") || query.get("error_code"),
  };
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState<"checking" | "ok" | "invalid">("checking");
  const [isInvite, setIsInvite] = useState(false);
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [spent, setSpent] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const link = readLink();
    setIsInvite(link.type === "invite");

    if (link.tokenHash) {
      // New shape: nothing to wait for. The form shows at once and the
      // token is verified on submit.
      setTokenHash(link.tokenHash);
      setReady("ok");
      return;
    }

    if (link.errorCode) {
      setSpent(link.errorCode === "otp_expired" || link.errorCode === "access_denied");
      setReady("invalid");
      return;
    }

    // Old shape: the client reads the session out of the hash, which
    // includes a network round trip to fetch the user. This used to be a
    // fixed 800 ms timer, which on a phone with two bars was a coin flip —
    // a perfectly good link reported as invalid. Now it listens for the
    // session and gives up only after ten seconds.
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      setReady(ok ? "ok" : "invalid");
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish(true);
    });
    let attempts = 0;
    const poll = setInterval(async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) return finish(true);
      if (++attempts >= 40) finish(false);
    }, 250);

    return () => {
      sub.subscription.unsubscribe();
      clearInterval(poll);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      if (tokenHash) {
        // Spend the token now, on a human's submit, and only then set the
        // password on the session it opened.
        const { error: verifyErr } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: isInvite ? "invite" : "recovery",
        });
        if (verifyErr) {
          setSpent(true);
          setReady("invalid");
          return;
        }
        // The token is spent now and the session is open. If the password
        // step below fails, a retry only needs updatePassword — verifying
        // again would fail and call a good link "already used".
        setTokenHash(null);
      }
      try {
        await updatePassword(password);
      } catch (e) {
        // Supabase refuses a "new" password that matches the current one.
        // That password already works, so they are in either way.
        if ((e as { code?: string })?.code !== "same_password") throw e;
      }
      // Back to the guide link or shelf that sent them to sign in, if the
      // reset was asked for from there in this browser; otherwise home.
      router.push(takeResetNext());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title={isInvite ? "Set your password" : "Choose a new password"}
      subtitle={
        isInvite
          ? "Last step — then you're into the portal"
          : "Then you'll be signed straight in"
      }
      footer={
        <p>
          <a
            href="/auth/login"
            className="font-medium text-runfree-magentaDeep hover:underline"
          >
            Back to sign in
          </a>
        </p>
      }
    >
      {ready === "checking" && (
        <p className="text-center text-sm text-gray-500">Checking your link…</p>
      )}

      {ready === "invalid" && (
        <div className="space-y-4">
          <FormError
            message={
              spent
                ? isInvite
                  ? "This invitation link has already been used or has expired."
                  : "This reset link has already been used or has expired."
                : isInvite
                  ? "This invitation link is no longer valid."
                  : "This reset link is invalid or has expired."
            }
          />
          <p className="text-sm leading-relaxed text-gray-600">
            {isInvite ? (
              <>
                Invitation links are single-use and expire. Ask whoever added
                you to send a new one, or{" "}
                <a
                  href="/auth/forgot-password"
                  className="font-medium text-runfree-magentaDeep hover:underline"
                >
                  set a password directly
                </a>{" "}
                using the same email address.
              </>
            ) : (
              <>
                Reset links are single-use and expire.{" "}
                <a
                  href="/auth/forgot-password"
                  className="font-medium text-runfree-magentaDeep hover:underline"
                >
                  Request a new one
                </a>
                .
              </>
            )}
          </p>
          {spent && (
            <p className="text-sm leading-relaxed text-gray-500">
              If you asked for more than one link, only the newest one works, so use
              the most recent email. If a fresh link says this too, email{" "}
              <a href="mailto:andrew@runfree.co" className="font-medium text-runfree-magentaDeep hover:underline">
                andrew@runfree.co
              </a>{" "}
              and he&rsquo;ll get you in.
            </p>
          )}
        </div>
      )}

      {ready === "ok" && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <FormError message={error} />
          <Field
            id="password"
            label={
              isInvite ? "Password (min 8 characters)" : "New password (min 8 characters)"
            }
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
          <Field
            id="confirm"
            label={isInvite ? "Confirm password" : "Confirm new password"}
            type="password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />
          <SubmitButton
            loading={loading}
            idleLabel={isInvite ? "Set password and continue" : "Update password"}
            busyLabel={isInvite ? "Setting up…" : "Updating…"}
          />
        </form>
      )}
    </AuthShell>
  );
}
