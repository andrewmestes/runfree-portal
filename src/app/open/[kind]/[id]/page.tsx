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
  keynote: { api: (id) => `/api/keynotes/file/${id}`, back: "/keynotes", backLabel: "Keynotes" },
  video: { api: (id) => `/api/tool-videos/ticket/${id}`, back: "/videos", backLabel: "Training Videos" },
};

type Status = "checking" | "ready" | "missing" | "error";

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
