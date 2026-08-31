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
import VisionStackExplorer, { type StackEntry } from "@/components/VisionStackExplorer";
import FilePreview, { type PreviewFile } from "@/components/FilePreview";
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
  /**
   * The open document.
   *
   * Andrew asked for these to "open a PDF in a modal" rather than a new tab —
   * a deliverable is the thing a board is being shown, and losing your place
   * in the stack to look at one is the wrong trade. `id` carries the signed
   * storage URL, which `fetchStorageBlobUrl` turns into a blob so the file is
   * still never publicly reachable.
   */
  const [preview, setPreview] = useState<PreviewFile | null>(null);

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

  const fetchStorageBlobUrl = useCallback(async (signedUrl: string) => {
    try {
      const res = await fetch(signedUrl);
      if (!res.ok) return null;
      return URL.createObjectURL(await res.blob());
    } catch {
      return null;
    }
  }, []);

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
              className="mt-6 inline-block rounded-lg bg-runfree-grad px-4 py-2.5 font-medium text-white transition hover:opacity-90"
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
    <div className="flex min-h-screen flex-col bg-gray-50">
      <PortalHeader
        profile={profile}
        onSignOut={handleSignOut}
        backHref={`/projects/${projectId}`}
        backLabel="Back to project"
        title=""
        showTitleBlock={false}
        certificationAccess={profile.certification_access || profile.is_staff}
      />

      {/* ── Hero ───────────────────────────────────────────────────────
          Short on purpose. The stack itself is the hero now, and it lives in
          the main area where Andrew asked for it — "bring this functionality
          down into the main area". A tall banner above it would push the
          thing you came to use below the fold. */}
      <div className="relative overflow-hidden bg-runfree-navy">
        <div aria-hidden className="absolute inset-0 bg-runfree-sunset opacity-25" />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full bg-runfree-magenta/25 blur-3xl"
        />
        <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <p className="font-display text-lg font-bold tracking-tight text-runfree-pink sm:text-xl">
            {church}
          </p>
          <h1 className="mt-1.5 font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            The Vision Stack
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-white/75">
            Everything your team has built, from the convictions underneath it all to
            the tools that put it to work.
          </p>
          {ready > 0 && (
            <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-white ring-1 ring-white/20">
              {ready} {ready === 1 ? "piece" : "pieces"} finished
            </p>
          )}
        </div>
      </div>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <VisionStackExplorer
          layers={detail.stackLayers.map((l) => ({
            slug: l.slug,
            name: l.name,
            blurb: l.blurb,
          }))}
          items={stackItems as StackEntry[]}
          imageUrls={imageUrls}
          canEdit={canEdit}
          onOpen={(item) => {
            const path = item.file_path ?? item.image_path;
            const url = path ? imageUrls[path] : undefined;
            if (!url) return;
            setPreview({
              id: url,
              title: item.title ?? "Deliverable",
              num: null,
              label: item.title ?? "Deliverable",
              sizeBytes: item.file_size,
            });
          }}
          onUpload={
            canEdit && accessToken
              ? async (item, file) => {
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
                  await load();
                }
              : undefined
          }
          onTogglePublished={
            canEdit && accessToken
              ? async (item) => {
                  await updateDeliverable(accessToken, item.id, {
                    published_at: item.published_at ? null : new Date().toISOString(),
                  });
                  await load();
                }
              : undefined
          }
        />
      </main>

      {preview && (
        <FilePreview
          file={preview}
          fetchUrl={fetchStorageBlobUrl}
          onClose={() => setPreview(null)}
        />
      )}

      <PortalFooter />
    </div>
  );
}
