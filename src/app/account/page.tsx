"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCurrentFramer, getCurrentProfile, getCurrentUser, logout, updatePassword } from "@/lib/auth";
import PortalHeader from "@/components/PortalHeader";
import AccessError from "@/components/AccessError";
import { Field, FormError, FormNotice } from "@/components/AuthShell";

type Framer = {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
};

type Profile = {
  full_name: string | null;
  email: string | null;
  account_role: string | null;
  is_owner: boolean | null;
  is_staff: boolean | null;
};

/** How to describe this account to the person holding it. */
function roleLabel(profile: Profile | null, framer: Framer | null): string {
  if (profile?.is_owner) return "Owner";
  if (framer?.is_admin) return "Admin";
  switch (profile?.account_role) {
    case "admin":
      return "Admin";
    case "runfree_team":
      return "RunFree team";
    case "framer":
    case "framer_subscribed":
      return "Certified Vision Framer";
    case "client":
      return "Client";
    default:
      return framer ? "Certified Vision Framer" : "Client";
  }
}

export default function AccountPage() {
  const [framer, setFramer] = useState<Framer | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
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
      const user = await getCurrentUser();

      if (!user) {
        router.replace("/auth/login");
        return;
      }

      const providers: string[] =
        (user.app_metadata?.providers as string[]) ||
        (user.app_metadata?.provider ? [user.app_metadata.provider] : []);

      setIsPasswordUser(providers.includes("email") || providers.length === 0);

      // No certification gate. This page is every signed-in person's account
      // — both the sidebar and the header profile menu link here for
      // everyone — and the password form on it is universal.
      //
      // It used to bounce anyone without certification access to "/", which
      // for a church client is a silent round trip: "/" sends a non-staff
      // user with one project straight back into that project, so tapping
      // your own name returned you to where you started and there was no
      // route to changing your password at all.
      const [current, prof] = await Promise.all([
        getCurrentFramer() as Promise<Framer | null>,
        getCurrentProfile() as Promise<Profile | null>,
      ]);

      setFramer(current);
      setProfile(prof);
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
        backLabel="Home"
      />

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="h-1.5 bg-runfree-grad" />
          <dl className="divide-y divide-gray-100">
            <div className="flex justify-between px-6 py-4 text-sm">
              <dt className="shrink-0 text-gray-500">Name</dt>
              <dd className="min-w-0 text-right font-medium text-runfree-ink">
                {profile?.full_name || framer?.name || "—"}
              </dd>
            </div>
            <div className="flex justify-between px-6 py-4 text-sm">
              <dt className="shrink-0 text-gray-500">Email</dt>
              <dd className="min-w-0 break-all text-right font-medium text-runfree-ink">
                {profile?.email || framer?.email || "—"}
              </dd>
            </div>
            <div className="flex justify-between px-6 py-4 text-sm">
              <dt className="text-gray-500">Role</dt>
              {/* Was `framer?.is_admin ? "Admin" : "Certified Vision Framer"`,
                  which called everyone without a certified_framers row a
                  Certified Vision Framer — including RunFree admins, who by
                  design have no such row, and every church client. */}
              <dd className="font-medium text-runfree-ink">
                {roleLabel(profile, framer)}
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
          Need your name or email changed? Ask an admin — we keep those in step
          with your records.
        </p>
      </main>
    </div>
  );
}
