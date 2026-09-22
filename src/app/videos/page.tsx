"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { getCurrentFramer, getCurrentUser, hasCertificationAccess, logout } from "@/lib/auth";
import { parseVideoUrl, splitVideoMeta } from "@/lib/video";
import { isProcessModule, stripModuleNumber } from "@/lib/modules";
import PortalHeader from "@/components/PortalHeader";
import PageLoader from "@/components/PageLoader";
import { useFocusTrap } from "@/lib/useFocusTrap";
import AccessError from "@/components/AccessError";
import PortalFooter from "@/components/PortalFooter";

type Framer = {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
};

type Video = {
  id: string;
  title: string;
  /**
   * A Loom/YouTube/Vimeo link for the training videos in the database, or
   * `drive:<fileId>` for a Process Tools video streamed from Drive through
   * /api/tool-videos — see lib/tool-videos.ts.
   */
  url: string;
  description: string | null;
  module: string | null;
  sort_order: number;
  /** Resolved and verified server-side; null means show the branded card. */
  thumbnailUrl: string | null;
  /**
   * Who the video is for. The database rows are the client-facing teaching
   * videos a Certified Vision Framer shows the teams they lead; the Process
   * Tools walkthroughs read from Drive train the facilitator and are not
   * for clients. Andrew, 22 Sept: "I need to be able to distinguish between
   * videos that our certified guys can use to train their clients, and the
   * videos that are created to train them as a trainer."
   */
  audience: Audience;
};

type Audience = "clients" | "facilitators";

const TABS: { key: Audience; label: string; blurb: string }[] = [
  { key: "clients", label: "Client Videos", blurb: "Teaching videos and the guide's clips, for the teams you lead." },
  { key: "facilitators", label: "Facilitator Training", blurb: "Tool walkthroughs that train you as the facilitator — not for clients." },
];

type Group = {
  key: string;
  label: string;
  /** Leading number of the module folder — drives which process icon shows. */
  order: number;
  /** Lowest sort_order in the group; this is what orders the groups. */
  rank: number;
  videos: Video[];
};

function leadingNumber(name: string): number {
  const m = name.match(/^\s*(\d+)/);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
}

/**
 * Poster frames for the Drive walkthroughs, checked into
 * public/brand/videos/drive/<id>.jpg (scripts/_posters.ts pulled one clean
 * frame per file). Before these, fifty of the eighty-four cards were the same
 * pink-to-blue gradient, and a wall of identical cards is a wall, not a shelf.
 * A video missing from the manifest falls back to the gradient, so a new
 * upload never breaks the page — it just waits for its poster.
 */
import DRIVE_POSTERS from "@/lib/drive-posters.json";
const POSTERS = new Set<string>(DRIVE_POSTERS as string[]);

const DRIVE_PREFIX = "drive:";
const isDriveVideo = (v: Video) => v.url.startsWith(DRIVE_PREFIX);
const driveId = (v: Video) => v.url.slice(DRIVE_PREFIX.length);

type ToolVideoGroup = {
  id: string;
  name: string;
  order: number;
  videos: { id: string; title: string; num: string | null; label: string; sizeBytes: number | null }[];
};

/**
 * The Process Tools Videos folder as Video rows. They fall in behind the
 * database videos of the same module (sort_order past anything the admin
 * screen assigns), so a module heading holds both and the walkthrough order
 * is the folder's own.
 */
/**
 * The unnumbered "Video Clips" folder holds the films the guide's text links
 * to — the movie clips, the Carey Nieuwhof interview — which a facilitator
 * plays for the room. Andrew, 22 Sept: "the linked movie clips or carey
 * nieuhoeff video, the ones that were linked in the text of the digital
 * facilitator's guide. those are also client facing videos." So that folder
 * is a client shelf; every numbered module folder trains the facilitator.
 */
const isClipsFolder = (g: ToolVideoGroup) =>
  g.order === Number.MAX_SAFE_INTEGER && /clip/i.test(g.name);

const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Three of those clips also sit inside the Crowd Cloud folder under the
 * same name. Same film, so the copy under the module heading is dropped
 * and the Video Clips one stands for it — otherwise the client shelf would
 * lose them to the facilitator shelf, or show them twice.
 */
function dropClipTwins(tools: Video[]): Video[] {
  const clips = new Set(tools.filter((v) => v.audience === "clients").map((v) => normTitle(v.title)));
  return tools.filter((v) => v.audience === "clients" || !clips.has(normTitle(v.title)));
}

function toolVideosAsVideos(groups: ToolVideoGroup[]): Video[] {
  const out: Video[] = [];
  for (const g of groups) {
    g.videos.forEach((v, i) => {
      out.push({
        id: `drive-${v.id}`,
        title: v.num ? `${v.num} ${v.label}` : v.label,
        url: `${DRIVE_PREFIX}${v.id}`,
        description: null,
        module: g.name,
        sort_order: 100_000 + g.order * 1000 + i,
        thumbnailUrl: POSTERS.has(v.id) ? `/brand/videos/drive/${v.id}.jpg` : null,
        audience: isClipsFolder(g) ? "clients" : "facilitators",
      });
    });
  }
  return out;
}

/**
 * The Drive folder "0 - Intro" holds the same five films as the Orientation
 * shelf — the Ted Talk, the book backstory, Why I Wrote the Book, the Long
 * Hollow testimony — so the page opened with an "Orientation" row and an
 * "Intro" row that were the same videos twice. The database rows are the
 * curated ones (they carry a description and a Loom still), so a Drive intro
 * that matches one by title is dropped, and any that does not match joins
 * the Orientation group instead of standing in its own.
 */
function foldIntroIntoOrientation(db: Video[], tools: Video[]): Video[] {
  const words = (t: string) =>
    new Set(t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !["the", "and", "for", "with"].includes(w)));
  const same = (a: string, b: string) => {
    const A = words(a), B = words(b);
    if (!A.size || !B.size) return false;
    let hit = 0;
    for (const w of A) if (B.has(w)) hit++;
    return hit / Math.min(A.size, B.size) >= 0.6;
  };
  const orientation = db.find((v) => /orientation/i.test(v.module || ""))?.module ?? null;
  return tools.flatMap((v) => {
    if (!/^intro$/i.test(stripModuleNumber(v.module || ""))) return [v];
    const twin = db.find((d) => same(d.title, v.title));
    if (twin) {
      // Same film. The curated row keeps its place; if it has no still of
      // its own (a Loom whose preview is the black pre-roll), it wears the
      // Drive copy's poster rather than the gradient.
      if (!twin.thumbnailUrl && v.thumbnailUrl) twin.thumbnailUrl = v.thumbnailUrl;
      return [];
    }
    // It joins the client-facing shelf: the Intro folder is the same set
    // of films as Orientation, which is what a client sees first.
    return orientation ? [{ ...v, module: orientation, audience: "clients" }] : [v];
  });
}

export default function VideosPage() {
  const [framer, setFramer] = useState<Framer | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [status, setStatus] = useState<
    "checking" | "loading" | "denied" | "ready" | "error"
  >("checking");
  const [loadError, setLoadError] = useState("");
  /**
   * Which shelf is showing. Kept in the URL (?tab=facilitators) so a shared
   * link, a refresh and the Back button all land on the same shelf.
   */
  const [tab, setTab] = useState<Audience>("clients");
  useEffect(() => {
    const read = () =>
      setTab(new URLSearchParams(window.location.search).get("tab") === "facilitators" ? "facilitators" : "clients");
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const goTab = useCallback((next: Audience) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "clients") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.pushState(null, "", url);
  }, []);
  const [playing, setPlaying] = useState<Video | null>(null);
  /** The ticketed stream address for a Drive video while it plays. */
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser();

      if (!user) {
        router.replace("/auth/login");
        return;
      }

      // Independent questions, asked together. They used to be awaited one
      // after the other, which meant two full round-trips where one would do.
      const [current, allowed] = await Promise.all([
        getCurrentFramer() as Promise<Framer | null>,
        hasCertificationAccess(),
      ]);
      if (!allowed) {
        setStatus("denied");
        return;
      }
      // Access is settled; the wait from here is Drive. "Checking your access"
      // through that read as a permissions problem to people who had access.
      setStatus("loading");
      setFramer(current);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        const headers = { Authorization: `Bearer ${session.access_token}` };
        // Two shelves, one page: the training videos in the database and
        // the Process Tools walkthroughs read live from Drive.
        const [res, toolRes] = await Promise.all([
          fetch("/api/videos", { headers }),
          fetch("/api/tool-videos", { headers }).catch(() => null),
        ]);
        const body = await res.json();
        if (!res.ok) {
          setLoadError(body.error || "Could not load the videos.");
        }
        let tools: Video[] = [];
        if (toolRes && toolRes.ok) {
          const toolBody = await toolRes.json();
          tools = dropClipTwins(toolVideosAsVideos(toolBody.groups || []));
        }
        const dbVideos: Video[] = (res.ok ? body.videos || [] : []).map(
          (v: Omit<Video, "audience">) => ({ ...v, audience: "clients" as const })
        );
        setVideos([...dbVideos, ...foldIntroIntoOrientation(dbVideos, tools)]);
      }

      setStatus("ready");
    }

    init().catch((err) => {

      console.error("Videos init failed:", err);

      setStatus("error");

    });
  }, [router]);

  /**
   * Navigation is a side effect, so it belongs here rather than in the render
   * body. Calling router.replace() during render violates React's rules and,
   * with reactStrictMode on, ran twice per mount.
   */
  useEffect(() => {
    if (status === "denied") router.replace("/");
  }, [status, router]);

  const closePlayer = useCallback(() => {
    setPlaying(null);
    setStreamUrl(null);
  }, []);
  useFocusTrap(playerRef, closePlayer, Boolean(playing));

  /**
   * A Drive video needs a ticket before the video tag can ask for bytes —
   * the tag cannot send the session header, so the page trades the session
   * for a short-lived address first. See lib/tool-videos.ts.
   */
  const play = useCallback(async (v: Video) => {
    if (!isDriveVideo(v)) {
      const parsed = parseVideoUrl(v.url);
      if (parsed.embedUrl) setPlaying(v);
      else window.open(parsed.watchUrl, "_blank");
      return;
    }
    setOpening(v.id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/tool-videos/ticket/${driveId(v)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setLoadError("That video could not be opened. Try again in a moment.");
        return;
      }
      const body = await res.json();
      setStreamUrl(body.url);
      setPlaying(v);
    } finally {
      setOpening(null);
    }
  }, []);

  async function handleSignOut() {
    await logout();
    router.replace("/auth/login");
  }

  const needle = query.trim().toLowerCase();

  /**
   * Group by module, ordering the groups by the lowest sort_order they
   * contain rather than by the folder's leading number. sort_order is the
   * field the admin screen already exposes, and it encodes the real
   * sequence — including where unnumbered groups like "Orientation" belong,
   * which a name-based rule would have no way to know.
   */
  const groups = useMemo<Group[]>(() => {
    const byKey = new Map<string, Group>();

    for (const v of videos) {
      if (v.audience !== tab) continue;
      if (
        needle &&
        !v.title.toLowerCase().includes(needle) &&
        !(v.module || "").toLowerCase().includes(needle)
      ) {
        continue;
      }

      const key = v.module?.trim() || "General";
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          label: stripModuleNumber(key),
          order: leadingNumber(key),
          rank: v.sort_order,
          videos: [],
        });
      }
      const group = byKey.get(key)!;
      group.rank = Math.min(group.rank, v.sort_order);
      group.videos.push(v);
    }

    // Numbered modules sit in their number order. An unnumbered group that
    // holds database videos (Orientation) keeps its sort_order place ahead
    // of them; an unnumbered group that holds only Drive videos (Video
    // Clips) goes last. Before the Drive walkthroughs joined, sort_order
    // alone could do this, since every group had one; a Drive-only module
    // like Kingdom Platform has none and was landing after Horizon
    // Storyline.
    const position = (g: Group) =>
      g.order !== Number.MAX_SAFE_INTEGER
        ? 100_000 + g.order * 1000
        : g.rank < 100_000
          ? g.rank
          : Number.MAX_SAFE_INTEGER;
    return [...byKey.values()].sort(
      (a, b) => position(a) - position(b) || a.rank - b.rank || a.label.localeCompare(b.label)
    );
  }, [videos, needle, tab]);

  const total = groups.reduce((n, g) => n + g.videos.length, 0);
  const counts = useMemo(() => {
    const c: Record<Audience, number> = { clients: 0, facilitators: 0 };
    for (const v of videos) c[v.audience]++;
    return c;
  }, [videos]);
  const shelf = TABS.find((t) => t.key === tab)!;

  if (status === "error") {
    return <AccessError onRetry={() => window.location.reload()} />;
  }

  if (status === "checking" || status === "denied") {
    return <PageLoader label="Checking your access…" />;
  }
  if (status === "loading") return <PageLoader label="Loading the videos…" />;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <PortalHeader
        section="certification"
        backHref="/certification"
        backLabel="Certification hub"
        framer={framer}
        onSignOut={handleSignOut}
        title="Training Videos"
        subtitle="Videos to show your clients, and the walkthroughs that train you"
        badge
      />

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {loadError && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {videos.length > 0 && (
          <div
            role="tablist"
            aria-label="Who the videos are for"
            className="mb-8 grid gap-3 sm:grid-cols-2"
          >
            {TABS.map((t) => {
              const active = t.key === tab;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => goTab(t.key)}
                  className={`relative overflow-hidden rounded-2xl border px-5 py-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-runfree-magenta/40 ${
                    active
                      ? "border-transparent bg-white shadow-md ring-1 ring-runfree-magenta/30"
                      : "border-gray-200 bg-white/60 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`absolute inset-x-0 top-0 h-1 ${active ? "bg-runfree-grad" : "bg-gray-200"}`}
                  />
                  <span className="flex items-center justify-between gap-3">
                    <span className={`font-display text-base font-bold ${active ? "text-runfree-ink" : "text-gray-600"}`}>
                      {t.label}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        active ? "bg-runfree-pink text-runfree-magentaDeep" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {counts[t.key]}
                    </span>
                  </span>
                  <span className={`mt-1 block text-sm ${active ? "text-gray-600" : "text-gray-500"}`}>
                    {t.blurb}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {videos.length > 0 && (
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${shelf.label.toLowerCase()}…`}
              className="w-full max-w-sm rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none transition placeholder:text-gray-500 focus:border-runfree-magenta focus:ring-2 focus:ring-runfree-magenta/25"
            />
            <span className="text-sm text-gray-500">
              {total} {total === 1 ? "video" : "videos"}
              {needle && " matching"}
            </span>
          </div>
        )}

        {videos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center">
            <p className="font-display text-lg font-semibold text-runfree-ink">
              No videos yet
            </p>
            <p className="mt-2 text-sm text-gray-500">
              {framer?.is_admin
                ? "Add one from Admin → Training Videos."
                : "Training videos will appear here as they're added."}
            </p>
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center">
            <p className="font-display text-lg font-semibold text-runfree-ink">
              No matches
            </p>
            <p className="mt-2 text-sm text-gray-500">
              {needle ? "Try a different search, or the other tab." : `No ${shelf.label.toLowerCase()} yet.`}
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {groups.map((group, gi) => (
              <section key={group.key}>
                {/* A full-width rule between modules. Without it the grid ran
                    on as one continuous field of cards and the group headings
                    had to do all the work of signalling a new section. */}
                {gi > 0 && (
                  <div
                    aria-hidden
                    className="mb-10 h-px w-full bg-gradient-to-r from-transparent via-runfree-magenta/35 to-transparent"
                  />
                )}

                {/* A fixed-width icon slot keeps every group title on the same
                    left edge, whether or not the group is one of the six
                    numbered tools. Orientation used to sit out of line. */}
                <header className="mb-4 flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center">
                    {isProcessModule(group.order) ? (
                      <Image
                        src={`/brand/modules/${group.order}.png`}
                        alt=""
                        width={40}
                        height={40}
                        className="h-9 w-9 object-contain"
                      />
                    ) : (
                      <span className="h-6 w-1.5 rounded-full bg-runfree-grad" />
                    )}
                  </span>
                  <h2 className="font-display text-xl font-bold text-runfree-ink">
                    {group.label}
                  </h2>
                  <span className="rounded-full bg-runfree-indigo px-2.5 py-0.5 text-xs font-semibold text-runfree-navy">
                    {group.videos.length}
                  </span>
                </header>

                {/* Four across on wide screens: at three, twenty videos ran to
                    a four-thousand-pixel page with only three visible at a
                    time. */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.videos.map((v, i) => (
                    <VideoCard
                      key={v.id}
                      video={v}
                      moduleOrder={group.order}
                      index={i}
                      busy={opening === v.id}
                      onPlay={() => void play(v)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <PortalFooter />

      {playing && (
        <div
          className="animate-fade fixed inset-0 z-50 flex items-center justify-center bg-runfree-ink/85 p-4"
          onClick={closePlayer}
        >
          <div
            ref={playerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="player-title"
            tabIndex={-1}
            className="w-full max-w-4xl overflow-hidden rounded-2xl bg-black shadow-2xl outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1.5 bg-runfree-grad" />
            <div className="flex items-center justify-between gap-3 bg-white px-5 py-3">
              <h3
                id="player-title"
                className="min-w-0 truncate font-display text-base font-semibold text-runfree-ink"
              >
                {playing.title}
              </h3>
              <div className="flex shrink-0 items-center gap-3">
                {isDriveVideo(playing) ? (
                  <a
                    href={`/open/video/${driveId(playing)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-gray-500 transition hover:text-runfree-magentaDeep"
                  >
                    Open full screen
                  </a>
                ) : (
                  <a
                    href={parseVideoUrl(playing.url).watchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-gray-500 transition hover:text-runfree-magentaDeep"
                  >
                    Open original
                  </a>
                )}
                <button
                  onClick={closePlayer}
                  className="rounded-lg px-3 py-1 text-sm font-medium text-gray-500 transition hover:text-runfree-magentaDeep"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="aspect-video w-full">
              {isDriveVideo(playing) ? (
                <video
                  key={streamUrl || playing.id}
                  src={streamUrl || undefined}
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                  className="h-full w-full bg-black"
                />
              ) : (
                <iframe
                  src={parseVideoUrl(playing.url).embedUrl || ""}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                  title={playing.title}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VideoCard({
  video,
  moduleOrder,
  index,
  busy = false,
  onPlay,
}: {
  video: Video;
  moduleOrder: number;
  index: number;
  busy?: boolean;
  onPlay: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const { duration, subtitle } = splitVideoMeta(video.description);
  const showThumb = Boolean(video.thumbnailUrl) && !failed;

  return (
    <button
      onClick={onPlay}
      aria-busy={busy}
      style={{ "--delay": `${Math.min(index, 8) * 45}ms` } as React.CSSProperties}
      className="animate-rise group flex flex-col overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-gray-200 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-runfree-magenta/30"
    >
      <div className="relative aspect-video overflow-hidden bg-runfree-sunset">
        {showThumb ? (
          <Image
            src={video.thumbnailUrl!}
            alt=""
            fill
            sizes="(min-width: 1024px) 400px, (min-width: 768px) 50vw, 100vw"
            className="object-cover transition duration-300 group-hover:scale-[1.03]"
            onError={() => setFailed(true)}
          />
        ) : (
          /* Branded fallback rather than a bare gradient: the module icon
             says which tool this belongs to, which is more use than an
             empty box when Loom won't give us a still. */
          isProcessModule(moduleOrder) && (
            <Image
              src={`/brand/modules/${moduleOrder}.png`}
              alt=""
              width={96}
              height={96}
              className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 object-contain opacity-30 brightness-0 invert"
            />
          )
        )}

        <span className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />

        {/* Lighter at rest, solid on hover: twenty opaque white discs on one
            page competed with the thumbnails they sit on. */}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/80 shadow-md backdrop-blur-sm transition duration-300 group-hover:scale-110 group-hover:bg-white group-hover:shadow-lg">
            <svg
              viewBox="0 0 24 24"
              className="ml-0.5 h-5 w-5 fill-runfree-magenta"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>

        {duration && (
          <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {duration}
          </span>
        )}
        {busy && (
          <span className="absolute bottom-2 left-2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            Opening…
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-display text-[15px] font-semibold leading-snug text-runfree-ink">
          {video.title}
        </h3>
        {subtitle && (
          <p className="mt-1.5 text-sm leading-snug text-gray-500">{subtitle}</p>
        )}
      </div>
    </button>
  );
}
