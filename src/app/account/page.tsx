"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCurrentFramer, hasCertificationAccess, logout, updatePassword } from "@/lib/auth";
import PortalHeader from "@/components/PortalHeader";
import AccessError from "@/components/AccessError";
import { Field, FormError, FormNotice } from "@/components/AuthShell";

type Framer = {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
};

export default function AccountPage() {
  const [framer, setFramer] = useState<Framer | null>(null);
  const [loading, setLoading] = useState(true);
  // Set when init() throws outright, so the page stops on a retry screen
  // instead of sitting on its loader with nothing left to set it false.
  const [fatal, setFatal] = useState(false);
  /** Google users have no password to change. */
  const [isPasswordUser, setIsPasswordUser] = useState(true);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const router = useRouter();

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth/login");
        return;
      }

      const providers: string[] =
        (user.app_metadata?.providers as string[]) ||
        (user.app_metadata?.provider ? [user.app_metadata.provider] : []);

      setIsPasswordUser(providers.includes("email") || providers.length === 0);

      const current = (await getCurrentFramer()) as Framer | null;
      if (!(await hasCertificationAccess())) {
        router.replace("/");
        return;
      }

      setFramer(current);
      setLoading(false);
    }

    init().catch((err) => {

      console.error("Account init failed:", err);

      setFatal(true);

      setLoading(false);

    });
  }, [router]);

  async function handleSignOut() {
    await logout();
    router.replace("/auth/login");
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setSaving(true);

    try {
      await updatePassword(password);
      setPassword("");
      setConfirm("");
      setNotice("Password updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setSaving(false);
    }
  }

  if (fatal) {
    return <AccessError onRetry={() => window.location.reload()} />;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-1.5 w-24 rounded-full bg-runfree-grad" />
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader
        framer={framer}
        onSignOut={handleSignOut}
        title="Your account"
        backHref="/"
        backLabel="← Home"
      />

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="h-1.5 bg-runfree-grad" />
          <dl className="divide-y divide-gray-100">
            <div className="flex justify-between px-6 py-4 text-sm">
              <dt className="text-gray-500">Name</dt>
              <dd className="font-medium text-runfree-ink">{framer?.name}</dd>
            </div>
            <div className="flex justify-between px-6 py-4 text-sm">
              <dt className="text-gray-500">Email</dt>
              <dd className="font-medium text-runfree-ink">{framer?.email}</dd>
            </div>
            <div className="flex justify-between px-6 py-4 text-sm">
              <dt className="text-gray-500">Role</dt>
              <dd className="font-medium text-runfree-ink">
                {framer?.is_admin ? "Admin" : "Certified Vision Framer"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="h-1.5 bg-runfree-grad" />
          <div className="p-6">
            <h2 className="font-display text-lg font-bold text-runfree-ink">
              Password
            </h2>

            {isPasswordUser ? (
              <form onSubmit={handleChangePassword} className="mt-4 space-y-5">
                <FormError message={error} />
                <FormNotice message={notice} />
                <Field
                  id="new-password"
                  label="New password (min 8 characters)"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="new-password"
                />
                <Field
                  id="confirm-password"
                  label="Confirm new password"
                  type="password"
                  value={confirm}
                  onChange={setConfirm}
                  autoComplete="new-password"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-runfree-grad px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Updating…" : "Update password"}
                </button>
              </form>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                You sign in with Google, so there&rsquo;s no password to manage
                here — your Google account handles it.
              </p>
            )}
          </div>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Need your name or email changed? Ask an admin — those are tied to your
          certification record.
        </p>
      </main>
    </div>
  );
}
