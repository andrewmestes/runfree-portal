import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { parseVideoUrl, splitVideoMeta } from "@/lib/video";
import { resolveLoomThumbnails } from "@/lib/loom";
import { clipShareBySlug, type ClipShare } from "@/lib/clip-shares";

/**
 * /watch/{id} — a client-facing teaching video, open to anyone with the link.
 *
 * Andrew, 22 Sept 2026, on how a Certified Vision Framer shares a video
 * with a client: the client-facing videos "can all be open for anyone to
 * view at any time." So this page has no sign-in and no way into the
 * portal — a board member or a pastor still being courted sees the film,
 * the RunFree and Pivvot marks, and nothing that asks them to log in.
 *
 * Two kinds of address. /watch/{uuid} is a `training_videos` row that
 * embeds (Loom, YouTube, Vimeo). /watch/{slug} is one of the Video Clips
 * films (lib/clip-shares.ts), and it plays the rights-holder's own public
 * version — never our Drive copy, which streams only to a signed-in framer —
 * or links out to it where it cannot be embedded. The facilitator
 * walkthroughs never get a public address at all.
 */

export const dynamic = "force-dynamic";

type Row = { id: string; title: string; url: string; description: string | null; module: string | null };

async function loadVideo(id: string): Promise<Row | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabaseAdmin
    .from("training_videos")
    .select("id,title,url,description,module")
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();
  if (!data) return null;
  const row = data as Row;
  return parseVideoUrl(row.url).embedUrl ? row : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const clip = clipShareBySlug.get(id);
  if (clip) {
    return {
      title: `${clip.title} · RunFree`,
      description: clip.about,
      openGraph: { title: clip.title, description: clip.about, type: "video.other", images: [{ url: clip.poster }] },
      twitter: { card: "summary_large_image", title: clip.title, description: clip.about },
    };
  }
  const video = await loadVideo(id);
  if (!video) return { title: "Video · RunFree" };
  const { subtitle } = splitVideoMeta(video.description);
  const description = subtitle || "A teaching video from RunFree's Pivvot Vision Framing process.";
  let image: string | undefined;
  try {
    image = (await resolveLoomThumbnails([video.url]))[video.url] || parseVideoUrl(video.url).thumbnailUrl || undefined;
  } catch {
    image = undefined;
  }
  return {
    title: `${video.title} · RunFree`,
    description,
    openGraph: { title: video.title, description, type: "video.other", ...(image ? { images: [{ url: image }] } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary", title: video.title, description },
  };
}

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clip = clipShareBySlug.get(id);
  if (clip) return <ClipWatch clip={clip} />;
  const video = await loadVideo(id);
  if (!video) notFound();
  const parsed = parseVideoUrl(video.url);
  const { duration, subtitle } = splitVideoMeta(video.description);

  return (
    <WatchShell>
        <div className="overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/10">
          <div className="aspect-video w-full">
            <iframe
              src={parsed.embedUrl || ""}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              title={video.title}
            />
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-3xl text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-runfree-pink/90">
            Pivvot Vision Framing
            {duration ? <span className="text-white/50"> · {duration}</span> : null}
          </p>
          <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl" style={{ textWrap: "balance" }}>
            {video.title}
          </h1>
          {subtitle && <p className="mt-3 text-base leading-relaxed text-white/75">{subtitle}</p>}
          <p className="mt-6 text-sm text-white/55">
            Shared with you by a Certified Vision Framer. Part of the process RunFree uses to help churches run free into what Jesus started.
          </p>
        </div>
    </WatchShell>
  );
}

/**
 * A Video Clips film: the rights-holder's own player when it embeds, and
 * always a plain link to the original, so the source is named and the film
 * still opens if the embed is ever withdrawn.
 */
function ClipWatch({ clip }: { clip: ClipShare }) {
  return (
    <WatchShell>
      <div className="overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/10">
        {clip.embed ? (
          <div className="aspect-video w-full">
            <iframe
              src={clip.embed}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              title={clip.title}
            />
          </div>
        ) : (
          <a
            href={clip.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative block aspect-video w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a local poster or a remote thumbnail */}
            <img src={clip.poster} alt="" className="h-full w-full object-cover opacity-70 transition group-hover:opacity-80" />
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg transition group-hover:scale-105">
                <svg viewBox="0 0 20 20" className="ml-1 h-7 w-7 text-runfree-ink" fill="currentColor" aria-hidden="true">
                  <path d="M6.5 4.5l9 5.5-9 5.5z" />
                </svg>
              </span>
              <span className="rounded-full bg-black/60 px-4 py-1.5 text-sm font-semibold text-white">Watch on {clip.source}</span>
            </span>
          </a>
        )}
      </div>

      <div className="mx-auto mt-8 max-w-3xl text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-runfree-pink/90">Pivvot Vision Framing</p>
        <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl" style={{ textWrap: "balance" }}>
          {clip.title}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-white/75">{clip.about}</p>
        <p className="mt-3 text-sm text-white/55">
          From {clip.source} ·{" "}
          <a href={clip.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-white/80 underline decoration-white/30 underline-offset-2 transition hover:text-white">
            Watch the original
          </a>
        </p>
        <p className="mt-6 text-sm text-white/55">
          Shared with you by a Certified Vision Framer. Part of the process RunFree uses to help churches run free into what Jesus started.
        </p>
      </div>
    </WatchShell>
  );
}

/** The frame every /watch page shares: the marks, the main column, the footer. */
function WatchShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-runfree-navy">
      <div className="h-1.5 bg-runfree-grad" />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-6 sm:px-6 lg:px-8">
        <a href="https://runfree.co" target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
          <Image src="/brand/runfree-logo-white.png" alt="RunFree" width={200} height={88} priority className="h-8 w-auto" />
        </a>
        <Image src="/brand/pivvot-badge-white.svg" alt="Pivvot Vision Framing" width={96} height={64} className="h-12 w-auto opacity-90" />
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 sm:px-6 lg:px-8">{children}</main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-white/50 sm:px-6 lg:px-8">
          <span>© {new Date().getFullYear()} RunFree. All rights reserved.</span>
          <a href="https://runfree.co" target="_blank" rel="noopener noreferrer" className="transition hover:text-white">
            runfree.co
          </a>
        </div>
      </footer>
    </div>
  );
}
