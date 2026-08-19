"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { getCurrentProfile, logout } from "@/lib/auth";
import {
  createDeliverable,
  availableSections,
  createContact,
  createPrepItem,
  createTask,
  createSession,
  deleteContact,
  deleteDeliverable,
  deleteTask,
  deleteProject,
  deletePrepItem,
  deleteSession,
  getProjectDetail,
  contactsToCsv,
  removeMember,
  reorderDeliverables,
  safeExternalUrl,
  saveSectionNote,
  setDeliverableCaption,
  setLeadNavigator,
  setProjectArchived,
  setTaskDone,
  updatePriorities,
  updateAvatar,
  updateMemberDetails,
  updateMemberRole,
  updateContact,
  updatePrepItem,
  updateProject,
  updateSession,
  type ChurchContact,
  type PrepGroup,
  type PrepGroupKind,
  type PrepItem,
  type ProjectTask,
  type ProjectDetail,
  type ProjectMember,
  type ProjectRole,
} from "@/lib/projects";
import {
  getSignedImageUrls,
  uploadDeliverableImage,
  uploadPrepFile,
  setPrepFilePrivacy,
  uploadProjectLogo,
} from "@/lib/storage";
import { extractLoomId } from "@/lib/loom";
import { MODULE_META, moduleLabel, moduleOrder } from "@/lib/modules";
import ModuleNav, { type NavModule } from "@/components/ModuleNav";
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
  certification_access: boolean;
};

/**
 * The one Drive handout that belongs to the Preparation panel rather than
 * the process. Matched loosely because the file is named by hand in Drive
 * and has appeared as both "Preparation Checklist" and "Prep Checklist".
 */
const PREP_HANDOUT = /prep(aration)?\s*checklist/i;

const PREP_SECTION = "CHURCH PREPARATION";
const OVERVIEW_SECTION = "PROCESS OVERVIEW";

/**
 * A phone photo of a flipchart is a few MB; anything past this is a video
 * someone mis-picked or a RAW file, and pushing it through the browser to
 * Storage would stall the upload with no feedback.
 */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

type HandoutFile = {
  id: string;
  title: string;
  num: string | null;
  label: string;
  sizeBytes: number | null;
};
type HandoutLibrary = {
  configured: boolean;
  byModule: Record<string, { combined: HandoutFile | null; sheets: HandoutFile[] }>;
  extras: { id: string; name: string; files: HandoutFile[] }[];
  notebooks: HandoutFile[];
};

/**
 * "2026-03-14" -> "14 March 2026". Parsed as parts rather than handed to
 * `new Date("2026-03-14")`, which is treated as UTC midnight and renders as
 * the previous day for anyone west of Greenwich — including every church
 * this serves.
 */
function formatSessionDate(held: string | null): string {
  if (!held) return "Date not set";
  const [y, m, d] = held.split("-").map(Number);
  if (!y || !m || !d) return held;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Today at midnight, local time — the cutoff "upcoming" is measured against. */
function startOfToday(): number {
  return new Date().setHours(0, 0, 0, 0);
}

/**
 * A stored date ("2026-08-24") as a local Date.
 *
 * `new Date("2026-08-24")` parses as midnight UTC, which is the previous
 * evening anywhere west of Greenwich — so after 8pm Eastern a session
 * scheduled for today sorted as already past and vanished from "Next". These
 * dates carry no time zone because they are calendar dates, not instants;
 * splitting the parts and handing them to the local constructor is what
 * treats them that way.
 */
function parseLocalDate(iso: string | null): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

/** "24 August" — the short form used where the year is obvious from context. */
function formatPrepDate(iso: string | null): string {
  const parsed = parseLocalDate(iso);
  if (!parsed) return "Date not set";
  return parsed.toLocaleDateString(undefined, { day: "numeric", month: "long" });
}

/**
 * Every storage path a project page needs signed, in one place.
 *
 * load() and refresh() each built this list by hand and they drifted:
 * load() left out prep-item files, so a PDF uploaded to Previous Vision
 * Equity or Team Building Profiles rendered as a dead chip on first load and
 * only came alive after some other action happened to call refresh().
 * Neither signed deliverable FILES at all, which left the Asana-imported
 * PDFs unopenable in the same way.
 */
function signablePaths(detail: ProjectDetail): string[] {
  return [
    ...(detail.logoPath ? [detail.logoPath] : []),
    ...detail.members.map((m) => m.avatarPath),
    ...detail.deliverables.map((d) => d.image_path),
    ...detail.deliverables.map((d) => d.file_path),
    ...detail.prepItems.map((p) => p.file_path),
  ].filter((p): p is string => !!p);
}

function prettySize(bytes: number | null): string | null {
  if (!bytes) return null;
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(mb >= 10 ? 0 : 1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  // Two ways to read the same engagement. "Dynamic" is the full scrolling
  // page; "Condensed" folds every part down to one index screen. Andrew wants
  // both live so the team and a client can be shown the same project in two
  // styles and asked which one they prefer. Persisted per browser so a
  // reviewer's choice survives a reload mid-comparison.
  /**
   * Which panel is showing. Kept in the URL (?panel=prepare) so a coach can
   * send someone straight to a section — "open this and look at Preparation"
   * used to mean "scroll down to roughly the middle".
   *
   * Read from the URL on mount rather than held in state alone, so a shared
   * link, a refresh, and the browser Back button all land in the same place.
   */
  const [panel, setPanel] = useState<string>("overview");
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("panel");
    if (fromUrl) setPanel(fromUrl);
    const onPop = () => {
      setPanel(new URLSearchParams(window.location.search).get("panel") || "overview");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const goPanel = useCallback((next: string) => {
    setPanel(next);
    const url = new URL(window.location.href);
    url.searchParams.set("panel", next);
    window.history.pushState(null, "", url);
    // A panel swap replaces the whole screen; landing halfway down the new
    // one because the old one was scrolled is disorienting.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const [status, setStatus] = useState<"checking" | "ready" | "not_found" | "error">("checking");
  const [activeModule, setActiveModule] = useState<string>("");
  const [handouts, setHandouts] = useState<HandoutLibrary | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
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

      const result = await getProjectDetail(session.access_token, projectId);
      if (!result) {
        setStatus("not_found");
        return;
      }
      setDetail(result);
      setStatus("ready");

      // Logo and every session image in a single signing request.
      setImageUrls(await getSignedImageUrls(session.access_token, signablePaths(result)));

      // Real Loom stills, resolved server-side. Fired after the render like
      // the handouts: a video card is usable without its picture, and waiting
      // on an external provider before showing anything is the wrong trade.
      const videoUrls = result.resources
        .filter((r) => r.kind === "video" && r.external_url)
        .map((r) => r.external_url!)
        .concat(
          result.sessions.map((x) => x.recording_url).filter((u): u is string => !!u)
        );
      if (videoUrls.length > 0) {
        fetch("/api/loom-thumbnails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ urls: videoUrls }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => d?.thumbnails && setThumbs(d.thumbnails))
          .catch(() => {});
      }

      // Handouts come from Drive and are the slowest part of the page, so
      // they load after the render rather than blocking it — a module shows
      // its videos and exercises immediately and the handout appears a beat
      // later. A failure here is deliberately quiet: the rest of the project
      // is still worth reading, and a church shouldn't see an error because
      // Google was slow.
      fetch(`/api/projects/${projectId}/handouts`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data && setHandouts(data))
        .catch(() => {});
    } catch (err) {
      console.error("Project load failed:", err);
      setStatus("error");
    }
  }, [projectId, router]);

  /**
   * Open a handout in a new tab.
   *
   * The file endpoint needs an Authorization header, which an <a href> cannot
   * send — this app keeps its session in localStorage, not a cookie. So the
   * bytes are fetched with the token and handed over as a blob URL, the same
   * approach the CVF portal uses for its gated Drive files.
   *
   * The tab is opened SYNCHRONOUSLY on the click and pointed at the blob
   * afterwards. Opening it after the await instead is what gets a window
   * swallowed by a popup blocker, because by then the browser no longer
   * attributes it to a user gesture.
   */
  const openHandout = useCallback(
    async (fileId: string, title: string) => {
      const tab = window.open("", "_blank");
      if (tab) {
        tab.document.write(
          `<title>${title.replace(/[<>]/g, "")}</title><p style="font:16px system-ui;padding:2rem;color:#555">Opening ${title.replace(/[<>]/g, "")}…</p>`
        );
      }
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch(`/api/projects/${projectId}/handouts/file/${fileId}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) throw new Error(String(res.status));

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (tab) tab.location.href = url;
        else window.location.href = url;
        // Long enough for the viewer to have loaded it; the object would
        // otherwise be held for the life of the document.
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch {
        if (tab) {
          tab.document.body.innerHTML =
            '<p style="font:16px system-ui;padding:2rem;color:#b00">That handout could not be opened. Please try again.</p>';
        }
      }
    },
    [projectId]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Default to the first module once content is known, but never fight a
  // choice the person has already made.
  const modules: NavModule[] = useMemo(() => {
    if (!detail) return [];
    const counts = new Map<string, number>();
    const note = (section: string | null) => {
      if (!section) return;
      if (moduleOrder(section) === null) return;
      counts.set(section, (counts.get(section) ?? 0) + 1);
    };
    detail.resources.forEach((r) => note(r.section));
    detail.deliverables.forEach((d) => note(d.section));
    detail.sessions.forEach((s) => note(s.section));

    return [...counts.entries()]
      .map(([section, count]) => ({ section, order: moduleOrder(section)!, count }))
      .sort((a, b) => a.order - b.order);
  }, [detail]);

  useEffect(() => {
    if (!activeModule && modules.length > 0) setActiveModule(modules[0].section);
  }, [modules, activeModule]);

  async function handleSignOut() {
    await logout();
    router.replace("/auth/login");
  }

  async function refresh() {
    if (!accessToken) return;
    const result = await getProjectDetail(accessToken, projectId);
    if (!result) return;
    setDetail(result);
    setImageUrls(await getSignedImageUrls(accessToken, signablePaths(result)));
  }

  if (status === "checking") return <PageLoader label="Loading your project…" />;
  if (status === "error") return <AccessError onRetry={load} />;
  if (status === "not_found" || !detail || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-runfree-indigo/40 px-4">
        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="h-1.5 bg-runfree-grad" />
          <div className="p-8 text-center">
            <h1 className="font-display text-2xl font-bold text-runfree-ink">Project not found</h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              Either it doesn&rsquo;t exist, or you don&rsquo;t have access to it.
            </p>
            <a
              href="/"
              className="mt-6 inline-block rounded-lg bg-runfree-grad-deep px-4 py-2.5 font-medium text-white transition hover:opacity-90"
            >
              Back to your projects
            </a>
          </div>
        </div>
      </div>
    );
  }

  const myMembership = detail.members.find((m) => m.profileId === profile.id);
  const myRole: ProjectRole | null = myMembership?.role ?? (profile.is_owner ? "admin" : null);
  const canEdit = myRole === "editor" || myRole === "admin";
  const canManage = myRole === "admin" || profile.is_owner;

  // Which sections belong to the prepare block is a property of the template,
  // not a constant. Pivvot calls it "CHURCH PREPARATION"; Younique's prework
  // sits under "Recommended Prework", which is not a module and not the
  // process overview. Deriving it from the groups the template declares means
  // a third template names its own prepare section and lands in the right
  // place without another branch here.
  const moduleSections = new Set(modules.map((m) => m.section));
  const prepSections = new Set<string>([
    PREP_SECTION,
    ...detail.prepGroups.map((g) => g.section).filter((s) => !moduleSections.has(s)),
  ]);

  const prepResources = detail.resources.filter(
    (r) => prepSections.has(r.section) && r.section !== OVERVIEW_SECTION
  );
  const overviewResources = detail.resources.filter((r) => r.section === OVERVIEW_SECTION);

  // A group attached to one of the six modules renders inside that module's
  // panel; everything else belongs to the prepare block. Guest Perspective
  // Evaluation sits under PROCESS OVERVIEW, which has no panel of its own —
  // its resources already render here, and its card belongs with them.
  //
  // Sorted so the template's own prepare section stays contiguous. Ordering
  // by position alone interleaves the two sections — Key Dates(1), Guest
  // Perspective(1), Preparation Checklist(2) — which reads as a shuffled
  // deck rather than one list with an appendix.
  const allNonModuleGroups = detail.prepGroups
    .filter((g) => !moduleSections.has(g.section))
    .sort(
      (a, b) =>
        Number(a.section === OVERVIEW_SECTION) - Number(b.section === OVERVIEW_SECTION) ||
        a.section.localeCompare(b.section) ||
        a.position - b.position
    );

  // Andrew's IA: key dates, preparation, deliverables and team-coaching work
  // are four different things that were all sharing one "prepare" block.
  // A group's `section` now says which of them it belongs to.
  const dateGroups = allNonModuleGroups.filter((g) => g.kind === "dates");
  const deliverableGroups = allNonModuleGroups.filter((g) => g.section === "DELIVERABLES");
  const teamGroups = allNonModuleGroups.filter((g) => g.section === "TEAM");
  const prepareGroups = allNonModuleGroups.filter(
    (g) =>
      g.kind !== "dates" &&
      g.section !== "DELIVERABLES" &&
      g.section !== "TEAM"
  );
  const stackItems = detail.deliverables.filter((d) => d.kind === "vision_stack");
  const stackReady = stackItems.filter((d) => d.published_at).length;

  // Anything whose section no other part of this page claims. Without this,
  // a template that doesn't use "Mod #N" headings renders NOTHING: every one
  // of the Younique template's 33 resources sits under "Day 1 - Section #1",
  // "Recommended Prework" and the like, so a Younique client would have
  // opened an empty portal. The same would have hit Meta Performance and
  // DENOMINEE as they land.
  //
  // ModulePanel already degrades correctly for these — moduleOrder() returns
  // null so it drops the stage line and the icon, and moduleLabel() passes an
  // unprefixed heading straight through — so they get the same treatment,
  // just without the six-tool rail above them.
  const claimed = new Set<string>([
    ...modules.map((m) => m.section),
    ...prepSections,
    OVERVIEW_SECTION,
  ]);
  const orphanSections = [
    ...new Set([
      // team_bio rows are rendered by TeamSection whatever section they're in.
      ...detail.resources.filter((r) => r.kind !== "team_bio").map((r) => r.section),
      ...detail.deliverables
        .filter((d) => d.kind === "session_image")
        .map((d) => d.section)
        .filter((s): s is string => !!s),
      ...detail.sessions.map((s) => s.section).filter((s): s is string => !!s),
    ]),
  ].filter((s) => !claimed.has(s));

  /**
   * The panels, in the order Andrew asked for them: orientation first, then
   * the people, then the work, and the Vision Stack last because it is the
   * output rather than the way in.
   *
   * Counts ride along on the tabs because they are what makes the process
   * legible to a first-time visitor. Deliverables carries none: coaches
   * routinely run part of the process, so any total there reads as a target
   * that a deliberately partial engagement has failed to hit.
   */
  const hasDeliverables = (detail.template?.hasVisionStack ?? false) || deliverableGroups.length > 0;
  const datesCount = detail.prepItems.filter((i) =>
    dateGroups.some((g) => g.id === i.group_id)
  ).length;
  const prepareCount = detail.prepItems.filter((i) =>
    prepareGroups.some((g) => g.id === i.group_id)
  ).length;

  // Title Case throughout — "The process" next to "Key dates" read as an
  // unfinished sentence rather than a set of labels.
  //
  // There is no Access tab. Who can get in is a property of the project, not
  // a section of it, so it lives in the header beside the logo and the
  // website — and it was landing one click from the Team tab, which shows
  // the church's people and looked like the same thing.
  const panelItems = [
    { key: "overview", label: "Overview", count: null },
    { key: "team", label: "Team", count: detail.contacts.length + detail.members.length },
    dateGroups.length > 0 ? { key: "dates", label: "Key Dates", count: datesCount } : null,
    prepareGroups.length > 0 || prepResources.length > 0
      ? { key: "prepare", label: "Preparation", count: prepareCount }
      : null,
    modules.length > 0 ? { key: "process", label: "The Process", count: modules.length } : null,
    { key: "sessions", label: "Session Recordings", count: detail.sessions.length },
    hasDeliverables ? { key: "deliverables", label: "Deliverables", count: null } : null,
  ].filter((x): x is { key: string; label: string; count: number | null } => x !== null);

  // A link to a panel this project doesn't have (a Younique project has no
  // module track) lands on the Overview rather than on a blank screen.
  const activePanel = panelItems.some((p) => p.key === panel) ? panel : "overview";

  const doorways = panelItems
    .filter((p) => p.key !== "overview" && p.key !== "access")
    .map((p) => ({
      key: p.key,
      label: p.label,
      blurb:
        p.key === "team"
          ? `${detail.members.length} from RunFree${
              detail.contacts.length > 0 ? ` · ${detail.contacts.length} from the church` : ""
            }`
          : p.key === "dates"
            ? `${datesCount} on the calendar`
            : p.key === "prepare"
              ? `${prepareCount} to read and do before we begin`
              : p.key === "process"
                ? `${modules.length} tools, in the order we use them`
                : p.key === "sessions"
                  ? detail.sessions.length === 1
                    ? "1 session recorded"
                    : `${detail.sessions.length} sessions recorded`
                  : "What your team builds together",
    }));

  // Where the team is: the module of the most recent session that has
  // actually happened, falling back to whichever module is selected.
  const lastHeld = [...detail.sessions]
    .filter((s) => s.held_on)
    .sort((a, b) => (a.held_on! < b.held_on! ? 1 : -1))[0];
  const currentModule = lastHeld?.section ?? (modules.length > 0 ? activeModule : null);

  const nextDateItem =
    detail.prepItems
      .filter((i) => i.due_on && dateGroups.some((g) => g.id === i.group_id))
      .sort((a, b) => (a.due_on! < b.due_on! ? -1 : 1))
      .find((i) => (parseLocalDate(i.due_on)?.getTime() ?? 0) >= startOfToday()) ?? null;

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader
        profile={profile}
        onSignOut={handleSignOut}
        backHref="/"
        backLabel="Your projects"
        title=""
        showTitleBlock={false}
        certificationAccess={profile.certification_access || profile.is_staff}
      />

      <ChurchHero
        detail={detail}
        logoUrl={detail.logoPath ? imageUrls[detail.logoPath] : undefined}
        canManage={canManage}
        accessToken={accessToken}
        onChanged={refresh}
      />

      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
        <PrioritiesBanner
          detail={detail}
          canEdit={canEdit}
          accessToken={accessToken}
          projectId={projectId}
          moduleOptions={availableSections(detail)}
          onChanged={refresh}
        />

        <ProjectToolbar active={activePanel} onSelect={goPanel} items={panelItems} />

        {/* One panel at a time. `key` on the wrapper restarts the fade on
            every swap, so the change is legible rather than an instant
            content replacement that looks like a glitch.

            The Dynamic/Condensed toggle is gone. It existed to make one very
            long page scannable, which is the problem panels solve — and
            keeping a mode that collapsed every tab back into a single scroll
            fought the navigation rather than complementing it. Andrew: "I'm
            wondering if we need that at all anymore... I don't like the way
            that that currently looks." */}
        <div key={activePanel} className="animate-fade mt-10">
            {activePanel === "overview" && (
              <OverviewPanel
                detail={detail}
                doorways={doorways}
                onGo={goPanel}
                nextDate={nextDateItem}
                currentModule={currentModule}
              />
            )}

            {/* TeamSection renders the church roster itself now, so there is
                no second ChurchTeamInfo here — that pairing was what put
                "Church team 0" directly above a list of eight people. */}
            {activePanel === "team" && (
              <TeamSection
                id="team"
                detail={detail}
                imageUrls={imageUrls}
                canManage={canManage}
                canEdit={canEdit}
                teamGroups={teamGroups}
                accessToken={accessToken}
                projectId={projectId}
                onChanged={refresh}
              />
            )}

            {activePanel === "dates" && dateGroups.length > 0 && (
              <section id="dates">
                <SectionHeading eyebrow="The calendar" title="Key dates" />
                <div className="mt-8">
                  <PrepCards
                    groups={dateGroups}
                    items={detail.prepItems}
                    projectId={projectId}
                    canEdit={canEdit}
                    accessToken={accessToken}
                    fileUrls={imageUrls}
                    onChanged={refresh}
                  />
                </div>
              </section>
            )}

            {activePanel === "prepare" && (
              <PrepareSection
                id="prepare"
                prep={prepResources}
                overview={overviewResources}
                thumbs={thumbs}
                prepGroups={prepareGroups}
                prepItems={detail.prepItems}
                projectId={projectId}
                canEdit={canEdit}
                accessToken={accessToken}
                fileUrls={imageUrls}
                onChanged={refresh}
                handouts={handouts}
                onOpenHandout={openHandout}
              />
            )}

            {activePanel === "process" && modules.length > 0 && (
              <section id="process">
                <SectionHeading eyebrow="The process" title="Pivvot Vision Framing Process" />
                <div className="mt-10">
                  <ModuleNav modules={modules} active={activeModule} onSelect={setActiveModule} />
                </div>
                <ModulePanel
                  key={activeModule}
                  section={activeModule}
                  detail={detail}
                  imageUrls={imageUrls}
                  canEdit={canEdit}
                  accessToken={accessToken}
                  onChanged={refresh}
                  handouts={handouts}
                  onOpenHandout={openHandout}
                  thumbs={thumbs}
                />

                {/* Andrew: "the additional handouts should be part of the
                    process, not part of the preparation section." The Field
                    Guide joins them here — "I want 'the process' to look and
                    feel more like the original for sure, with icons,
                    handouts, field guide, and videos." */}
                <ExtraHandouts
                  extras={(handouts?.extras ?? []).filter((g) => !PREP_HANDOUT.test(g.name))}
                  onOpen={openHandout}
                />

                {orphanSections.length > 0 && (
                  <div className="mt-16">
                    <SectionHeading eyebrow="Also in this engagement" title="Further materials" />
                    <div className="mt-8 space-y-6">
                      {orphanSections.map((section) => (
                        <ModulePanel
                          key={section}
                          section={section}
                          detail={detail}
                          imageUrls={imageUrls}
                          canEdit={canEdit}
                          accessToken={accessToken}
                          onChanged={refresh}
                          handouts={handouts}
                          onOpenHandout={openHandout}
                          thumbs={thumbs}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {activePanel === "sessions" && (
              <SessionsSection
                id="sessions"
                sessions={detail.sessions}
                detail={detail}
                imageUrls={imageUrls}
                thumbs={thumbs}
                moduleOptions={availableSections(detail)}
                canEdit={canEdit}
                accessToken={accessToken}
                projectId={projectId}
                onChanged={refresh}
              />
            )}

            {activePanel === "deliverables" && hasDeliverables && (
              <section id="deliverables">
                <SectionHeading eyebrow="What we build" title="Deliverables" />
                {detail.template?.hasVisionStack && (
                  <VisionStackCard
                    projectId={projectId}
                    ready={stackReady}
                    layers={detail.stackLayers}
                  />
                )}
                {deliverableGroups.length > 0 && (
                  <div className="mt-6">
                    <PrepCards
                      groups={deliverableGroups}
                      items={detail.prepItems}
                      projectId={projectId}
                      canEdit={canEdit}
                      accessToken={accessToken}
                      fileUrls={imageUrls}
                      onChanged={refresh}
                    />
                  </div>
                )}
              </section>
            )}

            {/* Archive and delete follow the roster rather than getting a
                tab of their own: they are the rarest thing an admin does,
                and Team is where the project's people already live. Access
                itself moved to the dialog in the header. */}
            {activePanel === "team" && canManage && (
              <ProjectSettings
                detail={detail}
                projectId={projectId}
                accessToken={accessToken}
                onChanged={refresh}
              />
          )}
        </div>
      </main>

      <BackToTop />

      <PortalFooter />
    </div>
  );
}

/**
 * The church roster, near the top and collapsed by default.
 *
 * This is DATA, not access. Andrew: "any time we have a team member on a
 * project, it sends them a welcome email... I think we want a place where it
 * says Church Team Info" separate from "a section where we add people to this
 * project [which] immediately sends them access."
 *
 * So nothing here touches project_members and nothing here can send mail.
 * Granting access is the separate control in the team section at the bottom,
 * which is the only path that creates an account.
 */
function ChurchTeamInfo({
  id,
  contacts,
  projectId,
  canEdit,
  accessToken,
  onChanged,
}: {
  id: string;
  contacts: ChurchContact[];
  projectId: string;
  canEdit: boolean;
  accessToken: string | null;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !name.trim()) return;
    setBusy(true);
    try {
      await createContact(
        accessToken,
        projectId,
        { full_name: name.trim(), email: email.trim() || null, title: title.trim() || null },
        contacts
      );
      setName(""); setEmail(""); setTitle(""); setAdding(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: ChurchContact) {
    if (!accessToken || !confirm(`Remove ${c.full_name} from the roster?`)) return;
    await deleteContact(accessToken, c.id);
    onChanged();
  }

  function downloadCsv() {
    const blob = new Blob([contactsToCsv(contacts)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "church-team.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (contacts.length === 0 && !canEdit) return null;

  const field =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta";

  return (
    <section id={id} className="mt-8 scroll-mt-20">
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200/80">
        {/* Not collapsible. Andrew: "I don't think that needs to be
            collapsible. Let's just go ahead and... when they click on the
            team tab, it just shows everybody in the team." Behind a fold it
            was one more click on a tab that exists to show these people. */}
        <div className="flex w-full items-center gap-3.5 border-b border-gray-100 px-5 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-runfree-indigo text-runfree-navy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-[18px] w-[18px]" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 19v-1.5a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3V19" />
              <circle cx="10" cy="8" r="3" />
              <path d="M20 19v-1.5a3 3 0 0 0-2.25-2.9M15.5 5.2a3 3 0 0 1 0 5.6" />
            </svg>
          </span>

          <span className="min-w-0 flex-1">
            <span className="block font-display text-base font-bold text-runfree-ink">
              Church Team
            </span>
            <span className="block text-xs text-gray-500">
              Names and titles. Portal access is granted separately.
            </span>
          </span>


          {contacts.length > 0 && (
            <button
              onClick={downloadCsv}
              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200 transition hover:text-runfree-ink hover:ring-runfree-magenta/40"
            >
              Export CSV
            </button>
          )}
          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-gray-600">
            {contacts.length}
          </span>
        </div>

        <div className="px-5 py-4">
            {/* "#team" used to jump down the long page. There is no such
                anchor now — access moved into the header, next to the logo. */}
            <p className="mb-3 text-xs text-gray-500">
              Names and contact details only. Nobody here has portal access until they are added
              through <strong className="font-semibold text-gray-600">Manage access</strong> at the
              top of this project.
            </p>

            {contacts.length === 0 && (
              <p className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-xs text-gray-400">
                No one on the roster yet.
              </p>
            )}

            {contacts.length > 0 && (
              <ul className="divide-y divide-gray-100">
                {contacts.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                    <span className="text-sm font-semibold text-runfree-ink">{c.full_name}</span>
                    {c.title && (
                      <span className="rounded-full bg-runfree-pink px-2 py-0.5 text-[11px] font-medium text-runfree-magentaDeep">
                        {c.title}
                      </span>
                    )}
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="text-xs text-gray-500 hover:text-runfree-magentaDeep hover:underline"
                      >
                        {c.email}
                      </a>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => remove(c)}
                        className="ml-auto rounded-md px-2 py-1 text-[11px] font-medium text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canEdit && (
              <div className="mt-3">
                {adding ? (
                  <form onSubmit={add} className="space-y-2 rounded-xl bg-gray-50/80 p-3">
                    <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={field} />
                    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Lead Pastor)" className={field} />
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" className={field} />
                    <div className="flex gap-2">
                      <button type="submit" disabled={busy || !name.trim()} className="rounded-lg bg-runfree-grad-deep px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
                        {busy ? "Saving…" : "Add to roster"}
                      </button>
                      <button type="button" onClick={() => setAdding(false)} className="rounded-lg px-3 py-2 text-xs font-medium text-gray-500 hover:text-runfree-ink">
                        Cancel
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-400">This does not send an email or create a login.</p>
                  </form>
                ) : (
                  <button
                    onClick={() => setAdding(true)}
                    className="w-full rounded-xl border border-dashed border-gray-300 py-2.5 text-xs font-semibold text-gray-500 transition hover:border-runfree-magenta/50 hover:text-runfree-magentaDeep"
                  >
                    + Add someone to the roster
                  </button>
                )}
              </div>
            )}
          </div>
      </div>
    </section>
  );
}

/**
 * A dialog that keeps you where you were.
 *
 * Andrew, on access: "that would be a good spot for information on access,
 * making it nice and small, when you click on it, it opens up into a little
 * light box or small thing that doesn't take you away from the page."
 *
 * Escape closes it, the backdrop closes it, and focus moves into the panel
 * on open so a keyboard user is not left behind on the button. Body scroll
 * is locked while it is up — a dialog that scrolls the page underneath it
 * reads as broken on a phone.
 */
function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-runfree-ink/50 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="animate-rise my-auto w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl outline-none"
      >
        <div className="h-1 bg-runfree-grad" />
        <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-extrabold tracking-tight text-runfree-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-gray-400 outline-none transition hover:bg-gray-100 hover:text-runfree-ink focus-visible:ring-2 focus-visible:ring-runfree-magenta"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/** Archive or delete, admins only, at the bottom where it belongs. */
function ProjectSettings({
  detail,
  projectId,
  accessToken,
  onChanged,
}: {
  detail: ProjectDetail;
  projectId: string;
  accessToken: string | null;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const archived = !!detail.archivedAt;

  async function toggleArchive() {
    if (!accessToken) return;
    setBusy(true);
    try {
      await setProjectArchived(accessToken, projectId, !archived);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    if (!accessToken) return;
    const typed = prompt(
      `This permanently deletes "${detail.name}" and everything in it — sessions, deliverables, uploaded charts and PDFs, the roster. This cannot be undone.\n\nType the project name to confirm:`
    );
    if (typed !== detail.name) return;
    setBusy(true);
    try {
      await deleteProject(accessToken, projectId);
      router.push("/");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-20">
      <div className="rounded-2xl border border-dashed border-gray-300 p-5">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
          Project settings
        </h4>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={toggleArchive}
            disabled={busy}
            className="rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-runfree-ink ring-1 ring-gray-300 transition hover:ring-runfree-magenta/50 disabled:opacity-50 max-sm:min-h-[40px]"
          >
            {archived ? "Restore this project" : "Archive this project"}
          </button>
          <span className="text-xs text-gray-500">
            {archived
              ? "Archived — hidden from the project list, nothing deleted."
              : "Hides it from the project list. Nothing is deleted."}
          </span>
          <button
            onClick={destroy}
            disabled={busy}
            className="ml-auto rounded-lg px-3.5 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 max-sm:min-h-[40px]"
          >
            Delete permanently
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * One bar carrying both controls, sticky under the hero.
 *
 * These were two separate rows — a floating Dynamic/Condensed pill above a
 * line of bare text links — with dead space between them and neither looking
 * like it belonged to the page. Andrew: "at the top, under the church name
 * and info, I want a kind of header that I can click and it takes me to the
 * elements I'm searching for."
 *
 * The links track which section you are actually looking at, so the bar
 * doubles as a position indicator rather than only a set of jumps.
 */
/**
 * The panel switcher.
 *
 * This used to be jump-links plus a scroll-spy down one very long page.
 * Andrew: "instead of having a single long page, making the whole project
 * more of a process overview that changes with every click, rather than
 * scrolling with every click... it should be VERY easy for someone to
 * navigate even if they have no idea what is all included in the project."
 *
 * So each item now swaps the panel rather than scrolling to it, and the
 * selected panel lives in the URL — a coach can send a link that opens on
 * Preparation instead of "scroll down to about halfway". The counts are the
 * part that does the teaching: someone who has never heard of a Vision Stack
 * still understands "6 dates" and "5 things to read".
 */
function ProjectToolbar({
  items,
  active,
  onSelect,
}: {
  items: { key: string; label: string; count?: number | null }[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="sticky top-0 z-30 -mx-4 mt-6 border-b border-gray-200/70 bg-gray-50/90 backdrop-blur-md sm:-mx-6 lg:-mx-8">
      <div className="mx-auto max-w-6xl px-4 py-2.5 sm:px-6 lg:px-8">
        {items.length > 0 && (
          <nav aria-label="Project sections">
            {/* Bigger, and the selected tab wears the brand gradient rather
                than a pale tint. Andrew: "the tabs themselves could be a
                little bit more prominent and colorful." These are the primary
                navigation of the whole page now, so they are sized like it. */}
            <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {items.map((it) => {
                const on = active === it.key;
                return (
                  <li key={it.key}>
                    <button
                      onClick={() => onSelect(it.key)}
                      aria-current={on ? "true" : undefined}
                      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition duration-200 outline-none focus-visible:ring-2 focus-visible:ring-runfree-magenta focus-visible:ring-offset-1 max-sm:min-h-[42px] ${
                        on
                          ? "bg-runfree-grad text-white shadow-sm"
                          : "text-gray-600 hover:bg-white hover:text-runfree-ink hover:shadow-sm"
                      }`}
                    >
                      {it.label}
                      {it.count != null && it.count > 0 && (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                            on ? "bg-white/25 text-white" : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {it.count}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

      </div>
    </div>
  );
}

/** The numbered sheets, folded behind one row. */
function SheetDropdown({
  label,
  sheets,
  onOpen,
}: {
  label: string;
  sheets: HandoutFile[];
  onOpen: (fileId: string, title: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 overflow-hidden rounded-2xl ring-1 ring-gray-200">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 bg-white px-4 py-3 text-left outline-none transition hover:bg-runfree-indigo/30 focus-visible:bg-runfree-indigo/30"
      >
        <span className="text-gray-400">
          <Chevron open={open} />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-runfree-ink">
          {label}
        </span>
        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-gray-600">
          {sheets.length}
        </span>
      </button>
      {open && (
        <div className="border-t border-gray-100 bg-white px-4 pb-4">
          <SheetWalkthrough sheets={sheets} onOpen={onOpen} />
        </div>
      )}
    </div>
  );
}

/**
 * Homework, wherever you are standing.
 *
 * The same rows render in three places — the banner at the top of the
 * project, the module they belong to, and the session that produced them —
 * because Andrew wanted a coach to upload once and a team to find the work
 * without hunting: "anytime a coach adds something there, it should
 * auto-populate to the top of the page as a task to complete. Once they
 * complete that task, it should fill both in a module and turn green."
 *
 * Ticking is deliberately available to VIEWERS. The church does the homework;
 * they are not editors. That write goes through set_task_done (migration 030)
 * rather than a policy, because RLS cannot restrict an UPDATE to one column.
 */
function TaskList({
  tasks,
  accessToken,
  onChanged,
  canEdit,
  emptyLabel,
  showSection = false,
}: {
  tasks: ProjectTask[];
  accessToken: string | null;
  onChanged: () => void;
  canEdit: boolean;
  emptyLabel?: string;
  showSection?: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (tasks.length === 0) {
    return emptyLabel ? (
      <p className="rounded-xl border border-dashed border-gray-200 py-5 text-center text-xs text-gray-400">
        {emptyLabel}
      </p>
    ) : null;
  }

  async function toggle(t: ProjectTask) {
    if (!accessToken || busyId) return;
    setBusyId(t.id);
    try {
      await setTaskDone(accessToken, t.id, !t.is_done);
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ul className="space-y-1.5">
      {tasks.map((t) => (
        <li
          key={t.id}
          className={`group/task flex flex-wrap items-start gap-x-3 gap-y-1 rounded-xl px-3 py-2.5 transition ${
            t.is_done ? "bg-emerald-50/60" : "bg-white ring-1 ring-gray-200/80"
          }`}
        >
          <button
            onClick={() => toggle(t)}
            disabled={!accessToken || busyId === t.id}
            aria-label={t.is_done ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`}
            className={`relative mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition before:absolute before:-inset-2 before:content-[''] ${
              t.is_done
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-gray-300 bg-white hover:border-runfree-magenta"
            }`}
          >
            {t.is_done && (
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </button>

          <span className="min-w-0 flex-1">
            <span
              className={`block text-sm font-medium ${
                t.is_done ? "text-gray-400 line-through" : "text-runfree-ink"
              }`}
            >
              {t.title}
            </span>
            {t.notes && (
              <span className="mt-0.5 block whitespace-pre-line text-xs leading-relaxed text-gray-500">
                {t.notes}
              </span>
            )}
            <span className="mt-1 flex flex-wrap items-center gap-2">
              {showSection && t.section && (
                <span className="rounded-full bg-runfree-indigo px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-runfree-navy">
                  {moduleLabel(t.section)}
                </span>
              )}
              {t.due_on && (
                <span className="text-[11px] font-medium text-gray-400">
                  Due {formatSessionDate(t.due_on)}
                </span>
              )}
            </span>
          </span>

          {canEdit && (
            <button
              onClick={async () => {
                if (!accessToken) return;
                if (!confirm(`Remove "${t.title}"?`)) return;
                await deleteTask(accessToken, t.id);
                onChanged();
              }}
              className="min-h-[36px] shrink-0 rounded-md px-2 text-[11px] font-medium text-gray-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover/task:opacity-100 focus:opacity-100 max-sm:opacity-100"
            >
              Remove
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The one place a coach types homework. Used by the banner and by a session. */
function AddTask({
  projectId,
  accessToken,
  siblings,
  section,
  sessionId,
  moduleOptions,
  onChanged,
}: {
  projectId: string;
  accessToken: string | null;
  siblings: ProjectTask[];
  section?: string | null;
  sessionId?: string | null;
  moduleOptions?: string[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState("");
  const [pickedSection, setPickedSection] = useState(section ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !title.trim()) return;
    setBusy(true);
    try {
      await createTask(
        accessToken,
        projectId,
        {
          title: title.trim(),
          notes: notes.trim() || null,
          due_on: due || null,
          section: pickedSection || null,
          session_id: sessionId ?? null,
        },
        siblings
      );
      setTitle("");
      setNotes("");
      setDue("");
      setOpen(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="min-h-[44px] w-full rounded-xl border border-dashed border-gray-300 text-xs font-semibold text-gray-500 transition hover:border-runfree-magenta/50 hover:text-runfree-magentaDeep"
      >
        + Add homework or a next step
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl bg-gray-50/80 p-3">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What should the team do?"
        className={field}
      />
      <textarea
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Detail (optional)"
        className={field}
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="Due date"
          className={field}
        />
        {moduleOptions && moduleOptions.length > 0 && (
          <select
            value={pickedSection}
            onChange={(e) => setPickedSection(e.target.value)}
            aria-label="Module"
            className={field}
          >
            <option value="">No module — top of the project only</option>
            {moduleOptions.map((m) => (
              <option key={m} value={m}>
                {moduleLabel(m)}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="min-h-[44px] rounded-lg bg-runfree-grad-deep px-4 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-[44px] rounded-lg px-3 text-xs font-medium text-gray-500 hover:text-runfree-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * Who can actually sign in, and at what level — at the top, where Andrew
 * asked for it: "an additional element at the very top of the page that has,
 * separate from the church team info, a section where we add people to this
 * project. It immediately sends them access to the portal based on the
 * permissions that we set for them."
 *
 * This is the ONLY control in the app that can send someone an email. The
 * roster card below it is just names.
 */
function ProjectAccess({
  id,
  detail,
  projectId,
  accessToken,
  onChanged,
  embedded = false,
}: {
  id: string;
  detail: ProjectDetail;
  projectId: string;
  accessToken: string | null;
  onChanged: () => void;
  /** Inside the header's Manage access dialog: no card, no fold, no heading. */
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(embedded);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [orgRole, setOrgRole] = useState("");
  const [role, setRole] = useState<ProjectRole>("viewer");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const members = [...detail.members].sort((a, b) =>
    a.isLead === b.isLead
      ? (a.fullName || a.email).localeCompare(b.fullName || b.email)
      : a.isLead
        ? -1
        : 1
  );

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !email.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ email: email.trim(), role, orgRole: orgRole.trim() || null }),
      });
      const body = await res.json();
      if (!res.ok) setMessage(body.error || "Couldn't add that person");
      else {
        setMessage(
          body.invited ? `Invited ${email} — they have been emailed.` : `${email} now has access.`
        );
        setEmail("");
        setOrgRole("");
        setAdding(false);
        onChanged();
      }
    } catch {
      setMessage("Couldn't reach the server — try again");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta";

  return (
    <section id={id} className={embedded ? "" : "mt-8 scroll-mt-24"}>
      <div
        className={
          embedded ? "" : "overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200/80"
        }
      >
        {!embedded && (
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-3 px-4 py-4 text-left outline-none transition hover:bg-runfree-indigo/30 focus-visible:bg-runfree-indigo/30 sm:gap-3.5 sm:px-5"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-runfree-pink text-runfree-magentaDeep">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <rect x="4" y="10" width="16" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 1 1 8 0v3" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-runfree-ink">Project access</span>
            <span className="block truncate text-xs text-gray-500">
              Who can sign in, and what they can do
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-gray-600">
            {members.length}
          </span>
          <span className="text-gray-400">
            <Chevron open={open} />
          </span>
        </button>
        )}

        {open && (
          <div className={embedded ? "" : "border-t border-gray-100 px-4 py-4 sm:px-5"}>
            <ul className="divide-y divide-gray-100">
              {members.map((m) => (
                <li key={m.profileId} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <span className="block truncate text-sm font-medium text-runfree-ink">
                      {m.fullName || m.email}
                      {m.isLead && (
                        <span className="ml-2 rounded-full bg-runfree-pink px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-runfree-magentaDeep">
                          Lead
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-gray-500">{m.email}</span>
                  </span>
                  <select
                    value={m.role}
                    aria-label={`Permission for ${m.fullName || m.email}`}
                    onChange={async (e) => {
                      if (!accessToken) return;
                      await updateMemberRole(
                        accessToken,
                        projectId,
                        m.profileId,
                        e.target.value as ProjectRole
                      );
                      onChanged();
                    }}
                    className="min-h-[40px] flex-1 rounded-lg border border-gray-300 px-2.5 text-xs font-medium text-runfree-ink outline-none focus:border-runfree-magenta sm:flex-none"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    onClick={async () => {
                      if (!accessToken) return;
                      if (!confirm(`Remove access for ${m.fullName || m.email}? They stay on the roster.`))
                        return;
                      await removeMember(accessToken, projectId, m.profileId);
                      onChanged();
                    }}
                    className="min-h-[40px] shrink-0 rounded-md px-2.5 text-[11px] font-medium text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-3">
              {adding ? (
                <form onSubmit={add} className="space-y-2 rounded-xl bg-gray-50/80 p-3">
                  <input
                    autoFocus
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email address"
                    className={field}
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      value={orgRole}
                      onChange={(e) => setOrgRole(e.target.value)}
                      placeholder="Title (e.g. Lead Pastor)"
                      className={field}
                    />
                    <select
                      value={role}
                      aria-label="Permission level"
                      onChange={(e) => setRole(e.target.value as ProjectRole)}
                      className={field}
                    >
                      <option value="viewer">Viewer — read only</option>
                      <option value="editor">Editor — can add content</option>
                      <option value="admin">Admin — can manage people</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={busy || !email.trim()}
                      className="min-h-[44px] rounded-lg bg-runfree-grad-deep px-4 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      {busy ? "Sending…" : "Grant access & invite"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdding(false)}
                      className="min-h-[44px] rounded-lg px-3 text-xs font-medium text-gray-500 hover:text-runfree-ink"
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    This sends them a welcome email with a link to sign in.
                  </p>
                </form>
              ) : (
                <button
                  onClick={() => setAdding(true)}
                  className="min-h-[44px] w-full rounded-xl border border-dashed border-gray-300 text-xs font-semibold text-gray-500 transition hover:border-runfree-magenta/50 hover:text-runfree-magentaDeep"
                >
                  + Give someone access
                </button>
              )}
              {message && (
                <p className="mt-2 text-xs font-medium text-runfree-magentaDeep">{message}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Appears once you are far enough down to want it. */

function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 700);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      className={`fixed bottom-6 right-6 z-40 grid h-11 w-11 place-items-center rounded-full bg-runfree-grad-deep text-white shadow-lg transition-all duration-200 hover:opacity-90 ${
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M10 15.5V5M5 9.5 10 4.5l5 5" />
      </svg>
    </button>
  );
}

/** A real chevron, not a text triangle. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
    >
      <path d="M7.5 4.5 13 10l-5.5 5.5" />
    </svg>
  );
}


/* -------------------------------------------------------------------------- */
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The church's own name and mark, first thing, at full size. A client should
 * open this and see themselves — not a RunFree product with their project
 * filed inside it.
 */
function ChurchHero({
  detail,
  logoUrl,
  canManage,
  accessToken,
  onChanged,
}: {
  detail: ProjectDetail;
  logoUrl?: string;
  canManage: boolean;
  accessToken: string | null;
  onChanged: () => void;
}) {
  const logoInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showAccess, setShowAccess] = useState(false);
  const [form, setForm] = useState({
    location: detail.location ?? "",
    website_url: detail.websiteUrl ?? "",
    about: detail.about ?? "",
  });

  async function uploadLogo(file: File | undefined) {
    if (!file || !accessToken) return;
    if (!file.type.startsWith("image/")) return;
    setBusy(true);
    try {
      const { path } = await uploadProjectLogo(accessToken, detail.id, file);
      await updateProject(accessToken, detail.id, { logo_path: path });
      onChanged();
    } catch (err) {
      console.error("Logo upload failed:", err);
    } finally {
      setBusy(false);
    }
  }

  async function saveDetails() {
    if (!accessToken) return;
    setBusy(true);
    try {
      await updateProject(accessToken, detail.id, {
        location: form.location || null,
        website_url: form.website_url || null,
        about: form.about || null,
      });
      onChanged();
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  const lead = detail.members.find((m) => m.isLead);
  const initials = detail.name
    .replace(/\s*-\s*.*$/, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  // "Athena Christian Church - Pivvot Vision Framing" → the church, and the work.
  const [org, engagement] = splitProjectName(detail.name, detail.template?.name ?? null);

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          {/* Works for any engagement: a church's logo, or the person's
              photo on a Younique or coaching project. */}
          <div
            onClick={() => canManage && logoInput.current?.click()}
            onDragOver={(e) => canManage && e.preventDefault()}
            onDrop={(e) => {
              if (!canManage) return;
              e.preventDefault();
              uploadLogo(e.dataTransfer.files?.[0]);
            }}
            title={canManage ? "Upload a logo or photo" : undefined}
            className={`group relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gray-50 ring-1 ring-gray-200 ${
              canManage ? "cursor-pointer hover:ring-runfree-magenta/40" : ""
            }`}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={org} className="h-full w-full object-contain p-2" />
            ) : (
              <span className="font-display text-2xl font-extrabold tracking-tight text-runfree-navy/40">
                {initials}
              </span>
            )}
            {canManage && (
              <>
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/85 text-[10px] font-bold uppercase tracking-wide text-runfree-magentaDeep opacity-0 transition group-hover:opacity-100">
                  {busy ? "Uploading…" : logoUrl ? "Replace" : "Add logo"}
                </span>
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => uploadLogo(e.target.files?.[0])}
                />
              </>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-runfree-magentaDeep">
              Welcome
            </p>
            <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-runfree-ink sm:text-4xl lg:text-[2.75rem]">
              {org}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
              <span className="font-medium text-runfree-navy">{engagement}</span>
              {lead && (
                <>
                  <span aria-hidden className="text-gray-300">
                    ·
                  </span>
                  <span>led by {lead.fullName || lead.email}</span>
                </>
              )}
              {detail.location && (
                <>
                  <span aria-hidden className="text-gray-300">
                    ·
                  </span>
                  <span>{detail.location}</span>
                </>
              )}
              {safeExternalUrl(detail.websiteUrl) && (
                <>
                  <span aria-hidden className="text-gray-300">
                    ·
                  </span>
                  <a
                    href={safeExternalUrl(detail.websiteUrl)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-runfree-magentaDeep hover:underline"
                  >
                    {prettyDomain(detail.websiteUrl!)}
                  </a>
                </>
              )}
            </p>
            {detail.about && !editing && (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-600">{detail.about}</p>
            )}

            {/* Access lives up here with the logo, the website and the lead
                navigator, because who can get in is a top-level fact about
                the project rather than a section of it. It opens a dialog so
                a coach checking who has access does not lose the panel they
                were reading. */}
            {canManage && !editing && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs font-medium text-runfree-magentaDeep outline-none hover:underline focus-visible:ring-2 focus-visible:ring-runfree-magenta"
                >
                  Edit details
                </button>
                <button
                  onClick={() => setShowAccess(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-runfree-ink shadow-sm ring-1 ring-gray-200 outline-none transition hover:ring-runfree-magenta/40 focus-visible:ring-2 focus-visible:ring-runfree-magenta"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-runfree-magentaDeep">
                    <rect x="4" y="10" width="16" height="10" rx="2" />
                    <path d="M8 10V7a4 4 0 1 1 8 0v3" />
                  </svg>
                  Manage access
                  <span className="rounded-full bg-gray-100 px-1.5 text-[10px] font-bold tabular-nums text-gray-600">
                    {detail.members.length}
                  </span>
                </button>
              </div>
            )}

            {showAccess && (
              <Modal
                title="Project access"
                subtitle="Who can sign in, and what they can do once they are here."
                onClose={() => setShowAccess(false)}
              >
                <ProjectAccess
                  id="access"
                  embedded
                  detail={detail}
                  projectId={detail.id}
                  accessToken={accessToken}
                  onChanged={onChanged}
                />
              </Modal>
            )}

            {canManage && editing && (
              <div className="mt-4 max-w-xl space-y-3 rounded-xl bg-gray-50 p-4 ring-1 ring-gray-200">
                <div className="flex flex-wrap gap-3">
                  <div className="flex-1 min-w-[150px]">
                    <Field label="Location">
                      <input
                        value={form.location}
                        onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                        placeholder="Athens, GA"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
                      />
                    </Field>
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <Field label="Website">
                      <input
                        value={form.website_url}
                        onChange={(e) => setForm((f) => ({ ...f, website_url: e.target.value }))}
                        placeholder="athenachristian.org"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
                      />
                    </Field>
                  </div>
                </div>
                <Field label="About">
                  <textarea
                    rows={2}
                    value={form.about}
                    onChange={(e) => setForm((f) => ({ ...f, about: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
                  />
                </Field>
                <div className="flex gap-2">
                  <button
                    onClick={saveDetails}
                    disabled={busy}
                    className="rounded-lg bg-runfree-grad-deep px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:text-runfree-ink"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function splitProjectName(name: string, templateName: string | null): [string, string] {
  const idx = name.indexOf(" - ");
  if (idx > 0) return [name.slice(0, idx), name.slice(idx + 3)];
  return [name, templateName ?? "Engagement"];
}

function prettyDomain(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/* -------------------------------------------------------------------------- */
/* Priorities                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * "What am I supposed to be doing right now with my team?"
 *
 * The first question a church team member actually arrives with, and until now
 * the page answered every other question first. Everything else here tells you
 * where the material is, which only helps once you already know what you are
 * meant to be doing with it.
 *
 * Above the Vision Stack on purpose. The finished work is what a church shows
 * a board; this is what they need on a Tuesday.
 */
function PrioritiesBanner({
  detail,
  canEdit,
  accessToken,
  projectId,
  moduleOptions,
  onChanged,
}: {
  projectId: string;
  moduleOptions: string[];
  detail: ProjectDetail;
  canEdit: boolean;
  accessToken: string | null;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(detail.priorities ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!accessToken) return;
    setBusy(true);
    try {
      await updatePriorities(accessToken, detail.id, draft);
      onChanged();
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  // Nothing set and nobody who could set it: show nothing rather than an
  // empty promise.
  const open = detail.tasks.filter((t) => !t.is_done);
  const done = detail.tasks.filter((t) => t.is_done);
  if (!detail.priorities && detail.tasks.length === 0 && !canEdit) return null;

  const updated = detail.prioritiesUpdatedAt
    ? new Date(detail.prioritiesUpdatedAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
      })
    : null;

  return (
    <section className="mt-8 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-runfree-magenta/25">
      <div className="h-1.5 bg-runfree-grad" />
      <div className="p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-runfree-magentaDeep">
              Coming up
            </p>
            <h2 className="mt-1.5 font-display text-2xl font-extrabold tracking-tight text-runfree-ink">
              What&rsquo;s Important Now
            </h2>
          </div>
          {canEdit && !editing && (
            <button
              onClick={() => {
                setDraft(detail.priorities ?? "");
                setEditing(true);
              }}
              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-runfree-magentaDeep ring-1 ring-runfree-magenta/30 transition hover:bg-runfree-pink"
            >
              {detail.priorities ? "Update" : "Set priorities"}
            </button>
          )}
        </div>

        {editing ? (
          <div className="mt-4 space-y-3">
            <textarea
              autoFocus
              rows={5}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={"What should this team do before you meet again?\n\nOne per line reads best:\nFinish the Kingdom Concept draft\nEveryone completes the 5 Eras assessment"}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm leading-relaxed outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
            />
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={busy}
                className="rounded-lg bg-runfree-grad-deep px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:text-runfree-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : detail.priorities ? (
          <>
            {/* Rendered as a checklist when written one-per-line, which is
                how a list of commitments is naturally written. */}
            <ul className="mt-4 space-y-2.5">
              {detail.priorities
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean)
                .map((line, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-runfree-magenta"
                    />
                    <span className="text-[15px] leading-relaxed text-runfree-ink">{line}</span>
                  </li>
                ))}
            </ul>
            {updated && (
              <p className="mt-4 text-xs text-gray-400">Updated {updated}</p>
            )}
          </>
        ) : detail.tasks.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-gray-300 py-8 text-center text-sm text-gray-400">
            Nothing set yet. This is the first thing your team sees — use it to
            say what matters this month.
          </p>
        ) : null}

        {/* Homework, gathered from every session and module. Andrew: "have
            that populate at the very top of their project." */}
        {(detail.tasks.length > 0 || canEdit) && (
          <div className="mt-5 space-y-2.5">
            {open.length > 0 && (
              <TaskList
                tasks={open}
                accessToken={accessToken}
                onChanged={onChanged}
                canEdit={canEdit}
                showSection
              />
            )}

            {done.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer list-none text-xs font-semibold text-gray-400 hover:text-runfree-ink">
                  {done.length} finished
                </summary>
                <div className="mt-2">
                  <TaskList
                    tasks={done}
                    accessToken={accessToken}
                    onChanged={onChanged}
                    canEdit={canEdit}
                    showSection
                  />
                </div>
              </details>
            )}

            {canEdit && (
              <AddTask
                projectId={projectId}
                accessToken={accessToken}
                siblings={detail.tasks}
                moduleOptions={moduleOptions}
                onChanged={onChanged}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Vision Stack                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The finished work, at the top of the page rather than the bottom. For an
 * engagement of this size the deliverables are the thing they paid for and
 * the thing they'll pull up in front of a board — burying them under process
 * material gets the priority exactly backwards.
 */
function VisionStackCard({
  projectId,
  ready,
  layers,
}: {
  projectId: string;
  /** How many pieces are published. There is deliberately no total — see below. */
  ready: number;
  layers: ProjectDetail["stackLayers"];
}) {
  return (
    <a
      href={`/projects/${projectId}/vision-stack`}
      className="group relative mt-10 block overflow-hidden rounded-3xl bg-runfree-navy shadow-lg ring-1 ring-runfree-navy/20 transition duration-300 hover:-translate-y-0.5 hover:shadow-xl"
    >
      <div className="h-1.5 bg-runfree-grad" />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-10 h-64 w-64 rounded-full bg-runfree-magenta/20 blur-3xl transition-opacity duration-500 group-hover:opacity-80"
      />
      <div className="relative flex flex-col gap-8 p-8 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-runfree-pink">
            Your Vision Stack
          </p>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Everything your team has built
          </h2>
          {/* No "{ready} of {total}". Andrew: "sometimes coaches don't finish
              all 23 based on what they're delivering. sometimes we do
              portions of the process, rather than the whole thing." A
              denominator turns an engagement that was scoped to four
              deliverables into one that reads as 19 short. What has been
              finished is worth saying; what is missing is not. */}
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/70">
            {layers.length} layers, from the convictions underneath it all to the tools that put it
            to work.
            {ready > 0 && (
              <>
                {" "}
                <span className="font-semibold text-white">
                  {ready} {ready === 1 ? "piece" : "pieces"}
                </span>{" "}
                finished so far.
              </>
            )}
          </p>
          <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-white">
            Open your Vision Stack
            <span
              aria-hidden
              className="transition-transform duration-300 group-hover:translate-x-1"
            >
              →
            </span>
          </span>
        </div>

        {/* The four layers, echoing the printed stack graphic: exploded plates,
            foundation at the bottom, toolbox on top. */}
        {/* Equal width and right-aligned: the staggered indent made four
            different-length labels look like four different-size boxes. The
            stack now steps cleanly, which is what the printed graphic does. */}
        {/* Each layer wears the icon of the process tool that produces it
            (migration 021), so the stack reads in the same visual language as
            the module track rather than as four unlabelled boxes. The
            Application Toolbox has no icon of its own yet and falls back to
            its layer number. */}
        <ul className="flex w-full shrink-0 flex-col-reverse gap-1.5 sm:w-72">
          {layers.map((layer, i) => (
            <li
              key={layer.slug}
              className="flex items-center gap-3 rounded-lg bg-white/10 px-3 py-2.5 text-left text-xs font-semibold text-white/80 ring-1 ring-white/10 transition duration-300 group-hover:bg-white/15"
              style={{ transitionDelay: `${i * 40}ms` }}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/10">
                {layer.icon_path ? (
                  <Image
                    src={layer.icon_path}
                    alt=""
                    width={28}
                    height={28}
                    className="h-7 w-7 object-contain"
                  />
                ) : (
                  <span className="text-[11px] font-bold tabular-nums text-white/70">{i + 1}</span>
                )}
              </span>
              <span className="min-w-0 flex-1">{layer.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </a>
  );
}

/* -------------------------------------------------------------------------- */
/* Quick tiles                                                                 */
/* -------------------------------------------------------------------------- */

function QuickTiles({
  prepCount,
  sessionCount,
  teamCount,
}: {
  prepCount: number;
  sessionCount: number;
  teamCount: number;
}) {
  const tiles = [
    { href: "#prepare", label: "Prepare", detail: `${prepCount} to do and review` },
    { href: "#sessions", label: "Session recordings", detail: sessionCount === 1 ? "1 recorded" : `${sessionCount} recorded` },
    { href: "#team", label: "Your team", detail: `${teamCount} ${teamCount === 1 ? "person" : "people"}` },
  ];

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
      {tiles.map((t) => (
        <a
          key={t.href}
          href={t.href}
          className="group flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 transition duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-runfree-magenta/30"
        >
          <span>
            <span className="block font-display text-base font-bold text-runfree-ink">{t.label}</span>
            <span className="mt-0.5 block text-xs text-gray-500">{t.detail}</span>
          </span>
          <span
            aria-hidden
            className="text-gray-300 transition-transform duration-200 group-hover:translate-y-0.5 group-hover:text-runfree-magenta"
          >
            ↓
          </span>
        </a>
      ))}
    </div>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-runfree-magentaDeep">
        {eyebrow}
      </p>
      <h2 className="mt-1.5 font-display text-2xl font-extrabold tracking-tight text-runfree-ink sm:text-3xl">
        {title}
      </h2>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Module panel                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Everything for one module, on the same page. The icon rail above swaps this
 * panel's contents — no navigation, no page load, nothing collapsed behind a
 * disclosure arrow.
 */
/**
 * One tint per doorway, drawn from the brand family rather than from a
 * generic rainbow — magenta and orange are the gradient's own ends, indigo
 * and navy the grounds it sits on. Written as whole class strings because
 * Tailwind scans source text and never sees a name built by interpolation.
 */
const DOORWAY_TINT: Record<string, { card: string; bar: string; arrow: string }> = {
  team: {
    card: "bg-runfree-pink/40 ring-runfree-magenta/20 hover:ring-runfree-magenta/50",
    bar: "bg-runfree-magenta",
    arrow: "text-runfree-magentaDeep",
  },
  dates: {
    card: "bg-orange-50 ring-orange-200/70 hover:ring-orange-300",
    bar: "bg-runfree-orange",
    arrow: "text-orange-600",
  },
  prepare: {
    card: "bg-runfree-indigo/60 ring-runfree-navy/15 hover:ring-runfree-navy/35",
    bar: "bg-runfree-navy",
    arrow: "text-runfree-navy",
  },
  process: {
    card: "bg-white ring-gray-200 hover:ring-runfree-magenta/40",
    bar: "bg-runfree-grad",
    arrow: "text-runfree-magentaDeep",
  },
  sessions: {
    card: "bg-emerald-50 ring-emerald-200/70 hover:ring-emerald-300",
    bar: "bg-emerald-500",
    arrow: "text-emerald-700",
  },
  deliverables: {
    card: "bg-runfree-navy/[0.06] ring-runfree-navy/20 hover:ring-runfree-navy/40",
    bar: "bg-runfree-grad-deep",
    arrow: "text-runfree-navy",
  },
  default: {
    card: "bg-white ring-gray-200 hover:ring-runfree-magenta/30",
    bar: "bg-gray-200",
    arrow: "text-gray-400",
  },
};

/**
 * The landing panel — the first thing anyone sees, and the only screen
 * written for someone who has never heard of a Vision Frame.
 *
 * It answers three questions and stops: where are we, what do we owe, and
 * what is in here. The doorways carry counts rather than jargon, because
 * "6 dates" teaches a first-time visitor more than "Horizon Storyline" does.
 *
 * What it deliberately does NOT show is a completion ratio. An earlier draft
 * led with "0 of 23 deliverables" and Andrew: "leading with 23 deliverables
 * feels overwhelming... sometimes coaches don't finish all 23 based on what
 * they're delivering. sometimes we do portions of the process, rather than
 * the whole thing." A denominator turns a deliberately partial engagement
 * into a page that reads as 74% failed, so the count of what EXISTS is shown
 * and the count of what is missing never is.
 */
function OverviewPanel({
  detail,
  doorways,
  onGo,
  nextDate,
  currentModule,
}: {
  detail: ProjectDetail;
  doorways: { key: string; label: string; blurb: string }[];
  onGo: (key: string) => void;
  nextDate: PrepItem | null;
  currentModule: string | null;
}) {
  const moduleNo = currentModule ? moduleOrder(currentModule) : null;
  const meta = moduleNo ? MODULE_META[moduleNo] : null;

  // No "sessions so far". It counted `sessions` rows, which only exist where
  // someone logged a recording — Christ Chapel had met in person twice more
  // than the number claimed. A count that is wrong whenever a coach doesn't
  // upload is worse than no count, and nothing here needs it.
  const stats: { label: string; value: string; sub?: string }[] = [];
  if (currentModule) {
    stats.push({
      label: "Where you are",
      value: moduleLabel(currentModule),
      sub: meta?.stage,
    });
  }
  if (nextDate?.due_on) {
    stats.push({
      label: "Next together",
      value: formatPrepDate(nextDate.due_on),
      sub: nextDate.title,
    });
  }

  return (
    <div className="animate-fade">
      {stats.length > 0 && (
        <div className="overflow-hidden rounded-3xl bg-runfree-navy text-white shadow-sm">
          <div className="h-1 bg-runfree-grad" />
          <dl
            className={`grid gap-6 p-6 sm:p-8 ${
              stats.length > 1 ? "sm:grid-cols-2" : ""
            }`}
          >
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">
                  {s.label}
                </dt>
                <dd className="mt-1.5 font-display text-xl font-extrabold tracking-tight sm:text-2xl">
                  {s.value}
                </dd>
                {s.sub && <p className="mt-0.5 text-xs text-white/60">{s.sub}</p>}
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="mt-8">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
          What&rsquo;s in here
        </h3>
        {/* Andrew: "the cards underneath what's in here could be a little
            more colorful." Each doorway carries its own tint from the brand
            family, so the grid reads as six distinct places rather than six
            identical white rectangles — and the colour is a second cue for
            "these are different destinations", not decoration. */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {doorways.map((d) => {
            const tint = DOORWAY_TINT[d.key] ?? DOORWAY_TINT.default;
            return (
              <button
                key={d.key}
                onClick={() => onGo(d.key)}
                className={`group relative flex flex-col items-start overflow-hidden rounded-2xl p-5 text-left shadow-sm ring-1 outline-none transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-runfree-magenta ${tint.card}`}
              >
                <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${tint.bar}`} />
                <span className="font-display text-base font-extrabold tracking-tight text-runfree-ink">
                  {d.label}
                </span>
                <span className="mt-1 text-[13px] leading-snug text-gray-600">{d.blurb}</span>
                <span
                  aria-hidden
                  className={`mt-3 transition-transform duration-200 group-hover:translate-x-1 ${tint.arrow}`}
                >
                  →
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ModulePanel({
  section,
  bare = false,
  detail,
  imageUrls,
  canEdit,
  accessToken,
  onChanged,
  handouts,
  onOpenHandout,
  thumbs,
}: {
  section: string;
  /** Inside a Condensed fold: no card, no gradient rule, no title block. */
  bare?: boolean;
  detail: ProjectDetail;
  imageUrls: Record<string, string>;
  canEdit: boolean;
  accessToken: string | null;
  onChanged: () => void;
  handouts: HandoutLibrary | null;
  onOpenHandout: (fileId: string, title: string) => void;
  thumbs: Record<string, string>;
}) {
  if (!section) return null;

  const resources = detail.resources.filter((r) => r.section === section);
  const videos = resources.filter((r) => r.kind === "video" && r.external_url);
  const exercises = resources.filter((r) => r.kind === "exercise" || r.kind === "link");
  const sectionGroups = detail.prepGroups.filter((g) => g.section === section);

  // Handouts come from Drive, keyed by module number — not from
  // template_resources, whose handout rows are just titles with nowhere to
  // point. "1 - Funnel Fusion" (the sheets) and "01 - Funnel Fusion
  // Handouts.pdf" (the combined PDF) both resolve to module 1.
  const moduleNo = moduleOrder(section);
  const driveHandouts = moduleNo ? handouts?.byModule?.[String(moduleNo)] : undefined;
  const primaryHandout = driveHandouts?.combined ?? null;
  const otherHandouts = driveHandouts?.sheets ?? [];

  // Every chart for this module, including the ones a coach uploaded while
  // logging a session.
  //
  // These used to be excluded, on the reasoning that a photo appearing twice
  // on one page reads as a duplicate. Andrew wanted the opposite: "I do want
  // the images that I take of charts to show up under the module portion
  // rather than just the session recordings... it might be nice for a coach
  // to be able to upload all of that at the same time."
  //
  // So the upload stays on the session, where it is convenient, and the
  // DISPLAY lives here, where a team looks for it. The session's own copy is
  // inside the coach's edit form only, so nobody sees it twice.
  const images = detail.deliverables.filter(
    (d) => d.section === section && d.kind === "session_image"
  );
  const moduleDeliverables = detail.deliverables.filter(
    (d) => d.section === section && d.kind === "vision_stack"
  );

  const order = moduleOrder(section);
  const meta = order ? MODULE_META[order] : null;
  const isGroupVertical = detail.template?.isGroup ?? true;

  // A section whose only rows are handouts and videos with no destination
  // yet has nothing to show. An editor still gets the panel, because the
  // photo drop zone is the point; a client gets nothing rather than a
  // heading over an empty box.
  const hasAnything =
    !!primaryHandout ||
    videos.length > 0 ||
    (exercises.length > 0 && isGroupVertical) ||
    images.length > 0 ||
    moduleDeliverables.length > 0;
  if (!hasAnything && !canEdit) return null;

  return (
    <div
      className={
        bare
          ? ""
          : "animate-fade mt-2 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-gray-200"
      }
    >
      {!bare && <div className="h-1 bg-runfree-grad" />}
      <div className={bare ? "space-y-8" : "space-y-10 p-6 sm:p-9"}>
        {!bare && (
          <div>
            <h3 className="font-display text-2xl font-extrabold tracking-tight text-runfree-ink">
              {moduleLabel(section)}
            </h3>
            {meta && <p className="mt-1 text-sm text-gray-500">{meta.stage}</p>}
          </div>
        )}

        {(primaryHandout || otherHandouts.length > 0) && (
          <Block title="Handouts">
            {primaryHandout && (
              <button
                onClick={() => onOpenHandout(primaryHandout.id, primaryHandout.title)}
                className="group flex w-full items-center gap-4 rounded-2xl bg-runfree-indigo/50 p-5 text-left ring-1 ring-runfree-navy/10 outline-none transition hover:bg-runfree-indigo hover:ring-runfree-magenta/30 focus-visible:ring-2 focus-visible:ring-runfree-magenta"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-runfree-grad text-white">
                  <DocIcon />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-runfree-ink">
                    {primaryHandout.label || primaryHandout.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-600">
                    Everything for this module in one file
                    {prettySize(primaryHandout.sizeBytes) && (
                      <span className="text-gray-400"> · {prettySize(primaryHandout.sizeBytes)}</span>
                    )}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="ml-auto shrink-0 text-gray-400 transition-transform group-hover:translate-x-1"
                >
                  →
                </span>
              </button>
            )}

            {otherHandouts.length > 0 && (
              /* Andrew asked for this last round and I shipped the list
                 always-open: "put 'Funnel Fusion handouts combined' as the
                 primary file. Underneath that, 'Individual handouts' as a
                 dropdown." */
              <SheetDropdown
                label={`${moduleLabel(section)} individual handouts`}
                sheets={otherHandouts}
                onOpen={onOpenHandout}
              />
            )}
          </Block>
        )}

        {videos.length > 0 && (
          <Block title={`${moduleLabel(section)} training videos`}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {videos.map((v) => (
                <VideoCard
                  key={v.id}
                  title={v.title}
                  url={v.external_url!}
                  thumbnail={thumbs[v.external_url!]}
                />
              ))}
            </div>
          </Block>
        )}

        {(() => {
          const mine = detail.tasks.filter((t) => t.section === section);
          if (mine.length === 0 && !canEdit) return null;
          return (
            <Block title="Homework &amp; next steps">
              <div className="space-y-2.5">
                <TaskList
                  tasks={mine}
                  accessToken={accessToken}
                  onChanged={onChanged}
                  canEdit={canEdit}
                  emptyLabel="Nothing assigned for this module yet."
                />
                {canEdit && (
                  <AddTask
                    projectId={detail.id}
                    accessToken={accessToken}
                    siblings={detail.tasks}
                    section={section}
                    onChanged={onChanged}
                  />
                )}
              </div>
            </Block>
          );
        })()}

        <SectionNote
          projectId={detail.id}
          section={section}
          initial={detail.sectionNotes[section] ?? ""}
          canEdit={canEdit}
          accessToken={accessToken}
          onChanged={onChanged}
        />

        <Block title="From our sessions">
          <ImageGallery
            images={images}
            imageUrls={imageUrls}
            canEdit={canEdit}
            accessToken={accessToken}
            projectId={detail.id}
            section={section}
            onChanged={onChanged}
          />
        </Block>

        {moduleDeliverables.length > 0 && (
          <Block title="What this module produces">
            <div className="flex flex-wrap gap-2">
              {moduleDeliverables.map((d) => (
                <span
                  key={d.id}
                  className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 ${
                    d.published_at
                      ? "bg-runfree-pink text-runfree-magentaDeep ring-runfree-magenta/30"
                      : "bg-white text-gray-500 ring-gray-200"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 rounded-full ${
                      d.published_at ? "bg-runfree-magenta" : "bg-gray-300"
                    }`}
                  />
                  {d.title}
                </span>
              ))}
            </div>
          </Block>
        )}
      </div>
    </div>
  );
}

/**
 * A small square control with a real accessible name. 28px rather than the
 * 2px dot this replaced — that was a hover-only target no keyboard or touch
 * user could hit, and screen readers announced it as an unlabelled button.
 */
function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      /* 36px rather than the 28px this started at. These are the only way to
         reorder without a mouse, so they are hit with a thumb on an iPad in a
         working session — 28px is well under a comfortable touch target and
         sits on top of a busy photo. */
      className="flex h-9 w-9 items-center justify-center rounded-md bg-white/90 text-sm font-bold text-gray-600 shadow-sm outline-none ring-runfree-magenta/60 backdrop-blur transition hover:bg-white hover:text-runfree-magentaDeep focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/**
 * Notes, next steps or homework for one module.
 *
 * Andrew: "I should have a nice place right here where I can add notes, next
 * steps, or homework assignments." Distinct from the project-wide priorities
 * banner, which is about right now across the whole engagement; this is what
 * belongs with a specific tool.
 */
function SectionNote({
  projectId,
  section,
  initial,
  canEdit,
  accessToken,
  onChanged,
}: {
  projectId: string;
  section: string;
  initial: string;
  canEdit: boolean;
  accessToken: string | null;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => setDraft(initial), [initial, section]);

  if (!initial && !canEdit) return null;

  async function save() {
    if (!accessToken) return;
    setBusy(true);
    try {
      await saveSectionNote(accessToken, projectId, section, draft);
      onChanged();
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
          Notes &amp; homework
        </h4>
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center text-xs font-medium text-runfree-magentaDeep hover:underline max-sm:min-h-[40px]"
          >
            {initial ? "Edit" : "Add"}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What should the team do with this module before you meet again?"
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="rounded-lg bg-runfree-grad-deep px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:text-runfree-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : initial ? (
        <p className="whitespace-pre-line rounded-xl bg-runfree-indigo/40 px-4 py-3 text-sm leading-relaxed text-runfree-ink">
          {initial}
        </p>
      ) : (
        <p className="rounded-xl border border-dashed border-gray-200 py-5 text-center text-xs text-gray-400">
          No notes for this module yet.
        </p>
      )}
    </section>
  );
}

/**
 * The numbered sheets for one module, as the walkthrough they actually are.
 *
 * These were a wrapped cloud of grey pills. Funnel Fusion has fifteen of
 * them, Crowd Cloud nineteen — and their order is the order the room works
 * through them: "01 Welcome", "02 The Good News of Clarity", "03
 * Expectations", on to "15 Problem Statement Worksheet". Rendered as pills
 * that sequence is invisible, every sheet looks equally important, and the
 * curriculum reads as a tag cloud.
 *
 * As a numbered list it reads as what a facilitator is holding: an agenda.
 */
function SheetWalkthrough({
  sheets,
  onOpen,
}: {
  sheets: HandoutFile[];
  onOpen: (fileId: string, title: string) => void;
}) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs text-gray-500">
        {sheets.length} sheets, in the order we work through them.
      </p>
      <ol className="overflow-hidden rounded-2xl ring-1 ring-gray-200">
        {sheets.map((h, i) => (
          <li key={h.id}>
            <button
              onClick={() => onOpen(h.id, h.title)}
              className={`group flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition hover:bg-runfree-indigo/40 focus-visible:bg-runfree-indigo/40 ${
                i > 0 ? "border-t border-gray-100" : ""
              }`}
            >
              <span className="w-7 shrink-0 text-right text-xs font-bold tabular-nums text-runfree-magenta/70">
                {h.num || i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-runfree-ink">
                {h.label || h.title}
              </span>
              {prettySize(h.sizeBytes) && (
                <span className="shrink-0 text-[11px] tabular-nums text-gray-400 max-sm:hidden">
                  {prettySize(h.sizeBytes)}
                </span>
              )}
              <span
                aria-hidden
                className="shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-runfree-magenta"
              >
                →
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The handout folders that are not one of the six modules.
 *
 * These were fetched from Drive on every page load and then rendered
 * nowhere — `extras` came back through the API and no component ever read
 * it. That silently hid the Vision Frame Field Guide, and it hid
 * "Preparation Checklist.pdf" and "Guest Perspective 7 Checkpoints.pdf",
 * which are the actual RunFree source for two of the prepare cards that
 * looked empty.
 *
 * The Field Guide leads, because it is the one document that describes the
 * whole engagement rather than one module of it.
 */
function ExtraHandouts({
  extras,
  onOpen,
}: {
  extras: HandoutLibrary["extras"];
  onOpen: (fileId: string, title: string) => void;
}) {
  const groups = extras.filter((g) => g.files.length > 0);
  if (groups.length === 0) return null;

  const isFieldGuide = (name: string) => /field guide/i.test(name);
  const fieldGuide = groups.find((g) => isFieldGuide(g.name));
  const rest = groups.filter((g) => !isFieldGuide(g.name));

  return (
    <div className="mt-8 space-y-4">
      {fieldGuide?.files[0] && (
        <button
          onClick={() => onOpen(fieldGuide.files[0].id, fieldGuide.files[0].title)}
          className="group flex w-full items-center gap-4 rounded-2xl bg-runfree-grad-deep p-5 text-left text-white outline-none transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-runfree-magenta"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <DocIcon />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">
              {fieldGuide.files[0].label || fieldGuide.files[0].title}
            </span>
            <span className="mt-0.5 block text-xs text-white/70">
              The whole process in one document — start here
              {prettySize(fieldGuide.files[0].sizeBytes) && (
                <span> · {prettySize(fieldGuide.files[0].sizeBytes)}</span>
              )}
            </span>
          </span>
          <span
            aria-hidden
            className="ml-auto shrink-0 transition-transform group-hover:translate-x-1"
          >
            →
          </span>
        </button>
      )}

      {rest.map((g) => (
        <div key={g.id} className="rounded-2xl bg-white p-5 ring-1 ring-gray-200/80 sm:p-6">
          <h4 className="text-base font-semibold tracking-tight text-runfree-ink">
            {moduleLabel(g.name)}
          </h4>
          <SheetWalkthrough sheets={g.files} onOpen={onOpen} />
        </div>
      ))}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
        {title}
      </h4>
      {children}
    </section>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <path d="M14 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Click to play, in place. Loading every module's videos as live iframes
 * costs a Loom request each on page load; a poster that swaps itself for the
 * player on click costs nothing until someone actually wants to watch.
 */
function VideoCard({
  title,
  url,
  thumbnail,
}: {
  title: string;
  url: string;
  thumbnail?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const loomId = extractLoomId(url);

  if (playing && loomId) {
    return (
      <div className="overflow-hidden rounded-2xl bg-black ring-1 ring-gray-200">
        <div className="aspect-video">
          <iframe
            src={`https://www.loom.com/embed/${loomId}?autoplay=1`}
            title={title}
            allow="autoplay; fullscreen"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
        <p className="px-4 py-3 text-xs font-medium text-white/90">{title}</p>
      </div>
    );
  }

  return (
    <button
      onClick={() => (loomId ? setPlaying(true) : window.open(url, "_blank"))}
      className="group overflow-hidden rounded-2xl bg-white text-left ring-1 ring-gray-200 transition duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-runfree-magenta/30"
    >
      <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-runfree-navy">
        {thumbnail ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnail}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
            <span aria-hidden className="absolute inset-0 bg-runfree-navy/25 transition group-hover:bg-runfree-navy/10" />
          </>
        ) : (
          <span
            aria-hidden
            className="absolute inset-0 bg-runfree-sunset opacity-30 transition-opacity duration-300 group-hover:opacity-50"
          />
        )}
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/95 shadow-lg transition-transform duration-300 group-hover:scale-110">
          <svg viewBox="0 0 24 24" className="ml-1 h-6 w-6 fill-runfree-magentaDeep">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </div>
      <p className="px-4 py-3 text-sm font-medium leading-snug text-runfree-ink">{title}</p>
    </button>
  );
}

/**
 * Untitled by design. Andrew: "I'm just curious if we could have the freedom
 * to not name every single piece, because sometimes we don't get to every
 * single exercise that we name." So an image is just an image — drop it in
 * and it appears.
 */
function ImageGallery({
  images,
  imageUrls,
  canEdit,
  accessToken,
  projectId,
  section,
  sessionId,
  onChanged,
}: {
  images: ProjectDetail["deliverables"];
  imageUrls: Record<string, string>;
  canEdit: boolean;
  accessToken: string | null;
  projectId: string;
  section: string | null;
  /** Set when the gallery belongs to one session rather than a whole module. */
  sessionId?: string | null;
  onChanged: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Index being dragged, and the slot it's currently hovering over. */
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragTo, setDragTo] = useState<number | null>(null);
  /** Local order, so a drag feels instant instead of waiting on a round trip. */
  const [order, setOrder] = useState<ProjectDetail["deliverables"]>([]);

  const withImages = useMemo(() => images.filter((d) => d.image_path), [images]);

  // Re-sync whenever the server's list changes, but never mid-drag.
  useEffect(() => {
    if (dragFrom === null) setOrder(withImages);
  }, [withImages, dragFrom]);

  async function handleFiles(files: FileList | null) {
    if (!files || !accessToken) return;

    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const tooBig = images.filter((f) => f.size > MAX_IMAGE_BYTES);
    const usable = images.filter((f) => f.size <= MAX_IMAGE_BYTES);

    if (images.length === 0) {
      setError("Those files aren't images.");
      return;
    }
    if (tooBig.length > 0) {
      setError(
        `${tooBig.length === 1 ? "One photo is" : `${tooBig.length} photos are`} over ${
          MAX_IMAGE_BYTES / 1024 / 1024
        }MB and ${tooBig.length === 1 ? "was" : "were"} skipped.`
      );
    } else {
      setError(null);
    }
    if (usable.length === 0) return;

    setBusy(true);
    try {
      // Positions continue from the highest one already used, not from the
      // count. A deleted photo leaves a gap, so counting would hand the new
      // row a position an existing row already holds, and two rows sharing a
      // position sort nondeterministically — the gallery would reshuffle
      // itself on reload.
      let next = order.reduce((max, d) => Math.max(max, d.position ?? 0), -1) + 1;
      for (const file of usable) {
        const { path } = await uploadDeliverableImage(accessToken, projectId, file);
        await createDeliverable(accessToken, projectId, {
          title: null,
          section,
          session_id: sessionId ?? null,
          kind: "session_image",
          image_path: path,
          position: next++,
          published_at: new Date().toISOString(),
        });
      }
      onChanged();
    } catch (err) {
      console.error("Image upload failed:", err);
      setError("That upload didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Move one photo to a new index and persist the whole order.
   *
   * Takes the list from the functional updater rather than the render
   * closure: two moves in quick succession would otherwise both compute from
   * the same stale array and the second would undo the first.
   */
  async function move(from: number, to: number) {
    if (from === to || to < 0 || to >= order.length) return;

    let reordered: ProjectDetail["deliverables"] = [];
    setOrder((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      reordered = next;
      return next;
    });

    if (!accessToken) return;
    try {
      await reorderDeliverables(
        accessToken,
        reordered.map((d) => d.id)
      );
      onChanged();
    } catch (err) {
      console.error("Reorder failed:", err);
      setError("Couldn't save that order.");
      onChanged(); // Snap back to whatever the server actually has.
    }
  }

  if (order.length === 0 && !canEdit) {
    return (
      <p className="rounded-2xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
        Photos from your working sessions will appear here.
      </p>
    );
  }

  return (
    <>
      {error && (
        <p role="status" className="mb-3 rounded-lg bg-runfree-pink px-3 py-2 text-xs font-medium text-runfree-magentaDeep">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {order.map((d, index) => {
        const url = d.image_path ? imageUrls[d.image_path] : undefined;
        const isDragging = dragFrom === index;
        const isTarget = dragTo === index && dragFrom !== index;

        return (
          <div
            key={d.id}
            draggable={canEdit}
            onDragStart={() => canEdit && setDragFrom(index)}
            onDragEnter={() => canEdit && dragFrom !== null && setDragTo(index)}
            onDragOver={(e) => canEdit && dragFrom !== null && e.preventDefault()}
            onDrop={(e) => {
              // Commit here as well as on dragEnd: a drop onto a sibling
              // fires this, and relying on dragEnd alone lost the move
              // whenever the pointer left the grid before releasing.
              if (dragFrom !== null && dragTo !== null) {
                e.preventDefault();
                move(dragFrom, dragTo);
                setDragFrom(null);
                setDragTo(null);
              }
            }}
            onDragEnd={() => {
              if (dragFrom !== null && dragTo !== null) move(dragFrom, dragTo);
              setDragFrom(null);
              setDragTo(null);
            }}
            className={`group relative overflow-hidden rounded-xl bg-gray-50 ring-1 transition ${
              isDragging ? "opacity-40" : "opacity-100"
            } ${
              isTarget
                ? "ring-2 ring-runfree-magenta"
                : "ring-gray-200 hover:ring-runfree-magenta/40"
            } ${canEdit ? "cursor-grab active:cursor-grabbing" : ""}`}
          >
            {/* object-contain, not cover: a flipchart photographed in portrait
                and a landscape screenshot both keep their real proportions.
                Cropping them to a common rectangle loses the top of the chart,
                which is usually where the heading is. */}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => canEdit && dragFrom !== null && e.preventDefault()}
              className="flex aspect-[4/3] items-center justify-center"
            >
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={d.title ?? "Session photo"}
                  draggable={false}
                  className="max-h-full max-w-full object-contain transition duration-300 group-hover:scale-[1.03]"
                />
              ) : (
                <span className="text-xs text-gray-400">Loading…</span>
              )}
            </a>

            {/* The title is the label on the chart, so it is set like one.
                Andrew: "All the charts should be able to be uploaded and
                viewed separately, with a clear title visible." It was 11px
                grey and truncated, which read as a caption on a photo rather
                than the name of a piece of work. Naming stays optional — "I'm
                just curious if we could have the freedom to not name every
                single piece" — so an untitled chart shows nothing to a
                viewer rather than a placeholder. */}
            {(d.caption || canEdit) && (
              <div className="border-t border-gray-100 px-2.5 py-2">
                {canEdit ? (
                  <input
                    defaultValue={d.caption ?? ""}
                    onBlur={async (e) => {
                      if (!accessToken || e.target.value === (d.caption ?? "")) return;
                      await setDeliverableCaption(accessToken, d.id, e.target.value);
                      onChanged();
                    }}
                    placeholder="Name this chart…"
                    aria-label={`Name for chart ${index + 1}`}
                    className="w-full bg-transparent text-[13px] font-semibold text-runfree-ink outline-none placeholder:font-normal placeholder:text-gray-400 focus:placeholder:text-gray-500"
                  />
                ) : (
                  <p
                    title={d.caption ?? undefined}
                    className="truncate text-[13px] font-semibold text-runfree-ink"
                  >
                    {d.caption}
                  </p>
                )}
              </div>
            )}

            {canEdit && (
              /* Reordering has to work without a mouse. HTML5 drag events
                 never fire on touch, so on the iPad a coach actually uses in
                 a session the drag below is inert, and it is equally
                 unreachable by keyboard. These buttons are the real control;
                 dragging is the shortcut for people with a mouse.

                 They sit at 60% opacity rather than hidden-until-hover,
                 because hover does not exist on touch either. */
              /* Pinned to the TOP of the tile. At the bottom it sat directly
                 on the "Name this photo…" input and swallowed every click, so
                 the caption could never be typed on a tile a coach could edit
                 — the one place it exists. */
              <div className="absolute inset-x-1 top-1 flex items-center justify-between gap-1 opacity-60 transition group-hover:opacity-100 focus-within:opacity-100">
                <div className="flex gap-1">
                  <IconButton
                    label={`Move photo ${index + 1} earlier`}
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    ←
                  </IconButton>
                  <IconButton
                    label={`Move photo ${index + 1} later`}
                    disabled={index === order.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    →
                  </IconButton>
                </div>
                <IconButton
                  label={`Remove photo ${index + 1}`}
                  onClick={async () => {
                    if (!accessToken) return;
                    // Every other destructive action in this file confirms.
                    // This one did not, and on a phone the ✕ sits a thumb's
                    // width from the reorder arrows on a ~164px tile.
                    if (!confirm(`Remove ${d.caption ? `"${d.caption}"` : "this photo"}? This cannot be undone.`))
                      return;
                    // The storage object is deliberately left in place — the
                    // row is what makes it visible, and orphaned bytes are
                    // cheaper than a failed delete that removes the image
                    // while leaving a card pointing at nothing.
                    await deleteDeliverable(accessToken, d.id);
                    onChanged();
                  }}
                >
                  ✕
                </IconButton>
              </div>
            )}
          </div>
        );
      })}

      {canEdit && (
        <>
          <button
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              // Only a file drag, not an image being reordered.
              if (dragFrom !== null) return;
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              if (dragFrom !== null) return;
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={`flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-3 text-center transition ${
              dragOver
                ? "border-runfree-magenta bg-runfree-pink/40"
                : "border-gray-300 hover:border-runfree-magenta/50 hover:bg-gray-50"
            }`}
          >
            <span aria-hidden className="text-xl text-gray-400">
              +
            </span>
            <span className="text-xs font-medium text-gray-500">
              {busy ? "Uploading…" : "Drop photos"}
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </>
      )}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Prepare                                                                     */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Preparation cards                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The editable half of the prepare block. Andrew: "I want to be able to add
 * task cards or something like that. For things like key dates, it is
 * something that I can go in and edit as the team and I nail down upcoming
 * meetings, and that would get updated easily."
 *
 * One card per group, one row per item, and the row's shape follows the
 * group's `kind` (see migration 022). Cards render even when empty — an empty
 * "Key Dates" card invites a first date, whereas a card that appears only
 * once it has content is a card nobody discovers.
 */
function PrepCards({
  groups,
  items,
  projectId,
  canEdit,
  accessToken,
  fileUrls,
  onChanged,
}: {
  groups: PrepGroup[];
  items: PrepItem[];
  projectId: string;
  canEdit: boolean;
  accessToken: string | null;
  fileUrls: Record<string, string>;
  onChanged: () => void;
}) {
  if (groups.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {groups.map((g) => (
        <PrepCard
          key={g.id}
          group={g}
          items={items.filter((i) => i.group_id === g.id)}
          projectId={projectId}
          canEdit={canEdit}
          accessToken={accessToken}
          fileUrls={fileUrls}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

function PrepCard({
  group,
  items,
  projectId,
  canEdit,
  accessToken,
  fileUrls,
  onChanged,
}: {
  group: PrepGroup;
  items: PrepItem[];
  projectId: string;
  canEdit: boolean;
  accessToken: string | null;
  fileUrls: Record<string, string>;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);

  // Dates read as a calendar, not as an entry log: soonest first, with
  // undated rows last rather than heading the list with blanks.
  const ordered =
    group.kind === "dates"
      ? [...items].sort((a, b) => {
          if (a.due_on && b.due_on) return a.due_on.localeCompare(b.due_on);
          if (a.due_on) return -1;
          if (b.due_on) return 1;
          return a.position - b.position;
        })
      : items;

  const done = items.filter((i) => i.is_done).length;

  return (
    <section className="flex flex-col rounded-2xl bg-white p-5 ring-1 ring-gray-200/80 transition hover:ring-gray-300 sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-base font-semibold tracking-tight text-runfree-ink">
            {group.title}
          </h4>
          {group.description && (
            <p className="mt-1 text-xs leading-relaxed text-gray-500">{group.description}</p>
          )}
        </div>
        {group.kind === "checklist" && items.length > 0 && (
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${
              done === items.length
                ? "bg-emerald-50 text-emerald-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {done}/{items.length}
          </span>
        )}
      </header>

      <div className="mt-4 flex-1">
        {ordered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-xs text-gray-400">
            {canEdit ? "Nothing here yet — add the first one." : "Nothing here yet."}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {ordered.map((item) => (
              <PrepRow
                key={item.id}
                item={item}
                group={group}
                projectId={projectId}
                canEdit={canEdit}
                accessToken={accessToken}
                fileUrl={item.file_path ? fileUrls[item.file_path] : undefined}
                onChanged={onChanged}
              />
            ))}
          </ul>
        )}
      </div>

      {canEdit && (
        <div className="mt-4">
          {adding ? (
            <PrepItemForm
              group={group}
              projectId={projectId}
              siblings={items}
              accessToken={accessToken}
              onDone={() => {
                setAdding(false);
                onChanged();
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full rounded-xl border border-dashed border-gray-300 py-2.5 text-xs font-semibold text-gray-500 transition hover:border-runfree-magenta/50 hover:text-runfree-magentaDeep"
            >
              + Add {prepNoun(group.kind)}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function prepNoun(kind: PrepGroupKind): string {
  switch (kind) {
    case "dates":
      return "a date";
    case "reading":
      return "a book or link";
    case "files":
      return "a document";
    case "notes":
      return "a note";
    default:
      return "an item";
  }
}

function PrepRow({
  item,
  group,
  projectId,
  canEdit,
  accessToken,
  fileUrl,
  onChanged,
}: {
  item: PrepItem;
  group: PrepGroup;
  projectId: string;
  canEdit: boolean;
  accessToken: string | null;
  fileUrl?: string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!accessToken || busy) return;
    setBusy(true);
    try {
      await updatePrepItem(accessToken, item.id, { is_done: !item.is_done });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!accessToken) return;
    if (!confirm(`Remove "${item.title}"?`)) return;
    setBusy(true);
    try {
      await deletePrepItem(accessToken, item.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="py-3">
        <PrepItemForm
          group={group}
          projectId={projectId}
          existing={item}
          accessToken={accessToken}
          onDone={() => {
            setEditing(false);
            onChanged();
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  const href = safeExternalUrl(item.external_url);

  return (
    <li className="group/row flex flex-wrap items-start gap-x-3 gap-y-1 py-3">
      {group.kind === "checklist" && (
        <button
          onClick={toggle}
          disabled={!canEdit || busy}
          aria-label={item.is_done ? `Mark "${item.title}" not done` : `Mark "${item.title}" done`}
          className={`relative mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition before:absolute before:-inset-2 before:content-[''] ${
            item.is_done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-gray-300 bg-white hover:border-runfree-magenta"
          } ${canEdit ? "" : "cursor-default opacity-70"}`}
        >
          {item.is_done && (
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path
                fillRule="evenodd"
                d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </button>
      )}

      {group.kind === "dates" && <DateTile date={item.due_on} />}

      <div className="min-w-0 flex-1">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-runfree-ink underline-offset-2 hover:text-runfree-magentaDeep hover:underline"
          >
            {item.title}
            <span aria-hidden className="ml-1 text-gray-400">
              ↗
            </span>
          </a>
        ) : (
          <p
            className={`text-sm font-medium ${
              item.is_done ? "text-gray-400 line-through" : "text-runfree-ink"
            }`}
          >
            {item.title}
          </p>
        )}

        {item.notes && (
          <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-gray-500">
            {item.notes}
          </p>
        )}

        {group.kind === "checklist" && item.due_on && (
          <p className="mt-1 text-[11px] font-medium text-gray-400">
            Due {formatSessionDate(item.due_on)}
          </p>
        )}

        {group.kind === "dates" && item.end_on && item.end_on !== item.due_on && (
          <p className="mt-1 text-[11px] font-medium text-gray-400">
            through {formatSessionDate(item.end_on)}
          </p>
        )}

        <span className="mt-1.5 flex flex-wrap items-center gap-2">
          {safeExternalUrl(item.meeting_url) && (
            <a
              href={safeExternalUrl(item.meeting_url)!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[28px] items-center rounded-lg bg-runfree-grad-deep px-2.5 text-[11px] font-semibold text-white transition hover:opacity-90"
            >
              Join
            </a>
          )}
          {item.is_private && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              Private
            </span>
          )}
        </span>

        {item.file_path && (
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-2 inline-flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-[11px] font-medium text-gray-600 ring-1 ring-gray-200 transition hover:text-runfree-magentaDeep ${
              fileUrl ? "" : "pointer-events-none opacity-50"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-3.5 w-3.5"
            >
              <path d="M14 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
              <path
                d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="max-w-[14rem] truncate">{item.file_name || "Document"}</span>
            {prettySize(item.file_size) && (
              <span className="text-gray-400">{prettySize(item.file_size)}</span>
            )}
          </a>
        )}
      </div>

      {canEdit && (
        // On a phone the actions drop to their own line rather than stealing
        // width from the title, which otherwise wraps to three lines beside
        // two buttons. On desktop they stay inline and appear on hover.
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover/row:opacity-100 focus-within:opacity-100 max-sm:order-last max-sm:w-full max-sm:justify-end max-sm:opacity-100">
          {/* Roomier on a phone. These sit inside a list row, so at their
              desktop size they are a 25px target — the same reason the photo
              reorder controls are 36px rather than drag handles. */}
          <button
            onClick={() => setEditing(true)}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-gray-400 hover:bg-gray-50 hover:text-runfree-ink max-sm:min-h-[36px] max-sm:px-3"
          >
            Edit
          </button>
          <button
            onClick={remove}
            disabled={busy}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 max-sm:min-h-[36px] max-sm:px-3"
          >
            Remove
          </button>
        </div>
      )}
    </li>
  );
}

/** A little calendar chip, so a list of dates scans as dates. */
function DateTile({ date }: { date: string | null }) {
  if (!date) {
    return (
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-dashed border-gray-300 text-[10px] font-semibold uppercase text-gray-400">
        TBD
      </div>
    );
  }
  const [y, m, d] = date.split("-").map(Number);
  const parsed = y && m && d ? new Date(y, m - 1, d) : null;
  const past = parsed ? parsed.getTime() < new Date().setHours(0, 0, 0, 0) : false;

  return (
    <div
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-center leading-none ${
        past ? "bg-gray-100 text-gray-400" : "bg-runfree-grad-deep text-white"
      }`}
    >
      <div>
        <div className="text-[9px] font-bold uppercase tracking-wider opacity-80">
          {parsed?.toLocaleDateString(undefined, { month: "short" })}
        </div>
        <div className="text-sm font-bold tabular-nums">{d}</div>
      </div>
    </div>
  );
}

/**
 * Add and edit share one form: the fields a row needs are decided by the
 * group's kind, and duplicating that decision across two components is how
 * the two drift apart.
 */
function PrepItemForm({
  group,
  projectId,
  existing,
  siblings = [],
  accessToken,
  onDone,
  onCancel,
}: {
  group: PrepGroup;
  projectId: string;
  existing?: PrepItem;
  siblings?: PrepItem[];
  accessToken: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [dueOn, setDueOn] = useState(existing?.due_on ?? "");
  const [endOn, setEndOn] = useState(existing?.end_on ?? "");
  const [meetingUrl, setMeetingUrl] = useState(existing?.meeting_url ?? "");
  const [isPrivate, setIsPrivate] = useState(existing?.is_private ?? false);
  const [url, setUrl] = useState(existing?.external_url ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Andrew: "all of the different add options — add a note, add an item, add
  // a document — are all designated per individual section. I would like to
  // be able to add any one of those things in any section."
  //
  // So every field is offered everywhere. `kind` still decides how a saved
  // row RENDERS (a date tile, a checkbox, a link, a document) — it no longer
  // decides what you are allowed to put in one. A book with a due date and a
  // PDF attached is a legitimate thing to want, and there is no reason the
  // card it sits in should forbid it.
  const wantsLongNotes = group.kind === "notes";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      let uploaded: Awaited<ReturnType<typeof uploadPrepFile>> | null = null;
      if (file) {
        if (file.size > MAX_IMAGE_BYTES) {
          setError(`That file is over ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`);
          setBusy(false);
          return;
        }
        uploaded = await uploadPrepFile(accessToken, projectId, file, isPrivate);
      }

      // Privacy is enforced by where the file sits, not by the checkbox
      // alone (see setPrepFilePrivacy). Ticking Private on a document
      // uploaded weeks ago has to move it, or the row hides while the file
      // stays readable to every member holding a signed URL.
      let movedPath: string | null = null;
      if (!uploaded && existing?.file_path && existing.is_private !== isPrivate) {
        movedPath = await setPrepFilePrivacy(accessToken, existing.file_path, isPrivate);
      }

      const payload = {
        title: title.trim(),
        notes: notes.trim() || null,
        due_on: dueOn || null,
        end_on: endOn || null,
        meeting_url: meetingUrl.trim() || null,
        is_private: isPrivate,
        external_url: url.trim() || null,
        ...(uploaded
          ? {
              file_path: uploaded.path,
              file_name: uploaded.name,
              file_mime: uploaded.mime,
              file_size: uploaded.size,
            }
          : movedPath
            ? { file_path: movedPath }
            : {}),
      };

      if (existing) {
        await updatePrepItem(accessToken, existing.id, payload);
      } else {
        await createPrepItem(accessToken, projectId, group.id, payload, siblings);
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta";

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl bg-gray-50/80 p-3">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={
          group.kind === "dates"
            ? "What happens that day?"
            : group.kind === "reading"
              ? "Title"
              : "What needs doing?"
        }
        className={field}
      />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          type="date"
          value={dueOn}
          onChange={(e) => setDueOn(e.target.value)}
          className={field}
          aria-label={group.kind === "dates" ? "Date" : "Due date"}
        />
        {/* An onsite weekend is one row with a span, not three rows.
            Andrew: "we need to be able to track that there are multiple
            dates there." */}
        <input
          type="date"
          value={endOn}
          onChange={(e) => setEndOn(e.target.value)}
          className={field}
          aria-label="End date, for something spanning days"
          title="End date, if it runs over more than one day"
        />
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Link (optional)"
          className={field}
        />
        <input
          type="url"
          value={meetingUrl}
          onChange={(e) => setMeetingUrl(e.target.value)}
          placeholder="Zoom / Meet link (optional)"
          className={field}
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
          className="h-4 w-4"
        />
        Keep this private — RunFree and project admins only, hidden from the church team
      </label>

      <textarea
        rows={wantsLongNotes ? 5 : 2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={wantsLongNotes ? "Notes" : "Notes (optional)"}
        className={field}
      />

      <div>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-xs text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-runfree-ink file:ring-1 file:ring-gray-300"
          />
          {existing?.file_name && !file && (
            <p className="mt-1 text-[11px] text-gray-400">
              Currently: {existing.file_name}. Choosing a new file replaces it.
            </p>
          )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2 pt-0.5">
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="rounded-lg bg-runfree-grad-deep px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : existing ? "Save" : "Add"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-2 text-xs font-medium text-gray-500 hover:text-runfree-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function PrepareSection({
  id,
  prep,
  overview,
  thumbs,
  prepGroups,
  prepItems,
  projectId,
  canEdit,
  accessToken,
  fileUrls,
  onChanged,
  handouts,
  onOpenHandout,
  showTitle = true,
}: {
  id: string;
  prep: ProjectDetail["resources"];
  overview: ProjectDetail["resources"];
  thumbs: Record<string, string>;
  prepGroups: PrepGroup[];
  prepItems: PrepItem[];
  projectId: string;
  canEdit: boolean;
  accessToken: string | null;
  fileUrls: Record<string, string>;
  onChanged: () => void;
  handouts: HandoutLibrary | null;
  onOpenHandout: (fileId: string, title: string) => void;
  /** False inside a Condensed fold, which supplies its own heading. */
  showTitle?: boolean;
}) {
  const extras = handouts?.extras ?? [];
  if (prep.length === 0 && overview.length === 0 && prepGroups.length === 0 && extras.length === 0)
    return null;

  const videos = [...prep, ...overview].filter((r) => r.kind === "video" && r.external_url);
  const reading = [...prep, ...overview].filter((r) => r.kind !== "video");

  return (
    <section id={id} className={showTitle ? "mt-20 scroll-mt-8" : "scroll-mt-8"}>
      {showTitle && <SectionHeading eyebrow="Before you begin" title="Prepare your team" />}

      {/* The editable work leads. The orientation videos below it are context;
          these cards are what the team actually has to act on. */}
      {/* The Preparation Checklist is the one handout that belongs to this
          block — it is the list the team works through before session one.
          The Field Guide moved to the process section with the rest of the
          handouts, per Andrew: "I want 'the process' to look and feel more
          like the original for sure, with icons, handouts, field guide, and
          videos." */}
      <ExtraHandouts extras={extras.filter((g) => PREP_HANDOUT.test(g.name))} onOpen={onOpenHandout} />

      {prepGroups.length > 0 && (
        <div className="mt-8">
          <PrepCards
            groups={prepGroups}
            items={prepItems}
            projectId={projectId}
            canEdit={canEdit}
            accessToken={accessToken}
            fileUrls={fileUrls}
            onChanged={onChanged}
          />
        </div>
      )}

      {videos.length > 0 && (
        <div className="mt-8">
          <h4 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
            Orientation
          </h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <VideoCard
                key={v.id}
                title={v.title}
                url={v.external_url!}
                thumbnail={thumbs[v.external_url!]}
              />
            ))}
          </div>
        </div>
      )}

      {reading.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {reading.map((r) => {
            const inner = (
              <>
                {r.title}
                {r.external_url && (
                  <span aria-hidden className="ml-1.5 text-gray-400">
                    →
                  </span>
                )}
              </>
            );
            return (
              <li key={r.id}>
                {r.external_url ? (
                  <a
                    href={safeExternalUrl(r.external_url)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-700 transition hover:border-runfree-magenta/40 hover:text-runfree-ink"
                  >
                    {inner}
                  </a>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-gray-50 px-3.5 py-1.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200">
                    {inner}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                    */
/* -------------------------------------------------------------------------- */

function SessionsSection({
  id,
  bare = false,
  thumbs = {},
  sessions,
  detail,
  imageUrls,
  moduleOptions,
  canEdit,
  accessToken,
  projectId,
  onChanged,
}: {
  id: string;
  /** Inside a Condensed fold the heading and margin come from the fold. */
  bare?: boolean;
  thumbs?: Record<string, string>;
  sessions: ProjectDetail["sessions"];
  detail: ProjectDetail;
  imageUrls: Record<string, string>;
  moduleOptions: string[];
  canEdit: boolean;
  accessToken: string | null;
  projectId: string;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [heldOn, setHeldOn] = useState("");
  const [section, setSection] = useState("");
  const [recording, setRecording] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !title.trim()) return;
    const created = await createSession(accessToken, projectId, {
      title: title.trim(),
      section: section || null,
      held_on: heldOn || null,
    });
    // Saved in a second call so the recording field can live on the create
    // form without widening createSession's contract for one caller.
    if (recording.trim() && created) {
      await updateSession(accessToken, created.id, { recording_url: recording.trim() });
    }
    setTitle("");
    setHeldOn("");
    setSection("");
    setRecording("");
    setAdding(false);
    onChanged();
  }

  return (
    <section id={id} className="mt-20 scroll-mt-20">
      {!bare && <SectionHeading eyebrow="Every time we met" title="Session recordings" />}

      <div className="mx-auto mt-8 max-w-3xl space-y-3">
        {sessions.length === 0 && (
          <p className="rounded-2xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
            Recordings and notes appear here after each session.
          </p>
        )}

        {sessions.map((s, i) => (
          <SessionRow
            key={s.id}
            index={i}
            session={s}
            photos={detail.deliverables.filter(
              (d) => d.kind === "session_image" && d.session_id === s.id
            )}
            imageUrls={imageUrls}
            moduleOptions={moduleOptions}
            canEdit={canEdit}
            thumb={s.recording_url ? thumbs[s.recording_url] : undefined}
            tasks={detail.tasks.filter((t) => t.session_id === s.id)}
            accessToken={accessToken}
            projectId={projectId}
            onChanged={onChanged}
          />
        ))}

        {canEdit &&
          (adding ? (
            <form
              onSubmit={add}
              className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200"
            >
              <Field label="Session title">
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Session 3 — Crowd Cloud"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
                />
              </Field>
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[150px]">
                  <Field label="Date held">
                    <input
                      type="date"
                      value={heldOn}
                      onChange={(e) => setHeldOn(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
                    />
                  </Field>
                </div>
                <div className="flex-1 min-w-[180px]">
                  <Field label="Module covered">
                    <SectionPicker value={section} options={moduleOptions} onChange={setSection} />
                  </Field>
                </div>
              </div>
              <Field label="Recording link (Loom or Zoom)">
                <input
                  value={recording}
                  onChange={(e) => setRecording(e.target.value)}
                  placeholder="https://www.loom.com/share/…"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
                />
              </Field>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-runfree-grad-deep px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                >
                  Add session
                </button>
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:text-runfree-ink"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full rounded-2xl border-2 border-dashed border-gray-300 py-4 text-sm font-medium text-gray-500 transition hover:border-runfree-magenta/40 hover:text-runfree-magentaDeep"
            >
              + Add a session
            </button>
          ))}
      </div>
    </section>
  );
}

function SessionRow({
  index,
  session,
  photos,
  imageUrls,
  moduleOptions,
  canEdit,
  thumb,
  tasks,
  accessToken,
  projectId,
  onChanged,
}: {
  index: number;
  session: ProjectDetail["sessions"][number];
  photos: ProjectDetail["deliverables"];
  imageUrls: Record<string, string>;
  moduleOptions: string[];
  canEdit: boolean;
  /** Loom still for the collapsed row. */
  thumb?: string;
  /** Homework this session produced. */
  tasks: ProjectTask[];
  accessToken: string | null;
  projectId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: session.title,
    held_on: session.held_on ?? "",
    section: session.section ?? "",
    recording_url: session.recording_url ?? "",
    takeaways: session.takeaways ?? "",
    commitments: session.commitments ?? "",
    transcript: session.transcript ?? "",
    published: !!session.published_at,
  });

  async function save() {
    if (!accessToken) return;
    setSaving(true);
    try {
      await updateSession(accessToken, session.id, {
        title: form.title.trim() || session.title,
        held_on: form.held_on || null,
        section: form.section || null,
        recording_url: form.recording_url || null,
        takeaways: form.takeaways || null,
        commitments: form.commitments || null,
        transcript: form.transcript || null,
        published_at: form.published ? new Date().toISOString() : null,
      });
      onChanged();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const loomId = session.recording_url ? extractLoomId(session.recording_url) : null;

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-runfree-indigo text-xs font-bold text-runfree-navy"
          >
            {index + 1}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-runfree-ink">{session.title}</span>
            <span className="mt-0.5 block truncate text-xs text-gray-500">
              {formatSessionDate(session.held_on)}
              {session.section && ` · ${moduleLabel(session.section)}`}
              {!session.published_at && canEdit && " · Draft"}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {/* Andrew: "under the session recordings, I would like to see a
              thumbnail there, and then you can click on it and it will drop
              down with any additional information." */}
          {session.recording_url && thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt=""
              className="hidden h-11 w-20 shrink-0 rounded-lg object-cover ring-1 ring-gray-200 sm:block"
            />
          ) : session.recording_url ? (
            <span className="rounded-full bg-runfree-pink px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-runfree-magentaDeep">
              Recording
            </span>
          ) : null}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="animate-fade space-y-4 border-t border-gray-100 px-5 py-5">
          {canEdit ? (
            <>
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[150px]">
                  {/* This input did not exist. held_on was rendered in the
                      header but never editable, so every session read "Date
                      not set" forever — in the one feature whose whole point
                      is a dated record of what happened when. */}
                  <Field label="Date held">
                    <input
                      type="date"
                      value={form.held_on}
                      onChange={(e) => setForm((f) => ({ ...f, held_on: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
                    />
                  </Field>
                </div>
                <div className="flex-1 min-w-[180px]">
                  {/* Six modules are delivered across roughly ten sessions, so
                      a session is not a module — tagging which one it covered
                      is what keeps the two views reconcilable. */}
                  <Field label="Module covered">
                    <SectionPicker
                      value={form.section}
                      options={moduleOptions}
                      onChange={(v) => setForm((f) => ({ ...f, section: v }))}
                    />
                  </Field>
                </div>
              </div>

              <Field label="Session title">
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
                />
              </Field>

              <Field label="Recording link (Loom or Zoom)">
                <input
                  value={form.recording_url}
                  onChange={(e) => setForm((f) => ({ ...f, recording_url: e.target.value }))}
                  placeholder="https://www.loom.com/share/…"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
                />
              </Field>
              <Field label="Key takeaways">
                <textarea
                  rows={3}
                  value={form.takeaways}
                  onChange={(e) => setForm((f) => ({ ...f, takeaways: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
                />
              </Field>
              {/* Andrew: "I typically upload a Session Recap, which would be
                  the notes... but to be able to pull out some homework
                  elements or some next steps and have that populate at the
                  very top of their project would be good."
                  So prose stays prose, and homework becomes real rows that
                  also appear at the top of the project and in the module. */}
              <div>
                <h5 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
                  Next steps &amp; homework
                </h5>
                <div className="space-y-2.5">
                  <TaskList
                    tasks={tasks}
                    accessToken={accessToken}
                    onChanged={onChanged}
                    canEdit={canEdit}
                    emptyLabel="Nothing assigned from this session yet."
                  />
                  <AddTask
                    projectId={projectId}
                    accessToken={accessToken}
                    siblings={tasks}
                    section={session.section}
                    sessionId={session.id}
                    moduleOptions={moduleOptions}
                    onChanged={onChanged}
                  />
                  <p className="text-[11px] text-gray-400">
                    These show at the top of the project and inside the module.
                  </p>
                </div>
              </div>
              <div>
                <h5 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
                  Photos from this session
                </h5>
                <ImageGallery
                  images={photos}
                  imageUrls={imageUrls}
                  canEdit={canEdit}
                  accessToken={accessToken}
                  projectId={projectId}
                  section={session.section}
                  sessionId={session.id}
                  onChanged={onChanged}
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))}
                />
                Visible to the church team
              </label>
              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-lg bg-runfree-grad-deep px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={async () => {
                    if (!accessToken) return;
                    if (!confirm(`Delete "${session.title}"? Its notes and photos go with it.`)) return;
                    await deleteSession(accessToken, session.id);
                    onChanged();
                  }}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                >
                  Delete session
                </button>
              </div>
            </>
          ) : (
            <>
              {tasks.length > 0 && (
                <div>
                  <h5 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
                    Next steps &amp; homework
                  </h5>
                  <TaskList
                    tasks={tasks}
                    accessToken={accessToken}
                    onChanged={onChanged}
                    canEdit={false}
                  />
                </div>
              )}
              {loomId && (
                <div className="overflow-hidden rounded-xl bg-black">
                  <div className="aspect-video">
                    <iframe
                      src={`https://www.loom.com/embed/${loomId}`}
                      title={session.title}
                      allowFullScreen
                      className="h-full w-full"
                    />
                  </div>
                </div>
              )}
              {session.takeaways && (
                <div>
                  <h5 className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
                    Takeaways
                  </h5>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
                    {session.takeaways}
                  </p>
                </div>
              )}
              {session.commitments && (
                <div>
                  <h5 className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
                    Next steps &amp; homework
                  </h5>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
                    {session.commitments}
                  </p>
                </div>
              )}
              {photos.length > 0 && (
                <div>
                  <h5 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
                    From this session
                  </h5>
                  <ImageGallery
                    images={photos}
                    imageUrls={imageUrls}
                    canEdit={false}
                    accessToken={accessToken}
                    projectId={projectId}
                    section={session.section}
                    sessionId={session.id}
                    onChanged={onChanged}
                  />
                </div>
              )}

              {!loomId && !session.takeaways && !session.commitments && photos.length === 0 && (
                <p className="text-sm text-gray-400">Notes from this session are coming.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Choose a section, or type a new one.
 *
 * The session form used to derive its options from sections that already had
 * content, which meant a brand-new project offered nothing and a Younique or
 * Meta Performance project offered nothing ever — neither uses "Mod #N"
 * headings, and the module rail was what supplied the list. Nothing anywhere
 * in the app could create a section, so those verticals had no way to be
 * organised at all.
 */
function SectionPicker({
  value,
  options,
  onChange,
  allowNone = true,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  allowNone?: boolean;
}) {
  const [custom, setCustom] = useState(false);

  if (custom) {
    return (
      <div className="flex gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Name this section"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
        />
        <button
          type="button"
          onClick={() => {
            setCustom(false);
            onChange("");
          }}
          className="shrink-0 rounded-lg px-2 text-xs text-gray-500 hover:text-runfree-ink"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === "__new__") {
          setCustom(true);
          onChange("");
        } else {
          onChange(e.target.value);
        }
      }}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
    >
      {allowNone && <option value="">Not tied to one section</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {moduleLabel(o)}
        </option>
      ))}
      <option value="__new__">+ New section…</option>
    </select>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Team                                                                        */
/* -------------------------------------------------------------------------- */

function TeamSection({
  id,
  bare = false,
  detail,
  imageUrls,
  canManage,
  canEdit = false,
  teamGroups = [],
  accessToken,
  projectId,
  onChanged,
}: {
  id: string;
  /** Inside a Condensed fold the heading comes from the fold. */
  bare?: boolean;
  detail: ProjectDetail;
  imageUrls: Record<string, string>;
  canManage: boolean;
  canEdit?: boolean;
  /** Insights profiles and other team-coaching uploads. */
  teamGroups?: PrepGroup[];
  accessToken: string | null;
  projectId: string;
  onChanged: () => void;
}) {
  // Lead navigator first, then Will, then Brooke, then anyone else.
  // Andrew: "make sure that Will Mancini comes before Brooke Domek, but the
  // lead navigator is always first."
  const RUNFREE_ORDER = ["will@runfree.co", "brooke@runfree.co"];
  const runfree = detail.members
    .filter((m) => m.isStaff)
    .sort((a, b) => {
      if (a.isLead !== b.isLead) return a.isLead ? -1 : 1;
      const ai = RUNFREE_ORDER.indexOf(a.email.toLowerCase());
      const bi = RUNFREE_ORDER.indexOf(b.email.toLowerCase());
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  // Templates default to group; only an explicitly 1:1 vertical opts out.
  const isGroup = detail.template?.isGroup ?? true;

  return (
    <section id={id} className="mt-20 scroll-mt-20">
      {!bare && <SectionHeading eyebrow="Who you're working with" title="Your Team" />}

      {/* The church's own people lead. Andrew: "Let's lead with their actual
          church team. And then below it shows the run free team." A church
          opening this tab is looking for themselves first. */}
      {isGroup && (
        <ChurchTeamInfo
          id="church-team"
          contacts={detail.contacts}
          projectId={projectId}
          canEdit={canEdit}
          accessToken={accessToken}
          onChanged={onChanged}
        />
      )}

      {/* RunFree side — real people, from project_members. The static
          template "team_bio" rows are gone (migration 019): they duplicated
          anyone who was also a member, and a string in a resources table has
          no face, no address and nothing to click. */}
      <h3 className="mt-12 font-display text-base font-bold text-runfree-ink">Your RunFree Team</h3>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {runfree.map((m) => (
          <div key={m.profileId}>
            <PersonCard
              name={m.fullName || m.email}
              role={m.isLead ? "Your Lead Navigator" : m.orgRole || "RunFree"}
              email={m.email}
              highlight={m.isLead}
              avatarUrl={m.avatarPath ? imageUrls[m.avatarPath] : undefined}
              canEditAvatar={canManage}
              onAvatarPicked={async (file) => {
                if (!accessToken) return;
                const { path } = await uploadProjectLogo(accessToken, projectId, file);
                await updateAvatar(accessToken, m.profileId, path);
                onChanged();
              }}
            />
            {canManage && !m.isLead && (
              /* Without this there is no way at all to say who is leading an
                 engagement, so the hero's "led by …" line and the highlighted
                 card below only ever appeared on projects whose row had been
                 set by hand in SQL. */
              <button
                onClick={async () => {
                  if (!accessToken) return;
                  await setLeadNavigator(accessToken, projectId, m.profileId);
                  onChanged();
                }}
                className="mt-1.5 w-full rounded-lg px-2 py-1 text-xs font-medium text-gray-400 transition hover:bg-runfree-pink hover:text-runfree-magentaDeep max-sm:min-h-[40px]"
              >
                Make lead navigator
              </button>
            )}
          </div>
        ))}
        {canManage && (
          <AddRunFreeMember
            accessToken={accessToken}
            projectId={projectId}
            onChanged={onChanged}
          />
        )}
      </div>

      {/* Team Building Profiles and other team-coaching uploads, last.
          Andrew: "under your team. Let's drop team building profiles. A
          little lower."

          What used to sit here — a second "Church team" listing the church
          members who hold portal access — is gone. It counted a different
          thing from the roster above while wearing almost the same name, so
          the tab showed "Church team 0" directly above eight people. Granting
          access lives in one place now: Manage access, in the header. */}
      {teamGroups.length > 0 && (
        <div className="mt-12">
          <PrepCards
            groups={teamGroups}
            items={detail.prepItems}
            projectId={projectId}
            canEdit={canEdit}
            accessToken={accessToken}
            fileUrls={imageUrls}
            onChanged={onChanged}
          />
        </div>
      )}
    </section>
  );
}

/**
 * Add another RunFree person to this engagement.
 *
 * Separate from the church roster's form on purpose: adding a colleague
 * through a panel headed "Church team" was the only route before, which read
 * as a mistake every time.
 */
function AddRunFreeMember({
  accessToken,
  projectId,
  onChanged,
}: {
  accessToken: string | null;
  projectId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [orgRole, setOrgRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-[92px] items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-500 transition hover:border-runfree-magenta/40 hover:text-runfree-magentaDeep"
      >
        + Add a RunFree teammate
      </button>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!accessToken || !email.trim()) return;
        setBusy(true);
        setError(null);
        try {
          const res = await fetch(`/api/projects/${projectId}/members`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ email: email.trim(), role: "editor", orgRole: orgRole.trim() || null }),
          });
          const body = await res.json();
          if (!res.ok) setError(body.error || "Couldn't add them");
          else {
            setEmail("");
            setOrgRole("");
            setOpen(false);
            onChanged();
          }
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200"
    >
      <input
        autoFocus
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="name@runfree.co"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta"
      />
      <input
        value={orgRole}
        onChange={(e) => setOrgRole(e.target.value)}
        placeholder="Their role, e.g. Navigator"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-runfree-grad-deep px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-2 py-1.5 text-xs text-gray-500 hover:text-runfree-ink"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

function PersonCard({
  name,
  role,
  email,
  highlight,
  avatarUrl,
  canEditAvatar,
  onAvatarPicked,
}: {
  name: string;
  role: string;
  email?: string;
  highlight?: boolean;
  avatarUrl?: string;
  canEditAvatar?: boolean;
  onAvatarPicked?: (file: File) => void | Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div
      className={`flex items-center gap-4 rounded-2xl p-5 shadow-sm ring-1 transition ${
        highlight
          ? "bg-runfree-indigo/60 ring-runfree-navy/15"
          : "bg-white ring-gray-200"
      }`}
    >
      <span
        onClick={() => canEditAvatar && fileRef.current?.click()}
        title={canEditAvatar ? "Add a headshot" : undefined}
        className={`group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-runfree-grad text-sm font-bold text-white ${
          canEditAvatar ? "cursor-pointer" : ""
        }`}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          initials
        )}
        {canEditAvatar && (
          <>
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[9px] font-bold uppercase opacity-0 transition group-hover:opacity-100">
              {busy ? "…" : avatarUrl ? "Change" : "Photo"}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f || !onAvatarPicked) return;
                setBusy(true);
                try {
                  await onAvatarPicked(f);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </>
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-runfree-ink">{name}</span>
        <span className="mt-0.5 block truncate text-xs text-gray-600">{role}</span>
        {email && (
          <a
            href={`mailto:${email}`}
            className="mt-0.5 block truncate text-xs text-runfree-magentaDeep hover:underline"
          >
            {email}
          </a>
        )}
      </span>
    </div>
  );
}

function MemberRow({
  member,
  managing,
  accessToken,
  projectId,
  onChanged,
}: {
  member: ProjectMember;
  managing: boolean;
  accessToken: string | null;
  projectId: string;
  onChanged: () => void;
}) {
  const [orgRole, setOrgRole] = useState(member.orgRole ?? "");

  async function saveOrgRole() {
    if (!accessToken || orgRole === (member.orgRole ?? "")) return;
    await updateMemberDetails(accessToken, projectId, member.profileId, {
      org_role: orgRole || null,
    });
    onChanged();
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-6 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-runfree-ink">
          {member.fullName || member.email}
        </p>
        <a
          href={`mailto:${member.email}`}
          className="truncate text-xs text-gray-500 hover:text-runfree-magentaDeep"
        >
          {member.email}
        </a>
      </div>

      {managing ? (
        <>
          <input
            value={orgRole}
            onChange={(e) => setOrgRole(e.target.value)}
            onBlur={saveOrgRole}
            placeholder="Role at church"
            className="w-40 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-runfree-magenta"
          />
          <select
            value={member.role}
            onChange={async (e) => {
              if (!accessToken) return;
              await updateMemberRole(
                accessToken,
                projectId,
                member.profileId,
                e.target.value as ProjectRole
              );
              onChanged();
            }}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs outline-none focus:border-runfree-magenta"
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
          <button
            onClick={async () => {
              if (!accessToken) return;
              await removeMember(accessToken, projectId, member.profileId);
              onChanged();
            }}
            className="rounded-lg px-2 py-1.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-runfree-ink"
          >
            Remove
          </button>
        </>
      ) : (
        <span className="text-xs text-gray-500">{member.orgRole || "—"}</span>
      )}
    </li>
  );
}

function AddMemberForm({
  accessToken,
  projectId,
  onChanged,
}: {
  accessToken: string | null;
  projectId: string;
  onChanged: () => void;
}) {
  const [email, setEmail] = useState("");
  const [orgRole, setOrgRole] = useState("");
  const [role, setRole] = useState<ProjectRole>("viewer");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !email.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ email: email.trim(), role, orgRole: orgRole.trim() || null }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage(body.error || "Couldn't add that person");
      } else {
        setMessage(body.invited ? `Invited ${email}` : `Added ${email}`);
        setEmail("");
        setOrgRole("");
        onChanged();
      }
    } catch {
      setMessage("Couldn't reach the server — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
      <div className="min-w-[180px] flex-1">
        <label className="mb-1 block text-xs font-medium text-gray-600">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@church.org"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Role at church</label>
        <input
          value={orgRole}
          onChange={(e) => setOrgRole(e.target.value)}
          placeholder="Executive Pastor"
          className="w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Access</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as ProjectRole)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta"
        >
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-runfree-grad-deep px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Adding…" : "Add"}
      </button>
      {message && <p className="w-full text-xs text-gray-600">{message}</p>}
    </form>
  );
}
