"use client";

import { RichTextView } from "@/components/RichText";
import {
  RAG_DOT,
  RAG_LABEL,
  daysBetween,
  daysSinceUpdate,
  effectiveStatus,
  initiativePace,
  isStale,
  reviewDue,
  trendFor,
  type ExecutionData,
  type Initiative,
  type InitiativeStep,
  type InitiativeUpdate,
} from "@/lib/execution";
import { HORIZON_DEFINITIONS, TEMPLATE_GROUPS, initiativeKind, templateByKey, templateIcon } from "@/lib/god-dreams";
import { richTextIsEmpty } from "@/lib/rich-text";
import { MeasureMosaic } from "./MeasureMosaic";
import { Icon, Label, NumberDisc, PINK_BUTTON, StatusMark, StatusWord, todayIso, type IconName } from "./ui";

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
 *
 * 17 Sept 2026 — "the user interface and visual feels a little dated." The
 * board became a literal horizon: the Beyond statement set large on a faint
 * sky, one sunset line under it (the board's only gradient), the rail
 * darkening into the Foreground, and four lifted cards on the one tinted
 * ground, where "You are here" is. The table of hairline cells is gone; each
 * box is a card, and the selected one points down into its detail.
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
 * The rail, far to near: light at the horizon, the sidebar's navy at the
 * Foreground — the same ramp the Vision Stack plates use from top to base, so
 * the two God Dreams surfaces read as one family.
 *
 * Rail ramp literals, far→near, tuned by eye; the only non-token colours on
 * the board besides the MeasureMosaic palette. Each rail is a gradient that
 * runs sideways on a phone (where the rail is a strip) and downwards from
 * `sm` (where it is a column). Only the Foreground's body is tinted: it is
 * the ground the meeting stands on, and a second tint made the bands compete.
 */
const BANDS: {
  key: BandKey;
  label: string;
  span: string;
  sub: string;
  icon: IconName;
  rail: string;
  text: string;
  faint: string;
  ground: string;
}[] = [
  {
    key: "beyond",
    label: HORIZON_DEFINITIONS.beyond.name,
    span: "5–20 years",
    sub: "The vivid description",
    icon: "telescope",
    rail: "bg-gradient-to-r sm:bg-gradient-to-b from-[#F4F6FC] to-[#E4E9F8]",
    text: "text-runfree-navy",
    faint: "text-runfree-navy/70",
    ground: "bg-gradient-to-b from-[#EEF1FA] to-white",
  },
  {
    key: "background",
    label: HORIZON_DEFINITIONS.background.name,
    span: "3 years",
    sub: "Four objectives",
    icon: "flag",
    rail: "bg-gradient-to-r sm:bg-gradient-to-b from-[#D3DBF3] to-[#BFC9EC]",
    text: "text-runfree-navy",
    faint: "text-runfree-navy/70",
    ground: "bg-white",
  },
  {
    key: "midground",
    label: HORIZON_DEFINITIONS.midground.name,
    span: "1 year",
    sub: "The one-year goal",
    icon: "target",
    rail: "bg-gradient-to-r sm:bg-gradient-to-b from-[#4A63B8] to-[#2F4699]",
    text: "text-white",
    faint: "text-white/75",
    ground: "bg-white",
  },
  {
    key: "foreground",
    label: HORIZON_DEFINITIONS.foreground.name,
    span: "90 days",
    sub: "Four initiatives",
    icon: "footprints",
    rail: "bg-gradient-to-r sm:bg-gradient-to-b from-[#1E2C63] to-runfree-navyDeep",
    text: "text-white",
    faint: "text-white/70",
    ground: "bg-[#E4E9F8]",
  },
];

/** The notch under a selected card, pointing into its detail. */
function Caret() {
  return (
    <span
      aria-hidden
      className="absolute -bottom-[7px] left-6 h-3 w-3 rotate-45 border-b-2 border-r-2 border-runfree-magenta bg-white"
    />
  );
}

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

  // Four slots, always; more than four (up to eight) still show, padded to a
  // whole row so the grid keeps its shape.
  const slots: (Initiative | null)[] =
    live.length <= 4
      ? [...live, ...Array.from({ length: 4 - live.length }, () => null)]
      : [...live.slice(0, 8), ...Array.from({ length: (4 - (Math.min(live.length, 8) % 4)) % 4 }, () => null)];

  const pdf = beyond?.file_path ?? null;
  // A reader with nothing chosen and no PDF gets the vision across the whole
  // band, not a column of sentences about what is missing.
  const showAside = chosen.length > 0 || !!pdf || canEdit;

  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-gray-200">
      {BANDS.map((band, bi) => (
        <section key={band.key} className={bi > 0 ? "border-t border-gray-200" : ""}>
          <div className="grid sm:grid-cols-[10rem_minmax(0,1fr)]">
            {/* ------------------------------------------------ the rail */}
            <div
              className={`flex flex-row flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:flex-col sm:items-start sm:gap-x-0 sm:py-5 ${band.rail}`}
            >
              <Icon name={band.icon} className={`h-[18px] w-[18px] ${band.faint}`} />
              <p className={`font-display text-sm font-extrabold leading-tight tracking-tight sm:mt-2 ${band.text}`}>
                {band.label}
              </p>
              <Label tone={band.faint} className="sm:mt-1">
                {band.span}
              </Label>
              <p className={`text-[11px] sm:mt-3 ${band.faint}`}>{band.sub}</p>
              {band.key === "foreground" && (
                <p className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-runfree-orangeLight sm:ml-0 sm:mt-auto sm:pt-4">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-runfree-orangeLight/20 ring-4 ring-runfree-orangeLight/10">
                    <Icon name="pin" className="h-3.5 w-3.5" />
                  </span>
                  You are here
                </p>
              )}
            </div>

            {/* ------------------------------------------------ the body */}
            <div className={`min-w-0 ${band.ground}`}>
              {band.key === "beyond" && (
                <div className={`grid ${showAside ? "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" : ""}`}>
                  <BeyondText
                    html={beyond?.body}
                    canEdit={canEdit}
                    selected={sameSelection(selected, { band: "beyond" })}
                    onClick={canEdit ? () => onSelect({ band: "beyond" }) : undefined}
                  />
                  {showAside && (
                    <aside className="border-t border-gray-200/70 px-5 py-5 sm:px-6 lg:border-l lg:border-t-0">
                      {chosen.length > 0 && (
                        <>
                          <Label>Vision templates</Label>
                          <ul className="mt-2 flex flex-wrap gap-4">
                            {chosen.map((t) => (
                              <li key={t.key} className="flex items-center gap-2.5">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={templateIcon(t.key)} alt="" className="h-10 w-10 shrink-0 rounded-xl" />
                                <span className="min-w-0">
                                  <span className="block text-sm font-bold leading-snug text-runfree-ink">{t.name}</span>
                                  <span className="block text-[11px] text-gray-500">
                                    {TEMPLATE_GROUPS.find((g) => g.key === t.group)?.label} · template {t.number}
                                  </span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      {pdf && (
                        <button
                          type="button"
                          onClick={() => onOpenFile?.(pdf)}
                          className={`${PINK_BUTTON} ${chosen.length > 0 ? "mt-3" : ""}`}
                        >
                          <Icon name="book" className="h-3.5 w-3.5" />
                          The full vivid description
                        </button>
                      )}
                      {canEdit && chosen.length === 0 && (
                        <button
                          type="button"
                          onClick={() => onSelect({ band: "beyond" })}
                          className={`w-full rounded-2xl border border-dashed border-gray-300 px-3 py-3 text-left text-xs font-semibold text-gray-500 transition-colors hover:border-runfree-magenta/50 hover:text-runfree-magentaDeep ${pdf ? "mt-3" : ""}`}
                        >
                          {pdf ? "Choose two vision templates →" : "Choose two templates · attach the PDF →"}
                        </button>
                      )}
                      {canEdit && chosen.length > 0 && !pdf && (
                        <button
                          type="button"
                          onClick={() => onSelect({ band: "beyond" })}
                          className="mt-3 text-[11px] font-semibold text-gray-500 hover:text-runfree-magentaDeep"
                        >
                          Attach the full vivid description as a PDF →
                        </button>
                      )}
                    </aside>
                  )}
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
                        srLabel={`Objective ${n + 1}.`}
                        selected={sameSelection(selected, { band: "background", position: n })}
                        onClick={() => onSelect({ band: "background", position: n })}
                        title={title || undefined}
                        text={plain(b?.body)}
                        empty={!title && richTextIsEmpty(b?.body)}
                        placeholder={canEdit ? `Objective ${n + 1} — click to write it` : `Objective ${n + 1} — not written yet`}
                        badge={notes > 0 ? `${notes} of 3 notes` : undefined}
                      />
                    );
                  })}
                </Grid>
              )}

              {band.key === "midground" && (
                <Grid cols={1}>
                  <Box
                    raised
                    statement
                    selected={sameSelection(selected, { band: "midground" })}
                    onClick={() => onSelect({ band: "midground" })}
                    text={plain(midground?.body)}
                    empty={richTextIsEmpty(midground?.body)}
                    placeholder={canEdit ? "The one-year goal — an inspiring picture with a number inside it. Click to write it." : "Not written yet"}
                    footer={
                      data.measures.length > 0 ? (
                        <span className="mt-3 grid gap-x-6 gap-y-3 border-t border-gray-100 pt-3 sm:grid-cols-2">
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
                        <span className="mt-3 block border-t border-gray-100 pt-3 text-[11px] text-gray-500">
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
                        trend={trendFor(data.updates, i.id)}
                        overdueReview={reviewDue(i, data.updates, today)}
                        pace={initiativePace(i, data.steps, today)}
                        daysLeft={i.start_date ? 90 - daysBetween(i.start_date, today) : null}
                        selected={sameSelection(selected, { band: "foreground", id: i.id })}
                        onClick={() => onSelect({ band: "foreground", id: i.id })}
                      />
                    ) : n >= 4 ? (
                      // Padding to a whole row when there are more than four.
                      <span key={`slot-${n}`} aria-hidden className="hidden xl:block" />
                    ) : canEdit && onAddInitiative ? (
                      <button
                        key={`slot-${n}`}
                        type="button"
                        onClick={onAddInitiative}
                        className="group flex h-full w-full flex-col rounded-2xl border border-dashed border-gray-300 bg-white/50 p-4 text-left transition-colors hover:border-runfree-magenta/50 sm:min-h-[9rem]"
                      >
                        <NumberDisc n={n + 1} />
                        <span className="mt-3 text-sm font-semibold text-gray-500 group-hover:text-runfree-magentaDeep">
                          + Add the {["first", "second", "third", "fourth"][n]} initiative
                        </span>
                      </button>
                    ) : (
                      <div
                        key={`slot-${n}`}
                        className="flex h-full w-full flex-col rounded-2xl border border-dashed border-gray-300 bg-white/50 p-4 sm:min-h-[9rem]"
                      >
                        <NumberDisc n={n + 1} />
                        <span className="sr-only">Initiative {n + 1}.</span>
                        <span className="mt-3 text-sm text-gray-500">Not yet chosen</span>
                      </div>
                    )
                  )}
                </Grid>
              )}
            </div>
          </div>

          {band.key === "beyond" && <div aria-hidden className="h-[3px] bg-runfree-sunset" />}

          {/* The detail, under the band it belongs to. */}
          {detail && selected?.band === band.key && (
            <div id="execution-detail" className="border-t border-gray-200 bg-gray-50">
              {detail}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

/**
 * The Beyond-the-Horizon vivid description, in full.
 *
 * Not a preview: this is the vision said up front, set large, because it is
 * the reason for everything under it. An editor's click opens the editor
 * underneath; a reader gets the text and nothing to click. A long description
 * steps down a size — a paragraph in the display face at 22px is a headline;
 * three of them are a wall.
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
  const long = plain(html).length > 320;
  const inner = empty ? (
    <span className="block text-sm text-gray-500">
      {canEdit
        ? "The long-range dream — what would people say about this church a generation from now? Click to write it."
        : "Not written yet."}
    </span>
  ) : (
    <RichTextView
      html={html!}
      className={`font-display !leading-snug tracking-tight !text-runfree-navy ${
        long ? "!text-base font-bold sm:!text-lg" : "!text-lg font-extrabold sm:!text-[22px]"
      }`}
    />
  );
  const base = "group relative block w-full px-5 py-5 text-left sm:px-6";
  if (!onClick) return <div className={base}>{inner}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`${base} transition-colors ${
        selected ? "bg-runfree-pink/50 shadow-[inset_3px_0_0_#E43D96]" : "hover:bg-runfree-indigo/40"
      }`}
    >
      {inner}
      <span className="mt-2 block text-[11px] font-semibold text-runfree-magentaDeep opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100">
        Edit the vision →
      </span>
    </button>
  );
}

/**
 * The grid the cards sit in. Cards, with room between them for the focus
 * ring and the selected card's notch — the old hairline table had neither.
 */
function Grid({ cols, children }: { cols: 1 | 4; children: React.ReactNode }) {
  return (
    <div className={`grid gap-3 p-3 sm:p-4 ${cols === 4 ? "sm:grid-cols-2 xl:grid-cols-4" : ""}`}>
      {children}
    </div>
  );
}

/**
 * A Background objective or the Mid-Ground goal.
 *
 * Background cards sit flat — depth on this board means nearness, and a
 * three-year objective is not near. The Mid-Ground is `raised` a little.
 */
function Box({
  n,
  srLabel,
  selected,
  onClick,
  title,
  text,
  empty,
  placeholder,
  badge,
  footer,
  raised = false,
  statement = false,
}: {
  n?: number;
  srLabel?: string;
  selected: boolean;
  onClick: () => void;
  title?: string;
  text: string;
  empty: boolean;
  placeholder: string;
  /** Top-right, beside the number — "2 of 3 notes". */
  badge?: string;
  footer?: React.ReactNode;
  raised?: boolean;
  /** The Mid-Ground's one sentence, set in the display face. */
  statement?: boolean;
}) {
  // An unwritten objective looks like the empty box it is.
  if (empty && n != null) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={`relative block w-full rounded-2xl border border-dashed p-4 text-left text-sm transition-colors ${
          selected
            ? "border-runfree-magenta bg-white text-runfree-magentaDeep"
            : "border-gray-300 bg-white/60 text-gray-500 hover:border-runfree-magenta/50 hover:text-runfree-magentaDeep"
        }`}
      >
        {selected && <Caret />}
        <NumberDisc n={n} />
        <span className="mt-2.5 block">{placeholder}</span>
      </button>
    );
  }

  const hasTop = n != null || !!badge;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`group relative block w-full rounded-2xl bg-white p-4 text-left ring-1 transition-[box-shadow,--tw-ring-color] duration-200 ${
        selected
          ? "shadow-lg ring-2 ring-runfree-magenta"
          : `ring-gray-200 hover:shadow-md hover:ring-runfree-magenta/40 ${raised ? "shadow-sm" : ""}`
      }`}
    >
      {selected && <Caret />}
      {hasTop && (
        <span className="flex items-center justify-between gap-2">
          {n != null ? <NumberDisc n={n} /> : <span />}
          {srLabel && <span className="sr-only">{srLabel} </span>}
          {badge && <span className="text-[11px] font-semibold text-gray-500">{badge}</span>}
        </span>
      )}
      {title && (
        <span className={`${hasTop ? "mt-2.5" : ""} block font-display text-sm font-bold leading-snug text-runfree-ink`}>
          {title}
        </span>
      )}
      <span
        className={`${title ? "mt-1" : hasTop ? "mt-2.5" : ""} block leading-snug ${
          empty
            ? "text-sm text-gray-500"
            : statement
              ? "font-display text-base font-bold text-runfree-ink"
              : "line-clamp-3 text-sm text-gray-600"
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
 * the light (with its word — this is read off a TV), the steps by colour, and
 * how long since the last check-in. No percentage — the step strip is the
 * sheet's own lights laid end to end. The number turns amber when nobody has
 * checked in for a fortnight, so staleness shows from across the room.
 */
function InitiativeBox({
  n,
  initiative: i,
  steps,
  status,
  sinceUpdate,
  stale,
  trend,
  overdueReview,
  pace,
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
  /** The recent check-ins, oldest first — the light's history, not its value. */
  trend: InitiativeUpdate[];
  /** The team's own Next Review date has passed. */
  overdueReview: boolean;
  pace: { elapsed: number; done: number; behind: boolean } | null;
  daysLeft: number | null;
  selected: boolean;
  onClick: () => void;
}) {
  const kind = initiativeKind(i.kind);
  const open = steps.filter((s) => s.status !== "green").length;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`group relative flex h-full w-full flex-col rounded-2xl bg-white p-4 text-left shadow-md ring-1 transition duration-300 hover:-translate-y-0.5 hover:shadow-lg motion-reduce:hover:translate-y-0 ${
        selected ? "shadow-lg ring-2 ring-runfree-magenta" : "ring-gray-200 hover:ring-runfree-magenta/40"
      }`}
    >
      {selected && <Caret />}
      <span className="flex items-center justify-between gap-2">
        <NumberDisc n={n} tone={stale ? "amber" : "navy"} />
        <span className="sr-only">Initiative {n}. </span>
        <span className="flex items-center gap-1.5">
          {overdueReview && (
            <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
              Review due
            </span>
          )}
          {daysLeft != null && (
            <span
              className={`whitespace-nowrap text-[11px] font-semibold tabular-nums ${
                daysLeft < 0 ? "text-rose-700" : daysLeft <= 14 ? "text-amber-700" : "text-gray-500"
              }`}
            >
              {daysLeft < 0 ? `${Math.abs(daysLeft)}d over` : `${daysLeft}d left`}
            </span>
          )}
        </span>
      </span>
      <span className="mt-3 flex items-start gap-2">
        <StatusMark status={status} size="md" labelHidden className="mt-[3px]" />
        <span className="min-w-0 flex-1 font-display text-[15px] font-extrabold leading-snug text-runfree-ink">
          {i.name}
        </span>
      </span>
      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
        <StatusWord status={status} size="xs" />
        <span aria-hidden>·</span>
        <span>
          {i.leader ? i.leader : "No owner yet"} · {kind.label}
        </span>
        <TrendStrip updates={trend} />
      </span>
      {pace?.behind && (
        <span className="mt-1 block text-xs font-semibold leading-snug text-amber-700">
          Behind pace — {Math.round(pace.elapsed * 100)}% of the time, {Math.round(pace.done * 100)}% of the
          steps
        </span>
      )}
      <span className="mt-auto block w-full pt-4">
        <StepStrip steps={steps} />
        <span className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
          <span className="text-gray-500">
            {steps.length === 0 ? "No steps yet" : open === 0 ? "All steps done" : `${open} of ${steps.length} steps open`}
          </span>
          <span className={`whitespace-nowrap ${stale ? "font-semibold text-amber-700" : "text-gray-500"}`}>
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
 * The light’s history: one tile per check-in, oldest to newest.
 *
 * The board already showed the CURRENT light and how long since anyone spoke
 * to it. Neither says whether this went amber on Tuesday or has been amber
 * since August, and those are completely different conversations — the first
 * is news, the second is a decision nobody is making. Rhythm Systems and
 * Ninety both lead with this strip for that reason.
 *
 * Small and quiet on purpose: it sits beside the owner’s name, not above the
 * initiative’s. Nothing to read when there is one check-in or none.
 */
export function TrendStrip({ updates }: { updates: InitiativeUpdate[] }) {
  if (updates.length < 2) return null;
  const label = updates.map((u) => RAG_LABEL[u.status]).join(", ");
  return (
    <span className="flex items-center gap-[3px]" title={`Check-ins, oldest first: ${label}`}>
      <span className="sr-only">Check-in history, oldest first: {label}.</span>
      {updates.map((u, idx) => (
        <span
          key={u.id}
          aria-hidden
          className={`block rounded-[2px] ${RAG_DOT[u.status]} ${
            idx === updates.length - 1 ? "h-2.5 w-2.5" : "h-1.5 w-1.5 opacity-60"
          }`}
        />
      ))}
    </span>
  );
}

/**
 * The action steps as a strip of tiles, in order. Reads as "how much of this
 * is green" without a number — the mosaic, not a progress bar.
 */
export function StepStrip({ steps, className = "" }: { steps: InitiativeStep[]; className?: string }) {
  if (steps.length === 0) {
    return <span className={`block h-1.5 w-full rounded-[2px] bg-runfree-indigo ${className}`} aria-hidden />;
  }
  return (
    <span className={`flex h-1.5 w-full gap-[3px] ${className}`} aria-hidden>
      {steps.map((s) => (
        <span key={s.id} className={`block h-full flex-1 rounded-[2px] transition-colors duration-500 ${RAG_DOT[s.status]}`} />
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
