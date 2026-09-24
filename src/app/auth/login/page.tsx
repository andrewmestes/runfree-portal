"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loginWithEmail, rememberNext, safeNext, signInWithGoogle } from "@/lib/auth";
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
  /**
   * Where to go after signing in. A guide link (`/open/handout/…`) sends a
   * signed-out person here with `?next=` so they land on the handout they
   * clicked, not the home page. Read from the URL after mount rather than
   * through useSearchParams, which would force a Suspense boundary around
   * the whole page for one string.
   */
  const [next, setNext] = useState("/");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setNext(safeNext(q.get("next")));
    // The callback sends a failed Google sign-in back here as ?error=<code>.
    // signup_disabled is the common one: self-signup is off, so a Google
    // account on an address nobody invited is refused — a personal Gmail,
    // say, when the invitation went to a church or work address.
    const code = q.get("error");
    if (code === "signup_disabled")
      setError(
        "That Google account isn't one the portal knows. Continue with Google using the address your invitation came to, or sign in below with that address and your password."
      );
    else if (code)
      setError(
        "That sign-in didn't complete. Try again, or use Forgot your password below to get a fresh link."
      );
  }, []);
  const router = useRouter();
  // A reset on the way in keeps the page they were headed for.
  const forgotHref =
    next === "/" ? "/auth/forgot-password" : `/auth/forgot-password?next=${encodeURIComponent(next)}`;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await loginWithEmail(email, password);
      router.push(next);
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
      // Google's round trip loses the query string; the callback page reads
      // this back and clears it.
      rememberNext(next);
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setGoogleLoading(false);
    }
  };

  return (
    <AuthShell
      title="RunFree Portal"
      subtitle="Sign in with the email your invitation came to"
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
          Access is by invitation from RunFree. Need one?{" "}
          <a
            href="mailto:andrew@runfree.co?subject=RunFree%20Portal%20access"
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
          idleLabel="Sign in"
          busyLabel="Signing in…"
        />
      </form>

      <p className="mt-4 text-center text-sm">
        <a
          href={forgotHref}
          className="text-gray-500 hover:text-runfree-magentaDeep hover:underline"
        >
          Forgot your password?
        </a>
      </p>

      {/* Most invited people never open the invitation — a church team, or a
          framer invited to the hub with no project at all (the 13 North
          Carolina framers, 22 Sept 2026) — and then cannot sign in because an
          invited account has no password yet. The way in is the same link
          above, which works whether or not the invitation was ever opened —
          so say so here, where they are stuck, without assuming a project. */}
      <p className="mt-2 text-center text-xs leading-relaxed text-gray-500">
        Invited but never set a password? Use{" "}
        <a
          href={forgotHref}
          className="font-medium text-runfree-magentaDeep hover:underline"
        >
          Forgot your password
        </a>{" "}
        with that same email, and you can set one now. Google sign-in works
        only with that address too.
      </p>
    </AuthShell>
  );
}
