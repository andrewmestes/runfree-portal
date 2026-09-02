"use client";

import { RAG_DOT, RAG_LABEL, type ExecutionData, type Initiative } from "@/lib/execution";
import { initiativeKind, templateByKey, templateIcon } from "@/lib/god-dreams";
import { richTextIsEmpty } from "@/lib/rich-text";

/**
 * The Horizon Storyline, as the board a team gathers around.
 *
 * This is Will's 1:4:1:4 graphic made live: one Beyond box, four Background
 * boxes, one Midground box, four Foreground boxes. Andrew asked for the
 * uploaded God Dreams artwork to be echoed here "to make it more tied to our
 * branding and tying it to the vision frame in people's minds" — so the bands
 * are stacked exactly as they print, inside a frame that quotes the Vision
 * Frame window.
 *
 * **Every box is a button.** Andrew: "when someone clicks on an initiative,
 * it could open a modal or dropdown, or maybe better, it could highlight the
 * initiative below where all of the Action Steps get displayed along with a
 * tracking sheet 'scoreboard.'" That pattern generalises: the board is the
 * navigator, and one detail area underneath shows whatever is selected. It is
 * also what removed the duplicated "Foreground Initiatives" heading — there
 * is now one list of initiatives, here, and one detail view below it.
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
  // cleanRichText escapes quotes and angle brackets as entities; a preview
  // that only knew &amp; and &nbsp; printed a church's "Three healthy
  // congregations" with &quot; around it.
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
}[] = [
  { key: "beyond", label: "Beyond the Horizon", span: "5–20 years" },
  { key: "background", label: "Background Vision", span: "3 years" },
  { key: "midground", label: "Midground Milestone", span: "1 year" },
  { key: "foreground", label: "Foreground Initiatives", span: "90 days" },
];

export default function HorizonBoard({
  data,
  selected,
  onSelect,
  canEdit,
}: {
  data: ExecutionData;
  selected: Selection | null;
  onSelect: (s: Selection) => void;
  canEdit: boolean;
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

  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-gray-200">
      {BANDS.map((band) => (
        <div key={band.key}>
          <div className="flex flex-wrap items-baseline gap-x-3 bg-runfree-navyDeep px-4 py-2 sm:px-5">
            <p className="font-display text-sm font-extrabold tracking-tight text-white">
              {band.label}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
              {band.span}
            </p>
          </div>

          {band.key === "beyond" && (
            <Grid cols={1}>
              <Box
                selected={sameSelection(selected, { band: "beyond" })}
                onClick={() => onSelect({ band: "beyond" })}
                text={plain(box("beyond")?.body)}
                empty={richTextIsEmpty(box("beyond")?.body)}
                placeholder={canEdit ? "The long-range dream" : "Not written yet"}
                footer={
                  chosen.length > 0 ? (
                    <span className="mt-2 flex flex-wrap items-center gap-1.5">
                      {chosen.map((t) => (
                        <span
                          key={t.key}
                          className="inline-flex items-center gap-1.5 rounded-full bg-runfree-indigo py-0.5 pl-0.5 pr-2 text-[11px] font-semibold text-runfree-navy"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={templateIcon(t.key)} alt="" className="h-4 w-4 rounded-full" />
                          {t.name}
                        </span>
                      ))}
                    </span>
                  ) : canEdit ? (
                    <span className="mt-2 block text-[11px] text-gray-400">
                      No vision templates chosen yet
                    </span>
                  ) : null
                }
              />
            </Grid>
          )}

          {band.key === "background" && (
            <Grid cols={4}>
              {backgrounds.map((b, n) => {
                const notes = [b?.where_we_stand, b?.where_were_headed, b?.how_well_get_there]
                  .filter((v) => !richTextIsEmpty(v)).length;
                return (
                  <Box
                    key={n}
                    selected={sameSelection(selected, { band: "background", position: n })}
                    onClick={() => onSelect({ band: "background", position: n })}
                    text={plain(b?.body)}
                    empty={richTextIsEmpty(b?.body)}
                    placeholder={canEdit ? `Priority ${n + 1}` : "Not written yet"}
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
                text={plain(box("midground")?.body)}
                empty={richTextIsEmpty(box("midground")?.body)}
                placeholder={canEdit ? "The one marker that says this year counted" : "Not written yet"}
                footer={
                  data.measures.length > 0 ? (
                    <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      {data.measures.map((m) => (
                        <span key={m.id} className="text-[11px] text-gray-500">
                          <span className="font-semibold text-runfree-ink">
                            {m.current ?? "—"}
                            {m.unit ?? ""}
                          </span>{" "}
                          / {m.target ?? "—"}
                          {m.unit ?? ""} {m.label}
                        </span>
                      ))}
                    </span>
                  ) : canEdit ? (
                    <span className="mt-2 block text-[11px] text-gray-400">
                      No measures yet — the quantitative half
                    </span>
                  ) : null
                }
              />
            </Grid>
          )}

          {band.key === "foreground" && live.length === 0 && (
            <p className="bg-white px-4 py-3.5 text-sm italic text-gray-400 sm:px-5">
              {canEdit
                ? "No initiatives yet. Add the first one your team committed to."
                : "Nothing in the foreground right now."}
            </p>
          )}

          {band.key === "foreground" && live.length > 0 && (
            <Grid cols={4}>
              {live.slice(0, 8).map((i) => (
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
              ))}
              {/* Pad to a whole row at every column count. `4 - n` only
                  worked up to four; five to seven initiatives exposed one to
                  three bare grey cells — the artefact the padding is for. */}
              {Array.from({ length: (4 - (Math.min(live.length, 8) % 4)) % 4 }, (_, k) => (
                <span key={`pad-${k}`} aria-hidden className="bg-white px-4 py-3.5 sm:px-5" />
              ))}
            </Grid>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * The grid the boxes sit in.
 *
 * `gap-px` over a grey container is what draws the rules between boxes, which
 * is why empty cells have to be padded white by the caller — a missing cell
 * shows the container through as a flat grey rectangle that reads as a
 * rendering fault rather than as the empty box the sheet prints.
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
  text,
  empty,
  placeholder,
  footer,
}: {
  selected: boolean;
  onClick: () => void;
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
      {/* The selected band gets a magenta edge rather than a ring: a ring on a
          gap-px grid paints over its neighbours' rules and makes the whole
          board look misaligned. */}
      {selected && (
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-runfree-grad" />
      )}
      <span
        className={`block text-sm leading-snug ${
          empty ? "italic text-gray-400" : "text-runfree-ink"
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
            {i.leader ? `${i.leader} · ` : ""}
            {totalSteps === 0 ? "no steps yet" : `${openSteps} of ${totalSteps} open`}
          </span>
        </span>
      </span>
    </button>
  );
}

/**
 * The Vision Frame window, as a mark.
 *
 * Andrew: "tying it to the vision frame in people's minds." This is the
 * "Vision as Future Picture" diagram reduced to its two moves — a frame drawn
 * in perspective, and a picture inside it — so the Execution tab is visibly
 * the same idea as the frame the church spent six months building.
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
