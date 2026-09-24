"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCurrentFramer, getCurrentUser, hasCertificationAccess, isPortalAdmin, loginUrlHere, logout } from "@/lib/auth";
import PortalHeader from "@/components/PortalHeader";
import PageLoader from "@/components/PageLoader";
import AccessError from "@/components/AccessError";
import PortalFooter from "@/components/PortalFooter";
import { isProcessModule, stripModuleNumber } from "@/lib/modules";
import ModuleNav from "@/components/ModuleNav";
import FilePreview, { PreviewFile } from "@/components/FilePreview";

type Framer = {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
};

type PortalFile = {
  id: string;
  name: string;
  title: string;
  num: string | null;
  label: string;
  mimeType: string;
  sizeBytes: number | null;
};

type PortalModule = {
  id: string;
  name: string;
  order: number;
  files: PortalFile[];
};

function prettySize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ResourcesPage() {
  const [framer, setFramer] = useState<Framer | null>(null);
  /** Refresh from Drive is a maintenance action, not a reader's control. */
  const [canRefresh, setCanRefresh] = useState(false);
  const [modules, setModules] = useState<PortalModule[]>([]);
  const [status, setStatus] = useState<
    "checking" | "loading" | "denied" | "ready" | "error"
  >("checking");
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  /** Empty means no module chosen — everything shows. */
  const [active, setActive] = useState("");
  const [preview, setPreview] = useState<PreviewFile | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [zipping, setZipping] = useState<string | null>(null);
  const router = useRouter();

  const loadLibrary = useCallback(async (fresh = false) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch(`/api/library${fresh ? "?fresh=1" : ""}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const body = await res.json();

    if (!res.ok) {
      setLoadError(body.error || "Could not load the library.");
      return;
    }

    setLoadError("");
    const loaded = body.modules || [];
    setModules(loaded);

    // Land on Funnel Fusion rather than all 100 handouts at once.
    setActive((prev) => {
      if (prev) return prev;
      const first = loaded.find(
        (m: PortalModule) => m.order >= 1 && m.order <= 6
      );
      return first ? first.id : "";
    });
  }, []);

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser();
      if (!user) {
        router.replace(loginUrlHere());
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
      setCanRefresh(await isPortalAdmin());
      await loadLibrary();
      setStatus("ready");
    }
    init().catch((err) => {
      console.error("Handouts init failed:", err);
      setStatus("error");
    });
  }, [router, loadLibrary]);

  async function handleSignOut() {
    await logout();
    router.replace("/auth/login");
  }

  /**
   * Navigation is a side effect, so it lives here rather than in the render
   * body — and it goes home, the way /books, /videos, /guide and /keynotes do.
   * This page used to stop at a CVF-era "Access pending — Sign out" card, the
   * one dead end in the certification half.
   */
  useEffect(() => {
    if (status === "denied") router.replace("/");
  }, [status, router]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await loadLibrary(true);
    } finally {
      setRefreshing(false);
    }
  }

  /** Authorised blob URL — same gated endpoint the download uses. */
  const fetchBlobUrl = useCallback(
    async (id: string): Promise<string | null> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return null;

      const res = await fetch(`/api/library/file/${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return null;

      const blob = await res.blob();
      // Force the PDF content type so browsers render rather than download.
      return URL.createObjectURL(
        blob.type === "application/pdf"
          ? blob
          : new Blob([blob], { type: "application/pdf" })
      );
    },
    []
  );

  const listRef = useRef<HTMLDivElement>(null);
  /**
   * On a phone the icons, pills and search fill the first screen, so a tap
   * changed a list nobody could see: after choosing Horizon Storyline the
   * list heading sat at 784px of an 844px viewport, and the only visible
   * response was the icon lifting. Same pattern as VisionStackExplorer.choose.
   */
  const revealList = useCallback(() => {
    if (window.matchMedia("(min-width: 640px)").matches) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.requestAnimationFrame(() =>
      listRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
    );
  }, []);

  /**
   * Zip a whole module. The page only asks for a ticket (lib/file-ticket.ts);
   * the browser fetches the zip itself from the ticketed URL, so the download
   * shows in the browser's own progress and never sits in the page as a blob
   * — Combined Handouts is 50 MB, too much to hold in a phone's memory with
   * only "Zipping…" on the button. Same hand-off as the keynote downloads.
   *
   * And the same hold: the browser shows nothing until the zip's headers
   * arrive, 2.5–3.7 s after the ticket in testing, so the button keeps
   * "Starting download…" for ten seconds after the hand-off. Going idle the
   * moment the URL was assigned left it looking dead, and a second tap
   * starts a second 50 MB zip. A failure clears it at once.
   */
  async function downloadModule(mod: PortalModule) {
    setZipping(mod.id);
    let handedOff = false;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/library/module/${mod.id}/ticket`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const url = res.ok ? (await res.json()).url : null;
      if (!url) {
        setLoadError("Could not build that download. Try again.");
        return;
      }

      // The zip's own Content-Disposition names the file.
      window.location.assign(url);
      handedOff = true;
      setTimeout(() => setZipping((z) => (z === mod.id ? null : z)), 10_000);
    } catch {
      setLoadError("Could not build that download. Try again.");
    } finally {
      if (!handedOff) setZipping(null);
    }
  }

  const needle = query.trim().toLowerCase();

  // The rail carries the six process tools; everything else — the Field
  // Guide at 0, Additional and Combined Handouts after 6 — becomes a pill
  // underneath. isProcessModule is the same 1..6 test ModuleNav uses to
  // decide which entries have artwork, so the split cannot drift from it.
  const processModules = modules.filter((m) => isProcessModule(m.order));
  const extraModules = modules.filter((m) => !isProcessModule(m.order));
  const isFieldGuide = (name: string) => /field guide/i.test(name);

  // ModuleNav's heading slot only knows the six process tools, so choosing a
  // pill — or nothing — left about 96px of blank space above the icons.
  // Search spans every module, so it reads as "All handouts" too.
  const selectedExtra = !needle ? extraModules.find((m) => m.id === active) : undefined;

  // Search spans every module; the icon nav only narrows when not searching.
  const visible = modules
    .filter((m) => needle || !active || m.id === active)
    .map((m) => ({
      ...m,
      files: needle
        ? m.files.filter((f) => f.title.toLowerCase().includes(needle))
        : m.files,
    }))
    .filter((m) => m.files.length > 0);

  const total = visible.reduce((n, m) => n + m.files.length, 0);

  if (status === "error") {
    return <AccessError onRetry={() => window.location.reload()} />;
  }

  if (status === "checking") return <PageLoader label="Checking your access…" />;
  if (status === "loading") return <PageLoader label="Loading the handouts…" />;

  if (status === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-runfree-indigo/40 px-4">
        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="h-1.5 bg-runfree-grad" />
          <div className="p-8 text-center">
            <h1 className="font-display text-2xl font-bold text-runfree-ink">
              Access pending
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              Your account is set up, but your email isn&rsquo;t on the Certified
              Vision Framers list yet. Once you&rsquo;re added, sign in again to
              get access.
            </p>
            <button
              onClick={handleSignOut}
              className="mt-6 w-full rounded-lg bg-runfree-grad px-4 py-2.5 font-medium text-white transition hover:opacity-90"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <PortalHeader
        section="certification"
        backHref="/certification"
        backLabel="Certification hub"
        framer={framer}
        onSignOut={handleSignOut}
        title="Handouts"
        subtitle="Your certification handouts, module by module"
        badge
      />

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {loadError && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {/* The rail is the six process tools, and only those.
            Andrew: "the vision frame field guide, additional handouts, and
            combined handouts should be pills below the process."

            They were sitting in the rail as three document-icon circles among
            six pieces of module artwork, which made the track read as a
            nine-step process it is not — and gave the outer entries the
            longest labels, so "0 - Vision Frame Field Guide" ran to three
            lines and dragged the whole row down with it. They are reference
            material, not steps, and the project page has always shown them as
            pills underneath. This matches it. */}
        <ModuleNav
          modules={processModules.map((m) => ({
            // The merged ModuleNav keys on `section` (the raw "Mod #2 CROWD
            // CLOUD" string) rather than an id, because the project side has
            // no ids for its sections. The library's module id serves.
            section: m.id,
            // Without this the button is captioned with the raw Drive id.
            label: m.name,
            id: m.id,
            name: m.name,
            order: m.order,
            count: m.files.length,
          }))}
          active={needle ? "" : active}
          fallbackHeading={
            selectedExtra
              ? { eyebrow: "Reference", title: stripModuleNumber(selectedExtra.name) }
              : !active || needle
                ? { eyebrow: "Every module", title: "All handouts" }
                : null
          }
          onSelect={(id) => {
            // Clicking the selected module again clears the filter. Only a
            // new selection scrolls; clearing one has nothing new to show.
            const next = active === id ? "" : id;
            setActive(next);
            setQuery("");
            if (next) revealList();
          }}
        />

        {extraModules.length > 0 && (
          <ul className="mb-10 mt-10 flex flex-wrap justify-center gap-2.5">
            {extraModules.map((m) => {
              const lead = isFieldGuide(m.name);
              const on = !needle && active === m.id;
              // Selection is tested first. The Field Guide used to wear the
              // gradient whatever was chosen, so it never looked selected
              // when it was, and looked selected beside Funnel Fusion when it
              // was not. Now every chosen pill takes the one filled look
              // (the fill ModuleNav gives a chosen non-process entry), and
              // the Field Guide leads with a stronger ring and "Start here",
              // the project page's words for it.
              return (
                <li key={m.id}>
                  <button
                    onClick={() => {
                      const next = active === m.id ? "" : m.id;
                      setActive(next);
                      setQuery("");
                      if (next) revealList();
                    }}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-runfree-magenta focus-visible:ring-offset-1 max-sm:min-h-[44px] ${
                      on
                        ? "bg-runfree-grad text-white ring-2 ring-runfree-magenta/40 ring-offset-2"
                        : lead
                          ? "bg-white text-runfree-magentaDeep ring-2 ring-runfree-magenta/50 hover:bg-runfree-pink/40"
                          : "bg-white text-gray-600 ring-1 ring-gray-200 hover:text-runfree-ink hover:ring-runfree-magenta/40"
                    }`}
                  >
                    <span className={on ? "text-white" : "text-runfree-magentaDeep"}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <path d="M14 3v5h5" />
                        <path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z" />
                      </svg>
                    </span>
                    {stripModuleNumber(m.name)}
                    <span className="text-[10px] font-bold tabular-nums opacity-70">
                      {lead ? "Start here" : m.files.length}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all handouts…"
            className="w-full max-w-sm rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none transition placeholder:text-gray-500 focus:border-runfree-magenta focus:ring-2 focus:ring-runfree-magenta/25"
          />
          <span className="text-sm text-gray-500">
            {total} {total === 1 ? "handout" : "handouts"}
            {needle && " matching"}
          </span>
          {/* Andrew, walking a framer through this page: "I'm not sure why
              it has a refresh drive thing on here. That should probably only
              be for us internally." It re-reads the Drive folder — useful
              when we have just changed the handouts, meaningless and slightly
              alarming to a framer who only wants to download one. */}
          {canRefresh && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="ml-auto rounded-lg px-3 py-2 text-sm font-medium text-gray-600 ring-1 ring-gray-200 transition hover:text-runfree-magentaDeep hover:ring-runfree-magenta/40 disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh from Drive"}
            </button>
          )}
        </div>

        {/* The scroll target for revealList. PortalHeader is not sticky, so
            nothing covers the top and no extra offset is needed. */}
        <div ref={listRef} className="scroll-mt-4">
          {visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center">
              <p className="font-display text-lg font-semibold text-runfree-ink">
                {modules.length === 0 ? "Nothing here yet" : "No matches"}
              </p>
              <p className="mt-2 text-sm text-gray-500">
                {modules.length === 0
                  ? "Files added to the shared Drive folder appear here automatically."
                  : "Try a different search."}
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {visible.map((mod, mi) => (
                <section
                  key={mod.id}
                  style={{ "--delay": `${mi * 60}ms` } as React.CSSProperties}
                  className="animate-rise overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200"
                >
                  <div className="h-1 bg-runfree-grad" />

                  <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-100 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        {/* The folder is "1 - Funnel Fusion"; the rail above
                            already says which module this is, so the card
                            reads "Funnel Fusion" like every other heading. */}
                        <h2 className="font-display text-lg font-bold text-runfree-ink">
                          {stripModuleNumber(mod.name)}
                        </h2>
                        <span className="rounded-full bg-runfree-indigo px-2.5 py-0.5 text-xs font-semibold text-runfree-navy">
                          {mod.files.length}
                        </span>
                      </div>
                      {/^combined handouts$/i.test(mod.name) && (
                        <p className="mt-1 text-xs text-gray-500">
                          Every handout from every module, combined into one
                          file — the Pivvot Notebook.
                        </p>
                      )}
                    </div>

                    {/* A zip of one file is just a slower way to get that
                        file. Counted on the whole module, not the search
                        results, because the zip is always the whole module. */}
                    {(modules.find((m) => m.id === mod.id)?.files.length ?? 0) > 1 && (
                      <button
                        onClick={() => downloadModule(mod)}
                        disabled={zipping === mod.id}
                        className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-600 ring-1 ring-gray-200 transition hover:text-runfree-magentaDeep hover:ring-runfree-magenta/40 disabled:opacity-50 max-sm:min-h-[44px]"
                      >
                        {zipping === mod.id ? "Starting download…" : "Download all"}
                      </button>
                    )}
                  </header>

                  <ul className="divide-y divide-gray-100">
                    {mod.files.map((file) => (
                      <li key={file.id}>
                        <button
                          onClick={() => setPreview(file)}
                          className="group flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-runfree-pink/40 sm:gap-4"
                        >
                          <span
                            className={`w-8 shrink-0 font-display text-sm font-bold tabular-nums sm:w-10 ${
                              file.num
                                ? "text-runfree-magentaDeep"
                                : "text-transparent"
                            }`}
                          >
                            {file.num || "—"}
                          </span>

                          <span className="min-w-0 flex-1 line-clamp-2 break-words text-[15px] font-medium text-runfree-ink">
                            {file.label}
                          </span>

                          <span className="hidden shrink-0 text-xs text-gray-500 sm:inline">
                            {prettySize(file.sizeBytes)}
                          </span>

                          {/* Visible on touch, revealed on hover elsewhere. A
                              chip that only appears under a pointer never
                              appears on a phone, and the whole row looked
                              inert.

                              Below sm the chip gives way to a chevron. At 390px
                              it kept about 70px, leaving the title 174px, and
                              half of Funnel Fusion's titles were cut to one
                              line — "04 The Horizon Storyline Overview" and
                              "04.1 … - Definitions" read as the same sheet. The
                              chevron still says "this row opens"; the whole
                              row stays the tap target. */}
                          <span className="hidden shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-runfree-magentaDeep ring-1 ring-runfree-magenta/30 transition sm:inline-block [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
                            Preview
                          </span>
                          <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-runfree-magentaDeep sm:hidden">
                            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.17 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </main>

      <PortalFooter />

      {preview && (
        <FilePreview
          file={preview}
          fetchUrl={fetchBlobUrl}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
