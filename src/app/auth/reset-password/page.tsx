"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { updatePassword } from "@/lib/auth";
import AuthShell, {
  Field,
  FormError,
  SubmitButton,
} from "@/components/AuthShell";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState<"checking" | "ok" | "invalid">("checking");
  /**
   * The same screen serves two arrivals: someone resetting a forgotten
   * password, and someone just invited to a project setting one for the
   * first time. Only the wording differs, but telling a brand-new user
   * their "reset link expired" would be baffling — they never had a
   * password to reset.
   */
  const [isInvite, setIsInvite] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Read before the client consumes and clears the hash.
    if (window.location.hash.includes("type=invite")) setIsInvite(true);

    // Supabase puts the session in the URL and the client picks it up.
    // Give it a moment, then confirm we actually have one.
    const timer = setTimeout(async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setReady(session ? "ok" : "invalid");
    }, 800);

    return () => clearTimeout(timer);
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
      await updatePassword(password);
      router.push("/");
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
              isInvite
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
                Reset links are single-use and expire after an hour.{" "}
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
