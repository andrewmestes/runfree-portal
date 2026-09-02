"use client";

import { useRef, useState } from "react";
import RichText, { RichTextView } from "@/components/RichText";
import { richTextIsEmpty } from "@/lib/rich-text";
import {
  FRAME_SIDES,
  FRAME_SIDE_IS_VISUAL,
  VISION_FRAME,
  type VisionFrameElement,
  type VisionFrameRow,
} from "@/lib/vision-frame";

/**
 * The four sides of the Vision Frame, in the Vision Stack.
 *
 * Andrew: "for the vision frame within the vision stack, do 4 rows, one for
 * each side of the frame. the Mission statement icon and a text space for the
 * mission statement available. the only different one would be the Strategy,
 * where an image is able to be uploaded for the visual strategy to show up."
 *
 * So this layer leads with the church's own words rather than a grid of file
 * tiles. It reads the SAME `vision_frame` rows the Deliverables panel writes
 * — there is one copy of a church's mission statement in this portal, and it
 * is here.
 *
 * Strategy is the odd one because it is the odd one in the room: Mission,
 * Values and Measures come out of a session as sentences, and Strategy comes
 * out as a napkin sketch. A text box alone would have been the wrong shape
 * for it.
 */
export default function FrameSides({
  rows,
  imageUrls,
  canEdit,
  onSaveBody,
  onUploadImage,
  onOpenImage,
}: {
  rows: VisionFrameRow[];
  imageUrls: Record<string, string>;
  canEdit: boolean;
  onSaveBody: (element: VisionFrameElement, body: string | null) => Promise<void>;
  onUploadImage: (element: VisionFrameElement, file: File) => Promise<void>;
  /** Show the sketch full size in the same modal a deliverable uses. */
  onOpenImage: (title: string, url: string) => void;
}) {
  const byKey = new Map(rows.map((r) => [r.element, r]));

  return (
    <div className="divide-y divide-gray-200/70 border-y border-gray-200/70">
      {FRAME_SIDES.map((key) => {
        const meta = VISION_FRAME.find((e) => e.key === key)!;
        return (
          <FrameSide
            key={key}
            element={key}
            label={meta.label}
            question={meta.question}
            prompt={meta.prompt}
            icon={meta.icon}
            row={byKey.get(key) ?? null}
            imageUrls={imageUrls}
            canEdit={canEdit}
            onSaveBody={onSaveBody}
            onUploadImage={onUploadImage}
            onOpenImage={onOpenImage}
          />
        );
      })}
    </div>
  );
}

function FrameSide({
  element,
  label,
  question,
  prompt,
  icon,
  row,
  imageUrls,
  canEdit,
  onSaveBody,
  onUploadImage,
  onOpenImage,
}: {
  element: VisionFrameElement;
  label: string;
  question: string | null;
  prompt: string;
  icon: string;
  row: VisionFrameRow | null;
  imageUrls: Record<string, string>;
  canEdit: boolean;
  onSaveBody: (element: VisionFrameElement, body: string | null) => Promise<void>;
  onUploadImage: (element: VisionFrameElement, file: File) => Promise<void>;
  onOpenImage: (title: string, url: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const isVisual = !!FRAME_SIDE_IS_VISUAL[element];
  const blank = richTextIsEmpty(row?.body);
  const sketch = row?.image_path ? imageUrls[row.image_path] : undefined;

  return (
    <section className="grid gap-5 py-8 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-7">
      {/* The frame's own mark. These are the RunFree-drawn icons — a compass
          for Mission, a fire for Values, a flashlight for Strategy, a
          bullseye for Measures — so a church recognises the side before it
          reads the word. */}
      <div className="flex items-start gap-4 sm:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={icon}
          alt=""
          className="h-12 w-12 shrink-0 object-contain sm:h-16 sm:w-16"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <div className="sm:mt-3 sm:w-28">
          <h4 className="font-display text-lg font-extrabold tracking-tight text-runfree-ink">
            {label}
          </h4>
          {question && (
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-magentaDeep">
              {question}
            </p>
          )}
        </div>
      </div>

      <div className="min-w-0">
        {editing ? (
          <div className="space-y-2">
            <RichText
              value={draft}
              onChange={setDraft}
              minHeight="8rem"
              placeholder={`${label} — in the church's own words.`}
            />
            <div className="flex items-center gap-2">
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onSaveBody(element, richTextIsEmpty(draft) ? null : draft);
                    setEditing(false);
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded-full bg-runfree-grad px-5 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-2 py-2 text-xs text-gray-500 transition hover:text-runfree-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : blank ? (
          <p className="max-w-2xl text-lg leading-relaxed text-gray-400">
            {canEdit ? prompt : "Not written yet."}
          </p>
        ) : (
          /* Set larger than body copy on purpose. This is the sentence the
             church will put on a wall — it should not read like a form
             field. */
          <RichTextView
            html={row!.body!}
            className="max-w-2xl !text-lg !leading-relaxed !text-runfree-ink"
          />
        )}

        {/* Strategy's sketch. */}
        {isVisual && (
          <div className="mt-5">
            {sketch ? (
              <button
                onClick={() => onOpenImage(label, sketch)}
                className="group block w-full max-w-xl overflow-hidden rounded-2xl bg-gray-50 ring-1 ring-gray-200 transition hover:ring-runfree-magenta/40"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={sketch}
                  alt={`${label} — visual strategy`}
                  loading="lazy"
                  className="block h-auto w-full transition duration-500 group-hover:scale-[1.02]"
                />
              </button>
            ) : canEdit ? (
              <button
                onClick={() => input.current?.click()}
                disabled={busy}
                className="flex w-full max-w-xl flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-gray-300 px-6 py-10 text-center transition hover:border-runfree-magenta/50 hover:bg-runfree-pink/20 disabled:opacity-50"
              >
                <span className="text-sm font-semibold text-runfree-ink">
                  {busy ? "Uploading…" : "Add the visual strategy"}
                </span>
                <span className="text-xs text-gray-500">
                  The napkin sketch — how people actually move
                </span>
              </button>
            ) : null}

            {canEdit && (
              <>
                <input
                  ref={input}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    setBusy(true);
                    setUploadError(null);
                    try {
                      await onUploadImage(element, f);
                    } catch (err) {
                      setUploadError(
                        err instanceof Error ? err.message : "That upload did not go through."
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
                {sketch && (
                  <button
                    onClick={() => input.current?.click()}
                    disabled={busy}
                    className="mt-2 text-[11px] font-semibold text-gray-500 transition hover:text-runfree-magentaDeep"
                  >
                    {busy ? "Uploading…" : "Replace the sketch"}
                  </button>
                )}
                {uploadError && (
                  <p role="alert" className="mt-2 text-[11px] font-semibold text-rose-600">
                    {uploadError}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {canEdit && !editing && (
          <button
            onClick={() => {
              setDraft(row?.body ?? "");
              setEditing(true);
            }}
            className="mt-3 text-[11px] font-semibold text-gray-500 transition hover:text-runfree-magentaDeep"
          >
            {blank ? "Write it" : "Edit"}
          </button>
        )}
      </div>
    </section>
  );
}
