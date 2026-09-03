"use client";

import { useState } from "react";
import RichText, { RichTextView } from "@/components/RichText";
import { richTextIsEmpty } from "@/lib/rich-text";
import { BACKGROUND_NOTE_FIELDS } from "@/lib/god-dreams";
import { saveHorizonBox, type ExecutionData, type HorizonBox } from "@/lib/execution";
import { Cell, EditorActions } from "./ui";

/**
 * One Background Vision priority, opened.
 *
 * Andrew: "The Background elements need to open with more detail as well when
 * clicked on." The handout that opens is "Background Vision Notes - 3 years",
 * which is three columns — Where We Stand, Where We're Headed, How We'll Get
 * There — so those are the three fields, in that order, under the headline.
 *
 * All four boxes exist from the start. They used to reveal one at a time,
 * which Andrew flagged: "all 4 background areas should be editable. not just
 * the first ... that's not intuitive." A four-box sheet with three boxes
 * hidden is not the sheet.
 */
export default function BackgroundDetail({
  data,
  position,
  projectId,
  accessToken,
  canEdit,
  onChanged,
}: {
  data: ExecutionData;
  position: number;
  projectId: string;
  accessToken: string;
  canEdit: boolean;
  onChanged: () => Promise<void>;
}) {
  const box = data.horizon.find((h) => h.horizon === "background" && h.position === position);
  const [editing, setEditing] = useState<keyof HorizonBox | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (field: "body" | (typeof BACKGROUND_NOTE_FIELDS)[number]["key"]) => {
    setBusy(true);
    try {
      await saveHorizonBox(accessToken, projectId, "background", position, {
        [field]: richTextIsEmpty(draft) ? null : draft,
      });
      await onChanged();
      setEditing(null);
    } finally {
      setBusy(false);
    }
  };

  const open = (field: keyof HorizonBox, current: string | null | undefined) => {
    setDraft(current ?? "");
    setEditing(field);
  };

  return (
    <div className="space-y-6">
      {/* The objective's title (076). Andrew: "a title for the background
          horizon objective and a full description that ties along with it." */}
      <section>
        <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-navy">
          Title
        </h4>
        <Cell
          value={box?.title ?? null}
          onSave={(v) =>
            void saveHorizonBox(accessToken, projectId, "background", position, { title: v }).then(onChanged)
          }
          disabled={!canEdit}
          placeholder={`Objective ${position + 1} — a name the team can say`}
          ariaLabel="Objective title"
          className="!px-0 font-display !text-lg font-extrabold tracking-tight !text-runfree-ink"
        />
      </section>

      <section>
        <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-navy">
          The objective, in full
        </h4>
        {editing === "body" ? (
          <div className="mt-2 space-y-2">
            <RichText
              value={draft}
              onChange={setDraft}
              minHeight="6rem"
              placeholder="One of the four things that must be true in three years — a sentence or two, and why it matters."
            />
            <EditorActions busy={busy} onSave={() => save("body")} onCancel={() => setEditing(null)} />
          </div>
        ) : richTextIsEmpty(box?.body) ? (
          <p className="mt-1.5 text-sm italic text-gray-400">
            Not written yet.
          </p>
        ) : (
          <div className="mt-1.5">
            <RichTextView html={box!.body!} className="!text-base !text-runfree-ink" />
          </div>
        )}
        {canEdit && editing !== "body" && (
          <button
            onClick={() => open("body", box?.body)}
            className="mt-1.5 text-[11px] font-semibold text-gray-500 transition hover:text-runfree-magentaDeep"
          >
            {richTextIsEmpty(box?.body) ? "Write it" : "Edit"}
          </button>
        )}
      </section>

      {/* The Background Vision Notes sheet. Three columns on a wide screen,
          stacked on a phone — they are read together, so they stay together
          rather than becoming three collapsed sections. */}
      <div className="grid gap-4 lg:grid-cols-3">
        {BACKGROUND_NOTE_FIELDS.map((f) => {
          const value = box?.[f.key] ?? null;
          const isEditing = editing === f.key;
          const blank = richTextIsEmpty(value);
          if (blank && !canEdit) return null;
          return (
            <section key={f.key} className="rounded-xl bg-white px-4 py-3.5 ring-1 ring-gray-200">
              <h5 className="text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-navy">
                {f.label}
              </h5>
              {isEditing ? (
                <div className="mt-2 space-y-2">
                  <RichText value={draft} onChange={setDraft} minHeight="7rem" placeholder={f.hint} />
                  <EditorActions
                    busy={busy}
                    onSave={() => save(f.key)}
                    onCancel={() => setEditing(null)}
                  />
                </div>
              ) : blank ? (
                <p className="mt-1 text-xs italic leading-relaxed text-gray-400">{f.hint}</p>
              ) : (
                <div className="mt-1.5">
                  <RichTextView html={value!} className="text-runfree-ink" />
                </div>
              )}
              {canEdit && !isEditing && (
                <button
                  onClick={() => open(f.key, value)}
                  className="mt-1.5 text-[11px] font-semibold text-gray-500 transition hover:text-runfree-magentaDeep"
                >
                  {blank ? "Write it" : "Edit"}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
