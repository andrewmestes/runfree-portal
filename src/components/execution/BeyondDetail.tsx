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
  removeVisionTemplate,
  saveHorizonBox,
  type ExecutionData,
} from "@/lib/execution";
import { Chip, EditorActions } from "./ui";

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

  const chosen = data.templates;
  const full = chosen.length >= MAX_TEMPLATES;

  return (
    <div className="space-y-6">
      <section>
        <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-navy">
          The vivid description
        </h4>
        {editing ? (
          <div className="mt-2 space-y-2">
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
          <p className="mt-1.5 text-sm italic text-gray-400">
            {canEdit
              ? "Not written yet. This is the long-range dream — the one that outlives the current staff."
              : "Not written yet."}
          </p>
        ) : (
          <div className="mt-1.5">
            <RichTextView html={box!.body!} className="text-runfree-ink" />
          </div>
        )}
        {canEdit && !editing && (
          <button
            onClick={() => {
              setDraft(box?.body ?? "");
              setEditing(true);
            }}
            className="mt-1.5 text-[11px] font-semibold text-gray-400 transition hover:text-runfree-magentaDeep"
          >
            {richTextIsEmpty(box?.body) ? "Write it" : "Edit"}
          </button>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-navy">
            Vision templates
          </h4>
          {canEdit && (
            <button
              onClick={() => setPicking((v) => !v)}
              className="text-[11px] font-semibold text-runfree-magentaDeep transition hover:underline"
            >
              {picking ? "Done" : chosen.length ? "Change" : "Choose"}
            </button>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
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
                  className="flex items-start gap-3 rounded-xl bg-white px-3.5 py-3 ring-1 ring-gray-200"
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
                      onClick={async () => {
                        await removeVisionTemplate(accessToken, row.id);
                        await onChanged();
                      }}
                      title="Remove"
                      className="shrink-0 text-gray-300 transition hover:text-rose-600"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        className="h-4 w-4"
                      >
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {picking && canEdit && (
          <div className="mt-4 space-y-4 rounded-xl bg-gray-50 p-4">
            {full && (
              <p className="text-xs text-gray-500">
                Two chosen. Remove one to swap it.
              </p>
            )}
            {TEMPLATE_GROUPS.map((g) => (
              <div key={g.key}>
                <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.icon} alt="" className="h-4 w-4 rounded" />
                  {g.label}
                </p>
                <div className="mt-1.5 grid gap-1.5 sm:grid-cols-3">
                  {VISION_TEMPLATES.filter((t) => t.group === g.key).map((t) => {
                    const already = chosen.some((c) => c.template_key === t.key);
                    return (
                      <button
                        key={t.key}
                        title={t.definition}
                        disabled={already || full}
                        onClick={async () => {
                          await addVisionTemplate(accessToken, projectId, t.key, chosen.length);
                          await onChanged();
                        }}
                        className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition ${
                          already
                            ? "bg-runfree-pink text-runfree-magentaDeep"
                            : full
                              ? "cursor-not-allowed bg-white text-gray-300 ring-1 ring-gray-200"
                              : "bg-white text-runfree-ink ring-1 ring-gray-200 hover:ring-runfree-magenta/50"
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
