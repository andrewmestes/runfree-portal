"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { getCurrentFramer, getCurrentUser, hasCertificationAccess, loginUrlHere, logout } from "@/lib/auth";
import PortalHeader from "@/components/PortalHeader";
import PageLoader from "@/components/PageLoader";
import AccessError from "@/components/AccessError";
import PortalFooter from "@/components/PortalFooter";
import FilePreview, { PreviewFile } from "@/components/FilePreview";
import PdfThumbnail from "@/components/PdfThumbnail";
import GuideTour, { prefetchGuideStills } from "@/components/GuideTour";

type Framer = {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
};

type GuideFile = {
  id: string;
  name: string;
  title: string;
  sizeBytes: number | null;
  modifiedTime: string | null;
};

function prettyDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * The Drive filename, said the way a person would. "SEP 2026 Digital
 * Facilitators Guide - Pivvot - RunFree Co." is how the export is named so
 * the folder sorts; on the page it reads "Digital Facilitator's Guide ·
 * September 2026". Anything that does not match the naming pattern is shown
 * as it is, minus the trailing " - Pivvot - RunFree Co."
 */
const MONTHS: Record<string, string> = { JAN: "January", FEB: "February", MAR: "March", APR: "April", MAY: "May", JUN: "June", JUL: "July", AUG: "August", SEP: "September", SEPT: "September", OCT: "October", NOV: "November", DEC: "December" };
function editionTitle(title: string): string {
  const m = /^([A-Z]{3,4})\s+(\d{4})\s+Digital Facilitator'?s'? Guide/i.exec(title.trim());
  if (m && MONTHS[m[1].toUpperCase()]) return `Digital Facilitator's Guide · ${MONTHS[m[1].toUpperCase()]} ${m[2]}`;
  return title.replace(/\s*-\s*Pivvot\s*-\s*RunFree Co\.?\s*$/i, "").trim();
}

export default function GuidePage() {
  const [framer, setFramer] = useState<Framer | null>(null);
  const [file, setFile] = useState<GuideFile | null>(null);
  const [status, setStatus] = useState<
    "checking" | "loading" | "denied" | "ready" | "error"
  >("checking");
  const [loadError, setLoadError] = useState("");
  const [preview, setPreview] = useState<PreviewFile | null>(null);
  /**
   * "How to use the guide" — the guided tour (components/GuideTour). Andrew: "the DFG
   * training is critical. let's just have that live on the DFG page." It opens
   * from the "How to use the guide" button above the cover, and on arrival from ?tour=1 (Help's
   * link, and the old /guide/how-to-use address, which redirects here).
   */
  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tour") !== "1") return;
    setTourOpen(true);
    // Read once: a refresh, or a bookmark copied from the bar, opens the Guide page, not the tour again.
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser();
      if (!user) {
        router.replace(loginUrlHere());
        return;
      }

      // Everything below is independent, so it all goes out at once: the
      // framer row, the access check, and the guide lookup itself (the API
      // gates that on its own, so nothing leaks if access turns out to be
      // denied). Three questions, one round trip.
      const lookup = (async () => {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return null;
        const res = await fetch("/api/guide", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        return { ok: res.ok, body: await res.json() };
      })();
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

      const result = await lookup;
      if (result) {
        if (!result.ok) {
          setLoadError(result.body.error || "Could not load the guide.");
        } else {
          setFile(result.body.file);
        }
      }

      setStatus("ready");
    }
    init().catch((err) => {
      console.error("Guide init failed:", err);
      setStatus("error");
    });
  }, [router]);

  /**
   * Warm the guide while the cover is on screen. The file route answers with
   * a five-minute private cache and an ETag, so this one low-priority fetch
   * means "Open the Guide" reads 25 MB from the browser's own copy instead
   * of waiting on Drive. Fire-and-forget: if it fails, the preview fetches
   * for itself exactly as before.
   */
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      try {
        await fetch(`/api/guide/file/${file.id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          priority: "low",
        } as RequestInit);
      } catch {
        // Nothing to do; the preview fetches for itself when opened.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  // The tour's seven stills (about 850 KB), a moment after the page settles,
  // so "How to use the guide" opens on the guide's cover instead of "Loading…".
  useEffect(() => {
    if (!file) return;
    const t = window.setTimeout(() => void prefetchGuideStills(), 1000);
    return () => window.clearTimeout(t);
  }, [file]);

  /**
   * Navigation is a side effect, so it belongs here rather than in the render
   * body. Calling router.replace() during render violates React's rules and,
   * with reactStrictMode on, ran twice per mount.
   */
  useEffect(() => {
    if (status === "denied") router.replace("/");
  }, [status, router]);

  async function handleSignOut() {
    await logout();
    router.replace("/auth/login");
  }

  /** Raw bytes for the cover preview, through the same gated endpoint. */
  const fetchPdfBytes = useCallback(
    async (id: string): Promise<ArrayBuffer | null> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return null;

      const res = await fetch(`/api/guide/file/${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return null;
      return res.arrayBuffer();
    },
    []
  );

  const fetchBlobUrl = useCallback(async (id: string): Promise<string | null> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;

    const res = await fetch(`/api/guide/file/${id}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return null;

    const blob = await res.blob();
    return URL.createObjectURL(
      blob.type === "application/pdf"
        ? blob
        : new Blob([blob], { type: "application/pdf" })
    );
  }, []);

  /**
   * The viewer's header says what the card says, "Digital Facilitator's
   * Guide · September 2026", not the Drive filename the folder sorts by.
   * Shared by the button and the cover: on a phone the button sits at the
   * fold (Safari's toolbar hides it), so the cover is the thing a thumb finds.
   */
  const openGuide = () => {
    if (file) setPreview({ ...file, num: null, label: editionTitle(file.title) });
  };

  if (status === "error") {
    return <AccessError onRetry={() => window.location.reload()} />;
  }

  if (status === "checking" || status === "denied") {
    return <PageLoader label="Checking your access…" />;
  }
  if (status === "loading") return <PageLoader label="Loading the guide…" />;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <PortalHeader
        section="certification"
        backHref="/certification"
        backLabel="Certification hub"
        framer={framer}
        onSignOut={handleSignOut}
        title="Digital Facilitator's Guide"
        subtitle="The current guide — always the latest version"
        badge
      />

      {/* The whole training playbook lives in this one file — it earns a
          moment, not just another card in a list. */}
      <div className="relative isolate flex-1 overflow-hidden bg-runfree-navy">
        <Image
          src="/brand/dfg-sunset.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-runfree-navy/30 via-runfree-navy/60 to-runfree-navy" />

        <div className="relative mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-24 lg:px-8">
          {loadError && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadError}
            </div>
          )}

          <div className="overflow-hidden rounded-2xl bg-white/95 shadow-2xl ring-1 ring-white/20 backdrop-blur-sm">
            <div className="h-1.5 bg-runfree-grad" />
            <div className="p-6 text-center sm:p-10">
              {file ? (
                <>
                  {/* The tour sits ABOVE the cover. Andrew: "The 'how it works' isn't
                      immediately visible … i can click on the image of the dfg and
                      never see it currently." Under the title and the Open button it
                      was the last thing on the card; here it is the first. */}
                  <button
                    type="button"
                    onClick={() => setTourOpen(true)}
                    className="group mx-auto mb-4 flex w-full max-w-sm items-center gap-3 rounded-xl bg-runfree-pink px-4 py-3 text-left ring-1 ring-runfree-magenta/25 transition hover:bg-[#fbdbe9] hover:ring-runfree-magenta/50 sm:mb-5 sm:max-w-md"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-runfree-grad text-white shadow-md transition group-hover:scale-105" aria-hidden="true">
                      <svg viewBox="0 0 20 20" className="ml-0.5 h-4 w-4" fill="currentColor">
                        <path d="M6.5 4.5l9 5.5-9 5.5z" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-base font-bold text-runfree-ink">How to use the guide</span>
                      <span className="block text-sm text-gray-600">A short guided tour</span>
                    </span>
                    <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-runfree-magentaDeep transition group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M8 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {/* The guide's own title slide — a 172-page playbook deserves
                      to show its face rather than sit behind a text link.
                      Always the real cover, not a live PDF render: at 25 MB
                      the guide sits well over PdfThumbnail's 12MB cap, so the
                      fallback is what actually renders every time. Handing it
                      the guide's own designed cover (rather than the generic
                      badge-on-navy placeholder) means that permanent fallback
                      looks intentional instead of like a broken feature. */}
                  <button
                    type="button"
                    onClick={openGuide}
                    aria-label="Open the Guide"
                    className="mx-auto mb-4 block w-full max-w-sm overflow-hidden rounded-xl sm:mb-6 shadow-xl ring-1 ring-black/10 transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-runfree-magenta sm:max-w-md"
                  >
                    <PdfThumbnail
                      fileId={file.id}
                      fetchBytes={fetchPdfBytes}
                      width={800}
                      sizeBytes={file.sizeBytes}
                      className="block h-auto w-full"
                      fallback={
                        <Image
                          src="/brand/dfg-cover.jpg"
                          alt=""
                          width={1400}
                          height={1050}
                          priority
                          className="block h-auto w-full"
                        />
                      }
                    />
                  </button>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-magentaDeep">
                    The complete training playbook
                  </p>
                  <h2 className="mt-2 font-display text-xl font-bold text-runfree-ink sm:text-2xl">
                    {editionTitle(file.title)}
                  </h2>
                  {file.modifiedTime && (
                    <p className="mt-1 text-sm text-gray-500">
                      Last updated {prettyDate(file.modifiedTime)}
                    </p>
                  )}
                  <button
                    onClick={openGuide}
                    className="mt-4 rounded-lg bg-runfree-grad px-8 py-3 text-sm font-semibold text-white transition hover:opacity-90 sm:mt-6"
                  >
                    Open the Guide
                  </button>
                </>
              ) : (
                <>
                  <h2 className="font-display text-xl font-bold text-runfree-ink">
                    No guide uploaded yet
                  </h2>
                  <p className="mt-2 text-sm text-gray-500">
                    The Digital Facilitator&rsquo;s Guide will appear here as
                    soon as it&rsquo;s added to Drive.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <PortalFooter />

      <GuideTour open={tourOpen} onClose={() => setTourOpen(false)} onOpenGuide={file ? openGuide : undefined} />

      {preview && (
        <FilePreview
          file={preview}
          fetchUrl={fetchBlobUrl}
          onClose={() => setPreview(null)}
          resumeKey={`guide-page:${preview.id}`}
        />
      )}
    </div>
  );
}
