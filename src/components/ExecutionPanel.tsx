"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectMember } from "@/lib/projects";
import {
  RAG_DOT,
  RAG_LABEL,
  STALE_AFTER_DAYS,
  createInitiative,
  daysBetween,
  daysSinceUpdate,
  effectiveStatus,
  getExecutionData,
  initiativePace,
  isStale,
  reviewDue,
  updateInitiative,
  measureProgress,
  nextRenewalStop,
  renewalCycle,
  effectiveCurrent,
  signedFileUrl,
  type ExecutionData,
  type Initiative,
} from "@/lib/execution";
import { richTextIsEmpty } from "@/lib/rich-text";
import HorizonBoard, { VisionFrameMark, type Selection } from "./execution/HorizonBoard";
import BeyondDetail from "./execution/BeyondDetail";
import BackgroundDetail from "./execution/BackgroundDetail";
import MidgroundDetail from "./execution/MidgroundDetail";
import InitiativeDetail from "./execution/InitiativeDetail";
import MinistryDashboard from "./execution/MinistryDashboard";
import RenewalCycle from "./execution/RenewalCycle";
import { BlockHeading, Cell, Icon, NumberDisc, PINK_BUTTON, isDateish, prettyDate, todayIso, type IconName } from "./execution/ui";

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
 *   This week      — what is red, what is stale, what is overdue, how long
 *                    is left in the ninety days, when the next renewal is.
 *                    Every line is a button that opens the thing it names.
 *   Horizon Board  — the 1:4:1:4 sheet, and the navigator for everything
 *                    below. The detail opens under the band that was clicked.
 *   Measures       — the scoreboard.
 *   Renewal Cycle  — the next stop, with the rest folded.
 *
 * 6 Sept 2026 — Andrew: "the intuitive functionality, and the overall feel of
 * the execution tab needs work." What the review against God Dreams and the
 * goal-tracking tools (Ninety, Rhythm, Perdoo, Lattice, Tability) changed is
 * recorded on each component; the thread through all of it is the weekly
 * check-in (077) and the staleness it makes visible.
 *
 * It loads its own data when opened rather than riding on `getProjectDetail`,
 * for the same reason the books panel does.
 *
 * 17 Sept 2026 — "functionally great … the visual feels a little dated." The
 * refresh changed how it looks and nothing about what it does: the same
 * data, the same gates, the same meeting order. See
 * docs/design/execution-redesign-spec.md for the judged direction.
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
  /** may_manage_tasks: owns action steps, check-ins and measure readings. */
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
  // Bumped when an empty Foreground slot is clicked; AddInitiative opens on it.
  const [addSignal, setAddSignal] = useState(0);
  // A user's click, as opposed to the default selection — only that scrolls.
  const userSelected = useRef(false);

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
      userSelected.current = true;
      if (data.initiatives.find((i) => i.id === focusInitiativeId)?.is_complete) setShowFinished(true);
    } else if (live.length > 0) setSelected({ band: "foreground", id: live[0].id });
    else if (data.horizon.some((h) => h.horizon === "midground")) setSelected({ band: "midground" });
    // The Beyond detail is the editor (076) — the vision itself is on the
    // board — so a reader is not landed on it.
    else if (canEdit) setSelected({ band: "beyond" });
  }, [data, selected, canEdit, focusInitiativeId]);

  // A selected initiative that has since been deleted would leave the detail
  // area blank with no way back — fall to the first one that still exists.
  useEffect(() => {
    if (!data || selected?.band !== "foreground") return;
    if (!data.initiatives.some((i) => i.id === selected.id)) setSelected(null);
  }, [data, selected]);

  /**
   * Bring the detail into view when a person opens something.
   *
   * The detail renders under the band that was clicked, so on a desktop it
   * is usually already on screen and `nearest` moves nothing. On a phone the
   * four bands stack and the detail can land a screen below the thumb.
   */
  useEffect(() => {
    if (!selected || !userSelected.current) return;
    const el = document.getElementById("execution-detail");
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.requestAnimationFrame(() =>
      el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" })
    );
  }, [selected]);

  const select = (s: Selection | null) => {
    userSelected.current = true;
    setSelected(s);
  };

  if (error) return <p className="py-10 text-center text-sm text-gray-500">{error}</p>;
  if (!data) return <p className="py-10 text-center text-sm text-gray-400">Loading…</p>;

  const written =
    data.horizon.length + data.initiatives.length + data.metrics.length + data.templates.length;

  const detail = selected ? (
    <DetailShell
      title={detailTitle(selected, data)}
      eyebrow={detailEyebrow(selected)}
      bandIcon={BAND_ICON[selected.band]}
      onClose={() => select(null)}
      onRename={
        selected.band === "foreground" && canEdit
          ? async (v) => {
              await updateInitiative(accessToken, selected.id, { name: v });
              await load();
            }
          : undefined
      }
    >
      {selected.band === "beyond" && canEdit && (
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
  ) : null;

  return (
    <section className="pb-16">
      <header className="flex flex-col items-center text-center">
        {/* God Dreams' own Execute mark, over the Vision Frame window. */}
        <span className="mx-auto inline-flex items-center gap-2 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-gray-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/god-dreams/execute-icon.png" alt="" className="h-8 w-8" />
          <VisionFrameMark className="h-8 w-8 text-runfree-navy/60" />
        </span>
        <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.16em] text-runfree-magentaDeep">
          God Dreams · The Horizon Storyline, run
        </p>
        <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-runfree-ink sm:text-3xl">
          Execution
        </h2>
        <p className="mx-auto mt-1.5 max-w-lg text-sm leading-relaxed text-gray-500">
          The weekly fifteen minutes: what is moving in the next ninety days, and what it is
          for.
        </p>
      </header>

      {written === 0 && !canEdit ? (
        <p className="mt-10 text-center text-sm text-gray-500">
          Nothing here yet. Your team will fill this in once the Horizon Storyline is
          set.
        </p>
      ) : (
        <>
          <ThisWeek data={data} members={members} onOpen={select} />

          <section className="mt-10">
            <BlockHeading
              eyebrow="One page, four horizons"
              title="Horizon Storyline"
              note="Far to near: the vision, four three-year objectives, this year's goal, and the four initiatives moving now. Click anything to open it."
            />
            {canEdit && <SetupStrip data={data} onOpen={select} onAddInitiative={() => setAddSignal((n) => n + 1)} />}
            <HorizonBoard
              data={data}
              selected={selected}
              onSelect={select}
              canEdit={canEdit}
              onOpenFile={async (path) => {
                const url = await signedFileUrl(accessToken, path);
                if (url) window.open(url, "_blank", "noopener");
              }}
              onAddInitiative={canEdit ? () => setAddSignal((n) => n + 1) : undefined}
              detail={detail}
            />
            {/* Adding, and the record of what is finished, on one row under
                the board. Finished initiatives are the record of what the
                church did: marking one finished used to make it vanish from
                the only list that showed it, with no way back — "Reopen"
                lived on a detail view you could no longer reach. */}
            {(canEdit || data.initiatives.some((i) => i.is_complete)) && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                {canEdit && (
                  <AddInitiative
                    data={data}
                    projectId={projectId}
                    accessToken={accessToken}
                    onChanged={load}
                    onCreated={(id) => select({ band: "foreground", id })}
                    signal={addSignal}
                  />
                )}
                {data.initiatives.some((i) => i.is_complete) && (
                  <button
                    type="button"
                    onClick={() => setShowFinished((v) => !v)}
                    aria-expanded={showFinished}
                    className="text-xs font-semibold text-gray-500 transition hover:text-runfree-magentaDeep"
                  >
                    {showFinished ? "Hide" : "Show"}{" "}
                    {data.initiatives.filter((i) => i.is_complete).length} finished
                  </button>
                )}
              </div>
            )}
            {showFinished && data.initiatives.some((i) => i.is_complete) && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {data.initiatives
                  .filter((i) => i.is_complete)
                  .map((i) => {
                    const on = selected?.band === "foreground" && selected.id === i.id;
                    return (
                      <li key={i.id}>
                        <button
                          type="button"
                          onClick={() => select({ band: "foreground", id: i.id })}
                          aria-pressed={on}
                          className={`inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
                            on
                              ? "text-runfree-ink ring-2 ring-runfree-magenta"
                              : "text-gray-600 ring-1 ring-gray-200 hover:ring-runfree-magenta/40"
                          }`}
                        >
                          <Icon name="check" className="h-3 w-3 text-emerald-600" />
                          {i.name}
                        </button>
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>

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

/** The glyph each band carries on its rail, repeated on its detail. */
const BAND_ICON: Record<Selection["band"], IconName> = {
  beyond: "telescope",
  background: "flag",
  midground: "target",
  foreground: "footprints",
};

function detailEyebrow(s: Selection): string {
  switch (s.band) {
    case "beyond":
      return "Beyond-the-Horizon Vision · 5–20 years";
    case "background":
      return "Background Horizon · 3 years";
    case "midground":
      return "Mid-Ground Horizon · 1 year";
    case "foreground":
      return "Foreground Horizon · 90 days · initiative dashboard";
  }
}

function detailTitle(s: Selection, data: ExecutionData): string {
  if (s.band === "foreground") {
    return data.initiatives.find((i) => i.id === s.id)?.name ?? "Initiative";
  }
  if (s.band === "background") {
    const box = data.horizon.find((h) => h.horizon === "background" && h.position === s.position);
    return box?.title?.trim() || `Objective ${s.position + 1}`;
  }
  if (s.band === "midground") return "The one-year goal";
  return "Edit the vision";
}

/**
 * The one detail area, opened under the band it belongs to.
 *
 * A single shell rather than four differently-shaped panels: whatever you
 * click lands in the same shape, with the same way out. It owns the eyebrow
 * and the title — the views inside never print the name again. The card that
 * was clicked points down into it, so it needs no stripe of its own.
 */
function DetailShell({
  eyebrow,
  title,
  bandIcon,
  onClose,
  onRename,
  children,
}: {
  eyebrow: string;
  title: string;
  bandIcon: IconName;
  onClose: () => void;
  /** Supplied only where the title is a name someone owns — an initiative. */
  onRename?: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="animate-fade">
      <div className="flex items-start justify-between gap-3 border-b border-gray-200 bg-white px-5 py-4 sm:px-7">
        {/* flex-1 as well as min-w-0: without it the rename Cell's w-full
            input was only as wide as the eyebrow above it. */}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-runfree-magentaDeep">
            <Icon name={bandIcon} className="h-3.5 w-3.5 shrink-0" />
            {eyebrow}
          </p>
          {onRename ? (
            <Cell
              value={title}
              onSave={(v) => v && onRename(v)}
              required
              ariaLabel="Initiative name"
              className="mt-1 !px-0 font-display !text-xl font-extrabold tracking-tight !text-runfree-ink sm:!text-2xl"
            />
          ) : (
            <h3 className="mt-1 font-display text-xl font-extrabold tracking-tight text-runfree-ink sm:text-2xl">
              {title}
            </h3>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-runfree-ink"
        >
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
      <div className="px-5 py-6 sm:px-7">{children}</div>
    </section>
  );
}

/**
 * Where the storyline stands, for the person building it.
 *
 * Four chips in the sheet's order, each done or not, each a button to the
 * band it names. Shown to editors only, and only until everything is in —
 * a finished storyline needs no scaffolding.
 */
function SetupStrip({
  data,
  onOpen,
  onAddInitiative,
}: {
  data: ExecutionData;
  onOpen: (s: Selection) => void;
  onAddInitiative: () => void;
}) {
  const beyond = data.horizon.find((h) => h.horizon === "beyond");
  const objectives = [0, 1, 2, 3].filter((n) => {
    const b = data.horizon.find((h) => h.horizon === "background" && h.position === n);
    return b && (b.title?.trim() || !richTextIsEmpty(b.body));
  }).length;
  const mid = data.horizon.find((h) => h.horizon === "midground");
  const live = data.initiatives.filter((i) => !i.is_complete).length;
  const steps: { label: string; done: boolean; detail: string; go: () => void }[] = [
    {
      label: "Vision",
      done: !!beyond && !richTextIsEmpty(beyond.body),
      detail: data.templates.length > 0 ? `${data.templates.length} template${data.templates.length === 1 ? "" : "s"}` : "no templates yet",
      go: () => onOpen({ band: "beyond" }),
    },
    {
      label: "Four objectives",
      done: objectives === 4,
      detail: `${objectives} of 4`,
      go: () => onOpen({ band: "background", position: Math.min(objectives, 3) }),
    },
    {
      label: "One-year goal",
      done: !!mid && !richTextIsEmpty(mid.body),
      detail: data.measures.length > 0 ? `${data.measures.length} measure${data.measures.length === 1 ? "" : "s"}` : "no measure yet",
      go: () => onOpen({ band: "midground" }),
    },
    {
      label: "Four initiatives",
      done: live >= 4,
      detail: `${live} of 4`,
      go: live >= 4 ? () => onOpen({ band: "foreground", id: data.initiatives.filter((i) => !i.is_complete)[0].id }) : onAddInitiative,
    },
  ];
  if (steps.every((s) => s.done)) return null;
  return (
    <ol className="mb-4 inline-flex max-w-full flex-wrap items-center gap-1 rounded-3xl bg-white p-1 shadow-sm ring-1 ring-gray-200 sm:rounded-full">
      {steps.map((s, n) => (
        <li key={s.label}>
          <button
            type="button"
            onClick={s.go}
            className={`inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-xs font-semibold transition-colors hover:bg-runfree-indigo/60 ${
              s.done ? "text-gray-500" : "text-runfree-ink"
            }`}
          >
            {s.done ? (
              <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-white">
                <Icon name="check" className="h-3 w-3" />
                <span className="sr-only">Done: </span>
              </span>
            ) : (
              <NumberDisc n={n + 1} />
            )}
            {s.label}
            <span className="font-normal text-gray-500">{s.detail}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function AddInitiative({
  data,
  projectId,
  accessToken,
  onChanged,
  onCreated,
  signal = 0,
}: {
  data: ExecutionData;
  projectId: string;
  accessToken: string;
  onChanged: () => Promise<void>;
  onCreated: (id: string) => void;
  /** Changes when an empty slot on the board is clicked. */
  signal?: number;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const live = data.initiatives.filter((i) => !i.is_complete).length;
  useEffect(() => {
    if (signal > 0) setAdding(true);
  }, [signal]);

  return (
    <div className={adding ? "w-full" : "flex flex-wrap items-center gap-3"}>
      {adding ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const created = await createInitiative(accessToken, projectId, name.trim(), data.initiatives.length);
            setName("");
            setAdding(false);
            await onChanged();
            // Land on the new initiative so its plan can be written straight away.
            onCreated(created.id);
          }}
          className="flex w-full flex-wrap items-center gap-2"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name this initiative — a verb and a thing: “Launch the Next Steps path”"
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
          {live < 4 && (
            <button type="button" onClick={() => setAdding(true)} className={PINK_BUTTON}>
              <Icon name="plus" className="h-3.5 w-3.5" />
              Add an initiative
            </button>
          )}
          {live >= 4 && (
            <p className="text-[11px] text-gray-500">
              Four initiatives are live — the sheet&rsquo;s full. Finish one to make room, or
              {" "}
              <button onClick={() => setAdding(true)} className="font-semibold text-runfree-magentaDeep hover:underline">
                add a fifth anyway
              </button>
              .
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** The bucket for agenda lines nobody owns. */
const UNOWNED = "No owner yet";

/**
 * The weekly standup, assembled.
 *
 * Every line is a button that opens the initiative it names: the card is
 * the agenda, the board underneath is where the meeting happens. Four
 * numbers across the top; the fourth is how far into the ninety days the
 * team is, because the Foreground Horizon IS ninety days and that clock is
 * what turns "at risk" into a decision.
 *
 * Andrew asked for a per-project weekly email; sending is blocked on
 * `RESEND_API_KEY`. What is built is the thing that email would contain, on
 * the page, with a copy button.
 */
function ThisWeek({
  data,
  members,
  onOpen,
}: {
  data: ExecutionData;
  members: ProjectMember[];
  onOpen: (s: Selection) => void;
}) {
  const today = todayIso();
  const [copied, setCopied] = useState(false);
  const [groupBy, setGroupBy] = useState<"initiative" | "person">("initiative");

  // The sheet's free-text "Accountable" first; failing that, the portal
  // member the step is assigned to.
  const owner = (s: ExecutionData["steps"][number]) =>
    s.accountable ||
    (s.assignee_profile_id
      ? (() => {
          const m = members.find((x) => x.profileId === s.assignee_profile_id);
          return m ? m.fullName || m.email : null;
        })()
      : null);

  const live = data.initiatives.filter((i) => !i.is_complete);
  const statusOf = (i: Initiative) => effectiveStatus(i, data.updates);
  const attention = live.filter((i) => statusOf(i) !== "green");
  const stale = live.filter((i) => isStale(i, data.updates, today));
  // One line per initiative, whatever the reasons — an initiative that is
  // both at risk and unheard-from is one conversation, not two.
  const flagged = live
    .map((i) => {
      const reasons: string[] = [];
      if (statusOf(i) !== "green") reasons.push(RAG_LABEL[statusOf(i)].toLowerCase());
      // A date the team chose beats the generic two-week rule, and saying
      // both would be saying the same thing twice.
      if (reviewDue(i, data.updates, today)) reasons.push(`review due ${prettyDate(i.next_review_on)}`);
      else if (isStale(i, data.updates, today)) {
        const d = daysSinceUpdate(i, data.updates, today);
        reasons.push(d != null && d > 365 ? "never checked in" : `no check-in for ${d} days`);
      }
      if (initiativePace(i, data.steps, today)?.behind) reasons.push("behind pace");
      return { i, reasons };
    })
    .filter((f) => f.reasons.length > 0);
  // Only steps on LIVE initiatives.
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
  const dayOf = anchor ? daysBetween(anchor, today) + 1 : null;

  // "Behind" needs a clock — the year since the earliest initiative started.
  const elapsed = anchor
    ? Math.min(1, Math.max(0, (Date.parse(today) - Date.parse(anchor)) / (365 * 86_400_000)))
    : null;
  const behind = data.measures.filter((m) => {
    const p = measureProgress(m, effectiveCurrent(m, data.readings));
    return p != null && elapsed != null && p + 0.1 < elapsed;
  });
  const talk = flagged.length + due.length + behind.length;

  if (live.length === 0 && data.measures.length === 0) return null;

  const lines: string[] = [`Where we are — ${prettyDate(today)}`, ""];
  for (const i of live) {
    const since = daysSinceUpdate(i, data.updates, today);
    // The clipboard copy is what Andrew wants the weekly email to be, so it
    // says exactly what the card above it says — a digest that disagrees
    // with the screen is worse than no digest.
    const flags = [
      reviewDue(i, data.updates, today)
        ? `review due ${prettyDate(i.next_review_on)}`
        : since != null && since >= STALE_AFTER_DAYS
          ? `no check-in for ${since} days`
          : null,
      initiativePace(i, data.steps, today)?.behind ? "behind pace" : null,
    ].filter(Boolean);
    lines.push(
      `${i.name} — ${RAG_LABEL[statusOf(i)]}${i.leader ? ` (${i.leader})` : ""}${
        flags.length ? ` — ${flags.join(", ")}` : ""
      }`
    );
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
  if (dayOf != null) lines.push("", `Day ${dayOf} of 90.`);
  if (next) lines.push(`Next renewal: ${prettyDate(next.on)} — ${next.length}, ${next.marker} in.`);
  const digest = lines.join("\n").trim();

  const initiativeOf = (id: string) => live.find((i) => i.id === id);

  /**
   * The agenda as data, so it can be ordered two ways without the lines
   * being written twice. `owner` is who would speak to it: an initiative's
   * leader, a step's accountable person, nobody for a measure.
   */
  const agenda: {
    key: string;
    dot: string;
    owner: string | null;
    node: React.ReactNode;
    go: () => void;
  }[] = [
    ...flagged.map(({ i, reasons }) => ({
      key: `a-${i.id}`,
      dot: statusOf(i) === "green" ? "bg-amber-300/70" : RAG_DOT[statusOf(i)],
      owner: i.leader,
      go: () => onOpen({ band: "foreground", id: i.id }),
      node: (
        <>
          <span className="font-semibold text-white">{i.name}</span> — {reasons.join(" · ")}
          {i.leader ? <span className="text-white/60"> · {i.leader}</span> : null}
        </>
      ),
    })),
    ...due.map((s) => ({
      key: `d-${s.id}`,
      dot: "bg-rose-400",
      owner: owner(s),
      go: () => onOpen({ band: "foreground", id: s.initiative_id }),
      node: (
        <>
          {s.description}
          {owner(s) ? ` · ${owner(s)}` : ""} — due {prettyDate(s.by_when)}
          {initiativeOf(s.initiative_id) ? (
            <span className="text-white/60"> · {initiativeOf(s.initiative_id)!.name}</span>
          ) : null}
        </>
      ),
    })),
    ...behind.map((m) => ({
      key: `m-${m.id}`,
      dot: "bg-amber-300/70",
      owner: null,
      go: () => onOpen({ band: "midground" }),
      node: (
        <>
          <span className="font-semibold text-white">{m.label}</span> — behind the year&rsquo;s pace
        </>
      ),
    })),
  ];
  // Named people first, in the order they appear; the unowned pile last,
  // because "nobody" is a finding, not a person to go to next.
  const owners = [...new Set(agenda.map((a) => a.owner ?? UNOWNED))].sort((a, b) =>
    a === UNOWNED ? 1 : b === UNOWNED ? -1 : 0
  );

  /*
   * The portal's own dark card — runfree-navy, a gradient bar on top — not
   * the sidebar's navyDeep it used to share, which made the agenda look like
   * part of the navigation. The count is the largest number on the page,
   * because it is the first thing the meeting needs to know.
   */
  return (
    <section className="mt-8 overflow-hidden rounded-3xl bg-runfree-navy text-white shadow-sm">
      <div aria-hidden className="h-1.5 bg-runfree-grad" />
      <div className="px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-runfree-pink">
              This week
            </p>
            <h3 className="mt-1.5 flex flex-wrap items-baseline gap-x-2 font-display tracking-tight">
              {talk === 0 ? (
                <span className="text-xl font-extrabold">Everything is on track</span>
              ) : (
                <>
                  <span className="text-3xl font-extrabold leading-none tabular-nums sm:text-4xl">{talk}</span>
                  <span className="text-xl font-extrabold">
                    thing{talk === 1 ? "" : "s"} to talk about
                  </span>
                </>
              )}
            </h3>
            {next && (
              <p className="mt-1.5 text-xs text-white/70">
                Next renewal {prettyDate(next.on)} · {next.length.toLowerCase()} ·{" "}
                {daysBetween(today, next.on)} days away
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(digest);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              } catch {
                /* clipboard blocked — the text is on screen either way */
              }
            }}
            className="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3.5 py-2 text-xs font-bold text-white ring-1 ring-white/20 transition-colors hover:bg-white/20 sm:w-auto"
          >
            <Icon name="clipboard" className="h-3.5 w-3.5" />
            <span aria-live="polite">{copied ? "Copied" : "Copy update"}</span>
          </button>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat n={live.length} label="In flight" />
          <Stat n={attention.length} label="Need attention" tone={attention.length ? "amber" : undefined} />
          <Stat n={due.length} label="Past due" tone={due.length ? "rose" : undefined} />
          {dayOf != null ? (
            <div className="flex flex-col rounded-2xl bg-white/10 px-4 py-3.5 ring-1 ring-white/10">
              <dt className="order-2 mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
                {dayOf > 90 ? `Day ${dayOf} — renewal due` : "Day of the ninety"}
              </dt>
              <dd className="order-1 font-display text-3xl font-extrabold leading-none tabular-nums">
                {Math.min(dayOf, 90)}
                <span className="ml-1 text-sm font-semibold text-white/60">/ 90</span>
              </dd>
              {/* Time gone, not work done — the ninety days are the clock. */}
              <div className="order-3 mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/15" aria-hidden>
                <div
                  className="h-full rounded-full bg-runfree-orangeLight"
                  style={{ width: `${Math.min(100, (dayOf / 90) * 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <Stat n={stale.length} label="Stale" tone={stale.length ? "amber" : undefined} />
          )}
        </dl>

        {talk > 0 && (
          <>
            {/* Two ways through the same agenda. "By initiative" is the
                board's own order and answers "what is wrong"; "by person"
                answers "whose turn is it", which is how a fifteen-minute
                standup actually goes round the room. Only offered when it
                would group into more than one name — a list of four lines
                all owned by the same person is not a grouping. */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-runfree-pink">Agenda</p>
              {owners.length > 1 && (
                <div className="inline-flex rounded-lg bg-white/10 p-0.5 ring-1 ring-white/10" role="group" aria-label="Group the agenda">
                  {(["initiative", "person"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setGroupBy(m)}
                      aria-pressed={groupBy === m}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition ${
                        groupBy === m ? "bg-white text-runfree-navy" : "text-white/75 hover:text-white"
                      }`}
                    >
                      By {m}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {groupBy === "person" && owners.length > 1 ? (
              <div className="mt-2 space-y-4">
                {owners.map((name) => (
                  <div key={name}>
                    <p className="px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">
                      {name}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {agenda
                        .filter((a) => (a.owner ?? UNOWNED) === name)
                        .map((a) => (
                          <Line key={a.key} dot={a.dot} onClick={a.go}>
                            {a.node}
                          </Line>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="mt-2 space-y-0.5">
                {agenda.map((a) => (
                  <Line key={a.key} dot={a.dot} onClick={a.go}>
                    {a.node}
                  </Line>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Line({
  dot,
  onClick,
  children,
}: {
  dot: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left text-[15px] text-white/85 transition-colors hover:bg-white/5 focus-visible:bg-white/10"
      >
        {/* The board's own tile, so a light here and a light there are one shape. */}
        <span
          aria-hidden
          className={`mt-[7px] block h-2.5 w-2.5 shrink-0 rounded-[3px] shadow-[inset_0_-2px_0_rgba(0,0,0,.14)] ${dot}`}
        />
        <span className="min-w-0 flex-1">{children}</span>
        <span aria-hidden className="shrink-0 text-white/40 transition group-hover:translate-x-0.5 group-hover:text-white">
          →
        </span>
      </button>
    </li>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: "amber" | "rose" }) {
  // dt before dd in the DOM, shown the other way round: the number leads.
  return (
    <div className="flex flex-col rounded-2xl bg-white/10 px-4 py-3.5 ring-1 ring-white/10">
      <dt className="order-2 mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">{label}</dt>
      <dd
        className={`order-1 font-display text-3xl font-extrabold leading-none tabular-nums ${
          tone === "rose" ? "text-rose-300" : tone === "amber" ? "text-amber-300" : "text-white"
        }`}
      >
        {n}
      </dd>
    </div>
  );
}

/**
 * Where the framework itself lives.
 *
 * Andrew: "give a few quicklinks to either the book, visual summary, key
 * chapters, etc." All three of those are files on the Books panel, which is
 * one in-portal click away and instant.
 */
function Framework({ onGoTo }: { onGoTo: (panel: string) => void }) {
  return (
    <section className="mt-12">
      <button
        onClick={() => onGoTo("books")}
        type="button"
        className="group flex w-full items-center gap-4 rounded-3xl bg-white px-4 py-4 text-left shadow-sm ring-1 ring-gray-200 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-runfree-magenta/40 motion-reduce:hover:translate-y-0 sm:px-5"
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
