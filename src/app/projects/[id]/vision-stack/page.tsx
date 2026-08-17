"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCurrentProfile, logout } from "@/lib/auth";
import {
  getProjectDetail,
  updateDeliverable,
  type ProjectDetail,
  type ProjectRole,
} from "@/lib/projects";
import { getSignedImageUrls, replaceDeliverableImage, uploadDeliverableFile } from "@/lib/storage";
import PortalHeader from "@/components/PortalHeader";
import PageLoader from "@/components/PageLoader";
import PortalFooter from "@/components/PortalFooter";
import AccessError from "@/components/AccessError";

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  is_staff: boolean;
  is_owner: boolean;
  certification_access: boolean;
};

/**
 * The finished work, laid out to be shown to a board.
 *
 * Order runs foundation-first — Paradigm Convictions, then the Vision Frame,
 * the Horizon Storyline, and finally the Application Toolbox. That inverts
 * the printed stack graphic, where the toolbox sits on top, and it should:
 * a page is read downward, and the argument only makes sense built upward.
 * Each layer is offset slightly further right as you descend, so the page
 * still reads as a stack rather than a list of headings.
 *
 * The scroll-driven, Apple-style treatment Andrew described is deliberately
 * not here yet — he called it "a secondary piece, not a priority right now."
 * What is here is the structure it will animate, so that build is a visual
 * job rather than a re-modelling one.
 */
export default function VisionStackPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"checking" | "ready" | "not_found" | "error">("checking");

  const load = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/auth/login");
        return;
      }
      setAccessToken(session.access_token);

      const current = (await getCurrentProfile()) as Profile | null;
      if (!current) {
        setStatus("error");
        return;
      }
      setProfile(current);

      const result = await getProjectDetail(session.access_token, projectId);
      if (!result) {
        setStatus("not_found");
        return;
      }
      setDetail(result);
      setStatus("ready");

      const paths = [
        ...result.deliverables.map((d) => d.image_path),
        ...result.deliverables.map((d) => d.file_path),
      ].filter((p): p is string => !!p);
      setImageUrls(await getSignedImageUrls(session.access_token, paths));
    } catch (err) {
      console.error("Vision Stack load failed:", err);
      setStatus("error");
    }
  }, [projectId, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSignOut() {
    await logout();
    router.replace("/auth/login");
  }

  if (status === "checking") return <PageLoader label="Loading your Vision Stack…" />;
  if (status === "error") return <AccessError onRetry={load} />;
  if (status === "not_found" || !detail || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-runfree-indigo/40 px-4">
        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="h-1.5 bg-runfree-grad" />
          <div className="p-8 text-center">
            <h1 className="font-display text-2xl font-bold text-runfree-ink">Not found</h1>
            <a
              href="/"
              className="mt-6 inline-block rounded-lg bg-runfree-grad-deep px-4 py-2.5 font-medium text-white transition hover:opacity-90"
            >
              Back to your projects
            </a>
          </div>
        </div>
      </div>
    );
  }

  const myMembership = detail.members.find((m) => m.profileId === profile.id);
  const myRole: ProjectRole | null = myMembership?.role ?? (profile.is_owner ? "admin" : null);
  const canEdit = myRole === "editor" || myRole === "admin";

  const church = detail.name.split(" - ")[0];
  const stackItems = detail.deliverables.filter((d) => d.kind === "vision_stack");
  const ready = stackItems.filter((d) => d.published_at).length;


  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader
        profile={profile}
        onSignOut={handleSignOut}
        backHref={`/projects/${projectId}`}
        backLabel="Back to project"
        title=""
        showTitleBlock={false}
        certificationAccess={profile.certification_access || profile.is_staff}
      />

      {/* Hero */}
      <div className="relative overflow-hidden bg-runfree-navy">
        <div aria-hidden className="absolute inset-0 bg-runfree-sunset opacity-25" />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-runfree-magenta/25 blur-3xl"
        />
        <div className="relative mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-24">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-runfree-pink">
            {church}
          </p>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            The Vision Stack
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/75">
            Everything your team has built, from the convictions underneath it all to the tools
            that put it to work.
          </p>
          {stackItems.length > 0 && (
            <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-white ring-1 ring-white/20">
              {ready} of {stackItems.length} complete
            </p>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="space-y-10">
          {detail.stackLayers.map((layer, i) => (
            <LayerBlock
              key={layer.slug}
              index={i}
              name={layer.name}
              blurb={layer.blurb}
              iconPath={layer.icon_path}
              items={stackItems.filter((d) => d.stack_layer === layer.slug)}
              imageUrls={imageUrls}
              canEdit={canEdit}
              accessToken={accessToken}
              projectId={projectId}
              onChanged={load}
            />
          ))}

        </div>

        {stackItems.every((d) => !d.published_at) && (
          <p className="mt-12 text-center text-sm text-gray-400">
            Your deliverables appear here as each one is finished.
          </p>
        )}
      </main>

      <PortalFooter />
    </div>
  );
}

/** Reveals itself once as it enters the viewport. Subtle — a fade and a small rise. */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Respect a reduced-motion preference: show immediately, animate nothing.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "-60px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return { ref, shown };
}

function LayerBlock({
  index,
  name,
  blurb,
  iconPath,
  items,
  imageUrls,
  canEdit,
  accessToken,
  projectId,
  onChanged,
}: {
  index: number;
  name: string;
  blurb: string | null;
  iconPath: string | null;
  items: ProjectDetail["deliverables"];
  imageUrls: Record<string, string>;
  canEdit: boolean;
  accessToken: string | null;
  projectId: string;
  onChanged: () => void;
}) {
  const { ref, shown } = useReveal<HTMLElement>();

  return (
    <section
      ref={ref}
      style={{
        // Each layer steps further right, so the page reads as a stack.
        marginLeft: `${index * 10}px`,
        transitionDelay: `${index * 60}ms`,
      }}
      className={`overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-gray-200 transition-all duration-700 ease-out ${
        shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      }`}
    >
      <div className="h-1 bg-runfree-grad" />
      <div className="p-7 sm:p-9">
        <div className="flex items-start gap-4">
          {/* The layer's own mark. Three of the four are the process icons
              already in the portal, which is not a coincidence — those layers
              are the output of those tools. */}
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gray-50 ring-1 ring-gray-200">
            {iconPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={iconPath} alt="" className="h-10 w-10 object-contain" />
            ) : (
              <span className="font-display text-base font-extrabold text-runfree-navy/30">
                {String(index + 1).padStart(2, "0")}
              </span>
            )}
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-magenta/60">
              Layer {String(index + 1).padStart(2, "0")}
            </p>
            <h2 className="mt-0.5 font-display text-2xl font-extrabold tracking-tight text-runfree-ink sm:text-3xl">
              {name}
            </h2>
            {blurb && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600">{blurb}</p>
            )}
          </div>
        </div>

        {items.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
            Nothing in this layer yet.
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <StackItem
                key={item.id}
                item={item}
                imageUrl={item.image_path ? imageUrls[item.image_path] : undefined}
                fileUrl={item.file_path ? imageUrls[item.file_path] : undefined}
                canEdit={canEdit}
                accessToken={accessToken}
                projectId={projectId}
                onChanged={onChanged}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function StackItem({
  item,
  imageUrl,
  fileUrl,
  canEdit,
  accessToken,
  projectId,
  onChanged,
}: {
  item: ProjectDetail["deliverables"][number];
  imageUrl?: string;
  fileUrl?: string;
  canEdit: boolean;
  accessToken: string | null;
  projectId: string;
  onChanged: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const done = !!item.published_at;

  /**
   * Accepts whatever the deliverable actually is. Most finished work is a
   * PDF — Andrew: "most of it is just PDFs" — but a photographed flipchart is
   * still an image, and the two want different treatment: an image is shown,
   * a document is listed by name and opened deliberately.
   */
  async function upload(file: File | undefined) {
    if (!file || !accessToken) return;
    setBusy(true);
    try {
      if (file.type.startsWith("image/")) {
        const { path } = await replaceDeliverableImage(
          accessToken,
          item.image_path,
          projectId,
          file
        );
        await updateDeliverable(accessToken, item.id, {
          image_path: path,
          published_at: item.published_at ?? new Date().toISOString(),
        });
      } else {
        const doc = await uploadDeliverableFile(accessToken, projectId, file);
        await updateDeliverable(accessToken, item.id, {
          file_path: doc.path,
          file_name: doc.name,
          file_mime: doc.mime,
          file_size: doc.size,
          published_at: item.published_at ?? new Date().toISOString(),
        });
      }
      onChanged();
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`group overflow-hidden rounded-2xl ring-1 transition ${
        done ? "bg-white ring-gray-200 hover:ring-runfree-magenta/40" : "bg-gray-50 ring-gray-200"
      }`}
    >
      <div
        onClick={() => canEdit && !imageUrl && !item.file_path && inputRef.current?.click()}
        className={`flex aspect-[4/3] items-center justify-center overflow-hidden bg-gray-50 ${
          canEdit && !imageUrl && !item.file_path ? "cursor-pointer" : ""
        }`}
      >
        {imageUrl ? (
          <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="flex h-full w-full items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={item.title ?? "Deliverable"}
              className="max-h-full max-w-full object-contain transition duration-300 group-hover:scale-[1.03]"
            />
          </a>
        ) : item.file_path ? (
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-runfree-grad text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                <path d="M14 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="line-clamp-2 text-xs font-medium text-runfree-ink">
              {item.file_name ?? "Open document"}
            </span>
            {item.file_size && (
              <span className="text-[10px] text-gray-400">
                {(item.file_size / 1024 / 1024).toFixed(1)} MB
              </span>
            )}
          </a>
        ) : item.external_url ? (
          <a
            href={item.external_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 text-center text-xs font-medium text-runfree-magentaDeep hover:underline"
          >
            Open →
          </a>
        ) : (
          <span className="px-4 text-center text-xs text-gray-400">
            {busy ? "Uploading…" : canEdit ? "Click to add a PDF or image" : "In progress"}
          </span>
        )}
        {canEdit && (
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => upload(e.target.files?.[0])}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <p className="truncate text-sm font-medium text-runfree-ink">{item.title}</p>
        {canEdit ? (
          /* Was a 2x2 pixel button with no accessible name: impossible to hit
             on touch, invisible to a keyboard, and announced by a screen
             reader as an unlabelled control. Now a real target that says what
             it does and what state it is in. */
          <button
            type="button"
            onClick={async () => {
              if (!accessToken) return;
              await updateDeliverable(accessToken, item.id, {
                published_at: done ? null : new Date().toISOString(),
              });
              onChanged();
            }}
            aria-pressed={done}
            aria-label={
              done
                ? `${item.title ?? "This deliverable"} is visible to the church — hide it`
                : `${item.title ?? "This deliverable"} is hidden — make it visible to the church`
            }
            title={done ? "Visible to the church" : "Hidden from the church"}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide outline-none ring-runfree-magenta/60 transition focus-visible:ring-2 ${
              done
                ? "bg-runfree-pink text-runfree-magentaDeep hover:bg-runfree-pink/70"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${done ? "bg-runfree-magenta" : "bg-gray-400"}`}
            />
            {done ? "Live" : "Draft"}
          </button>
        ) : (
          done && (
            <span className="shrink-0 rounded-full bg-runfree-pink px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-runfree-magentaDeep">
              Ready
            </span>
          )
        )}
      </div>
    </div>
  );
}
