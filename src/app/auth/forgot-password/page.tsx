"use client";

import { useState } from "react";
import { resetPassword } from "@/lib/auth";
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await resetPassword(email);
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
            href="/auth/login"
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
            message={`If ${email} has an account, a reset link is on its way. The link expires in an hour.`}
          />
          <p className="text-sm leading-relaxed text-gray-600">
            Not seeing it after a few minutes? Check your spam folder, and make
            sure you used the same email you were added to the project with.
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
