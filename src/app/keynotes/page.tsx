"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCurrentFramer, getCurrentUser, hasCertificationAccess, logout } from "@/lib/auth";
import PortalHeader from "@/components/PortalHeader";
import PageLoader from "@/components/PageLoader";
import AccessError from "@/components/AccessError";
import PortalFooter from "@/components/PortalFooter";

type Framer = { id: string; email: string; name: string; is_admin: boolean };

type Format = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  modifiedTime: string | null;
};

type Presentation = {
  title: string;
  slug: string;
  keynote: Format | null;
  powerpoint: Format | null;
};

function prettySize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

export default function KeynotesPage() {
  const [framer, setFramer] = useState<Framer | null>(null);
  const [decks, setDecks] = useState<Presentation[]>([]);
  const [status, setStatus] = useState<"checking" | "denied" | "ready" | "error">("checking");
  const [loadError, setLoadError] = useState("");
  /** Drive id currently downloading — these files are big enough to need a state. */
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser();
      if (!user) {
        router.replace("/auth/login");
        return;
      }
      const [current, allowed] = await Promise.all([
        getCurrentFramer() as Promise<Framer | null>,
        hasCertificationAccess(),
      ]);
      if (!allowed) {
        setStatus("denied");
        return;
      }
      setFramer(current);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        const res = await fetch("/api/keynotes", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const body = await res.json();
        if (!res.ok) setLoadError(body.error || "Could not load the presentations.");
        else setDecks(body.presentations ?? []);
      }
      setStatus("ready");
    }
    init().catch((err) => {
      console.error("Keynotes init failed:", err);
      setStatus("error");
    });
  }, [router]);

  useEffect(() => {
    if (status === "denied") router.replace("/");
  }, [status, router]);

  async function handleSignOut() {
    await logout();
    router.replace("/auth/login");
  }

  /**
   * Download through the gated endpoint.
   *
   * A plain `<a href>` cannot carry the bearer token, so the bytes come back
   * through fetch and are handed to the browser as an object URL. These decks
   * run to ~47MB, which is why there is a visible pending state — without one
   * the button looks dead for several seconds on a slow connection.
   */
  async function download(f: Format) {
    setBusy(f.id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/keynotes/file/${f.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setLoadError("That file could not be downloaded. Try again in a moment.");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke on the next tick — revoking synchronously can cancel the
      // download in Safari before it has read the blob.
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      console.error("Keynote download failed:", err);
      setLoadError("That file could not be downloaded. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  if (status === "error") return <AccessError onRetry={() => window.location.reload()} />;
  if (status === "checking" || status === "denied") return <PageLoader label="Checking your access…" />;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <PortalHeader
        section="certification"
        backHref="/certification"
        backLabel="Certification hub"
        framer={framer}
        onSignOut={handleSignOut}
        title="Keynote Presentations"
        subtitle="The decks you teach from, in Keynote and PowerPoint"
        badge
      />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        {loadError && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {decks.length === 0 && !loadError ? (
          <p className="rounded-2xl bg-white px-6 py-12 text-center text-sm text-gray-500 ring-1 ring-gray-200">
            No presentations uploaded yet.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {decks.map((d) => (
              <article
                key={d.slug}
                className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200"
              >
                <div className="h-1 bg-runfree-grad" />
                <div className="flex flex-1 flex-col p-6">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-runfree-grad text-white shadow-sm">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-6 w-6"
                    >
                      <rect x="2.5" y="4" width="19" height="12.5" rx="1.6" />
                      <path d="M12 16.5V21M8.5 21h7" />
                    </svg>
                  </span>

                  <h2 className="mt-4 font-display text-lg font-bold text-runfree-ink">
                    {d.title}
                  </h2>

                  <div className="mt-4 flex flex-1 flex-col justify-end gap-2">
                    <FormatButton
                      label="Keynote"
                      hint=".key · Mac"
                      file={d.keynote}
                      busy={busy}
                      onDownload={download}
                    />
                    <FormatButton
                      label="PowerPoint"
                      hint=".pptx · Windows"
                      file={d.powerpoint}
                      busy={busy}
                      onDownload={download}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <p className="mt-6 text-xs leading-relaxed text-gray-400">
          These mirror Drive directly — a new version there is the current version
          here, with nothing to re-upload.
        </p>
      </main>

      <PortalFooter />
    </div>
  );
}

/**
 * One format for one deck.
 *
 * A format that does not exist in Drive still renders, greyed and disabled,
 * rather than disappearing. Two cards with a different number of buttons read
 * as a layout bug; a card that says "Not uploaded yet" reads as information —
 * and it is the honest state, since the PowerPoint folder was empty when this
 * shipped.
 */
function FormatButton({
  label,
  hint,
  file,
  busy,
  onDownload,
}: {
  label: string;
  hint: string;
  file: Format | null;
  busy: string | null;
  onDownload: (f: Format) => void;
}) {
  if (!file) {
    return (
      <span className="flex items-center justify-between rounded-lg bg-gray-50 px-3.5 py-2.5 text-sm text-gray-400 ring-1 ring-gray-200">
        <span className="font-semibold">{label}</span>
        <span className="text-xs">Not uploaded yet</span>
      </span>
    );
  }

  const isBusy = busy === file.id;
  return (
    <button
      onClick={() => onDownload(file)}
      disabled={!!busy}
      className="flex items-center justify-between rounded-lg bg-white px-3.5 py-2.5 text-sm text-runfree-ink ring-1 ring-gray-300 transition hover:bg-runfree-pink hover:ring-runfree-magenta/40 disabled:opacity-60"
    >
      <span className="flex min-w-0 flex-col items-start">
        <span className="font-semibold">{label}</span>
        <span className="text-[11px] text-gray-500">{hint}</span>
      </span>
      <span className="ml-3 shrink-0 text-xs font-semibold text-runfree-magentaDeep">
        {isBusy ? "Preparing…" : `Download ${prettySize(file.sizeBytes)}`}
      </span>
    </button>
  );
}
