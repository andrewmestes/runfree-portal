"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCurrentUser, hasCertificationAccess } from "@/lib/auth";
import { resumeWithFreshTicket } from "@/lib/tool-videos-client";
import { stripModuleNumber } from "@/lib/modules";
import { splitLeadingNumber } from "@/lib/file-number";
import { isClipsFolder, toolVideoShelf, type Shelf } from "@/lib/video-shelf";
import FilePreview, { PreviewFile } from "@/components/FilePreview";
import PageLoader from "@/components/PageLoader";

/**
 * /open/{kind}/{id} — one file, straight away.
 *
 * This is the address the Digital Facilitators' Guide links to. Andrew:
 * "the link on the digital facilitator's guide checks portal access, then
 * displays the handout without going to the actual portal … as quick as
 * possible, so that if someone is facilitating live in the room and they
 * click on the link, it quickly recognizes them and displays the handout
 * they want."
 *
 * So there is no page here to speak of. Signed in and certified: the file
 * opens full-screen in the same viewer the library uses, fetched through the
 * same gated route, and Close goes to that file's shelf. Not signed in: the
 * sign-in page, which brings them straight back here. Not certified: a
 * page saying the link is for Certified Vision Framers.
 *
 * Kinds map onto the gated file routes that already exist; the only new one
 * is `video`, which streams (see lib/tool-videos.ts).
 */
const KINDS: Record<
  string,
  { api: (id: string) => string; back: string; backLabel: string }
> = {
  handout: { api: (id) => `/api/library/file/${id}`, back: "/resources", backLabel: "Handouts" },
  book: { api: (id) => `/api/books/file/${id}`, back: "/books", backLabel: "Books" },
  guide: { api: (id) => `/api/guide/file/${id}`, back: "/guide", backLabel: "Facilitator's Guide" },
  keynote: { api: (id) => `/api/keynotes/ticket/${id}`, back: "/keynotes", backLabel: "Keynotes" },
  // Most guide video links are facilitator walkthroughs, and a bare /videos
  // opens the Client tab, where they are not. The player's own back link
  // picks the tab per video; this one is only for the error screens, which
  // do not know the video.
  video: { api: (id) => `/api/tool-videos/ticket/${id}`, back: "/videos?tab=facilitators", backLabel: "Training Videos" },
  // The hub card links to /open/companion/current; the route resolves it.
  companion: { api: (id) => `/api/companion/file/${id}`, back: "/certification", backLabel: "Certification Hub" },
};

type Status = "checking" | "ready" | "missing" | "error" | "denied";

type DeckFile = {
  id: string;
  format: "keynote" | "powerpoint" | "pdf";
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  url: string;
};

function prettySize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

export default function OpenPage() {
  const params = useParams<{ kind: string; id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const kind = KINDS[params.kind] ? params.kind : null;
  const id = params.id;

  const [status, setStatus] = useState<Status>("checking");
  // A fresh tab has one history entry; set in an effect because the page also renders on the server.
  const [ownTab, setOwnTab] = useState(false);
  useEffect(() => setOwnTab(window.history.length === 1), []);
  const [file, setFile] = useState<PreviewFile | null>(null);
  /**
   * The bytes, not a URL. FilePreview owns the object URL it is handed —
   * it revokes it on unmount and asks again on the next mount (React's dev
   * double-mount does exactly that) — so the page keeps the Blob and mints
   * a fresh URL per request.
   */
  const [blob, setBlob] = useState<Blob | null>(null);
  const [video, setVideo] = useState<{ url: string; title: string; group: string; shelf: Shelf | null } | null>(null);
  /**
   * A presentation is a .key or .pptx — nothing a browser can show — so a
   * deck with a PDF of its slides shows that, with both formats a button
   * away. Without one the page starts the download itself and offers both
   * formats, so a guide icon still "just works" from the front of a room.
   */
  const [deck, setDeck] = useState<{
    title: string;
    requested: DeckFile | null;
    keynote: DeckFile | null;
    powerpoint: DeckFile | null;
    pdf: DeckFile | null;
  } | null>(null);
  /**
   * Which deck button is minting its ticket, and which one failed. The
   * tickets in `deck` last fifteen minutes (lib/file-ticket.ts); a framer who
   * opens the slides from the guide and teaches for twenty then taps
   * "Keynote" got a raw "Not signed in" page. So each click mints its own,
   * the way the Keynotes page does.
   */
  const [deckBusy, setDeckBusy] = useState<string | null>(null);
  const [deckError, setDeckError] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!kind) {
        setStatus("missing");
        return;
      }
      const user = await getCurrentUser();
      if (!user) {
        // Come straight back here after signing in.
        router.replace(`/auth/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      // Two independent questions, asked together — they used to be two
      // round trips in a row before the file was even requested.
      const [allowed, { data: { session } }] = await Promise.all([
        hasCertificationAccess(),
        supabase.auth.getSession(),
      ]);
      if (!allowed) {
        // Say so, rather than bouncing to the home page. A church member who
        // taps a guide link — or a framer whose access has not been granted
        // yet — landed on their dashboard with no idea why.
        setStatus("denied");
        return;
      }
      if (!session) {
        router.replace(`/auth/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const res = await fetch(KINDS[kind].api(id), { headers });
      if (cancelled) return;
      if (res.status === 404) {
        setStatus("missing");
        return;
      }
      // The server's answer wins over the check above. They apply the same
      // rule now, but if they ever drift apart again the reader should be
      // told the link isn't theirs, not "That didn't open" and a Try again
      // that can never work.
      if (res.status === 403) {
        setStatus("denied");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        return;
      }

      if (kind === "video") {
        const body = await res.json();
        // "1.2 …", as the shelf titles it (toolVideosAsVideos on /videos);
        // the label alone dropped the tool number.
        setVideo({
          url: body.url,
          title: body.num ? `${body.num} ${body.label}` : body.label || body.title,
          group: body.group,
          shelf: body.shelf ?? null,
        });
        setStatus("ready");
        // An unnumbered film in a module folder may be a copy of one of the
        // Video Clips (the guide's two Crowd Cloud movie clips are), which
        // only the clips' titles can tell. That takes the folder listing, so
        // it is asked for once the player is up, and the back link is
        // put right when it lands. A failure leaves the neutral link.
        if (!body.shelf) {
          const listRes = await fetch("/api/tool-videos", { headers }).catch(() => null);
          const listed = listRes?.ok ? await listRes.json().catch(() => null) : null;
          if (cancelled || !Array.isArray(listed?.groups)) return;
          const groups: { name: string; order: number; videos: { id: string; num: string | null; label: string }[] }[] =
            listed.groups;
          const home = groups.find((g) => g.videos.some((v) => v.id === id));
          const mine = home?.videos.find((v) => v.id === id);
          if (!home || !mine) return;
          const clips = groups.filter(isClipsFolder).flatMap((g) => g.videos);
          const shelf = toolVideoShelf({ group: home.name, groupOrder: home.order, num: mine.num, label: mine.label }, clips);
          setVideo((cur) => (cur ? { ...cur, shelf } : cur));
        }
        return;
      }

      if (kind === "keynote") {
        const body = await res.json();
        setDeck(body);
        // With a PDF of the slides beside the deck, show that — the deck
        // itself is a download away in the viewer's header. Without one,
        // start the download straight away; the ticketed URL carries an
        // attachment disposition, so the page stays put.
        // The PDF is fetched by its plain URL with the session, not the
        // ticketed one: a ticket changes every time, so the browser could
        // never reuse its copy or send back the ETag, and every open pulled
        // the whole file from Drive again.
        if (body.pdf?.url) {
          const pdfRes = await fetch(`/api/keynotes/file/${encodeURIComponent(body.pdf.id)}`, { headers });
          if (cancelled) return;
          if (pdfRes.ok) {
            const raw = await pdfRes.blob();
            if (cancelled) return;
            setFile({ id: body.pdf.id, title: body.title, num: null, label: body.title, sizeBytes: raw.size });
            setBlob(raw.type === "application/pdf" ? raw : new Blob([raw], { type: "application/pdf" }));
            setStatus("ready");
            return;
          }
        }
        setStatus("ready");
        if (body.requested?.url && body.requested.format !== "pdf") window.location.assign(body.requested.url);
        return;
      }

      // The file's own name travels in Content-Disposition; that is the
      // viewer's title, so the person sees "04 3 Kinds of Change", not an id.
      // The real name is in filename* (lib/content-disposition.ts); the
      // quoted one is its ASCII stand-in, a ’ or – flattened.
      const disposition = res.headers.get("content-disposition") || "";
      const star = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const plain = disposition.match(/filename="?([^";]+)"?/);
      let rawName = plain ? plain[1] : "Document";
      if (star) {
        try {
          rawName = decodeURIComponent(star[1]);
        } catch {
          /* keep the ASCII name */
        }
      }
      // Same clean-up as toTitle() in lib/drive.ts, leading dashes included,
      // so guide 1.7's "-- Future Team Survey" opens as "Future Team Survey".
      const cleaned = rawName
        .replace(/\.[a-z0-9]{1,5}$/i, "")
        .replace(/^\s*[-–—]+\s*/, "")
        .replace(/\s*[-–—]\s*CERT\.?(?=\s|$)/i, "");
      // Will's guide uses hyphens for spaces ("Pivvot-Certification-Companion-Guide").
      // Handout and book names use hyphens on purpose, so only this kind is cleaned.
      const name = kind === "companion" ? cleaned.replace(/[-_]+/g, " ").trim() : cleaned;
      const raw = await res.blob();
      if (cancelled) return;
      const typed =
        raw.type === "application/pdf" || raw.type.startsWith("image/")
          ? raw
          : new Blob([raw], { type: "application/pdf" });
      // The listing's own split (lib/file-number.ts), so a date or a title
      // that starts with a number is not read as a file number here either.
      const { num, rest } = splitLeadingNumber(name);
      setFile({
        id,
        title: name,
        num,
        label: rest,
        sizeBytes: typed.size,
      });
      setBlob(typed);
      setStatus("ready");
    }
    init().catch(() => {
      if (!cancelled) setStatus("error");
    });
    return () => {
      cancelled = true;
    };
  }, [kind, id, pathname, router]);

  // A fresh object URL per ask; the viewer revokes each one it is given.
  const fetchUrl = useCallback(async () => (blob ? URL.createObjectURL(blob) : null), [blob]);

  // The tab says what is open. The layout names the kind; this names the
  // file once it is known, so a handout, a video and the Companion Guide
  // open side by side stop looking identical (see guide/layout.tsx).
  const openTitle = video?.title || deck?.title || file?.title || null;
  useEffect(() => {
    if (openTitle) document.title = `${openTitle} · RunFree Portal`;
  }, [openTitle]);

  /** Mint a fresh ticket for one format and hand it to the browser. */
  async function downloadDeck(f: DeckFile) {
    setDeckBusy(f.id);
    setDeckError(null);
    const failed = () => setDeckError({ id: f.id, message: "That file could not be downloaded. Try again in a moment." });
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace(`/auth/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      const res = await fetch(`/api/keynotes/ticket/${f.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = res.ok ? await res.json() : null;
      if (!body?.requested?.url) {
        failed();
        return;
      }
      window.location.assign(body.requested.url);
    } catch {
      failed();
    } finally {
      setDeckBusy(null);
    }
  }

  const back = kind ? KINDS[kind].back : "/";
  const backLabel = kind ? KINDS[kind].backLabel : "Home";
  /**
   * Close from a tab of its own — a guide icon tapped on a phone, an iPad or
   * in Safari opens its file in a new tab — closes that tab, which brings the
   * framer back to the guide where they were. It used to go to the file's
   * shelf, leaving a second portal tab with the guide somewhere behind it.
   * Where the browser refuses to close the tab, the shelf opens as before.
   */
  function leaveTo(fallback: string) {
    if (ownTab) {
      window.close();
      window.setTimeout(() => router.push(fallback), 300);
      return;
    }
    router.push(fallback);
  }
  const leave = () => leaveTo(back);

  if (status === "checking") return <PageLoader label="Opening…" />;

  if (status === "missing" || status === "error" || status === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-runfree-ink px-4 text-center text-white">
        <div className="max-w-md">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">RunFree Portal</p>
          <h1 className="mt-2 font-display text-2xl font-extrabold">
            {status === "missing"
              ? "That file isn’t in the library"
              : status === "denied"
                ? "This link is for Certified Vision Framers"
                : "That didn’t open"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/70">
            {status === "missing"
              ? `The link may be out of date. The current version is on the ${backLabel} page.`
              : status === "denied"
                ? "It opens the facilitator materials behind the Digital Facilitator's Guide. Everything for your own engagement is on your project."
                : `Something went wrong fetching it. Try again, or find it on the ${backLabel} page.`}
          </p>
          {/* The copy says "Try again"; give it a button. The 404 screen has
              none — reloading cannot bring back a file that is not there. */}
          {status === "error" && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 mr-3 inline-block rounded-lg border border-white/30 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Try again
            </button>
          )}
          <Link
            href={status === "denied" ? "/" : back}
            className="mt-6 inline-block rounded-lg bg-runfree-grad px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {status === "denied" ? "Go to your project" : `Go to ${backLabel}`}
          </Link>
        </div>
      </div>
    );
  }

  if (kind === "keynote" && deck && file && blob) {
    // The slides, with the real deck a click away.
    const deckButton = (f: DeckFile, label: string) => (
      <button
        type="button"
        onClick={() => downloadDeck(f)}
        disabled={deckBusy !== null}
        title={deckError?.id === f.id ? deckError.message : undefined}
        className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-runfree-ink transition hover:border-runfree-magenta disabled:opacity-50 sm:text-sm"
      >
        {deckBusy === f.id ? "Preparing…" : deckError?.id === f.id ? "Try again" : label}
      </button>
    );
    const deckLinks = (
      <>
        {deck.keynote && deckButton(deck.keynote, "Keynote")}
        {deck.powerpoint && deckButton(deck.powerpoint, "PowerPoint")}
      </>
    );
    return (
      <div className="min-h-screen bg-runfree-ink">
        <FilePreview file={file} fetchUrl={fetchUrl} onClose={leave} actions={deckLinks} />
      </div>
    );
  }

  if (kind === "keynote" && deck) {
    const DownloadButton = ({ f, primary }: { f: DeckFile; primary: boolean }) => (
      <button
        type="button"
        onClick={() => downloadDeck(f)}
        disabled={deckBusy !== null}
        className={
          primary
            ? "inline-flex items-center justify-center rounded-lg bg-runfree-grad px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            : "inline-flex items-center justify-center rounded-lg border border-white/30 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
        }
      >
        {deckBusy === f.id ? "Preparing…" : f.format === "keynote" ? "Keynote (.key)" : "PowerPoint (.pptx)"}
        {f.sizeBytes && deckBusy !== f.id ? <span className="ml-2 font-normal text-white/60">{prettySize(f.sizeBytes)}</span> : null}
      </button>
    );
    return (
      <div className="flex min-h-screen items-center justify-center bg-runfree-ink px-4 text-center text-white">
        <div className="max-w-md">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Keynote Presentation</p>
          <h1 className="mt-2 font-display text-2xl font-extrabold">{deck.title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/70">
            {/* "View the slides" asks for the PDF, and a PDF is never
                auto-downloaded, so here it is the slides that failed. */}
            {deck.requested?.format === "pdf"
              ? "The slides didn’t load. Try again, or download the deck below."
              : deck.requested
                ? `Your download of ${deck.requested.name} has started. If it did not, or you want the other format, use a button below.`
                : "Choose a format to download."}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-white/50">
            Presentations open in Keynote or PowerPoint on your computer, not in the browser.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {deck.requested?.format === "pdf" && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center rounded-lg bg-runfree-grad px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Try again
              </button>
            )}
            {deck.keynote && <DownloadButton f={deck.keynote} primary={deck.requested?.format === "keynote"} />}
            {deck.powerpoint && <DownloadButton f={deck.powerpoint} primary={deck.requested?.format === "powerpoint"} />}
          </div>
          {deckError && <p className="mt-3 text-xs text-red-300">{deckError.message}</p>}
          <Link href={back} className="mt-6 inline-block text-sm font-medium text-white/60 transition hover:text-white">
            All {backLabel}
          </Link>
        </div>
      </div>
    );
  }

  if (kind === "video" && video) {
    // Back to the tab this video is on, by /videos's own rules
    // (lib/video-shelf.ts): Video Clips, 0 - Intro and a module folder's
    // copy of a clip are Client Videos, every other walkthrough Facilitator
    // Training. Until the listing has said whether an unnumbered film is a
    // clip, the link claims no tab and opens the page as the top bar does.
    const shelfLink =
      video.shelf === "clients"
        ? { href: "/videos", label: "All Client Videos" }
        : video.shelf === "facilitators"
          ? { href: "/videos?tab=facilitators", label: "All Facilitator Training" }
          : { href: "/videos", label: "All Training Videos" };
    return (
      <div className="flex min-h-screen flex-col bg-black text-white">
        <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">
              {stripModuleNumber(video.group)}
            </p>
            <h1 className="truncate font-display text-base font-semibold">{video.title}</h1>
          </div>
          {ownTab ? (
            <button
              type="button"
              onClick={() => leaveTo(shelfLink.href)}
              className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              Close
            </button>
          ) : (
            <Link
              href={shelfLink.href}
              className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              {shelfLink.label}
            </Link>
          )}
        </header>
        <div className="flex flex-1 items-center justify-center">
          <video
            key={video.url}
            src={video.url}
            controls
            autoPlay
            playsInline
            preload="metadata"
            onError={(e) => void resumeWithFreshTicket(e.currentTarget, id)}
            className="max-h-[calc(100vh-4rem)] w-full"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-runfree-ink">
      {file && blob && (
        <FilePreview
          file={file}
          fetchUrl={fetchUrl}
          onClose={leave}
          resumeKey={kind === "guide" ? `guide-page:${file.id}` : undefined}
        />
      )}
    </div>
  );
}
