"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCurrentFramer, getCurrentUser, hasCertificationAccess, logout } from "@/lib/auth";
import PortalHeader from "@/components/PortalHeader";
import PageLoader from "@/components/PageLoader";
import AccessError from "@/components/AccessError";
import PortalFooter from "@/components/PortalFooter";
import FilePreview, { PreviewFile } from "@/components/FilePreview";
import BooksShelf from "@/components/BooksShelf";

type Framer = {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
};

type BookFile = {
  id: string;
  name: string;
  title: string;
  num: string | null;
  label: string;
  mimeType: string;
  sizeBytes: number | null;
};

type BookShelf = {
  id: string;
  name: string;
  amazonUrl: string;
  fullBook: BookFile | null;
  visualSummary: BookFile | null;
  chapters: BookFile[];
  other: BookFile[];
};

type BooksLibrary = {
  books: BookShelf[];
  extras: BookFile[];
  /** One-file books — on the shelf, not in Other Resources. */
  standalone: BookShelf[];
};

function prettySize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BooksPage() {
  const [framer, setFramer] = useState<Framer | null>(null);
  const [library, setLibrary] = useState<BooksLibrary>({
    books: [],
    extras: [],
    standalone: [],
  });
  const [status, setStatus] = useState<
    "checking" | "denied" | "ready" | "error"
  >("checking");
  const [loadError, setLoadError] = useState("");
  const [activeId, setActiveId] = useState<string>("");
  /**
   * Covers that 404'd. A title can be on the shelf before its artwork has
   * been saved — Innovating Discipleship is exactly that case — and a broken
   * image icon looks like a fault, where the name tile looks deliberate.
   * Drop the file into public/brand/books and it starts working with no code
   * change.
   */
  const [coverFailed, setCoverFailed] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<PreviewFile | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const load = useCallback(async (fresh = false) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch(`/api/books${fresh ? "?fresh=1" : ""}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const body = await res.json();

    if (!res.ok) {
      setLoadError(body.error || "Could not load the books library.");
      return;
    }

    setLoadError("");
    const books: BookShelf[] = body.books || [];
    setLibrary({
      books,
      extras: body.extras || [],
      standalone: body.standalone || [],
    });
    setActiveId((prev) => prev || books[0]?.id || "");
  }, []);

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

      setFramer(current);
      await load();
      setStatus("ready");
    }
    init().catch((err) => {
      console.error("Books init failed:", err);
      setStatus("error");
    });
  }, [router, load]);

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

  async function handleRefresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  const fetchBlobUrl = useCallback(async (id: string): Promise<string | null> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;

    const res = await fetch(`/api/books/file/${id}`, {
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

  /** Raw bytes for the first-page preview, through the same gated endpoint. */
  const fetchPdfBytes = useCallback(
    async (id: string): Promise<ArrayBuffer | null> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return null;

      const res = await fetch(`/api/books/file/${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return null;
      return res.arrayBuffer();
    },
    []
  );

  if (status === "error") {
    return <AccessError onRetry={() => window.location.reload()} />;
  }

  if (status === "checking" || status === "denied") {
    return <PageLoader label="Checking your access…" />;
  }

  const active =
    [...library.books, ...library.standalone].find((b) => b.id === activeId) || null;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <PortalHeader
        section="certification"
        backHref="/certification"
        backLabel="Certification hub"
        framer={framer}
        onSignOut={handleSignOut}
        title="Books"
        subtitle="Visual summaries, chapters, and full downloads"
        badge
      />

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {loadError && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        <BooksShelf
          library={library}
          activeId={activeId}
          onSelect={setActiveId}
          onOpen={setPreview}
          fetchBytes={fetchPdfBytes}
          onRefresh={handleRefresh}
          refreshing={refreshing}
        />

        {library.extras.length > 0 && (
          <section className="mt-12 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
            <header className="border-b border-gray-100 px-5 py-4">
              <h2 className="font-display text-lg font-bold text-runfree-ink">
                Other Resources
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Files in the Books folder that aren&rsquo;t tied to one of the
                four books above.
              </p>
            </header>
            <ul className="divide-y divide-gray-100">
              {library.extras.map((f) => (
                <li key={f.id}>
                  <button
                    onClick={() => setPreview(f)}
                    className="group flex w-full items-center gap-4 px-5 py-3 text-left transition hover:bg-runfree-pink/40"
                  >
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-runfree-ink">
                      {f.title}
                    </span>
                    <span className="hidden shrink-0 text-xs text-gray-500 sm:inline">
                      {prettySize(f.sizeBytes)}
                    </span>
                    <span className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-runfree-magentaDeep opacity-0 ring-1 ring-runfree-magenta/30 transition group-hover:opacity-100">
                      Preview
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
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
