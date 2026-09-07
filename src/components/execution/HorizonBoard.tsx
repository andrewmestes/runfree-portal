"use client";

import { RichTextView } from "@/components/RichText";
import {
  RAG_DOT,
  RAG_LABEL,
  daysBetween,
  daysSinceUpdate,
  effectiveStatus,
  isStale,
  type ExecutionData,
  type Initiative,
  type InitiativeStep,
} from "@/lib/execution";
import { HORIZON_DEFINITIONS, TEMPLATE_GROUPS, initiativeKind, templateByKey, templateIcon } from "@/lib/god-dreams";
import { richTextIsEmpty } from "@/lib/rich-text";
import { MeasureMosaic } from "./MeasureMosaic";
import { todayIso } from "./ui";

/**
 * The Horizon Storyline, as the board a team gathers around.
 *
 * This is Will's 1:4:1:4 graphic made live: one Beyond-the-Horizon box, four
 * Background objectives, one Mid-Ground goal, four Foreground initiatives,
 * stacked exactly as they print.
 *
 * 6 Sept 2026 — Andrew: "the intuitive functionality, and the overall feel
 * of the execution tab needs work." Three things changed here:
 *
 * 1. **The bands read as distance.** Each band has a rail on the left that
 *    darkens from the far horizon to the near one — the book's own figure
 *    15.1 puts "You Are Here" at the Foreground, so the rail says so. Four
 *    identical navy header bars had made the four horizons blur into one
 *    table.
 * 2. **The detail opens under the band you clicked.** It used to render
 *    below the whole board, so opening a Background objective put its
 *    detail three bands away from the box that was pressed. `detail` is
 *    rendered directly after the band that holds the selection.
 * 3. **An initiative box says how it is going, not just what it is.** A
 *    strip of its action steps by colour, the owner, and how long since
 *    anyone checked in — stale in amber. The three things a weekly meeting
 *    asks before it opens anything.
 *
 * The Foreground always shows four slots. Andrew: "I want four individual
 * boxes that say initiative one, initiative two, initiative three,
 * initiative four."
 */

export type Selection =
  | { band: "beyond" }
  | { band: "background"; position: number }
  | { band: "midground" }
  | { band: "foreground"; id: string };

export type BandKey = Selection["band"];

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

/**
 * The rail, far to near. Light indigo at the horizon, the sidebar's navy at
 * the Foreground — the same ramp the Vision Stack plates use from top to
 * base, so the two God Dreams surfaces read as one family.
 */
const BANDS: {
  key: BandKey;
  label: string;
  span: string;
  sub: string;
  rail: string;
  text: string;
  faint: string;
}[] = [
  {
    key: "beyond",
    label: HORIZON_DEFINITIONS.beyond.name,
    span: "5–20 years",
    sub: "The vivid description",
    rail: "bg-[#EEF1FA]",
    text: "text-runfree-navy",
    faint: "text-runfree-navy/60",
  },
  {
    key: "background",
    label: HORIZON_DEFINITIONS.background.name,
    span: "3 years",
    sub: "Four objectives",
    rail: "bg-[#D3DBF3]",
    text: "text-runfree-navy",
    faint: "text-runfree-navy/60",
  },
  {
    key: "midground",
    label: HORIZON_DEFINITIONS.midground.name,
    span: "1 year",
    sub: "The one-year goal",
    rail: "bg-[#3B51A6]",
    text: "text-white",
    faint: "text-white/60",
  },
  {
    key: "foreground",
    label: HORIZON_DEFINITIONS.foreground.name,
    span: "90 days",
    sub: "Four initiatives",
    rail: "bg-runfree-navyDeep",
    text: "text-white",
    faint: "text-white/50",
  },
];

export default function HorizonBoard({
  data,
  selected,
  onSelect,
  canEdit,
  onOpenFile,
  onAddInitiative,
  detail,
}: {
  data: ExecutionData;
  selected: Selection | null;
  onSelect: (s: Selection) => void;
  canEdit: boolean;
  /** Opens the stored vivid-description PDF (076) by storage path. */
  onOpenFile?: (path: string) => void;
  /** An empty Foreground slot, clicked by an editor. */
  onAddInitiative?: () => void;
  /** The open detail, rendered under the band that holds `selected`. */
  detail?: React.ReactNode;
}) {
  const today = todayIso();
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
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200">
      {BANDS.map((band, bi) => (
        <div key={band.key} className={bi > 0 ? "border-t border-gray-200" : ""}>
          <div className="grid sm:grid-cols-[8.5rem_minmax(0,1fr)]">
            {/* ------------------------------------------------ the rail */}
            <div
              className={`flex flex-row flex-wrap items-baseline gap-x-3 px-4 py-2.5 sm:flex-col sm:items-start sm:gap-x-0 sm:py-4 ${band.rail}`}
            >
              <p className={`font-display text-[13px] font-extrabold leading-tight tracking-tight ${band.text}`}>
                {band.label}
              </p>
              <p className={`text-[10px] font-bold uppercase tracking-[0.14em] sm:mt-1 ${band.faint}`}>
                {band.span}
              </p>
              <p className={`ml-auto text-[11px] sm:ml-0 sm:mt-3 ${band.faint}`}>{band.sub}</p>
              {band.key === "foreground" && (
                <p className="mt-0 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-runfree-orangeLight sm:mt-4">
                  <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-runfree-orangeLight" />
                  You are here
                </p>
              )}
            </div>

            {/* ----------------------------------------------- the boxes */}
            <div className="min-w-0">
              {band.key === "beyond" && (
                <div className="grid gap-px bg-gray-200 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
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
                        n={n + 1}
                        selected={sameSelection(selected, { band: "background", position: n })}
                        onClick={() => onSelect({ band: "background", position: n })}
                        title={title || undefined}
                        text={plain(b?.body)}
                        empty={!title && richTextIsEmpty(b?.body)}
                        placeholder={canEdit ? `Objective ${n + 1} — click to write it` : `Objective ${n + 1} — not written yet`}
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
                    placeholder={canEdit ? "The one-year goal — an inspiring picture with a number inside it. Click to write it." : "Not written yet"}
                    footer={
                      data.measures.length > 0 ? (
                        <span className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
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
                        n={n + 1}
                        initiative={i}
                        steps={data.steps.filter((s) => s.initiative_id === i.id)}
                        status={effectiveStatus(i, data.updates)}
                        sinceUpdate={daysSinceUpdate(i, data.updates, today)}
                        stale={isStale(i, data.updates, today)}
                        daysLeft={i.start_date ? 90 - daysBetween(i.start_date, today) : null}
                        selected={sameSelection(selected, { band: "foreground", id: i.id })}
                        onClick={() => onSelect({ band: "foreground", id: i.id })}
                      />
                    ) : canEdit && onAddInitiative && n < 4 ? (
                      <button
                        key={`slot-${n}`}
                        onClick={onAddInitiative}
                        className="group block w-full bg-white px-4 py-3.5 text-left transition hover:bg-runfree-indigo/40 sm:px-5"
                      >
                        <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-gray-300">
                          Initiative {n + 1}
                        </span>
                        <span className="mt-1 block text-sm font-semibold text-gray-400 group-hover:text-runfree-magentaDeep">
                          + Add the {["first", "second", "third", "fourth"][n]} initiative
                        </span>
                      </button>
                    ) : (
                      <span key={`slot-${n}`} className="block bg-white px-4 py-3.5 sm:px-5">
                        {n < 4 && (
                          <>
                            <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-gray-300">
                              Initiative {n + 1}
                            </span>
                            <span className="mt-1 block text-sm italic text-gray-300">Not yet chosen</span>
                          </>
                        )}
                      </span>
                    )
                  )}
                </Grid>
              )}
            </div>
          </div>

          {/* The detail, under the band it belongs to. */}
          {detail && selected?.band === band.key && (
            <div id="execution-detail" className="border-t border-gray-200 bg-gray-50">
              {detail}
            </div>
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
    <div className={`grid gap-px bg-gray-200 ${cols === 4 ? "sm:grid-cols-2 xl:grid-cols-4" : ""}`}>
      {children}
    </div>
  );
}

function Box({
  n,
  selected,
  onClick,
  title,
  text,
  empty,
  placeholder,
  footer,
}: {
  n?: number;
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
      {n != null && (
        <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-gray-300">Objective {n}</span>
      )}
      {title && <span className="mt-0.5 block text-sm font-bold leading-snug text-runfree-ink">{title}</span>}
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

/**
 * One Foreground initiative, on the board.
 *
 * Name, owner, and three signals a meeting reads before opening anything:
 * the light, the steps by colour, and how long since the last check-in.
 * No percentage — the step strip is the sheet's own lights laid end to end.
 */
function InitiativeBox({
  n,
  initiative: i,
  steps,
  status,
  sinceUpdate,
  stale,
  daysLeft,
  selected,
  onClick,
}: {
  n: number;
  initiative: Initiative;
  steps: InitiativeStep[];
  status: Initiative["status"];
  sinceUpdate: number | null;
  stale: boolean;
  daysLeft: number | null;
  selected: boolean;
  onClick: () => void;
}) {
  const kind = initiativeKind(i.kind);
  const open = steps.filter((s) => s.status !== "green").length;
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`group relative flex w-full flex-col px-4 py-3.5 text-left transition sm:px-5 ${
        selected ? "bg-runfree-pink/70" : "bg-white hover:bg-runfree-indigo/40"
      }`}
    >
      {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-runfree-grad" />}
      <span className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-300">Initiative {n}</span>
        {daysLeft != null && (
          <span
            className={`text-[10px] font-bold uppercase tracking-wide ${
              daysLeft < 0 ? "text-rose-600" : daysLeft <= 14 ? "text-amber-600" : "text-gray-400"
            }`}
          >
            {daysLeft < 0 ? `${Math.abs(daysLeft)}d over` : `${daysLeft}d left`}
          </span>
        )}
      </span>
      <span className="mt-1 flex items-start gap-2">
        <span
          title={RAG_LABEL[status]}
          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${RAG_DOT[status]}`}
        />
        <span className="sr-only">{RAG_LABEL[status]}. </span>
        <span className="block min-w-0 flex-1 text-sm font-semibold leading-snug text-runfree-ink">{i.name}</span>
      </span>
      <span className="mt-1 block text-[11px] leading-snug text-gray-500">
        {i.leader ? i.leader : "No owner yet"} · {kind.label}
      </span>
      <span className="mt-auto block w-full pt-3">
        <StepStrip steps={steps} />
        <span className="mt-1.5 flex items-baseline justify-between gap-2 text-[11px]">
          <span className="text-gray-500">
            {steps.length === 0 ? "No steps yet" : open === 0 ? "All steps done" : `${open} of ${steps.length} steps open`}
          </span>
          <span className={stale ? "font-semibold text-amber-600" : "text-gray-400"}>
            {sinceUpdate == null
              ? "Not started"
              : sinceUpdate === 0
                ? "Checked in today"
                : `${sinceUpdate}d since check-in`}
          </span>
        </span>
      </span>
    </button>
  );
}

/**
 * The action steps as a strip of lights, in order. Grey where a step has
 * no light yet. Reads as "how much of this is green" without a number.
 */
export function StepStrip({ steps, className = "" }: { steps: InitiativeStep[]; className?: string }) {
  if (steps.length === 0) {
    return <span className={`block h-1.5 w-full rounded-full bg-gray-100 ${className}`} aria-hidden />;
  }
  return (
    <span className={`flex h-1.5 w-full gap-[2px] overflow-hidden rounded-full ${className}`} aria-hidden>
      {steps.map((s) => (
        <span key={s.id} className={`block h-full flex-1 ${RAG_DOT[s.status]}`} />
      ))}
    </span>
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
