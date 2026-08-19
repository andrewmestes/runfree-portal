"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginWithEmail, signInWithGoogle } from "@/lib/auth";
import AuthShell, {
  Field,
  FormError,
  GoogleButton,
  OrDivider,
  SubmitButton,
} from "@/components/AuthShell";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await loginWithEmail(email, password);
      router.push("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      // Supabase's wording here is opaque to a normal person.
      setError(
        /invalid login credentials/i.test(msg)
          ? "That email and password don't match. Try again, or reset your password below."
          : /email not confirmed/i.test(msg)
            ? "Please confirm your email first — check your inbox for the link we sent."
            : msg
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setGoogleLoading(false);
    }
  };

  return (
    <AuthShell
      title="RunFree Portal"
      subtitle="Sign in to your engagement"
      about={
        <>
          <p>
            <strong className="font-semibold text-runfree-ink">RunFree Portal</strong> is the
            private workspace for churches and leaders working through a vision-framing or
            coaching engagement with RunFree, and for Certified Vision Framers who facilitate
            that process.
          </p>
          <p>
            Inside, a church team finds everything for their engagement in one place: the dates
            they are meeting, the reading and preparation before each session, the handouts and
            teaching videos for each stage of the process, recordings and notes from every
            session held, and the finished work their team produces &mdash; their mission,
            values, strategy and measures.
          </p>
          <p>
            Signing in with Google shares only your name, email address and profile picture. The
            portal cannot read your Gmail, Drive, Calendar or contacts, and never asks to. You
            can use an email address and password instead if you prefer.
          </p>
          <p>
            Every project is private to the church it belongs to and the RunFree team leading it.
            Access is by invitation only &mdash; there is no public area and nothing here is
            indexed or shared. See our{" "}
            <a href="/privacy" className="font-medium text-runfree-magentaDeep hover:underline">
              Privacy Policy
            </a>{" "}
            and{" "}
            <a href="/terms" className="font-medium text-runfree-magentaDeep hover:underline">
              Terms of Service
            </a>
            .
          </p>
        </>
      }
      footer={
        <p className="leading-relaxed">
          Access is granted by RunFree when you're added to a project. Need an
          invitation?{" "}
          <a
            href="mailto:andrew@runfree.co?subject=Client%20Portal%20access"
            className="font-medium text-runfree-magentaDeep hover:underline"
          >
            Get in touch
          </a>
        </p>
      }
    >
      <GoogleButton
        onClick={handleGoogle}
        disabled={googleLoading}
        label={googleLoading ? "Redirecting…" : "Continue with Google"}
      />

      <OrDivider />

      <form onSubmit={handleLogin} className="space-y-5">
        <FormError message={error} />
        <Field
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
        />
        <Field
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        <SubmitButton
          loading={loading}
          idleLabel="Sign In"
          busyLabel="Signing in…"
        />
      </form>

      <p className="mt-4 text-center text-sm">
        <a
          href="/auth/forgot-password"
          className="text-gray-500 hover:text-runfree-magentaDeep hover:underline"
        >
          Forgot your password?
        </a>
      </p>
    </AuthShell>
  );
}
