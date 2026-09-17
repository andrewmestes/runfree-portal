"use client";

import { useState } from "react";
import RichText, { RichTextView } from "@/components/RichText";
import { richTextIsEmpty } from "@/lib/rich-text";
import {
  TEMPLATE_GROUPS,
  VISION_TEMPLATES,
  templateByKey,
  templateIcon,
} from "@/lib/god-dreams";
import {
  addVisionTemplate,
  removeHorizonFile,
  removeVisionTemplate,
  saveHorizonBox,
  uploadHorizonFile,
  type ExecutionData,
} from "@/lib/execution";
import { Chip, EditorActions, Icon, Label, PINK_BUTTON, SubHeading } from "./ui";

/**
 * Beyond the Horizon — the 5-to-20-year vision, and the templates that name
 * its shape.
 *
 * Andrew: "maybe a place for their two vision templates at the top of the
 * 1:4:1:4." The 12 Templates handout is explicit that they describe the
 * Beyond-the-Horizon vision specifically, so this is the only band they could
 * correctly live on.
 *
 * **Two, and the picker stops there.** Andrew called them "their two vision
 * templates", and God Dreams treats the choice as a primary plus a secondary
 * — a church that has picked five has not finished choosing. Same argument as
 * the four Background boxes. If that needs loosening it is `MAX_TEMPLATES`.
 */
const MAX_TEMPLATES = 2;

export default function BeyondDetail({
  data,
  projectId,
  accessToken,
  canEdit,
  onChanged,
}: {
  data: ExecutionData;
  projectId: string;
  accessToken: string;
  canEdit: boolean;
  onChanged: () => Promise<void>;
}) {
  const box = data.horizon.find((h) => h.horizon === "beyond" && h.position === 0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const chosen = data.templates;

  async function attach(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const up = await uploadHorizonFile(accessToken, projectId, file);
      const old = box?.file_path ?? null;
      await saveHorizonBox(accessToken, projectId, "beyond", 0, {
        file_path: up.path,
        file_name: up.name,
        file_size: up.size,
      });
      if (old) await removeHorizonFile(accessToken, old).catch(() => {});
      await onChanged();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Could not attach that file");
    } finally {
      setUploading(false);
    }
  }
  const full = chosen.length >= MAX_TEMPLATES;

  return (
    <div className="space-y-8">
      <section>
        <SubHeading icon="telescope">The vivid description</SubHeading>
        {editing ? (
          <div className="mt-3 space-y-2">
            <RichText
              value={draft}
              onChange={setDraft}
              minHeight="9rem"
              placeholder="What would people say about this church a generation from now? Paint the picture, don't summarise it."
            />
            <EditorActions
              busy={busy}
              onSave={async () => {
                setBusy(true);
                try {
                  await saveHorizonBox(accessToken, projectId, "beyond", 0, {
                    body: richTextIsEmpty(draft) ? null : draft,
                  });
                  await onChanged();
                  setEditing(false);
                } finally {
                  setBusy(false);
                }
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : richTextIsEmpty(box?.body) ? (
          <p className="mt-3 text-sm text-gray-500">
            {canEdit
              ? "Not written yet. This is the long-range dream — the one that outlives the current staff."
              : "Not written yet."}
          </p>
        ) : (
          <RichTextView html={box!.body!} className="mt-3 !text-base !text-runfree-ink" />
        )}
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(box?.body ?? "");
              setEditing(true);
            }}
            className="mt-1.5 text-[11px] font-semibold text-gray-500 transition hover:text-runfree-magentaDeep"
          >
            {richTextIsEmpty(box?.body) ? "Write it" : "Edit"}
          </button>
        )}
      </section>

      {/* The full vivid description as a document (076). Andrew: "there's a
          PDF that they could click on that has their full vivid description."
          It opens from the board, beside the templates. */}
      <section>
        <SubHeading icon="book">The full vivid description, as a PDF</SubHeading>
        {box?.file_path ? (
          <p className="mt-3 flex flex-wrap items-center gap-3 text-sm text-runfree-ink">
            <span className="font-medium">{box.file_name ?? "Vivid description.pdf"}</span>
            {canEdit && (
              <button
                type="button"
                onClick={async () => {
                  if (!confirm("Remove the attached PDF?")) return;
                  const old = box.file_path!;
                  await saveHorizonBox(accessToken, projectId, "beyond", 0, {
                    file_path: null,
                    file_name: null,
                    file_size: null,
                  });
                  await removeHorizonFile(accessToken, old).catch(() => {});
                  await onChanged();
                }}
                className="text-[11px] font-semibold text-gray-500 transition hover:text-rose-600"
              >
                Remove
              </button>
            )}
          </p>
        ) : (
          <p className="mt-3 text-sm text-gray-500">
            The church&rsquo;s written vivid description, opened from the board with one click.
          </p>
        )}
        {canEdit && (
          <label className={`${PINK_BUTTON} mt-3 cursor-pointer focus-within:ring-2 focus-within:ring-runfree-magenta`}>
            <Icon name="book" className="h-3.5 w-3.5" />
            {uploading ? "Attaching…" : box?.file_path ? "Replace the PDF" : "Attach a PDF"}
            <input
              type="file"
              accept="application/pdf"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void attach(f);
                e.target.value = "";
              }}
            />
          </label>
        )}
        {uploadError && <p className="mt-1 text-xs text-red-600">{uploadError}</p>}
      </section>

      <section>
        <SubHeading
          icon="flag"
          aside={
            <span className="flex items-center gap-3">
              <span className="text-[11px] tabular-nums text-gray-500">
                {chosen.length} of {MAX_TEMPLATES}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setPicking((v) => !v)}
                  aria-expanded={picking}
                  className={PINK_BUTTON}
                >
                  {picking ? "Done" : chosen.length ? "Change" : "Choose"}
                </button>
              )}
            </span>
          }
        >
          Vision templates
        </SubHeading>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          Which of Will&rsquo;s twelve describe this vision. Most churches land on two — a
          primary and a secondary.
        </p>

        {chosen.length > 0 && (
          <ul className="mt-3 space-y-2">
            {chosen.map((row) => {
              const t = templateByKey(row.template_key);
              if (!t) return null;
              return (
                <li
                  key={row.id}
                  className="flex items-center gap-3 rounded-2xl bg-white px-3.5 py-3 shadow-sm ring-1 ring-gray-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={templateIcon(t.key)}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-lg"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-runfree-ink">{t.name}</span>
                      <Chip tone="navy">
                        {TEMPLATE_GROUPS.find((g) => g.key === t.group)?.label}
                      </Chip>
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-gray-600">{t.definition}</p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={async () => {
                        await removeVisionTemplate(accessToken, row.id);
                        await onChanged();
                      }}
                      title="Remove"
                      aria-label={`Remove ${t.name}`}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Icon name="x" className="h-4 w-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {picking && canEdit && (
          <div className="mt-4 space-y-4 rounded-2xl bg-gray-50 p-4">
            {full && (
              <p className="text-xs text-gray-500">
                Two chosen. Remove one to swap it.
              </p>
            )}
            {TEMPLATE_GROUPS.map((g) => (
              <div key={g.key}>
                <p className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.icon} alt="" className="h-4 w-4 rounded" />
                  <Label>{g.label}</Label>
                </p>
                <div className="mt-1.5 grid gap-1.5 sm:grid-cols-3">
                  {VISION_TEMPLATES.filter((t) => t.group === g.key).map((t) => {
                    const already = chosen.some((c) => c.template_key === t.key);
                    return (
                      <button
                        key={t.key}
                        type="button"
                        title={t.definition}
                        disabled={already || full}
                        onClick={async () => {
                          await addVisionTemplate(accessToken, projectId, t.key, chosen.length);
                          await onChanged();
                        }}
                        className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold ring-1 transition ${
                          already
                            ? "bg-runfree-pink text-runfree-magentaDeep ring-runfree-magenta/40"
                            : full
                              ? "cursor-not-allowed bg-white text-gray-400 ring-gray-200"
                              : "bg-white text-runfree-ink ring-gray-200 hover:ring-runfree-magenta/40"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={templateIcon(t.key)} alt="" className="h-6 w-6 shrink-0 rounded" />
                        <span className="min-w-0">{t.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
