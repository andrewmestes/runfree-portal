"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { getCurrentProfile, logout } from "@/lib/auth";
import {
  createDeliverable,
  createSession,
  deleteDeliverable,
  getProjectDetail,
  membersToCsv,
  removeMember,
  reorderDeliverables,
  safeExternalUrl,
  updateMemberDetails,
  updateMemberRole,
  updateSession,
  type ProjectDetail,
  type ProjectMember,
  type ProjectRole,
} from "@/lib/projects";
import { getSignedImageUrls, uploadDeliverableImage } from "@/lib/storage";
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

const PREP_SECTION = "CHURCH PREPARATION";
const OVERVIEW_SECTION = "PROCESS OVERVIEW";

/**
 * A phone photo of a flipchart is a few MB; anything past this is a video
 * someone mis-picked or a RAW file, and pushing it through the browser to
 * Storage would stall the upload with no feedback.
 */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"checking" | "ready" | "not_found" | "error">("checking");
  const [activeModule, setActiveModule] = useState<string>("");

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
      const paths = [
        ...(result.logoPath ? [result.logoPath] : []),
        ...result.deliverables.map((d) => d.image_path).filter((p): p is string => !!p),
      ];
      setImageUrls(await getSignedImageUrls(session.access_token, paths));
    } catch (err) {
      console.error("Project load failed:", err);
      setStatus("error");
    }
  }, [projectId, router]);

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
    const paths = [
      ...(result.logoPath ? [result.logoPath] : []),
      ...result.deliverables.map((d) => d.image_path).filter((p): p is string => !!p),
    ];
    setImageUrls(await getSignedImageUrls(accessToken, paths));
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

  const prepResources = detail.resources.filter((r) => r.section === PREP_SECTION);
  const overviewResources = detail.resources.filter((r) => r.section === OVERVIEW_SECTION);
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
  const claimed = new Set<string>([...modules.map((m) => m.section), PREP_SECTION, OVERVIEW_SECTION]);
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

      <ChurchHero detail={detail} logoUrl={detail.logoPath ? imageUrls[detail.logoPath] : undefined} />

      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
        <VisionStackCard
          projectId={projectId}
          total={stackItems.length}
          ready={stackReady}
          layers={detail.stackLayers}
        />

        <QuickTiles
          prepCount={prepResources.length}
          sessionCount={detail.sessions.length}
          teamCount={detail.members.length}
        />

        {modules.length > 0 && (
          <section className="mt-16">
            <SectionHeading eyebrow="The process" title="Six tools, in order" />
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
            />
          </section>
        )}

        {orphanSections.length > 0 && (
          <section className="mt-16">
            {modules.length > 0 && <SectionHeading eyebrow="Also in this engagement" title="Further materials" />}
            <div className={modules.length > 0 ? "mt-8 space-y-6" : "space-y-6"}>
              {orphanSections.map((section) => (
                <ModulePanel
                  key={section}
                  section={section}
                  detail={detail}
                  imageUrls={imageUrls}
                  canEdit={canEdit}
                  accessToken={accessToken}
                  onChanged={refresh}
                />
              ))}
            </div>
          </section>
        )}

        <PrepareSection
          id="prepare"
          prep={prepResources}
          overview={overviewResources}
        />

        <SessionsSection
          id="sessions"
          sessions={detail.sessions}
          canEdit={canEdit}
          accessToken={accessToken}
          projectId={projectId}
          onChanged={refresh}
        />

        <TeamSection
          id="team"
          detail={detail}
          canManage={canManage}
          accessToken={accessToken}
          projectId={projectId}
          onChanged={refresh}
        />
      </main>

      <PortalFooter />
    </div>
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
function ChurchHero({ detail, logoUrl }: { detail: ProjectDetail; logoUrl?: string }) {
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
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gray-50 ring-1 ring-gray-200">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={org} className="h-full w-full object-contain p-2" />
            ) : (
              <span className="font-display text-2xl font-extrabold tracking-tight text-runfree-navy/40">
                {initials}
              </span>
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
            {detail.about && (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-600">{detail.about}</p>
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
  total,
  ready,
  layers,
}: {
  projectId: string;
  total: number;
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
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/70">
            Four layers, from the convictions underneath it all to the tools that put it to work.
            {total > 0 && (
              <>
                {" "}
                <span className="font-semibold text-white">
                  {ready} of {total}
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
        <ul className="flex shrink-0 flex-col-reverse gap-1.5">
          {layers.map((layer, i) => (
            <li
              key={layer.slug}
              className="rounded-lg bg-white/10 px-4 py-2 text-xs font-semibold text-white/80 ring-1 ring-white/10 transition duration-300 group-hover:bg-white/15"
              style={{
                marginLeft: `${i * 14}px`,
                transitionDelay: `${i * 40}ms`,
              }}
            >
              {layer.name}
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
    { href: "#prepare", label: "Prepare", detail: `${prepCount} to read and watch` },
    { href: "#sessions", label: "Sessions", detail: sessionCount === 1 ? "1 recorded" : `${sessionCount} recorded` },
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
function ModulePanel({
  section,
  detail,
  imageUrls,
  canEdit,
  accessToken,
  onChanged,
}: {
  section: string;
  detail: ProjectDetail;
  imageUrls: Record<string, string>;
  canEdit: boolean;
  accessToken: string | null;
  onChanged: () => void;
}) {
  if (!section) return null;

  const resources = detail.resources.filter((r) => r.section === section);
  // Only handouts that actually resolve somewhere are shown. A card that
  // looks like a document and goes nowhere reads as broken, not as pending.
  const handouts = resources.filter(
    (r) => r.kind === "handout" && (r.external_url || r.drive_file_id)
  );
  const primaryHandout = handouts.find((h) => h.is_primary) ?? handouts[0];
  const otherHandouts = handouts.filter((h) => h.id !== primaryHandout?.id);
  const videos = resources.filter((r) => r.kind === "video" && r.external_url);
  const exercises = resources.filter((r) => r.kind === "exercise" || r.kind === "link");

  const images = detail.deliverables.filter(
    (d) => d.section === section && d.kind === "session_image"
  );
  const moduleDeliverables = detail.deliverables.filter(
    (d) => d.section === section && d.kind === "vision_stack"
  );

  const order = moduleOrder(section);
  const meta = order ? MODULE_META[order] : null;

  // A section whose only rows are handouts and videos with no destination
  // yet has nothing to show. An editor still gets the panel, because the
  // photo drop zone is the point; a client gets nothing rather than a
  // heading over an empty box.
  const hasAnything =
    !!primaryHandout ||
    videos.length > 0 ||
    exercises.length > 0 ||
    images.length > 0 ||
    moduleDeliverables.length > 0;
  if (!hasAnything && !canEdit) return null;

  return (
    <div className="animate-fade mt-2 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-gray-200">
      <div className="h-1 bg-runfree-grad" />
      <div className="space-y-10 p-6 sm:p-9">
        <div>
          <h3 className="font-display text-2xl font-extrabold tracking-tight text-runfree-ink">
            {moduleLabel(section)}
          </h3>
          {meta && <p className="mt-1 text-sm text-gray-500">{meta.stage}</p>}
        </div>

        {primaryHandout && (
          <Block title="Handouts">
            <a
              href={safeExternalUrl(primaryHandout.external_url) ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-4 rounded-2xl bg-runfree-indigo/50 p-5 ring-1 ring-runfree-navy/10 transition hover:bg-runfree-indigo hover:ring-runfree-magenta/30"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-runfree-grad text-white">
                <DocIcon />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-runfree-ink">{primaryHandout.title}</span>
                <span className="mt-0.5 block text-xs text-gray-600">
                  Everything for this module in one file
                </span>
              </span>
              <span
                aria-hidden
                className="ml-auto shrink-0 text-gray-400 transition-transform group-hover:translate-x-1"
              >
                →
              </span>
            </a>

            {otherHandouts.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {otherHandouts.map((h) => (
                  <li key={h.id}>
                    <a
                      href={safeExternalUrl(h.external_url) ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-runfree-magenta/40 hover:text-runfree-ink"
                    >
                      {h.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Block>
        )}

        {videos.length > 0 && (
          <Block title="Watch">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {videos.map((v) => (
                <VideoCard key={v.id} title={v.title} url={v.external_url!} />
              ))}
            </div>
          </Block>
        )}

        {exercises.length > 0 && (
          <Block title="In the room">
            <ul className="flex flex-wrap gap-2">
              {exercises.map((e) => (
                <li
                  key={e.id}
                  className="inline-flex items-center rounded-full bg-gray-50 px-3.5 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-gray-200"
                >
                  {e.title}
                </li>
              ))}
            </ul>
          </Block>
        )}

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
      className="flex h-7 w-7 items-center justify-center rounded-md bg-white/90 text-xs font-bold text-gray-600 shadow-sm outline-none ring-runfree-magenta/60 backdrop-blur transition hover:bg-white hover:text-runfree-magentaDeep focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
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
function VideoCard({ title, url }: { title: string; url: string }) {
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
      <div className="relative flex aspect-video items-center justify-center bg-runfree-navy">
        <span
          aria-hidden
          className="absolute inset-0 bg-runfree-sunset opacity-30 transition-opacity duration-300 group-hover:opacity-50"
        />
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
  onChanged,
}: {
  images: ProjectDetail["deliverables"];
  imageUrls: Record<string, string>;
  canEdit: boolean;
  accessToken: string | null;
  projectId: string;
  section: string;
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

            {canEdit && (
              /* Reordering has to work without a mouse. HTML5 drag events
                 never fire on touch, so on the iPad a coach actually uses in
                 a session the drag below is inert, and it is equally
                 unreachable by keyboard. These buttons are the real control;
                 dragging is the shortcut for people with a mouse.

                 They sit at 60% opacity rather than hidden-until-hover,
                 because hover does not exist on touch either. */
              <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1 opacity-60 transition group-hover:opacity-100 focus-within:opacity-100">
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

function PrepareSection({
  id,
  prep,
  overview,
}: {
  id: string;
  prep: ProjectDetail["resources"];
  overview: ProjectDetail["resources"];
}) {
  if (prep.length === 0 && overview.length === 0) return null;

  const videos = [...prep, ...overview].filter((r) => r.kind === "video" && r.external_url);
  const reading = [...prep, ...overview].filter((r) => r.kind !== "video");

  return (
    <section id={id} className="mt-20 scroll-mt-8">
      <SectionHeading eyebrow="Before you begin" title="Prepare your team" />

      {videos.length > 0 && (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <VideoCard key={v.id} title={v.title} url={v.external_url!} />
          ))}
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
  sessions,
  canEdit,
  accessToken,
  projectId,
  onChanged,
}: {
  id: string;
  sessions: ProjectDetail["sessions"];
  canEdit: boolean;
  accessToken: string | null;
  projectId: string;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !title.trim()) return;
    await createSession(accessToken, projectId, { title: title.trim(), section: null });
    setTitle("");
    setAdding(false);
    onChanged();
  }

  return (
    <section id={id} className="mt-20 scroll-mt-8">
      <SectionHeading eyebrow="Every time we met" title="Session recordings" />

      <div className="mx-auto mt-8 max-w-3xl space-y-3">
        {sessions.length === 0 && (
          <p className="rounded-2xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
            Recordings and notes appear here after each session.
          </p>
        )}

        {sessions.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            canEdit={canEdit}
            accessToken={accessToken}
            onChanged={onChanged}
          />
        ))}

        {canEdit &&
          (adding ? (
            <form
              onSubmit={add}
              className="flex gap-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200"
            >
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Session title, e.g. Module 2 — Crowd Cloud"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
              />
              <button
                type="submit"
                className="rounded-lg bg-runfree-grad-deep px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:text-runfree-ink"
              >
                Cancel
              </button>
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
  session,
  canEdit,
  accessToken,
  onChanged,
}: {
  session: ProjectDetail["sessions"][number];
  canEdit: boolean;
  accessToken: string | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
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
        <span className="min-w-0">
          <span className="block font-semibold text-runfree-ink">{session.title}</span>
          <span className="mt-0.5 block text-xs text-gray-500">
            {session.held_on ?? "Date not set"}
            {!session.published_at && canEdit && " · Draft"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {session.recording_url && (
            <span className="rounded-full bg-runfree-pink px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-runfree-magentaDeep">
              Recording
            </span>
          )}
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
              <Field label="Recording link (Loom or Zoom)">
                <input
                  value={form.recording_url}
                  onChange={(e) => setForm((f) => ({ ...f, recording_url: e.target.value }))}
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
              <Field label="Commitments">
                <textarea
                  rows={2}
                  value={form.commitments}
                  onChange={(e) => setForm((f) => ({ ...f, commitments: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))}
                />
                Visible to the church team
              </label>
              <button
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-runfree-grad-deep px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <>
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
                    Commitments
                  </h5>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
                    {session.commitments}
                  </p>
                </div>
              )}
              {!loomId && !session.takeaways && !session.commitments && (
                <p className="text-sm text-gray-400">Notes from this session are coming.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
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
  detail,
  canManage,
  accessToken,
  projectId,
  onChanged,
}: {
  id: string;
  detail: ProjectDetail;
  canManage: boolean;
  accessToken: string | null;
  projectId: string;
  onChanged: () => void;
}) {
  const [managing, setManaging] = useState(false);

  const runfree = detail.members.filter((m) => m.isStaff);
  const church = detail.members.filter((m) => !m.isStaff);
  const bios = detail.resources.filter((r) => r.kind === "team_bio");

  function downloadCsv() {
    const csv = membersToCsv(church.length > 0 ? church : detail.members);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${detail.name.replace(/[^\w\- ]+/g, "")} — team.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <section id={id} className="mt-20 scroll-mt-8">
      <SectionHeading eyebrow="Who you're working with" title="Your team" />

      {/* RunFree side — the constant two, plus whoever is leading this one. */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {runfree.map((m) => (
          <PersonCard
            key={m.profileId}
            name={m.fullName || m.email}
            role={m.isLead ? "Your Lead Navigator" : m.orgRole || "RunFree"}
            email={m.email}
            highlight={m.isLead}
          />
        ))}
        {bios.map((b) => {
          const [name, role] = b.title.split(/\s+—\s+/);
          return <PersonCard key={b.id} name={name} role={role || "RunFree"} />;
        })}
      </div>

      {/* The church's own team. */}
      <div className="mt-10 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
          <h3 className="font-display text-base font-bold text-runfree-ink">
            Church team
            <span className="ml-2 text-sm font-normal text-gray-400">{church.length}</span>
          </h3>
          <div className="flex items-center gap-2">
            {church.length > 0 && (
              <button
                onClick={downloadCsv}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200 transition hover:text-runfree-ink hover:ring-runfree-magenta/40"
              >
                Export CSV
              </button>
            )}
            {canManage && (
              <button
                onClick={() => setManaging((v) => !v)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-runfree-magentaDeep ring-1 ring-runfree-magenta/30 transition hover:bg-runfree-pink"
              >
                {managing ? "Done" : "Manage"}
              </button>
            )}
          </div>
        </div>

        {church.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-gray-400">
            Nobody from the church has been added yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {church.map((m) => (
              <MemberRow
                key={m.profileId}
                member={m}
                managing={managing && canManage}
                accessToken={accessToken}
                projectId={projectId}
                onChanged={onChanged}
              />
            ))}
          </ul>
        )}

        {canManage && managing && (
          <AddMemberForm
            accessToken={accessToken}
            projectId={projectId}
            onChanged={onChanged}
          />
        )}
      </div>
    </section>
  );
}

function PersonCard({
  name,
  role,
  email,
  highlight,
}: {
  name: string;
  role: string;
  email?: string;
  highlight?: boolean;
}) {
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
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-runfree-grad text-sm font-bold text-white">
        {initials}
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
