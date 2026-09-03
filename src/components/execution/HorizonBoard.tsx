"use client";

import { RichTextView } from "@/components/RichText";
import { RAG_DOT, RAG_LABEL, type ExecutionData, type Initiative } from "@/lib/execution";
import { HORIZON_DEFINITIONS, TEMPLATE_GROUPS, initiativeKind, templateByKey, templateIcon } from "@/lib/god-dreams";
import { richTextIsEmpty } from "@/lib/rich-text";
import { MeasureMosaic } from "./MeasureMosaic";

/**
 * The Horizon Storyline, as the board a team gathers around.
 *
 * This is Will's 1:4:1:4 graphic made live: one Beyond-the-Horizon box, four
 * Background objectives, one Mid-Ground goal, four Foreground initiatives.
 * The bands are stacked exactly as they print, inside a frame that quotes the
 * Vision Frame window.
 *
 * Every box below the top band is a button, and ONE detail area underneath
 * shows whatever is selected. The top band is different (4 Sept 2026):
 * Andrew asked for the vision to be said up front — the vivid description,
 * the church's two vision templates with their icons, and the full
 * description as a PDF — "that way, we can remove the section underneath
 * the horizon storyline that says the long range vision because we're
 * already saying that upfront." So the Beyond box carries all of it, and
 * only an editor clicks through, to edit.
 *
 * The Foreground always shows four slots. Andrew: "I want four individual
 * boxes that say initiative one, initiative two, initiative three,
 * initiative four" — the name is replaced when one is added, and an empty
 * slot is where the next one is added from.
 */

export type Selection =
  | { band: "beyond" }
  | { band: "background"; position: number }
  | { band: "midground" }
  | { band: "foreground"; id: string };

export function sameSelection(a: Selection | null, b: Selection | null): boolean {
  if (!a || !b || a.band !== b.band) return false;
  if (a.band === "background" && b.band === "background") return a.position === b.position;
  if (a.band === "foreground" && b.band === "foreground") return a.id === b.id;
  return true;
}

/** Strip tags for the one-line preview a box shows. */
function plain(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const BANDS: {
  key: "beyond" | "background" | "midground" | "foreground";
  label: string;
  span: string;
  sub: string;
}[] = [
  { key: "beyond", label: HORIZON_DEFINITIONS.beyond.name, span: "5–20 years", sub: "The vivid description" },
  { key: "background", label: HORIZON_DEFINITIONS.background.name, span: "3 years", sub: "Four objectives" },
  { key: "midground", label: HORIZON_DEFINITIONS.midground.name, span: "1 year", sub: "The one-year goal" },
  { key: "foreground", label: HORIZON_DEFINITIONS.foreground.name, span: "90 days", sub: "Four initiatives" },
];

export default function HorizonBoard({
  data,
  selected,
  onSelect,
  canEdit,
  onOpenFile,
  onAddInitiative,
}: {
  data: ExecutionData;
  selected: Selection | null;
  onSelect: (s: Selection) => void;
  canEdit: boolean;
  /** Opens the stored vivid-description PDF (076) by storage path. */
  onOpenFile?: (path: string) => void;
  /** An empty Foreground slot, clicked by an editor. */
  onAddInitiative?: () => void;
}) {
  const box = (band: "beyond" | "midground", position = 0) =>
    data.horizon.find((h) => h.horizon === band && h.position === position);

  const backgrounds = [0, 1, 2, 3].map((n) =>
    data.horizon.find((h) => h.horizon === "background" && h.position === n)
  );
  const live = data.initiatives.filter((i) => !i.is_complete);
  const chosen = data.templates
    .map((t) => templateByKey(t.template_key))
    .filter((t): t is NonNullable<typeof t> => !!t);
  const beyond = box("beyond");
  const midground = box("midground");

  // Four slots, always; more than four (up to eight) still show, padded to
  // a whole row so the grey grid never shows through.
  const slots: (Initiative | null)[] =
    live.length <= 4
      ? [...live, ...Array.from({ length: 4 - live.length }, () => null)]
      : [...live.slice(0, 8), ...Array.from({ length: (4 - (Math.min(live.length, 8) % 4)) % 4 }, () => null)];

  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-gray-200">
      {BANDS.map((band) => (
        <div key={band.key}>
          <div className="flex flex-wrap items-baseline gap-x-3 bg-runfree-navyDeep px-4 py-2 sm:px-5">
            <p className="font-display text-sm font-extrabold tracking-tight text-white">{band.label}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">{band.span}</p>
            <p className="ml-auto text-[11px] text-white/40">{band.sub}</p>
          </div>

          {band.key === "beyond" && (
            <div className="grid gap-px bg-gray-200 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
              <BeyondText
                html={beyond?.body}
                canEdit={canEdit}
                selected={sameSelection(selected, { band: "beyond" })}
                onClick={canEdit ? () => onSelect({ band: "beyond" }) : undefined}
              />
              <div className="bg-white px-4 py-3.5 sm:px-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Vision templates</p>
                {chosen.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {chosen.map((t) => (
                      <li key={t.key} className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={templateIcon(t.key)} alt="" className="h-12 w-12 shrink-0 rounded-xl" />
                        <span className="min-w-0">
                          <span className="block text-sm font-bold leading-snug text-runfree-ink">{t.name}</span>
                          <span className="block text-[11px] text-gray-500">
                            {TEMPLATE_GROUPS.find((g) => g.key === t.group)?.label} · template {t.number}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-xs italic text-gray-400">
                    {canEdit ? "Not chosen yet — choose two under Edit." : "Not chosen yet."}
                  </p>
                )}
                <div className="mt-3 border-t border-gray-100 pt-3">
                  {beyond?.file_path ? (
                    <button
                      onClick={() => onOpenFile?.(beyond.file_path!)}
                      className="inline-flex items-center gap-2 rounded-lg bg-runfree-grad px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                        <path d="M14 3v5h5" />
                        <path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z" />
                      </svg>
                      The full vivid description
                    </button>
                  ) : (
                    <p className="text-[11px] text-gray-400">
                      {canEdit ? "Attach the full vivid description as a PDF under Edit." : "The full vivid description is coming."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {band.key === "background" && (
            <Grid cols={4}>
              {backgrounds.map((b, n) => {
                const notes = [b?.where_we_stand, b?.where_were_headed, b?.how_well_get_there].filter(
                  (v) => !richTextIsEmpty(v)
                ).length;
                const title = b?.title?.trim() || "";
                return (
                  <Box
                    key={n}
                    selected={sameSelection(selected, { band: "background", position: n })}
                    onClick={() => onSelect({ band: "background", position: n })}
                    title={title || undefined}
                    text={plain(b?.body)}
                    empty={!title && richTextIsEmpty(b?.body)}
                    placeholder={canEdit ? `Objective ${n + 1}` : `Objective ${n + 1} — not written yet`}
                    footer={
                      notes > 0 ? (
                        <span className="mt-2 block text-[11px] font-semibold text-runfree-navy/60">
                          {notes} of 3 notes
                        </span>
                      ) : null
                    }
                  />
                );
              })}
            </Grid>
          )}

          {band.key === "midground" && (
            <Grid cols={1}>
              <Box
                selected={sameSelection(selected, { band: "midground" })}
                onClick={() => onSelect({ band: "midground" })}
                text={plain(midground?.body)}
                empty={richTextIsEmpty(midground?.body)}
                placeholder={canEdit ? "The one-year goal — an inspiring picture with a number inside it" : "Not written yet"}
                footer={
                  data.measures.length > 0 ? (
                    <span className="mt-3 grid gap-3 sm:grid-cols-2">
                      {data.measures.slice(0, 4).map((m) => (
                        <MeasureMosaic
                          key={m.id}
                          measure={m}
                          readings={data.readings.filter((r) => r.measure_id === m.id)}
                          compact
                        />
                      ))}
                    </span>
                  ) : canEdit ? (
                    <span className="mt-2 block text-[11px] text-gray-400">
                      No measure yet — the quantitative half
                    </span>
                  ) : null
                }
              />
            </Grid>
          )}

          {band.key === "foreground" && (
            <Grid cols={4}>
              {slots.map((i, n) =>
                i ? (
                  <InitiativeBox
                    key={i.id}
                    initiative={i}
                    openSteps={
                      data.steps.filter((s) => s.initiative_id === i.id && s.status !== "green").length
                    }
                    totalSteps={data.steps.filter((s) => s.initiative_id === i.id).length}
                    selected={sameSelection(selected, { band: "foreground", id: i.id })}
                    onClick={() => onSelect({ band: "foreground", id: i.id })}
                  />
                ) : canEdit && onAddInitiative && n < 4 ? (
                  <button
                    key={`slot-${n}`}
                    onClick={onAddInitiative}
                    className="group block w-full bg-white px-4 py-3.5 text-left transition hover:bg-runfree-indigo/40 sm:px-5"
                  >
                    <span className="block text-sm font-semibold italic text-gray-400 group-hover:text-runfree-magentaDeep">
                      Initiative {n + 1}
                    </span>
                    <span className="mt-1 block text-[11px] text-gray-400">+ Add it</span>
                  </button>
                ) : (
                  <span key={`slot-${n}`} className="block bg-white px-4 py-3.5 sm:px-5">
                    {n < 4 && (
                      <>
                        <span className="block text-sm font-semibold italic text-gray-300">Initiative {n + 1}</span>
                        <span className="mt-1 block text-[11px] text-gray-300">Not yet chosen</span>
                      </>
                    )}
                  </span>
                )
              )}
            </Grid>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * The Beyond-the-Horizon vivid description, in full.
 *
 * Not a preview: this is the vision said up front. An editor's click opens
 * the editor underneath; a reader gets the text and nothing to click.
 */
function BeyondText({
  html,
  canEdit,
  selected,
  onClick,
}: {
  html: string | null | undefined;
  canEdit: boolean;
  selected: boolean;
  onClick?: () => void;
}) {
  const empty = richTextIsEmpty(html);
  const inner = empty ? (
    <span className="block text-sm italic text-gray-400">
      {canEdit
        ? "The long-range dream — what would people say about this church a generation from now? Click to write it."
        : "Not written yet."}
    </span>
  ) : (
    <RichTextView html={html!} className="text-runfree-ink" />
  );
  const cls = `relative block w-full px-4 py-4 text-left sm:px-5 ${
    selected ? "bg-runfree-pink/70" : "bg-white"
  }`;
  if (!onClick) return <div className={cls}>{inner}</div>;
  return (
    <button onClick={onClick} aria-pressed={selected} className={`${cls} transition hover:bg-runfree-indigo/40`}>
      {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-runfree-grad" />}
      {inner}
      <span className="mt-2 block text-[11px] font-semibold text-runfree-magentaDeep">Edit</span>
    </button>
  );
}

/**
 * The grid the boxes sit in.
 *
 * `gap-px` over a grey container is what draws the rules between boxes, which
 * is why empty cells have to be padded white by the caller.
 */
function Grid({ cols, children }: { cols: 1 | 4; children: React.ReactNode }) {
  return (
    <div className={`grid gap-px bg-gray-200 ${cols === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : ""}`}>
      {children}
    </div>
  );
}

function Box({
  selected,
  onClick,
  title,
  text,
  empty,
  placeholder,
  footer,
}: {
  selected: boolean;
  onClick: () => void;
  title?: string;
  text: string;
  empty: boolean;
  placeholder: string;
  footer?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`group relative block w-full px-4 py-3.5 text-left transition sm:px-5 ${
        selected ? "bg-runfree-pink/70" : "bg-white hover:bg-runfree-indigo/40"
      }`}
    >
      {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-runfree-grad" />}
      {title && <span className="block text-sm font-bold leading-snug text-runfree-ink">{title}</span>}
      <span
        className={`block text-sm leading-snug ${
          empty ? "italic text-gray-400" : title ? "mt-0.5 line-clamp-3 text-gray-600" : "text-runfree-ink"
        }`}
      >
        {empty ? placeholder : text}
      </span>
      {footer}
    </button>
  );
}

function InitiativeBox({
  initiative: i,
  openSteps,
  totalSteps,
  selected,
  onClick,
}: {
  initiative: Initiative;
  openSteps: number;
  totalSteps: number;
  selected: boolean;
  onClick: () => void;
}) {
  const kind = initiativeKind(i.kind);
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`group relative block w-full px-4 py-3.5 text-left transition sm:px-5 ${
        selected ? "bg-runfree-pink/70" : "bg-white hover:bg-runfree-indigo/40"
      }`}
    >
      {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-runfree-grad" />}
      <span className="flex items-start gap-2">
        <span
          title={RAG_LABEL[i.status]}
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${RAG_DOT[i.status]}`}
        />
        <span className="sr-only">{RAG_LABEL[i.status]}. </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-snug text-runfree-ink">{i.name}</span>
          <span className="mt-0.5 block text-[11px] text-gray-500">{kind.label}</span>
          <span className="mt-1 block text-[11px] text-gray-500">
            {i.leader ? `${i.leader} · ` : "No owner yet · "}
            {totalSteps === 0 ? "no steps yet" : `${openSteps} of ${totalSteps} open`}
          </span>
        </span>
      </span>
    </button>
  );
}

/**
 * The Vision Frame window, as a mark.
 */
export function VisionFrameMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
        <rect x="2" y="2" width="44" height="44" />
        <rect x="11" y="11" width="26" height="26" />
        <path d="M2 2l9 9M46 2l-9 9M2 46l9-9M46 46l-9-9" strokeWidth="1.6" />
      </g>
      <path d="M13 33l6.5-8 4.5 5 5-7 6.5 10z" fill="currentColor" opacity="0.85" />
    </svg>
  );
}
