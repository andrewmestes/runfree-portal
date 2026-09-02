"use client";

import { useState } from "react";
import RichText, { RichTextView } from "./RichText";
import { richTextIsEmpty } from "@/lib/rich-text";
import {
  VISION_FRAME,
  framePrompt,
  type FrameVoice,
  type VisionFrameElement,
  type VisionFrameRow,
} from "@/lib/vision-frame";

/**
 * The Vision Frame Progress sheet, in the portal.
 *
 * Laid out like the sheet itself — icon and label down the left, the church's
 * own words on the right — because that sheet is what the room has been
 * looking at for six months, and a different arrangement here would read as a
 * different document.
 *
 * Rows with nothing in them still render, greyed, with the prompt showing.
 * That is the point of calling it *progress*: a church three modules in should
 * be able to see the shape of what is coming and what is still blank. Andrew's
 * own template ships with "In Process…" written into Vision Proper.
 */
export default function VisionFramePanel({
  rows,
  canEdit,
  onSave,
  elements,
  voice = "church",
}: {
  rows: VisionFrameRow[];
  canEdit: boolean;
  onSave: (element: VisionFrameElement, body: string | null) => Promise<void>;
  /** Which rows this template's sheet carries (067). Omitted: all seven. */
  elements?: string[] | null;
  voice?: FrameVoice;
}) {
  const [editing, setEditing] = useState<VisionFrameElement | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  // A nonprofit's frame has no Kingdom Concept: the template says which rows
  // belong on its sheet, in the sheet's own order.
  const frame = elements ? VISION_FRAME.filter((e) => elements.includes(e.key)) : VISION_FRAME;
  const byKey = new Map(rows.map((r) => [r.element, r]));
  const filled = frame.filter((e) => !richTextIsEmpty(byKey.get(e.key)?.body)).length;

  // Nothing written and nobody who could write it: a church with no frame yet
  // sees the empty sheet, which is informative, but only once there is a
  // reason for them to be looking at it.
  if (filled === 0 && !canEdit) return null;

  return (
    <section className="mt-10">
      <header className="mb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-runfree-magentaDeep">
          In their own words
        </p>
        <h3 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-runfree-ink">
          Vision Frame Progress
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          {filled === frame.length
            ? `All ${frame.length} are written.`
            : `${filled} of ${frame.length} written so far.`}
        </p>
      </header>

      <div className="overflow-hidden rounded-2xl ring-1 ring-gray-200">
        {frame.map((el, i) => {
          const row = byKey.get(el.key);
          const empty = richTextIsEmpty(row?.body);
          const isEditing = editing === el.key;

          return (
            <div
              key={el.key}
              className={`flex flex-col gap-3 px-4 py-4 sm:flex-row sm:gap-5 sm:px-5 ${
                i > 0 ? "border-t border-gray-200" : ""
              } ${i % 2 === 1 ? "bg-gray-50/70" : "bg-white"}`}
            >
              {/* The label rail. Fixed width from sm up so all seven line up
                  the way they do on the printed sheet. */}
              <div className="flex shrink-0 items-center gap-3 sm:w-40 sm:flex-col sm:items-center sm:gap-2 sm:text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={el.icon}
                  alt=""
                  className="h-10 w-10 shrink-0 object-contain sm:h-14 sm:w-14"
                  onError={(e) => {
                    // The seven element icons are brand art that has not been
                    // handed over yet. Until the files land at
                    // /brand/vision-frame/, the row shows its name alone
                    // rather than a broken image.
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
                <p className="text-sm font-bold leading-tight text-runfree-ink">{el.label}</p>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs leading-relaxed text-gray-500">
                  {el.question && (
                    <span className="font-bold uppercase tracking-wide text-runfree-navy">
                      {el.question} —{" "}
                    </span>
                  )}
                  {framePrompt(el.key, voice)}
                </p>

                <div className="mt-2">
                  {isEditing ? (
                    <div className="space-y-2">
                      <RichText
                        value={draft}
                        onChange={setDraft}
                        minHeight="7rem"
                        placeholder={`${el.label} — in ${voice === "church" ? "the church's" : "your"} own words.`}
                      />
                      <div className="flex items-center gap-2">
                        <button
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              await onSave(el.key, richTextIsEmpty(draft) ? null : draft);
                              setEditing(null);
                            } finally {
                              setBusy(false);
                            }
                          }}
                          className="rounded-lg bg-runfree-grad px-3.5 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                        >
                          {busy ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="rounded-lg px-2.5 py-2 text-xs text-gray-500 transition hover:text-runfree-ink"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : empty ? (
                    <p className="text-sm italic text-gray-400">
                      Not written yet.
                    </p>
                  ) : (
                    <RichTextView html={row!.body!} className="text-runfree-ink" />
                  )}
                </div>

                {canEdit && !isEditing && (
                  <button
                    onClick={() => {
                      setDraft(row?.body ?? "");
                      setEditing(el.key);
                    }}
                    className="mt-2 text-[11px] font-semibold text-gray-400 transition hover:text-runfree-magentaDeep"
                  >
                    {empty ? "Write it" : "Edit"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
