"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectMember } from "@/lib/projects";
import {
  RAG_DOT,
  RAG_LABEL,
  createInitiative,
  getExecutionData,
  updateInitiative,
  measureProgress,
  nextRenewalStop,
  renewalCycle,
  effectiveCurrent,
  type ExecutionData,
} from "@/lib/execution";
import HorizonBoard, { VisionFrameMark, type Selection } from "./execution/HorizonBoard";
import BeyondDetail from "./execution/BeyondDetail";
import BackgroundDetail from "./execution/BackgroundDetail";
import MidgroundDetail from "./execution/MidgroundDetail";
import InitiativeDetail from "./execution/InitiativeDetail";
import MinistryDashboard from "./execution/MinistryDashboard";
import RenewalCycle from "./execution/RenewalCycle";
import { BlockHeading, Cell, isDateish, prettyDate, todayIso } from "./execution/ui";

/**
 * Execution — the Horizon Storyline, run.
 *
 * Andrew, on what this is for: "I'm thinking of an organization visiting this
 * on a weekly basis, emphasizing the important over the urgent, over the
 * whirlwind, accessible for a 15-min standup meeting, keeping the cadence of
 * accountability, all within the God Dreams / Horizon Storyline framework."
 *
 * So the page is ordered the way that meeting runs:
 *
 *   This week      — what is red, what is overdue, when the next review is
 *   Horizon Board  — the 1:4:1:4 sheet, and the navigator for everything below
 *   (detail)       — whichever box is selected, in full
 *   Ministry Dashboard — the monthly numbers
 *   Renewal Cycle  — the rhythm, as dates
 *
 * The board doubling as the navigator is what removed the duplicated
 * "Foreground Initiatives" heading Andrew flagged: there is now one place
 * initiatives are listed, and one detail area under it.
 *
 * It loads its own data when opened rather than riding on `getProjectDetail`,
 * for the same reason the books panel does.
 */
export default function ExecutionPanel({
  projectId,
  accessToken,
  canEdit,
  canManageSteps,
  churchName,
  members,
  onGoTo,
  focusInitiativeId = null,
}: {
  projectId: string;
  accessToken: string;
  /** editor or admin: owns the storyline, the plans and the scoreboard. */
  canEdit: boolean;
  /** may_manage_tasks: owns action steps, their lights, and measure readings. */
  canManageSteps: boolean;
  churchName: string;
  members: ProjectMember[];
  onGoTo: (panel: string) => void;
  /**
   * Open on this initiative. Set when someone arrives from a step on the
   * dashboard — AssignedSteps promises "jump to the initiative on the
   * board", and landing on the first live one instead broke that promise.
   */
  focusInitiativeId?: string | null;
}) {
  const [data, setData] = useState<ExecutionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);
  /**
   * Whether the default-selection effect has already run.
   *
   * Without this, Close could never close: setSelected(null) re-fired the
   * effect, which saw no selection and picked the first initiative again,
   * so the detail area reopened on the same paint it was dismissed.
   */
  const defaulted = useRef(false);
  const [showFinished, setShowFinished] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getExecutionData(accessToken, projectId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this section.");
    }
  }, [accessToken, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * What is open when you arrive.
   *
   * The first live initiative, because this panel exists for a weekly meeting
   * and the foreground is what that meeting is about. Falling back up the
   * bands means a church that has written its storyline but not yet chosen
   * initiatives still lands on something written rather than on an empty
   * detail area.
   */
  useEffect(() => {
    if (!data || selected || defaulted.current) return;
    defaulted.current = true;
    const live = data.initiatives.filter((i) => !i.is_complete);
    if (focusInitiativeId && data.initiatives.some((i) => i.id === focusInitiativeId)) {
      setSelected({ band: "foreground", id: focusInitiativeId });
      if (data.initiatives.find((i) => i.id === focusInitiativeId)?.is_complete) setShowFinished(true);
    } else if (live.length > 0) setSelected({ band: "foreground", id: live[0].id });
    else if (data.horizon.some((h) => h.horizon === "midground")) setSelected({ band: "midground" });
    else if (data.horizon.length > 0 || canEdit) setSelected({ band: "beyond" });
  }, [data, selected, canEdit, focusInitiativeId]);

  // A selected initiative that has since been deleted would leave the detail
  // area blank with no way back — fall to the first one that still exists.
  useEffect(() => {
    if (!data || selected?.band !== "foreground") return;
    if (!data.initiatives.some((i) => i.id === selected.id)) setSelected(null);
  }, [data, selected]);

  if (error) return <p className="py-10 text-center text-sm text-gray-500">{error}</p>;
  if (!data) return <p className="py-10 text-center text-sm text-gray-400">Loading…</p>;

  const written =
    data.horizon.length + data.initiatives.length + data.metrics.length + data.templates.length;

  return (
    <section className="pb-16">
      <header className="text-center">
        <VisionFrameMark className="mx-auto h-9 w-9 text-runfree-navy" />
        <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.16em] text-runfree-magentaDeep">
          The Horizon Storyline, run
        </p>
        <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-runfree-ink sm:text-3xl">
          Execution
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-gray-500">
          One page for the weekly fifteen minutes: what the church is becoming, what
          that means this year, and what four things are moving in the next ninety
          days.
        </p>
      </header>

      {written === 0 && !canEdit ? (
        <p className="mt-10 text-center text-sm text-gray-500">
          Nothing here yet. Your team will fill this in once the Horizon Storyline is
          set.
        </p>
      ) : (
        <>
          <ThisWeek data={data} members={members} />

          <section className="mt-10">
            <BlockHeading
              eyebrow="One page, four horizons"
              title="Horizon Storyline"
              note="Click any box to open it. Beyond the horizon sets the direction, the three-year vision names the priorities, this year's milestone makes it measurable, and the ninety-day initiatives are what your team is actually doing about it."
            />
            <HorizonBoard
              data={data}
              selected={selected}
              onSelect={setSelected}
              canEdit={canEdit}
            />
            {canEdit && <AddInitiative data={data} projectId={projectId} accessToken={accessToken} onChanged={load} />}

            {/* Finished initiatives are the record of what the church did.
                Marking one finished used to make it vanish from the only list
                that showed it, with no way back — "Reopen" lived on a detail
                view you could no longer reach. */}
            {data.initiatives.some((i) => i.is_complete) && (
              <div className="mt-4">
                <button
                  onClick={() => setShowFinished((v) => !v)}
                  className="text-xs font-semibold text-gray-500 transition hover:text-runfree-magentaDeep"
                >
                  {showFinished ? "Hide" : "Show"}{" "}
                  {data.initiatives.filter((i) => i.is_complete).length} finished
                </button>
                {showFinished && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {data.initiatives
                      .filter((i) => i.is_complete)
                      .map((i) => (
                        <li key={i.id}>
                          <button
                            onClick={() => setSelected({ band: "foreground", id: i.id })}
                            aria-pressed={selected?.band === "foreground" && selected.id === i.id}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                              selected?.band === "foreground" && selected.id === i.id
                                ? "bg-runfree-pink text-runfree-magentaDeep ring-runfree-magenta/30"
                                : "bg-white text-gray-600 ring-gray-200 hover:ring-runfree-magenta/40"
                            }`}
                          >
                            {i.name}
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          {selected && (
            <DetailShell
              title={detailTitle(selected, data)}
              eyebrow={detailEyebrow(selected)}
              onClose={() => setSelected(null)}
              onRename={
                selected.band === "foreground" && canEdit
                  ? async (v) => {
                      await updateInitiative(accessToken, selected.id, { name: v });
                      await load();
                    }
                  : undefined
              }
            >
              {selected.band === "beyond" && (
                <BeyondDetail
                  data={data}
                  projectId={projectId}
                  accessToken={accessToken}
                  canEdit={canEdit}
                  onChanged={load}
                />
              )}
              {selected.band === "background" && (
                <BackgroundDetail
                  data={data}
                  position={selected.position}
                  projectId={projectId}
                  accessToken={accessToken}
                  canEdit={canEdit}
                  onChanged={load}
                />
              )}
              {selected.band === "midground" && (
                <MidgroundDetail
                  data={data}
                  projectId={projectId}
                  accessToken={accessToken}
                  canEdit={canEdit}
                  canLog={canManageSteps}
                  onChanged={load}
                />
              )}
              {selected.band === "foreground" &&
                (() => {
                  const i = data.initiatives.find((x) => x.id === selected.id);
                  if (!i) return null;
                  return (
                    <InitiativeDetail
                      initiative={i}
                      data={data}
                      members={members}
                      projectId={projectId}
                      accessToken={accessToken}
                      canEdit={canEdit}
                      canManageSteps={canManageSteps}
                      onChanged={load}
                    />
                  );
                })()}
            </DetailShell>
          )}

          <MinistryDashboard
            data={data}
            projectId={projectId}
            accessToken={accessToken}
            canEdit={canEdit}
            churchName={churchName}
            onChanged={load}
          />

          <RenewalCycle data={data} canEdit={canEdit} />

          <Framework onGoTo={onGoTo} />
        </>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function detailEyebrow(s: Selection): string {
  switch (s.band) {
    case "beyond":
      return "Beyond the horizon · 5–20 years";
    case "background":
      return "Background vision · 3 years";
    case "midground":
      return "Midground milestone · 1 year";
    case "foreground":
      return "Foreground initiative · 90 days";
  }
}

function detailTitle(s: Selection, data: ExecutionData): string {
  if (s.band === "foreground") {
    return data.initiatives.find((i) => i.id === s.id)?.name ?? "Initiative";
  }
  if (s.band === "background") return `Priority ${s.position + 1}`;
  if (s.band === "midground") return "This year's milestone";
  return "The long-range vision";
}

/**
 * The one detail area, under the board.
 *
 * A single shell rather than four differently-shaped panels: whatever you
 * click lands in the same place, at the same width, with the same way out.
 */
function DetailShell({
  eyebrow,
  title,
  onClose,
  onRename,
  children,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  /** Supplied only where the title is a name someone owns — an initiative. */
  onRename?: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-2xl bg-gray-50 ring-1 ring-gray-200">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3.5 sm:px-6">
        {/* flex-1 as well as min-w-0: without it the rename Cell's w-full
            input was only as wide as the eyebrow above it. */}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-magentaDeep">
            {eyebrow}
          </p>
          {onRename ? (
            <Cell
              value={title}
              onSave={(v) => v && onRename(v)}
              required
              ariaLabel="Initiative name"
              className="!px-0 font-display !text-lg font-extrabold tracking-tight !text-runfree-ink"
            />
          ) : (
            <h3 className="mt-0.5 font-display text-lg font-extrabold tracking-tight text-runfree-ink">
              {title}
            </h3>
          )}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-runfree-ink"
        >
          Close
        </button>
      </div>
      <div className="px-4 py-5 sm:px-6">{children}</div>
    </section>
  );
}

function AddInitiative({
  data,
  projectId,
  accessToken,
  onChanged,
}: {
  data: ExecutionData;
  projectId: string;
  accessToken: string;
  onChanged: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const live = data.initiatives.filter((i) => !i.is_complete).length;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {adding ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            await createInitiative(accessToken, projectId, name.trim(), data.initiatives.length);
            setName("");
            setAdding(false);
            await onChanged();
          }}
          className="flex w-full flex-wrap items-center gap-2"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name this initiative"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
          />
          <button
            type="submit"
            className="rounded-lg bg-runfree-grad px-3.5 py-2 text-xs font-semibold text-white transition hover:opacity-90"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setName("");
            }}
            className="px-2 py-2 text-xs text-gray-500 transition hover:text-runfree-ink"
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <button
            onClick={() => setAdding(true)}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-runfree-magentaDeep transition hover:bg-runfree-pink"
          >
            + Add an initiative
          </button>
          {live > 4 && (
            <p className="text-[11px] text-gray-400">
              The sheet gives four boxes. {live} are live — worth asking which are
              really this quarter&rsquo;s.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The weekly standup, assembled.
 *
 * Andrew asked for a per-project weekly email; sending is blocked on
 * `RESEND_API_KEY`, and a Send button that silently does nothing is worse
 * than no button. What is built is the thing that email would contain, on the
 * page, with a copy button — so it is already useful, and it is the payload
 * the moment Resend is configured.
 */
function ThisWeek({ data, members }: { data: ExecutionData; members: ProjectMember[] }) {
  const today = todayIso();
  const [copied, setCopied] = useState(false);

  // The sheet's free-text "Accountable" first; failing that, the portal
  // member the step is assigned to. The digest used to name only the former,
  // so a step assigned through the dropdown went out with no owner.
  const owner = (s: ExecutionData["steps"][number]) =>
    s.accountable ||
    (s.assignee_profile_id
      ? (() => {
          const m = members.find((x) => x.profileId === s.assignee_profile_id);
          return m ? m.fullName || m.email : null;
        })()
      : null);

  const live = data.initiatives.filter((i) => !i.is_complete);
  const attention = live.filter((i) => i.status !== "green");
  // Only steps on LIVE initiatives. A finished initiative's leftover red
  // steps were still counted here, so the headline said "2 past due" over a
  // board that showed none.
  const liveIds = new Set(live.map((i) => i.id));
  const due = data.steps.filter(
    (s) =>
      liveIds.has(s.initiative_id) &&
      s.status !== "green" &&
      isDateish(s.by_when) &&
      (s.by_when as string) <= today
  );

  const anchor = useMemo(
    () => live.map((i) => i.start_date).filter((d): d is string => !!d).sort()[0] ?? null,
    [live]
  );
  const next = anchor ? nextRenewalStop(renewalCycle(anchor), today) : null;

  // "Behind" needs a clock. Measured against the year since the earliest
  // initiative started: at half the year a measure should be about halfway.
  // The old rule — under 50%, full stop — called every measure behind on day
  // one, under a heading that said everything was on track. With no anchor
  // nothing can be behind, only unstarted.
  const elapsed = anchor
    ? Math.min(1, Math.max(0, (Date.parse(today) - Date.parse(anchor)) / (365 * 86_400_000)))
    : null;
  const behind = data.measures.filter((m) => {
    const p = measureProgress(m, effectiveCurrent(m, data.readings));
    return p != null && elapsed != null && p + 0.1 < elapsed;
  }).length;
  const talk = attention.length + due.length + behind;

  if (live.length === 0 && data.measures.length === 0) return null;

  const lines: string[] = [`Where we are — ${prettyDate(today)}`, ""];
  for (const i of live) {
    lines.push(`${i.name} — ${RAG_LABEL[i.status]}${i.leader ? ` (${i.leader})` : ""}`);
    for (const s of data.steps.filter((s) => s.initiative_id === i.id && s.status !== "green")) {
      const who = owner(s);
      lines.push(
        `   • ${s.description}${who ? ` — ${who}` : ""}${
          s.by_when ? ` — by ${isDateish(s.by_when) ? prettyDate(s.by_when) : s.by_when}` : ""
        }`
      );
    }
    lines.push("");
  }
  for (const m of data.measures) {
    const now = effectiveCurrent(m, data.readings);
    lines.push(`${m.label}: ${now ?? "—"}${m.unit ?? ""} of ${m.target ?? "—"}${m.unit ?? ""}`);
  }
  if (next) lines.push("", `Next review: ${prettyDate(next.on)} — ${next.length}, ${next.marker} in.`);
  const digest = lines.join("\n").trim();

  return (
    <section className="mt-8">
      <div className="rounded-2xl bg-runfree-navyDeep px-5 py-5 text-white sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">
              This week
            </p>
            <h3 className="mt-1 font-display text-xl font-extrabold tracking-tight">
              {talk === 0
                ? "Everything is on track"
                : `${talk} thing${talk === 1 ? "" : "s"} to talk about`}
            </h3>
          </div>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(digest);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              } catch {
                /* clipboard blocked — the text is on screen either way */
              }
            }}
            className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
          >
            {copied ? "Copied" : "Copy update"}
          </button>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat n={live.length} label="In flight" />
          <Stat n={attention.length} label="Need attention" tone={attention.length ? "amber" : undefined} />
          <Stat n={due.length} label="Past due" tone={due.length ? "rose" : undefined} />
          {data.measures.length > 0 ? (
            <Stat n={behind} label="Measures behind" tone={behind ? "amber" : undefined} />
          ) : (
            <div className="rounded-xl bg-white/5 px-3 py-3">
              <dd className="font-display text-sm font-extrabold leading-tight">
                {next ? prettyDate(next.on) : "—"}
              </dd>
              <dt className="mt-1 text-[11px] uppercase tracking-wide text-white/50">Next review</dt>
            </div>
          )}
        </dl>

        {(attention.length > 0 || due.length > 0) && (
          <ul className="mt-4 space-y-1.5 border-t border-white/10 pt-4">
            {attention.map((i) => (
              <li key={i.id} className="flex items-start gap-2 text-sm text-white/80">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${RAG_DOT[i.status]}`} />
                <span>
                  <span className="font-semibold text-white">{i.name}</span> —{" "}
                  {RAG_LABEL[i.status].toLowerCase()}
                  {i.leader ? ` · ${i.leader}` : ""}
                </span>
              </li>
            ))}
            {due.map((s) => (
              <li key={s.id} className="flex items-start gap-2 text-sm text-white/80">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose-400" />
                <span>
                  {s.description}
                  {owner(s) ? ` · ${owner(s)}` : ""} — due {prettyDate(s.by_when)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {next && data.measures.length > 0 && (
          <p className="mt-4 border-t border-white/10 pt-3 text-xs text-white/50">
            Next review {prettyDate(next.on)} — {next.length.toLowerCase()}, {next.marker} in.
          </p>
        )}
      </div>
    </section>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: "amber" | "rose" }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-3">
      <dd
        className={`font-display text-2xl font-extrabold leading-none ${
          tone === "rose" ? "text-rose-300" : tone === "amber" ? "text-amber-300" : "text-white"
        }`}
      >
        {n}
      </dd>
      <dt className="mt-1.5 text-[11px] uppercase tracking-wide text-white/50">{label}</dt>
    </div>
  );
}

/**
 * Where the framework itself lives.
 *
 * Andrew: "give a few quicklinks to either the book, visual summary, key
 * chapters, etc." All three of those are files on the Books panel, which is
 * one in-portal click away and instant — where a direct Drive link would
 * mean a ~7s live read on the panel a church opens weekly. So: one card, the
 * real cover, and an honest list of what is behind the link.
 */
function Framework({ onGoTo }: { onGoTo: (panel: string) => void }) {
  return (
    <section className="mt-12">
      <button
        onClick={() => onGoTo("books")}
        className="group flex w-full items-center gap-4 rounded-2xl bg-white px-4 py-4 text-left ring-1 ring-gray-200 transition hover:ring-runfree-magenta/40 sm:px-5"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/god-dreams/book-cover.jpg"
          alt=""
          loading="lazy"
          className="h-20 w-auto shrink-0 rounded-lg shadow-sm ring-1 ring-gray-200"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-magentaDeep">
            Where this comes from
          </span>
          <span className="mt-0.5 block font-display text-base font-extrabold tracking-tight text-runfree-ink">
            God Dreams
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-gray-500">
            The full book, the visual summary and the chapters behind each horizon —
            including chapter 5, which introduces the Horizon Storyline.
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-runfree-magentaDeep transition group-hover:translate-x-0.5">
          Books →
        </span>
      </button>
    </section>
  );
}
