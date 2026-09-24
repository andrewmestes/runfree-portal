"use client";

import { useEffect, useState } from "react";
import { rememberResetNext, resetPassword, safeNext } from "@/lib/auth";
import AuthShell, {
  Field,
  FormError,
  FormNotice,
  SubmitButton,
} from "@/components/AuthShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  /**
   * The page a guide link or shelf was headed for, handed on by the sign-in
   * page. The reset email opens in a new tab, so it is kept in localStorage
   * (rememberResetNext) for reset-password to pick up — the reset link itself
   * can't carry it, because the templates append ?token_hash= to it literally.
   */
  const [next, setNext] = useState("/");
  useEffect(() => {
    setNext(safeNext(new URLSearchParams(window.location.search).get("next")));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await resetPassword(email);
      rememberResetNext(next);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the email");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a link to set a new one"
      footer={
        <p>
          <a
            href={next === "/" ? "/auth/login" : `/auth/login?next=${encodeURIComponent(next)}`}
            className="font-medium text-runfree-magentaDeep hover:underline"
          >
            Back to sign in
          </a>
        </p>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <FormNotice
            message={`If ${email} has an account, a reset link is on its way.`}
          />
          <p className="text-sm leading-relaxed text-gray-600">
            Not seeing it after a few minutes? Check your spam folder, and make
            sure you used the email your invitation came to. Church and
            organization mail systems sometimes hold new mail for a few minutes
            while they scan it.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <FormError message={error} />
          <Field
            id="email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
          />
          <SubmitButton
            loading={loading}
            idleLabel="Send reset link"
            busyLabel="Sending…"
          />
        </form>
      )}
    </AuthShell>
  );
}
