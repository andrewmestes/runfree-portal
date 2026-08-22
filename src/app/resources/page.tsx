"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCurrentFramer, hasCertificationAccess, isPortalAdmin, logout } from "@/lib/auth";
import PortalHeader from "@/components/PortalHeader";
import PageLoader from "@/components/PageLoader";
import AccessError from "@/components/AccessError";
import PortalFooter from "@/components/PortalFooter";
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
    "checking" | "denied" | "ready" | "error"
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

  async function handleRefresh() {
    setRefreshing(true);
    await loadLibrary(true);
    setRefreshing(false);
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

  /** Zip a whole module, streamed from the gated endpoint. */
  async function downloadModule(mod: PortalModule) {
    setZipping(mod.id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/library/module/${mod.id}/zip`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setLoadError("Could not build that download. Try again.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${mod.name}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      setLoadError("Could not build that download. Try again.");
    } finally {
      setZipping(null);
    }
  }

  const needle = query.trim().toLowerCase();

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
    <div className="min-h-screen bg-gray-50">
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

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {loadError && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        <ModuleNav
          modules={modules.map((m) => ({
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
          onSelect={(id) => {
            // Clicking the selected module again clears the filter.
            setActive((prev) => (prev === id ? "" : id));
            setQuery("");
          }}
        />

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
                      <h2 className="font-display text-lg font-bold text-runfree-ink">
                        {mod.name}
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

                  <button
                    onClick={() => downloadModule(mod)}
                    disabled={zipping === mod.id}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-600 ring-1 ring-gray-200 transition hover:text-runfree-magentaDeep hover:ring-runfree-magenta/40 disabled:opacity-50"
                  >
                    {zipping === mod.id ? "Zipping…" : "Download all"}
                  </button>
                </header>

                <ul className="divide-y divide-gray-100">
                  {mod.files.map((file) => (
                    <li key={file.id}>
                      <button
                        onClick={() => setPreview(file)}
                        className="group flex w-full items-center gap-4 px-5 py-3 text-left transition hover:bg-runfree-pink/40"
                      >
                        <span
                          className={`w-10 shrink-0 font-display text-sm font-bold tabular-nums ${
                            file.num
                              ? "text-runfree-magentaDeep"
                              : "text-transparent"
                          }`}
                        >
                          {file.num || "—"}
                        </span>

                        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-runfree-ink">
                          {file.label}
                        </span>

                        <span className="hidden shrink-0 text-xs text-gray-500 sm:inline">
                          {prettySize(file.sizeBytes)}
                        </span>

                        <span className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-runfree-magentaDeep opacity-0 ring-1 ring-runfree-magenta/30 transition group-hover:opacity-100">
                          Preview
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
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
