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
import {
  listVisionFrame,
  saveVisionFrameElement,
  type VisionFrameRow,
} from "@/lib/vision-frame";
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
  /**
   * The four sides of the frame, in the church's own words.
   *
   * The same `vision_frame` rows the Deliverables panel writes — this page
   * reads them rather than keeping a second copy, so a mission statement
   * edited in either place is edited everywhere.
   */
  const [frameRows, setFrameRows] = useState<VisionFrameRow[]>([]);

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

      const frame = await listVisionFrame(session.access_token, projectId);
      setFrameRows(frame);

      const paths = [
        ...result.deliverables.map((d) => d.image_path),
        ...result.deliverables.map((d) => d.file_path),
        ...frame.map((f) => f.image_path),
      ].filter((p): p is string => !!p);
      setImageUrls(await getSignedImageUrls(session.access_token, paths));
      // Only now. Marking ready before the frame rows and signed URLs landed
      // mounted the explorer on an empty frame and blank tiles for a beat,
      // and the entrance animation played over the wrong picture.
      setStatus("ready");
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
      {/* One field, one sentence, set large.
          The gradient wash and the blurred magenta blob went: two overlapping
          effects behind white type muddied the middle of the field and read
          as decoration rather than as a ground. What carries this now is the
          scale of the type and the space around it. */}
      <div className="relative overflow-hidden bg-runfree-navyDeep">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 12% 0%, #24397F 0%, #16224F 45%, #131D45 100%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-28">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-runfree-pink">
            {church}
          </p>
          <h1 className="mt-4 font-display text-5xl font-extrabold leading-[0.95] tracking-[-0.03em] text-white sm:text-6xl lg:text-7xl">
            The Vision Stack
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/60 sm:text-xl">
            Everything your team has built — from the convictions underneath it all
            to the tools that put it to work.
          </p>
          {ready > 0 && (
            <p className="mt-8 text-sm font-semibold text-white/50">
              {ready} {ready === 1 ? "piece" : "pieces"} finished
            </p>
          )}
        </div>
      </div>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
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
          frameRows={frameRows}
          onSaveFrameBody={async (element, body) => {
            if (!accessToken) return;
            await saveVisionFrameElement(accessToken, projectId, element, { body });
            await load();
          }}
          onUploadFrameImage={async (element, file) => {
            if (!accessToken) return;
            // `replaceDeliverableImage` is named for its first caller but is
            // generic: it writes to `{project_id}/...` in the shared bucket
            // and removes the old object. Storage RLS keys on the project id
            // in the path, not on which table points at it.
            const existing = frameRows.find((r) => r.element === element)?.image_path ?? null;
            const { path } = await replaceDeliverableImage(accessToken, existing, projectId, file);
            await saveVisionFrameElement(accessToken, projectId, element, { image_path: path });
            await load();
          }}
          onOpenImage={(title, url) =>
            setPreview({ id: url, title, num: null, label: title, sizeBytes: null })
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
