"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCurrentFramer, isPortalAdmin, logout } from "@/lib/auth";
import { parseVideoUrl, PROVIDER_LABEL } from "@/lib/video";
import PortalHeader from "@/components/PortalHeader";
import AccessError from "@/components/AccessError";
import { Field, FormError, FormNotice } from "@/components/AuthShell";

type Framer = {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
};

type Video = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  module: string | null;
  sort_order: number;
  is_published: boolean;
};

export default function AdminVideosPage() {
  const [framer, setFramer] = useState<Framer | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  // Set when init() throws outright, so the page stops on a retry screen
  // instead of sitting on its loader with nothing left to set it false.
  const [fatal, setFatal] = useState(false);

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [module, setModule] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const router = useRouter();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("training_videos")
      .select("id,title,url,description,module,sort_order,is_published")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setVideos(data || []);
  }, []);

  useEffect(() => {
    async function init() {
      const current = (await getCurrentFramer()) as Framer | null;
      if (!(await isPortalAdmin())) {
        router.replace("/resources");
        return;
      }
      setFramer(current);
      await load();

      // Offer the Drive module names as grouping options
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        const res = await fetch("/api/library", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const body = await res.json();
          setModules(
            (body.modules || []).map((m: { name: string }) => m.name)
          );
        }
      }

      setLoading(false);
    }
    init().catch((err) => {
      console.error("Admin videos init failed:", err);
      setFatal(true);
      setLoading(false);
    });
  }, [router, load]);

  async function handleSignOut() {
    await logout();
    router.replace("/auth/login");
  }

  const parsed = url ? parseVideoUrl(url) : null;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");

    if (!framer) return;

    if (parsed && !parsed.embedUrl) {
      setError(
        "That link isn't one we can embed. Loom, YouTube, Vimeo, and Google Drive video links all work."
      );
      return;
    }

    setSaving(true);

    const { error: insertError } = await supabase.from("training_videos").insert({
      title: title.trim(),
      url: url.trim(),
      description: description.trim() || null,
      module: module.trim() || null,
      sort_order: videos.length,
      created_by: framer.id,
    });

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNotice(`Added "${title.trim()}".`);
    setTitle("");
    setUrl("");
    setDescription("");
    await load();
  }

  async function togglePublished(v: Video) {
    await supabase
      .from("training_videos")
      .update({ is_published: !v.is_published })
      .eq("id", v.id);
    await load();
  }

  async function remove(v: Video) {
    await supabase.from("training_videos").delete().eq("id", v.id);
    setConfirmId(null);
    await load();
  }

  if (fatal) {
    return <AccessError onRetry={() => window.location.reload()} />;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-1.5 w-24 rounded-full bg-runfree-grad" />
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader
        framer={framer}
        onSignOut={handleSignOut}
        title="Training Videos"
        subtitle="Paste a Loom, YouTube, Vimeo, or Drive link"
        backHref="/admin"
        backLabel="← Admin"
      />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="h-1.5 bg-runfree-grad" />
          <form onSubmit={handleAdd} className="space-y-5 p-6">
            <FormError message={error} />
            <FormNotice message={notice} />

            <Field id="title" label="Title" value={title} onChange={setTitle} />

            <div>
              <label
                htmlFor="url"
                className="mb-1.5 block text-sm font-medium text-runfree-ink"
              >
                Video link
              </label>
              <input
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.loom.com/share/…"
                required
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none transition placeholder:text-gray-500 focus:border-runfree-magenta focus:ring-2 focus:ring-runfree-magenta/25"
              />
              {url && (
                <p
                  className={`mt-1.5 text-xs ${
                    parsed?.embedUrl ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {parsed?.embedUrl
                    ? `Detected ${PROVIDER_LABEL[parsed.provider]} — will play inside the portal`
                    : "Can't embed that link. Loom, YouTube, Vimeo, or a Drive video link."}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="description"
                className="mb-1.5 block text-sm font-medium text-runfree-ink"
              >
                Description <span className="text-gray-500">(optional)</span>
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none transition focus:border-runfree-magenta focus:ring-2 focus:ring-runfree-magenta/25"
              />
            </div>

            <div>
              <label
                htmlFor="module"
                className="mb-1.5 block text-sm font-medium text-runfree-ink"
              >
                Group under <span className="text-gray-500">(optional)</span>
              </label>
              <input
                id="module"
                list="module-options"
                value={module}
                onChange={(e) => setModule(e.target.value)}
                placeholder="Leave blank for General"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none transition placeholder:text-gray-500 focus:border-runfree-magenta focus:ring-2 focus:ring-runfree-magenta/25"
              />
              <datalist id="module-options">
                {modules.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <p className="mt-1.5 text-xs text-gray-500">
                Matching a module name groups the video with those handouts.
              </p>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-runfree-grad-deep px-6 py-2.5 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Adding…" : "Add Video"}
            </button>
          </form>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          {videos.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-gray-500">
              No videos yet.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {videos.map((v) => (
                <li
                  key={v.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4"
                >
                  <div className="min-w-[12rem] flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-runfree-ink">
                        {v.title}
                      </span>
                      {!v.is_published && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                          Hidden
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      {PROVIDER_LABEL[parseVideoUrl(v.url).provider]}
                      {v.module ? ` · ${v.module}` : ""}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => togglePublished(v)}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 ring-1 ring-gray-200 transition hover:text-runfree-magentaDeep hover:ring-runfree-magenta/40"
                    >
                      {v.is_published ? "Hide" : "Show"}
                    </button>

                    {confirmId === v.id ? (
                      <span className="flex items-center gap-2">
                        <button
                          onClick={() => remove(v)}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          className="text-sm text-gray-500 hover:text-gray-700"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmId(v.id)}
                        className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 ring-1 ring-red-200 transition hover:bg-red-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
