"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCurrentProfile, listMyProjects, logout } from "@/lib/auth";
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
  /** Portal-wide certification access — see 006_client_portal_expansion.sql. */
  certification_access: boolean;
};

type ProjectRow = {
  id: string;
  name: string;
  visibility: "private" | "team";
  templates: { name: string; slug: string } | null;
};

export default function HomePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [status, setStatus] = useState<
    "checking" | "missing_profile" | "ready" | "error"
  >("checking");
  const router = useRouter();

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    // Same recovery/invite-link forwarding as the CVF portal this was
    // forked from — see docs/forking-guide.md and auth/callback/page.tsx.
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("type=invite")) {
      window.location.replace(`/auth/reset-password${hash}`);
      return;
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        router.replace("/auth/reset-password");
      }
    });
    unsubscribe = () => sub.subscription.unsubscribe();

    async function init() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/auth/login");
          return;
        }

        const current = (await getCurrentProfile()) as Profile | null;
        if (!current) {
          // Every signed-in user gets a profiles row from the
          // handle_new_user trigger the moment their auth.users row exists —
          // there's no separate allowlist step here. Reaching this means the
          // trigger didn't fire, not that access is "pending".
          setStatus("missing_profile");
          return;
        }

        setProfile(current);
        const mine = (await listMyProjects()) as ProjectRow[];

        // A church client is on exactly one engagement and has no use for a
        // list of one. Send them straight in — "I want it to go directly to
        // the project that they're invited to, especially since the vast
        // majority will only be involved in one single project."
        //
        // Staff keep the list even when it holds one project, because they
        // create others and need somewhere to do it from.
        if (!current.is_staff && mine.length === 1) {
          router.replace(`/projects/${mine[0].id}`);
          return;
        }

        setProjects(mine);
        setStatus("ready");
      } catch (err) {
        console.error("Home init failed:", err);
        setStatus("error");
      }
    }
    init();

    return () => unsubscribe?.();
  }, [router]);

  async function handleSignOut() {
    await logout();
    router.replace("/auth/login");
  }

  if (status === "checking") return <PageLoader label="Loading your projects…" />;

  if (status === "error") {
    return <AccessError onRetry={() => window.location.reload()} />;
  }

  if (status === "missing_profile") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-runfree-indigo/40 px-4">
        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="h-1.5 bg-runfree-grad" />
          <div className="p-8 text-center">
            <h1 className="font-display text-2xl font-bold text-runfree-ink">
              Something's not set up right
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              You're signed in, but no profile exists for your account yet.
              This shouldn't happen — let us know.
            </p>
            <button
              onClick={handleSignOut}
              className="mt-6 w-full rounded-lg bg-runfree-grad-deep px-4 py-2.5 font-medium text-white transition hover:opacity-90"
            >
              Sign out
            </button>
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
        eyebrow={
          profile?.full_name
            ? `Welcome back, ${profile.full_name.split(" ")[0]}`
            : undefined
        }
        title="Your projects"
        subtitle="Session recordings, coaching notes, and deliverables for each engagement."
        // Andrew: "the certification link is missing on the home page." It was
        // — this page rendered the header without the prop, so it defaulted to
        // false and the switcher only ever appeared once you were inside a
        // project.
        certificationAccess={(profile?.certification_access ?? false) || (profile?.is_staff ?? false)}
      />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        {profile?.is_staff && (
          <div className="mb-6 flex justify-end">
            <a
              href="/projects/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-runfree-grad-deep px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              + New project
            </a>
          </div>
        )}

        {projects.length === 0 ? (
          <EmptyState isStaff={profile?.is_staff ?? false} />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </main>

      <PortalFooter />
    </div>
  );
}

function EmptyState({ isStaff }: { isStaff: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center">
      <p className="font-display text-lg font-semibold text-runfree-ink">
        No projects yet
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-600">
        {isStaff
          ? "Nothing here yet — projects you create or are added to will show up in this list."
          : "Nothing here yet. Once you're added to a project, it'll show up here."}
      </p>
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectRow }) {
  return (
    <a
      href={`/projects/${project.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 transition duration-200 hover:-translate-y-1 hover:shadow-lg hover:ring-runfree-magenta/35"
    >
      <div className="h-1 bg-runfree-grad" />
      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-center gap-2">
          {project.visibility === "team" && (
            <span className="inline-flex rounded-full bg-runfree-indigo px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-runfree-navy">
              Team-wide
            </span>
          )}
          {project.templates?.name && (
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
              {project.templates.name}
            </span>
          )}
        </div>
        <h2 className="mt-3 font-display text-lg font-bold text-runfree-ink">
          {project.name}
        </h2>
      </div>
    </a>
  );
}
