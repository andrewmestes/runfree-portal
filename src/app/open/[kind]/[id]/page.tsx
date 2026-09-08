"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCurrentUser, hasCertificationAccess } from "@/lib/auth";
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
 * sign-in page, which brings them straight back here. Not certified: home.
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
  video: { api: (id) => `/api/tool-videos/ticket/${id}`, back: "/videos", backLabel: "Training Videos" },
};

type Status = "checking" | "ready" | "missing" | "error";

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
  const [file, setFile] = useState<PreviewFile | null>(null);
  /**
   * The bytes, not a URL. FilePreview owns the object URL it is handed —
   * it revokes it on unmount and asks again on the next mount (React's dev
   * double-mount does exactly that) — so the page keeps the Blob and mints
   * a fresh URL per request.
   */
  const [blob, setBlob] = useState<Blob | null>(null);
  const [video, setVideo] = useState<{ url: string; title: string; group: string } | null>(null);
  /**
   * A presentation is a .key or .pptx — nothing a browser can show. The
   * page starts the download itself and offers both formats, so a guide
   * icon still "just works" from the front of a room.
   */
  const [deck, setDeck] = useState<{
    title: string;
    requested: DeckFile | null;
    keynote: DeckFile | null;
    powerpoint: DeckFile | null;
    pdf: DeckFile | null;
  } | null>(null);

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
      if (!(await hasCertificationAccess())) {
        router.replace("/");
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
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
      if (!res.ok) {
        setStatus("error");
        return;
      }

      if (kind === "video") {
        const body = await res.json();
        setVideo({ url: body.url, title: body.label || body.title, group: body.group });
        setStatus("ready");
        return;
      }

      if (kind === "keynote") {
        const body = await res.json();
        setDeck(body);
        // With a PDF of the slides beside the deck, show that — the deck
        // itself is a download away in the viewer's header. Without one,
        // start the download straight away; the ticketed URL carries an
        // attachment disposition, so the page stays put.
        if (body.pdf?.url) {
          const pdfRes = await fetch(body.pdf.url);
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
      const disposition = res.headers.get("content-disposition") || "";
      const nameMatch = disposition.match(/filename="?([^";]+)"?/);
      const name = (nameMatch ? nameMatch[1] : "Document")
        .replace(/\.[a-z0-9]{1,5}$/i, "")
        .replace(/\s*[-–—]\s*CERT\s*$/i, "");
      const raw = await res.blob();
      if (cancelled) return;
      const typed =
        raw.type === "application/pdf" || raw.type.startsWith("image/")
          ? raw
          : new Blob([raw], { type: "application/pdf" });
      const m = name.match(/^\s*(\d+(?:\.\d+)?)\s*[-–—]?\s*(.*)$/);
      setFile({
        id,
        title: name,
        num: m && m[2] ? m[1] : null,
        label: m && m[2] ? m[2] : name,
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

  const back = kind ? KINDS[kind].back : "/";
  const backLabel = kind ? KINDS[kind].backLabel : "Home";

  if (status === "checking") return <PageLoader label="Opening…" />;

  if (status === "missing" || status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-runfree-ink px-4 text-center text-white">
        <div className="max-w-md">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">RunFree Portal</p>
          <h1 className="mt-2 font-display text-2xl font-extrabold">
            {status === "missing" ? "That file isn’t in the library" : "That didn’t open"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/70">
            {status === "missing"
              ? "The link may be out of date. The current version will be on the shelf."
              : "Something went wrong fetching it. Try again, or open it from the shelf."}
          </p>
          <Link
            href={back}
            className="mt-6 inline-block rounded-lg bg-runfree-grad px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Go to {backLabel}
          </Link>
        </div>
      </div>
    );
  }

  if (kind === "keynote" && deck && file && blob) {
    // The slides, with the real deck a click away.
    const deckLinks = (
      <>
        {deck.keynote && (
          <a href={deck.keynote.url} className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-runfree-ink transition hover:border-runfree-magenta sm:text-sm">
            Keynote
          </a>
        )}
        {deck.powerpoint && (
          <a href={deck.powerpoint.url} className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-runfree-ink transition hover:border-runfree-magenta sm:text-sm">
            PowerPoint
          </a>
        )}
      </>
    );
    return (
      <div className="min-h-screen bg-runfree-ink">
        <FilePreview file={file} fetchUrl={fetchUrl} onClose={() => router.push(back)} actions={deckLinks} />
      </div>
    );
  }

  if (kind === "keynote" && deck) {
    const DownloadButton = ({ f, primary }: { f: DeckFile; primary: boolean }) => (
      <a
        href={f.url}
        className={
          primary
            ? "inline-flex items-center justify-center rounded-lg bg-runfree-grad px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            : "inline-flex items-center justify-center rounded-lg border border-white/30 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
        }
      >
        {f.format === "keynote" ? "Keynote (.key)" : "PowerPoint (.pptx)"}
        {f.sizeBytes ? <span className="ml-2 font-normal text-white/60">{prettySize(f.sizeBytes)}</span> : null}
      </a>
    );
    return (
      <div className="flex min-h-screen items-center justify-center bg-runfree-ink px-4 text-center text-white">
        <div className="max-w-md">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Keynote Presentation</p>
          <h1 className="mt-2 font-display text-2xl font-extrabold">{deck.title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/70">
            {deck.requested
              ? `Your download of ${deck.requested.name} has started. If it did not, or you want the other format, use a button below.`
              : "Choose a format to download."}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-white/50">
            Presentations open in Keynote or PowerPoint on your computer, not in the browser.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {deck.keynote && <DownloadButton f={deck.keynote} primary={deck.requested?.format !== "powerpoint"} />}
            {deck.powerpoint && <DownloadButton f={deck.powerpoint} primary={deck.requested?.format === "powerpoint"} />}
          </div>
          <Link href={back} className="mt-6 inline-block text-sm font-medium text-white/60 transition hover:text-white">
            All {backLabel}
          </Link>
        </div>
      </div>
    );
  }

  if (kind === "video" && video) {
    return (
      <div className="flex min-h-screen flex-col bg-black text-white">
        <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">{video.group}</p>
            <h1 className="truncate font-display text-base font-semibold">{video.title}</h1>
          </div>
          <Link
            href={back}
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            All {backLabel}
          </Link>
        </header>
        <div className="flex flex-1 items-center justify-center">
          <video
            key={video.url}
            src={video.url}
            controls
            autoPlay
            playsInline
            preload="metadata"
            className="max-h-[calc(100vh-4rem)] w-full"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-runfree-ink">
      {file && blob && (
        <FilePreview file={file} fetchUrl={fetchUrl} onClose={() => router.push(back)} />
      )}
    </div>
  );
}
