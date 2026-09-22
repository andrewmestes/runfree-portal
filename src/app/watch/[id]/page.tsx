import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { parseVideoUrl, splitVideoMeta } from "@/lib/video";
import { resolveLoomThumbnails } from "@/lib/loom";

/**
 * /watch/{id} — a client-facing teaching video, open to anyone with the link.
 *
 * Andrew, 22 Sept 2026, on how a Certified Vision Framer shares a video
 * with a client: the client-facing videos "can all be open for anyone to
 * view at any time." So this page has no sign-in and no way into the
 * portal — a board member or a pastor still being courted sees the film,
 * the RunFree and Pivvot marks, and nothing that asks them to log in.
 *
 * Only rows in `training_videos` are reachable here, and only the ones
 * that embed (Loom, YouTube, Vimeo). The Drive clips are deliberately not:
 * they stream through a ticket that needs a signed-in framer, and several
 * are third-party films whose public hosting is Andrew's call, not ours.
 * The facilitator walkthroughs never get a public address at all.
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
  const video = await loadVideo(id);
  if (!video) notFound();
  const parsed = parseVideoUrl(video.url);
  const { duration, subtitle } = splitVideoMeta(video.description);

  return (
    <div className="flex min-h-screen flex-col bg-runfree-navy">
      <div className="h-1.5 bg-runfree-grad" />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-6 sm:px-6 lg:px-8">
        <a href="https://runfree.co" target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
          <Image src="/brand/runfree-logo-white.png" alt="RunFree" width={200} height={88} priority className="h-8 w-auto" />
        </a>
        <Image src="/brand/pivvot-badge-white.svg" alt="Pivvot Vision Framing" width={96} height={64} className="h-12 w-auto opacity-90" />
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 sm:px-6 lg:px-8">
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
      </main>

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
