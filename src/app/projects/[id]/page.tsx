"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCurrentProfile, logout } from "@/lib/auth";
import {
  createDeliverable,
  createSession,
  getProjectDetail,
  groupBySection,
  removeMember,
  sectionOrderFromStructure,
  updateDeliverable,
  updateMemberRole,
  updateSession,
  type ProjectDetail,
  type ProjectRole,
} from "@/lib/projects";
import { getSignedImageUrl, replaceDeliverableImage } from "@/lib/storage";
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
};

const KIND_LABEL: Record<string, string> = {
  handout: "Handout",
  video: "Video",
  exercise: "Exercise",
  team_bio: "Team",
  link: "Link",
};

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"checking" | "ready" | "not_found" | "error">("checking");
  const [manageOpen, setManageOpen] = useState(false);

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

      const withImages = result.deliverables.filter((d) => d.image_path);
      const urls = await Promise.all(
        withImages.map(async (d) => [d.id, await getSignedImageUrl(session.access_token, d.image_path!)] as const)
      );
      setImageUrls(Object.fromEntries(urls.filter(([, url]) => url) as [string, string][]));
    } catch (err) {
      console.error("Project load failed:", err);
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

  if (status === "checking") return <PageLoader label="Loading project…" />;
  if (status === "error") return <AccessError onRetry={load} />;
  if (status === "not_found" || !detail || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-runfree-indigo/40 px-4">
        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="h-1.5 bg-runfree-grad" />
          <div className="p-8 text-center">
            <h1 className="font-display text-2xl font-bold text-runfree-ink">Project not found</h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              Either it doesn&rsquo;t exist, or you don&rsquo;t have access to it.
            </p>
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
  const canManage = myRole === "admin" || profile.is_owner;

  const sectionOrder = sectionOrderFromStructure(detail.template?.structure);
  const sections = new Set<string>([
    ...sectionOrder,
    ...detail.resources.map((r) => r.section),
    ...detail.sessions.map((s) => s.section ?? "General"),
    ...detail.deliverables.map((d) => d.section ?? "General"),
  ]);
  const orderedSections = [
    ...sectionOrder.filter((s) => sections.has(s)),
    ...[...sections].filter((s) => !sectionOrder.includes(s)),
  ];

  const resourcesBySection = groupBySection(detail.resources, sectionOrder);
  const sessionsBySection = groupBySection(detail.sessions, sectionOrder);
  const deliverablesBySection = groupBySection(detail.deliverables, sectionOrder);

  function itemsFor<T>(grouped: Array<{ section: string; items: T[] }>, section: string): T[] {
    return grouped.find((g) => g.section === section)?.items ?? [];
  }

  async function refresh() {
    if (!accessToken) return;
    const result = await getProjectDetail(accessToken, projectId);
    if (result) setDetail(result);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader
        profile={profile}
        onSignOut={handleSignOut}
        backHref="/"
        backLabel="Your projects"
        title={detail.name}
        subtitle={detail.template ? detail.template.name : "Custom project"}
        eyebrow={detail.visibility === "team" ? "Team-wide project" : "Private project"}
      />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <TeamBar
          members={detail.members}
          canManage={canManage}
          manageOpen={manageOpen}
          onToggleManage={() => setManageOpen((v) => !v)}
          accessToken={accessToken}
          projectId={projectId}
          onChanged={refresh}
        />

        <div className="mt-8 space-y-8">
          {orderedSections.length === 0 && (
            <EmptyProjectState canEdit={canEdit} />
          )}

          {orderedSections.map((section) => (
            <SectionBlock
              key={section}
              section={section}
              resources={itemsFor(resourcesBySection, section)}
              sessions={itemsFor(sessionsBySection, section)}
              deliverables={itemsFor(deliverablesBySection, section)}
              imageUrls={imageUrls}
              canEdit={canEdit}
              accessToken={accessToken}
              onChanged={refresh}
            />
          ))}

          {canEdit && (
            <AddSectionContent
              knownSections={orderedSections}
              accessToken={accessToken}
              projectId={projectId}
              onChanged={refresh}
            />
          )}
        </div>
      </main>

      <PortalFooter />
    </div>
  );
}

function EmptyProjectState({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center">
      <p className="font-display text-lg font-semibold text-runfree-ink">Nothing here yet</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-600">
        {canEdit
          ? "Add the first session or deliverable below to get this project started."
          : "Once your coach adds a session or deliverable, it'll show up here."}
      </p>
    </div>
  );
}

function TeamBar({
  members,
  canManage,
  manageOpen,
  onToggleManage,
  accessToken,
  projectId,
  onChanged,
}: {
  members: ProjectDetail["members"];
  canManage: boolean;
  manageOpen: boolean;
  onToggleManage: () => void;
  accessToken: string | null;
  projectId: string;
  onChanged: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("viewer");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !email.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage(body.error || "Couldn't add that person");
      } else {
        setMessage(body.invited ? `Invited ${email} and added them as ${role}` : `Added ${email} as ${role}`);
        setEmail("");
        onChanged();
      }
    } catch {
      setMessage("Couldn't reach the server — try again");
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleChange(profileId: string, newRole: ProjectRole) {
    if (!accessToken) return;
    await updateMemberRole(accessToken, projectId, profileId, newRole);
    onChanged();
  }

  async function handleRemove(profileId: string) {
    if (!accessToken) return;
    await removeMember(accessToken, projectId, profileId);
    onChanged();
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {members.map((m) => (
            <span
              key={m.profileId}
              title={m.email}
              className="inline-flex items-center gap-1.5 rounded-full bg-runfree-indigo px-3 py-1 text-xs font-medium text-runfree-ink"
            >
              {m.fullName || m.email}
              <span className="text-[10px] uppercase tracking-wide text-runfree-navy/60">{m.role}</span>
            </span>
          ))}
        </div>
        {canManage && (
          <button
            onClick={onToggleManage}
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-runfree-magentaDeep outline-none ring-1 ring-runfree-magenta/30 transition hover:bg-runfree-pink focus-visible:ring-2"
          >
            {manageOpen ? "Close" : "Manage team"}
          </button>
        )}
      </div>

      {canManage && manageOpen && (
        <div className="animate-fade border-t border-gray-100 bg-gray-50 p-5">
          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block text-xs font-medium text-gray-600">Add by email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@church.org"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as ProjectRole)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-runfree-grad-deep px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Adding…" : "Add"}
            </button>
          </form>
          {message && <p className="mt-2 text-xs text-gray-600">{message}</p>}

          <div className="mt-4 divide-y divide-gray-200 border-t border-gray-200">
            {members.map((m) => (
              <div key={m.profileId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-runfree-ink">{m.fullName || m.email}</p>
                  <p className="truncate text-xs text-gray-500">{m.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.profileId, e.target.value as ProjectRole)}
                    className="rounded-lg border border-gray-300 px-2 py-1 text-xs outline-none focus:border-runfree-magenta"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    onClick={() => handleRemove(m.profileId)}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-200 hover:text-runfree-ink"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionBlock({
  section,
  resources,
  sessions,
  deliverables,
  imageUrls,
  canEdit,
  accessToken,
  onChanged,
}: {
  section: string;
  resources: ProjectDetail["resources"];
  sessions: ProjectDetail["sessions"];
  deliverables: ProjectDetail["deliverables"];
  imageUrls: Record<string, string>;
  canEdit: boolean;
  accessToken: string | null;
  onChanged: () => void;
}) {
  if (resources.length === 0 && sessions.length === 0 && deliverables.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
      <div className="h-1 bg-runfree-grad" />
      <div className="p-6">
        <h2 className="font-display text-lg font-bold text-runfree-ink">{section}</h2>

        {resources.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {resources.map((r) => (
              <a
                key={r.id}
                href={r.external_url ?? "#"}
                target={r.external_url ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-runfree-ink transition hover:border-runfree-magenta/40 hover:bg-runfree-pink"
              >
                <span className="rounded-full bg-runfree-indigo px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-runfree-navy">
                  {KIND_LABEL[r.kind] ?? r.kind}
                </span>
                {r.title}
              </a>
            ))}
          </div>
        )}

        {sessions.length > 0 && (
          <div className="mt-5 space-y-2">
            {sessions.map((s) => (
              <SessionCard key={s.id} session={s} canEdit={canEdit} accessToken={accessToken} onChanged={onChanged} />
            ))}
          </div>
        )}

        {deliverables.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {deliverables.map((d) => (
              <DeliverableTile
                key={d.id}
                deliverable={d}
                imageUrl={imageUrls[d.id]}
                canEdit={canEdit}
                accessToken={accessToken}
                onChanged={onChanged}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SessionCard({
  session,
  canEdit,
  accessToken,
  onChanged,
}: {
  session: ProjectDetail["sessions"][number];
  canEdit: boolean;
  accessToken: string | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    recording_url: session.recording_url ?? "",
    transcript: session.transcript ?? "",
    takeaways: session.takeaways ?? "",
    commitments: session.commitments ?? "",
    published: !!session.published_at,
  });

  async function save() {
    if (!accessToken) return;
    setSaving(true);
    try {
      await updateSession(accessToken, session.id, {
        recording_url: form.recording_url || null,
        transcript: form.transcript || null,
        takeaways: form.takeaways || null,
        commitments: form.commitments || null,
        published_at: form.published ? new Date().toISOString() : null,
      });
      onChanged();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-runfree-ink">{session.title}</p>
          <p className="text-xs text-gray-500">
            {session.held_on ?? "No date set"} · {session.published_at ? "Published" : "Draft"}
          </p>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="animate-fade space-y-3 border-t border-gray-100 px-4 py-4">
          {canEdit ? (
            <>
              <Field label="Recording link (Loom / Zoom)">
                <input
                  value={form.recording_url}
                  onChange={(e) => setForm((f) => ({ ...f, recording_url: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
                />
              </Field>
              <Field label="Takeaways">
                <textarea
                  value={form.takeaways}
                  onChange={(e) => setForm((f) => ({ ...f, takeaways: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
                />
              </Field>
              <Field label="Commitments">
                <textarea
                  value={form.commitments}
                  onChange={(e) => setForm((f) => ({ ...f, commitments: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
                />
              </Field>
              <Field label="Transcript">
                <textarea
                  value={form.transcript}
                  onChange={(e) => setForm((f) => ({ ...f, transcript: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))}
                />
                Published (visible to viewers)
              </label>
              <button
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-runfree-grad-deep px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <>
              {session.recording_url && (
                <a
                  href={session.recording_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm font-medium text-runfree-magentaDeep hover:underline"
                >
                  Watch recording
                </a>
              )}
              {session.takeaways && <p className="text-sm text-gray-700">{session.takeaways}</p>}
              {session.commitments && (
                <p className="text-sm text-gray-700">
                  <span className="font-medium">Commitments:</span> {session.commitments}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}

function DeliverableTile({
  deliverable,
  imageUrl,
  canEdit,
  accessToken,
  onChanged,
}: {
  deliverable: ProjectDetail["deliverables"][number];
  imageUrl?: string;
  canEdit: boolean;
  accessToken: string | null;
  onChanged: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file || !accessToken) return;
    setUploading(true);
    try {
      const { path } = await replaceDeliverableImage(accessToken, deliverable.image_path, deliverable.project_id, file);
      await updateDeliverable(accessToken, deliverable.id, { image_path: path });
      onChanged();
    } catch (err) {
      console.error("Image upload failed:", err);
    } finally {
      setUploading(false);
    }
  }

  async function togglePublish() {
    if (!accessToken) return;
    await updateDeliverable(accessToken, deliverable.id, {
      published_at: deliverable.published_at ? null : new Date().toISOString(),
    });
    onChanged();
  }

  return (
    <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
      <div
        onDragOver={(e) => {
          if (!canEdit) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!canEdit) return;
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => canEdit && fileInputRef.current?.click()}
        className={`flex aspect-square items-center justify-center overflow-hidden ${
          canEdit ? "cursor-pointer" : ""
        } ${dragOver ? "ring-2 ring-inset ring-runfree-magenta" : ""}`}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={deliverable.title} className="h-full w-full object-cover" />
        ) : deliverable.external_url ? (
          <a
            href={deliverable.external_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full items-center justify-center p-3 text-center text-xs font-medium text-runfree-magentaDeep hover:underline"
          >
            Open link
          </a>
        ) : (
          <span className="px-3 text-center text-xs text-gray-400">
            {uploading ? "Uploading…" : canEdit ? "Drop an image, or click to upload" : "Not added yet"}
          </span>
        )}
        {canEdit && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-2 p-2.5">
        <p className="truncate text-xs font-medium text-runfree-ink">{deliverable.title}</p>
        {canEdit && (
          <button
            onClick={togglePublish}
            title={deliverable.published_at ? "Published — click to unpublish" : "Draft — click to publish"}
            className={`h-2 w-2 shrink-0 rounded-full ${
              deliverable.published_at ? "bg-runfree-magenta" : "bg-gray-300"
            }`}
          />
        )}
      </div>
    </div>
  );
}

function AddSectionContent({
  knownSections,
  accessToken,
  projectId,
  onChanged,
}: {
  knownSections: string[];
  accessToken: string | null;
  projectId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"session" | "deliverable">("deliverable");
  const [title, setTitle] = useState("");
  const [section, setSection] = useState(knownSections[0] ?? "");
  const [busy, setBusy] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !title.trim()) return;
    setBusy(true);
    try {
      if (kind === "session") {
        await createSession(accessToken, projectId, { title: title.trim(), section: section || null });
      } else {
        await createDeliverable(accessToken, projectId, { title: title.trim(), section: section || null });
      }
      setTitle("");
      onChanged();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border-2 border-dashed border-gray-300 bg-white py-6 text-sm font-medium text-gray-500 transition hover:border-runfree-magenta/40 hover:text-runfree-magentaDeep"
      >
        + Add a session or deliverable
      </button>
    );
  }

  return (
    <form onSubmit={handleAdd} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "session" | "deliverable")}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta"
          >
            <option value="deliverable">Deliverable</option>
            <option value="session">Session</option>
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-gray-600">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Section</label>
          <input
            value={section}
            onChange={(e) => setSection(e.target.value)}
            list="known-sections"
            placeholder="e.g. Mod #1 FUNNEL FUSION"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
          />
          <datalist id="known-sections">
            {knownSections.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-runfree-grad-deep px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:text-runfree-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
