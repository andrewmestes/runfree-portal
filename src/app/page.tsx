"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  getCurrentProfile,
  getCurrentSession,
  listMyProjects,
  logout,
  setProjectPinned,
} from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";
import { getSignedImageUrls } from "@/lib/storage";
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
  logo_path: string | null;
  location: string | null;
  templates: { name: string; slug: string } | null;
  /** When this user pinned it, or null. See migration 038. */
  pinned_at: string | null;
  /** Filled in after the list loads — one signing call, one members call. */
  logoUrl?: string;
  leadContact?: string | null;
};

export default function HomePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [layout, setLayout] = useState<"cards" | "list">("cards");
  useEffect(() => {
    const saved = window.localStorage.getItem("rf-projects-layout");
    if (saved === "list" || saved === "cards") setLayout(saved);
  }, []);
  function chooseLayout(l: "cards" | "list") {
    setLayout(l);
    window.localStorage.setItem("rf-projects-layout", l);
  }
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
        const mine = (await listMyProjects()) as unknown as ProjectRow[];

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

        /**
         * A certified framer with no projects lands on the certification hub,
         * not on an empty projects list.
         *
         * Andrew: "the logo links to the list of projects. if someone doesn't
         * have access to that, let's make sure that takes them to the home
         * page of the certification rather than an error message."
         *
         * Doing it here rather than by changing the logo's href fixes every
         * route to "/" at once — the logo, the footer, "Your projects", and
         * any bookmark — instead of the one link that happened to be noticed.
         * Staff are excluded: an empty list is a real state for someone who is
         * about to create their first project, and they need the button.
         */
        if (!current.is_staff && mine.length === 0 && current.certification_access) {
          router.replace("/certification");
          return;
        }

        setProjects(mine);
        setStatus("ready");

        // Logos and a lead contact, after the list is already on screen —
        // a card is useful without its mark, and neither is worth delaying
        // the page for.
        void (async () => {
          try {
            const session = await getCurrentSession();
            if (!session) return;
            const paths = mine
              .map((p: ProjectRow) => p.logo_path)
              .filter((x): x is string => !!x);
            const urls = paths.length > 0 ? await getSignedImageUrls(session.access_token, paths) : {};

            const client = createUserClient(session.access_token);
            const { data: contacts } = await client
              .from("church_contacts")
              .select("project_id, full_name, title, position")
              .in("project_id", mine.map((p: ProjectRow) => p.id))
              .order("position", { ascending: true });

            const leadByProject = new Map<string, string>();
            for (const c of contacts ?? []) {
              if (/pastor|lead/i.test(c.title ?? "") && !leadByProject.has(c.project_id)) {
                leadByProject.set(c.project_id, c.full_name);
              }
            }

            setProjects((prev) =>
              prev.map((p) => ({
                ...p,
                logoUrl: p.logo_path ? urls[p.logo_path] : undefined,
                leadContact: leadByProject.get(p.id) ?? null,
              }))
            );
          } catch {
            /* cosmetic only */
          }
        })();
      } catch (err) {
        console.error("Home init failed:", err);
        setStatus("error");
      }
    }
    init();

    return () => unsubscribe?.();
  }, [router]);

  /**
   * Re-sort in place rather than refetching. The server is already updated;
   * a round trip would only make the star feel slow, and the ordering rule is
   * simple enough to apply here — pinned first, most recent pin at the top.
   */
  function togglePin(id: string, pinned: boolean) {
    setProjects((prev) =>
      [...prev]
        .map((p) => (p.id === id ? { ...p, pinned_at: pinned ? new Date().toISOString() : null } : p))
        .sort((a, b) => {
          if (!!a.pinned_at !== !!b.pinned_at) return a.pinned_at ? -1 : 1;
          if (a.pinned_at && b.pinned_at) return a.pinned_at < b.pinned_at ? 1 : -1;
          return 0;
        })
    );
  }

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
              className="mt-6 w-full rounded-lg bg-runfree-grad px-4 py-2.5 font-medium text-white transition hover:opacity-90"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
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

      <main className="flex-1 mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="mb-6 flex items-center justify-end gap-2">
          <div className="inline-flex rounded-lg bg-white p-1 ring-1 ring-gray-200">
            {(["cards", "list"] as const).map((l) => (
              <button
                key={l}
                onClick={() => chooseLayout(l)}
                aria-pressed={layout === l}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition ${
                  layout === l
                    ? "bg-runfree-grad text-white"
                    : "text-gray-500 hover:text-runfree-ink"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        {profile?.is_staff && (
          <>
            <a
              href="/projects/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-runfree-grad px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              + New project
            </a>
          </>
        )}
        </div>

        {projects.length === 0 ? (
          <EmptyState
            isStaff={profile?.is_staff ?? false}
            certificationAccess={
              (profile?.certification_access ?? false) || (profile?.is_staff ?? false)
            }
          />
        ) : layout === "list" ? (
          <ul className="overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200">
            {projects.map((project, i) => (
              <li key={project.id}>
                <ProjectListRow project={project} first={i === 0} onToggled={togglePin} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} onToggled={togglePin} />
            ))}
          </div>
        )}
      </main>

      <PortalFooter />
    </div>
  );
}

/**
 * Projects lead, always — Andrew: "if they have both kinds of access, let's
 * land on the projects page first." But a certified framer with no project
 * yet would otherwise land on a dead end, so the certification library is
 * offered here rather than left to be discovered in the nav.
 */
function EmptyState({
  isStaff,
  certificationAccess,
}: {
  isStaff: boolean;
  certificationAccess: boolean;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
      <p className="font-display text-lg font-semibold text-runfree-ink">No projects yet</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-600">
        {isStaff
          ? "Projects you create or are added to will show up in this list."
          : "Once you're added to a project, it'll show up here."}
      </p>

      {certificationAccess && (
        <>
          <p className="mx-auto mt-8 max-w-sm text-xs font-bold uppercase tracking-[0.14em] text-gray-400">
            Meanwhile, your certification library
          </p>
          <div className="mx-auto mt-4 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { href: "/resources", label: "Handouts" },
              { href: "/videos", label: "Videos" },
              { href: "/books", label: "Books" },
              { href: "/guide", label: "Facilitator's Guide" },
            ].map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="flex min-h-[64px] items-center justify-center rounded-xl bg-runfree-indigo/50 px-3 text-sm font-semibold text-runfree-navy transition hover:bg-runfree-indigo"
              >
                {l.label}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * "Christ Chapel - Pivvot Vision Framing" with "Pivvot Vision Framing"
 * printed above it said the same thing twice. The template name is the
 * eyebrow; the church's own name is the heading, with the suffix stripped.
 */
function churchName(project: ProjectRow): string {
  const t = project.templates?.name;
  if (!t) return project.name;
  return project.name.replace(new RegExp(`\\s*[-–—]\\s*${t}\\s*$`, "i"), "").trim() || project.name;
}

function ProjectMark({ project, size }: { project: ProjectRow; size: number }) {
  const initials = churchName(project)
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return project.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={project.logoUrl}
      alt=""
      style={{ width: size, height: size }}
      className="shrink-0 rounded-xl object-contain ring-1 ring-gray-200"
    />
  ) : (
    <span
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-xl bg-runfree-indigo text-sm font-bold text-runfree-navy"
    >
      {initials}
    </span>
  );
}

function ProjectMeta({ project }: { project: ProjectRow }) {
  const bits = [project.leadContact, project.location].filter(Boolean) as string[];
  if (bits.length === 0) return null;
  return <p className="mt-1 truncate text-xs text-gray-500">{bits.join(" · ")}</p>;
}

/**
 * Pin a project to the top of your own list.
 *
 * Andrew: "when listing projects, I'd like to be able to reorder these, maybe
 * even star or pin them to the top the way Asana does."
 *
 * Pinning beat drag-to-reorder here. A hand-sorted list has to be maintained
 * — every new project lands somewhere arbitrary and needs dragging into
 * place — whereas a star is one click, needs no upkeep, and answers the
 * actual question ("which two am I working on this week?"). Manual ordering
 * can still go on top of this later if it turns out to be wanted.
 *
 * It sits inside a card that is itself a link, so the click has to be stopped
 * from navigating — hence preventDefault as well as stopPropagation.
 */
function PinButton({
  project,
  onToggled,
}: {
  project: ProjectRow;
  onToggled: (id: string, pinned: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const pinned = !!project.pinned_at;

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await setProjectPinned(project.id, !pinned);
      onToggled(project.id, !pinned);
    } catch {
      // Leave the star as it was; the list is still usable unsorted.
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      aria-pressed={pinned}
      title={pinned ? "Unpin from the top" : "Pin to the top"}
      aria-label={
        pinned ? `Unpin ${churchName(project)}` : `Pin ${churchName(project)} to the top`
      }
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg outline-none transition focus-visible:ring-2 focus-visible:ring-runfree-magenta ${
        pinned
          ? "text-runfree-magenta hover:bg-runfree-pink"
          : "text-gray-300 hover:bg-gray-100 hover:text-runfree-magentaDeep"
      } ${busy ? "opacity-50" : ""}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill={pinned ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />
      </svg>
    </button>
  );
}

function ProjectCard({ project, onToggled }: { project: ProjectRow; onToggled: (id: string, pinned: boolean) => void }) {
  return (
    <a
      href={`/projects/${project.id}`}
      className={`group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 transition duration-200 hover:-translate-y-1 hover:shadow-lg hover:ring-runfree-magenta/35 ${
        project.pinned_at ? "ring-runfree-magenta/40" : "ring-gray-200"
      }`}
    >
      <div className="h-1 bg-runfree-grad" />
      <div className="flex flex-1 items-start gap-4 p-6">
        <ProjectMark project={project} size={48} />
        <div className="min-w-0 flex-1">
          {project.templates?.name && (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {project.templates.name}
            </span>
          )}
          <h2 className="mt-0.5 font-display text-lg font-bold leading-snug text-runfree-ink">
            {churchName(project)}
          </h2>
          <ProjectMeta project={project} />
        </div>
        <PinButton project={project} onToggled={onToggled} />
      </div>
    </a>
  );
}

function ProjectListRow({
  project,
  first,
  onToggled,
}: {
  project: ProjectRow;
  first: boolean;
  onToggled: (id: string, pinned: boolean) => void;
}) {
  return (
    <a
      href={`/projects/${project.id}`}
      className={`flex items-center gap-4 px-5 py-3.5 transition hover:bg-runfree-indigo/30 ${
        first ? "" : "border-t border-gray-100"
      }`}
    >
      <ProjectMark project={project} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-runfree-ink">{churchName(project)}</p>
        <ProjectMeta project={project} />
      </div>
      {project.templates?.name && (
        <span className="hidden shrink-0 text-[11px] font-medium uppercase tracking-wide text-gray-400 sm:block">
          {project.templates.name}
        </span>
      )}
      <PinButton project={project} onToggled={onToggled} />
      <span aria-hidden className="shrink-0 text-gray-300">
        →
      </span>
    </a>
  );
}
