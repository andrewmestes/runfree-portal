"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { getCurrentFramer, hasCertificationAccess, logout } from "@/lib/auth";
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
  url: string;
  description: string | null;
  module: string | null;
  sort_order: number;
  /** Resolved and verified server-side; null means show the branded card. */
  thumbnailUrl: string | null;
};

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

export default function VideosPage() {
  const [framer, setFramer] = useState<Framer | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [status, setStatus] = useState<
    "checking" | "denied" | "ready" | "error"
  >("checking");
  const [loadError, setLoadError] = useState("");
  const [playing, setPlaying] = useState<Video | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
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

      const current = (await getCurrentFramer()) as Framer | null;
      if (!(await hasCertificationAccess())) {
        setStatus("denied");
        return;
      }
      setFramer(current);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        const res = await fetch("/api/videos", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const body = await res.json();
        if (!res.ok) {
          setLoadError(body.error || "Could not load the videos.");
        } else {
          setVideos(body.videos || []);
        }
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

  const closePlayer = useCallback(() => setPlaying(null), []);
  useFocusTrap(playerRef, closePlayer, Boolean(playing));

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

    return [...byKey.values()].sort(
      (a, b) => a.rank - b.rank || a.label.localeCompare(b.label)
    );
  }, [videos, needle]);

  const total = groups.reduce((n, g) => n + g.videos.length, 0);

  if (status === "error") {
    return <AccessError onRetry={() => window.location.reload()} />;
  }

  if (status === "checking" || status === "denied") {
    return <PageLoader label="Checking your access…" />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <PortalHeader
        section="certification"
        backHref="/certification"
        backLabel="Certification hub"
        framer={framer}
        onSignOut={handleSignOut}
        title="Training Videos"
        subtitle="Walkthroughs and coaching for facilitating the tools"
        badge
      />

      <main className="flex-1 mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {loadError && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {videos.length > 0 && (
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search videos…"
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
            <p className="mt-2 text-sm text-gray-500">Try a different search.</p>
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
                      onPlay={() => {
                        const parsed = parseVideoUrl(v.url);
                        if (parsed.embedUrl) setPlaying(v);
                        else window.open(parsed.watchUrl, "_blank");
                      }}
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
          onClick={() => setPlaying(null)}
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
                <a
                  href={parseVideoUrl(playing.url).watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-gray-500 transition hover:text-runfree-magentaDeep"
                >
                  Open original
                </a>
                <button
                  onClick={() => setPlaying(null)}
                  className="rounded-lg px-3 py-1 text-sm font-medium text-gray-500 transition hover:text-runfree-magentaDeep"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="aspect-video w-full">
              <iframe
                src={parseVideoUrl(playing.url).embedUrl || ""}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                title={playing.title}
              />
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
  onPlay,
}: {
  video: Video;
  moduleOrder: number;
  index: number;
  onPlay: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const { duration, subtitle } = splitVideoMeta(video.description);
  const showThumb = Boolean(video.thumbnailUrl) && !failed;

  return (
    <button
      onClick={onPlay}
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
