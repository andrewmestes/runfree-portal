"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCurrentProfile, logout } from "@/lib/auth";
import { createProject, listTemplates, type TemplateSummary } from "@/lib/projects";
import PortalHeader from "@/components/PortalHeader";
import PageLoader from "@/components/PageLoader";
import PortalFooter from "@/components/PortalFooter";
import AccessError from "@/components/AccessError";

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  is_staff: boolean;
  is_owner: boolean;
};

export default function NewProjectPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [status, setStatus] = useState<"checking" | "ready" | "error">("checking");

  const [name, setName] = useState("");
  // Andrew: "the visibility section of create-a-new-project can probably go
  // away, I'd like the section at the top of the project to be where you add
  // people and adjust their permissions." So a project is always created
  // private and access is a deliberate act on the project itself.
  const visibility = "private" as const;
  const [templateId, setTemplateId] = useState<string | "">("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          router.replace("/auth/login");
          return;
        }
        setAccessToken(session.access_token);

        const current = (await getCurrentProfile()) as Profile | null;
        if (!current) {
          setStatus("error");
          return;
        }
        setProfile(current);

        const list = await listTemplates(session.access_token);
        setTemplates(list);
        setStatus("ready");
      } catch (err) {
        console.error("New-project init failed:", err);
        setStatus("error");
      }
    }
    init();
  }, [router]);

  async function handleSignOut() {
    await logout();
    router.replace("/auth/login");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !profile || !name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const { id } = await createProject(accessToken, profile.id, {
        name: name.trim(),
        visibility,
        templateId: templateId || null,
      });
      router.push(`/projects/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the project");
      setCreating(false);
    }
  }

  if (status === "checking") return <PageLoader label="Loading templates…" />;
  if (status === "error") return <AccessError onRetry={() => window.location.reload()} />;
  if (!profile) return null;

  if (!profile.is_staff) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-runfree-indigo/40 px-4">
        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="h-1.5 bg-runfree-grad" />
          <div className="p-8 text-center">
            <h1 className="font-display text-2xl font-bold text-runfree-ink">Staff only</h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              Only RunFree team members can start a new project. If a coach should be
              creating this, ask Andrew to add you as staff.
            </p>
            <a
              href="/"
              className="mt-6 inline-block rounded-lg bg-runfree-grad px-4 py-2.5 font-medium text-white transition hover:opacity-90"
            >
              Back to your projects
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader
        profile={profile}
        onSignOut={handleSignOut}
        backHref="/"
        backLabel="Your projects"
        title="Start a new project"
        subtitle="Stamp a new engagement from a template, or start from scratch and shape it as you go."
      />

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 sm:p-8">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-runfree-ink">Project name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Athena Christian Church - Pivvot Vision Framing"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-runfree-ink">Start from</label>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-3 has-[:checked]:border-runfree-magenta has-[:checked]:bg-runfree-pink/40">
                <input
                  type="radio"
                  name="template"
                  checked={templateId === ""}
                  onChange={() => setTemplateId("")}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium text-runfree-ink">Start from scratch</span>
                  <span className="block text-xs text-gray-500">
                    No fixed modules — add sessions and deliverables with whatever section names fit.
                  </span>
                </span>
              </label>
              {templates.map((t) => (
                <label
                  key={t.id}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-3 has-[:checked]:border-runfree-magenta has-[:checked]:bg-runfree-pink/40"
                >
                  <input
                    type="radio"
                    name="template"
                    checked={templateId === t.id}
                    onChange={() => setTemplateId(t.id)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium text-runfree-ink">{t.name}</span>
                    {t.description && <span className="block text-xs text-gray-500">{t.description}</span>}
                  </span>
                </label>
              ))}
              {templates.length === 0 && (
                <p className="text-xs text-gray-500">No templates yet — starting from scratch is the only option.</p>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={creating}
            className="w-full rounded-lg bg-runfree-grad px-4 py-2.5 font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create project"}
          </button>
        </form>
      </main>

      <PortalFooter />
    </div>
  );
}
