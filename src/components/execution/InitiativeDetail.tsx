"use client";

import { useState } from "react";
import RichText, { RichTextView } from "@/components/RichText";
import { richTextIsEmpty } from "@/lib/rich-text";
import { INITIATIVE_KINDS, initiativeKind } from "@/lib/god-dreams";
import type { ProjectMember } from "@/lib/projects";
import {
  PLAN_FIELDS,
  RAG_DOT,
  RAG_LABEL,
  RAG_RING,
  STALE_AFTER_DAYS,
  createStep,
  daysBetween,
  daysSinceUpdate,
  deleteInitiative,
  deleteStep,
  deleteUpdate,
  effectiveStatus,
  isStale,
  latestUpdate,
  postUpdate,
  reviewDue,
  trendFor,
  updateInitiative,
  updateStep,
  type ExecutionData,
  type Initiative,
  type InitiativeStep,
  type InitiativeUpdate,
  type RagStatus,
} from "@/lib/execution";
import { StepStrip, TrendStrip } from "./HorizonBoard";
import { Cell, Chip, DateCell, EditorActions, Field, MiniField, RagPicker, isDateish, prettyDate, todayIso } from "./ui";

/**
 * One Foreground Initiative, opened under the board.
 *
 * Ordered the way the weekly fifteen minutes actually runs (6 Sept 2026):
 *
 *   1. How is it going — the light, and how long since anyone said so.
 *      "Post a check-in" is the one action the meeting exists for.
 *   2. The numbers — steps by colour, past due, cost, days left.
 *   3. The action steps — what moves this week.
 *   4. The check-in history — the story behind the lights.
 *   5. The plan — the six blocks of the Foreground Initiative Plan, folded.
 *      They were written once at the retreat; the meeting rarely rereads
 *      them, and unfolded they pushed the action steps a screen and a half
 *      down.
 *
 * Status changes go through a check-in rather than a bare picker: Rhythm
 * Systems' rule — you may change the colour, but you say why — is the one
 * that keeps a dashboard honest past the first quarter. Still no
 * percent-complete anywhere; the strip is the sheet's own lights end to end.
 */
export default function InitiativeDetail({
  initiative: i,
  data,
  members,
  projectId,
  accessToken,
  canEdit,
  canManageSteps,
  onChanged,
}: {
  initiative: Initiative;
  data: ExecutionData;
  members: ProjectMember[];
  projectId: string;
  accessToken: string;
  canEdit: boolean;
  canManageSteps: boolean;
  onChanged: () => Promise<void>;
}) {
  const [newStep, setNewStep] = useState("");
  const [planOpen, setPlanOpen] = useState<boolean | null>(null);

  const steps = data.steps.filter((s) => s.initiative_id === i.id);
  const updates = data.updates.filter((u) => u.initiative_id === i.id);
  const kind = initiativeKind(i.kind);
  const today = todayIso();
  const status = effectiveStatus(i, data.updates);
  const last = latestUpdate(data.updates, i.id);
  const since = daysSinceUpdate(i, data.updates, today);
  const stale = isStale(i, data.updates, today);
  const trend = trendFor(data.updates, i.id);
  const dueReview = reviewDue(i, data.updates, today);

  const written = PLAN_FIELDS.filter((f) => !richTextIsEmpty(i[f.key])).length;
  // Open by default only when there is nothing written and someone can write it.
  const showPlan = planOpen ?? (written === 0 && canEdit);

  const patch = async (p: Parameters<typeof updateInitiative>[2]) => {
    await updateInitiative(accessToken, i.id, p);
    await onChanged();
  };

  const who = (profileId: string | null) => {
    if (!profileId) return null;
    const m = members.find((x) => x.profileId === profileId);
    return m ? m.fullName || m.email : null;
  };

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------- how is it going */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${RAG_RING[status]}`}>
              {RAG_LABEL[status]}
            </span>
            <Chip tone="navy">{kind.label}</Chip>
            {i.is_complete && <Chip tone="accent">Finished</Chip>}
            <TrendStrip updates={trend} />
          </div>
          <p className={`mt-1.5 text-xs ${stale ? "font-semibold text-amber-700" : "text-gray-500"}`}>
            {last
              ? `Last check-in ${since === 0 ? "today" : `${since} day${since === 1 ? "" : "s"} ago`}${
                  who(last.author_profile_id) ? ` by ${who(last.author_profile_id)}` : ""
                }`
              : since != null
                ? `No check-in yet — started ${since} day${since === 1 ? "" : "s"} ago`
                : "No check-in yet"}
            {stale && ` · the weekly rhythm slipped (${STALE_AFTER_DAYS}+ days)`}
          </p>
          {/* The date the team put in the diary, read back to them. Before
              this, Next Review was a field you could fill in and nothing
              anywhere would ever mention again. */}
          {dueReview && (
            <p className="mt-1 text-xs font-semibold text-amber-700">
              The review this team set for {prettyDate(i.next_review_on)} is still open.
            </p>
          )}
        </div>
        {canManageSteps && !i.is_complete && (
          <CheckIn
            initiative={i}
            status={status}
            projectId={projectId}
            accessToken={accessToken}
            onChanged={onChanged}
            nudge={stale || !last}
          />
        )}
      </div>

      <Scoreboard initiative={i} steps={steps} today={today} />

      {/* ------------------------------------------------- header fields */}
      <div className="grid gap-x-5 gap-y-3 rounded-xl bg-white px-4 py-3.5 ring-1 ring-gray-200 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Owner">
          <Cell
            value={i.leader}
            onSave={(v) => void patch({ leader: v })}
            disabled={!canEdit}
            placeholder="Who is in charge of this initiative"
          />
        </Field>
        <Field label="Team">
          <Cell
            value={i.team}
            onSave={(v) => void patch({ team: v })}
            disabled={!canEdit}
            placeholder="Who is on it"
          />
        </Field>
        <Field label="Start date">
          <DateCell value={i.start_date} onSave={(v) => void patch({ start_date: v })} disabled={!canEdit} />
        </Field>
        <Field label="Next review">
          <DateCell
            value={i.next_review_on}
            onSave={(v) => void patch({ next_review_on: v })}
            disabled={!canEdit}
          />
        </Field>
      </div>

      {/* ----------------------------------------------- action step list */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-navy">
            Action steps
          </h4>
          {kind.stepRange && (
            <span className="text-[11px] text-gray-400">
              {kind.label} usually runs {kind.steps.toLowerCase()}
            </span>
          )}
        </div>

        {steps.length === 0 ? (
          <p className="mt-2 text-xs italic text-gray-400">
            No steps yet. These are the specific moves, each with a person and a date.
          </p>
        ) : (
          <ul className="mt-2.5 space-y-1.5">
            {steps.map((s, n) => (
              <StepRow
                key={s.id}
                step={s}
                n={n + 1}
                members={members}
                accessToken={accessToken}
                canManage={canManageSteps}
                today={today}
                onChanged={onChanged}
              />
            ))}
          </ul>
        )}

        {canManageSteps && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newStep.trim()) return;
              await createStep(accessToken, projectId, i.id, newStep.trim(), steps.length);
              setNewStep("");
              await onChanged();
            }}
            className="mt-3 flex flex-wrap items-center gap-2"
          >
            <input
              value={newStep}
              onChange={(e) => setNewStep(e.target.value)}
              placeholder="Add an action step"
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
            />
            <button
              type="submit"
              className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-runfree-magentaDeep ring-1 ring-gray-300 transition hover:bg-runfree-pink"
            >
              Add
            </button>
          </form>
        )}
      </section>

      {/* ------------------------------------------------- check-in history */}
      {updates.length > 0 && (
        <UpdateHistory
          updates={updates}
          who={who}
          canManage={canManageSteps}
          onDelete={async (id) => {
            await deleteUpdate(accessToken, id);
            // Re-stamp the light from whatever check-in remains, best effort.
            const remaining = updates.filter((u) => u.id !== id);
            if (remaining.length > 0) {
              await updateInitiative(accessToken, i.id, {
                status: remaining[0].status,
                last_review_on: remaining[0].on_date,
              }).catch(() => {});
            }
            await onChanged();
          }}
        />
      )}

      {/* ------------------------------------------------------- the plan */}
      <section className="rounded-xl bg-white ring-1 ring-gray-200">
        <button
          onClick={() => setPlanOpen(!showPlan)}
          aria-expanded={showPlan}
          className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left"
        >
          <span>
            <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-navy">
              The plan
            </span>
            <span className="mt-0.5 block text-xs text-gray-500">
              {written === 0
                ? canEdit
                  ? "The Foreground Initiative Plan — six blocks, written once at the start."
                  : "Not written yet."
                : `${written} of ${PLAN_FIELDS.length} blocks written — initiative, objective, deliverables, plan, timeline, costs`}
            </span>
          </span>
          <span className="text-xs font-semibold text-runfree-magentaDeep">{showPlan ? "Hide" : "Read the plan"}</span>
        </button>
        {showPlan && (
          <div className="space-y-3 border-t border-gray-100 px-4 py-4">
            {PLAN_FIELDS.map((f) => (
              <PlanBlock
                key={f.key}
                field={f}
                body={i[f.key]}
                canEdit={canEdit}
                onSave={(html) => patch({ [f.key]: html })}
              />
            ))}
            {canEdit && (
              <label className="block min-w-0 pt-1">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Type of initiative
                </span>
                <select
                  value={i.kind}
                  onChange={(e) => void patch({ kind: e.target.value as Initiative["kind"] })}
                  className="mt-0.5 w-full max-w-md rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-runfree-ink outline-none focus:border-runfree-magenta"
                >
                  {INITIATIVE_KINDS.map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.label} — {k.steps} step{k.steps === "One" ? "" : "s"}, {k.responsibility.toLowerCase()}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] leading-relaxed text-gray-500">
                  {kind.blurb} Reviewed: {kind.review.toLowerCase()}.
                </span>
              </label>
            )}
          </div>
        )}
      </section>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-4 border-t border-gray-200 pt-4">
          <button
            onClick={() => void patch({ is_complete: !i.is_complete })}
            className="text-xs font-semibold text-gray-500 transition hover:text-runfree-ink"
          >
            {i.is_complete ? "Reopen this initiative" : "Mark this initiative finished"}
          </button>
          <button
            onClick={async () => {
              if (!confirm(`Delete “${i.name}” and its action steps? This cannot be undone.`)) return;
              await deleteInitiative(accessToken, i.id);
              await onChanged();
            }}
            className="text-xs font-semibold text-gray-500 transition hover:text-rose-600"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The weekly check-in: a light and a sentence.
 *
 * Opens as a small form; the light defaults to what it is now, so a week
 * where nothing changed is one click and a word. When it is not green the
 * placeholder asks for the plan, which is Rhythm's rule and Will's "This
 * Review" column in one.
 */
function CheckIn({
  initiative: i,
  status,
  projectId,
  accessToken,
  onChanged,
  nudge,
}: {
  initiative: Initiative;
  status: RagStatus;
  projectId: string;
  accessToken: string;
  onChanged: () => Promise<void>;
  /** True when it is overdue — the button is louder. */
  nudge: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [light, setLight] = useState<RagStatus>(status);
  const [note, setNote] = useState("");
  const [on, setOn] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        onClick={() => {
          setLight(status);
          setOpen(true);
        }}
        className={`shrink-0 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
          nudge
            ? "bg-runfree-grad text-white hover:opacity-90"
            : "bg-white text-runfree-magentaDeep ring-1 ring-gray-300 hover:bg-runfree-pink"
        }`}
      >
        Post this week&rsquo;s check-in
      </button>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await postUpdate(accessToken, projectId, i.id, light, note.trim() || null, on);
          setOpen(false);
          setNote("");
          await onChanged();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not post that");
        } finally {
          setBusy(false);
        }
      }}
      className="w-full rounded-xl bg-white p-4 ring-1 ring-runfree-magenta/30 sm:basis-full"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-navy">
          This week&rsquo;s check-in
        </span>
        <span className="flex items-center gap-2">
          <RagPicker value={light} onChange={setLight} />
          <span className="text-xs text-gray-600">{RAG_LABEL[light]}</span>
        </span>
        <label className="ml-auto flex items-center gap-2 text-[11px] text-gray-500">
          Dated
          <input
            type="date"
            value={on}
            onChange={(e) => setOn(e.target.value)}
            className="rounded-md border border-gray-200 px-2 py-1 text-xs text-runfree-ink outline-none focus:border-runfree-magenta"
          />
        </label>
      </div>
      <textarea
        autoFocus
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder={
          light === "green"
            ? "What moved this week?"
            : "What is in the way, and what is the plan to get back to green?"
        }
        className="mt-3 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <div className="mt-2">
        <EditorActions busy={busy} onSave={() => {}} onCancel={() => setOpen(false)} />
      </div>
    </form>
  );
}

function UpdateHistory({
  updates,
  who,
  canManage,
  onDelete,
}: {
  updates: InitiativeUpdate[];
  who: (profileId: string | null) => string | null;
  canManage: boolean;
  onDelete: (id: string) => Promise<void>;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? updates : updates.slice(0, 3);
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-navy">
          Check-ins
        </h4>
        {updates.length > 3 && (
          <button
            onClick={() => setAll((v) => !v)}
            className="text-[11px] font-semibold text-gray-500 transition hover:text-runfree-magentaDeep"
          >
            {all ? "Show the latest three" : `Show all ${updates.length}`}
          </button>
        )}
      </div>
      <ol className="mt-2 space-y-1.5">
        {shown.map((u) => (
          <li key={u.id} className="flex items-start gap-3 rounded-xl bg-white px-3.5 py-2.5 ring-1 ring-gray-200">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${RAG_DOT[u.status]}`} title={RAG_LABEL[u.status]} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-500">
                <span className="font-semibold text-runfree-ink">{prettyDate(u.on_date)}</span>
                {who(u.author_profile_id) ? ` · ${who(u.author_profile_id)}` : ""}
                {` · ${RAG_LABEL[u.status].toLowerCase()}`}
              </p>
              {u.note && <p className="mt-0.5 text-sm text-runfree-ink">{u.note}</p>}
            </div>
            {canManage && (
              <button
                onClick={async () => {
                  if (!confirm(`Delete the ${prettyDate(u.on_date)} check-in?`)) return;
                  await onDelete(u.id);
                }}
                className="shrink-0 text-[10px] font-semibold text-gray-400 transition hover:text-rose-600"
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function PlanBlock({
  field: f,
  body,
  canEdit,
  onSave,
}: {
  field: (typeof PLAN_FIELDS)[number];
  body: string | null;
  canEdit: boolean;
  onSave: (html: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const blank = richTextIsEmpty(body);
  if (blank && !canEdit) return null;
  return (
    <div className="rounded-xl bg-gray-50 px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-navy">{f.label}</p>
      {editing ? (
        <div className="mt-2 space-y-2">
          <RichText value={draft} onChange={setDraft} minHeight="6rem" placeholder={f.hint} />
          <EditorActions
            busy={busy}
            onSave={async () => {
              setBusy(true);
              try {
                await onSave(richTextIsEmpty(draft) ? null : draft);
                setEditing(false);
              } finally {
                setBusy(false);
              }
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : blank ? (
        <p className="mt-1 text-xs italic text-gray-400">{f.hint}</p>
      ) : (
        <div className="mt-1.5">
          <RichTextView html={body!} className="text-runfree-ink" />
        </div>
      )}
      {canEdit && !editing && (
        <button
          onClick={() => {
            setDraft(body ?? "");
            setEditing(true);
          }}
          className="mt-1.5 text-[11px] font-semibold text-gray-500 transition hover:text-runfree-magentaDeep"
        >
          {blank ? "Write it" : "Edit"}
        </button>
      )}
    </div>
  );
}

/**
 * The tracking strip.
 *
 * Four numbers, each derived rather than entered: how the steps sit by
 * colour, how many are past their date, what the plan costs if the costs
 * parse, and how much of the 90 days is left.
 */
function Scoreboard({
  initiative: i,
  steps,
  today,
}: {
  initiative: Initiative;
  steps: InitiativeStep[];
  today: string;
}) {
  const by = (s: InitiativeStep["status"]) => steps.filter((x) => x.status === s).length;
  const overdue = steps.filter(
    (s) => s.status !== "green" && isDateish(s.by_when) && (s.by_when as string) <= today
  ).length;

  // Sum only what parses as money. A "?" in the Cost column is a real answer
  // on Will's sheet, so a total that silently treated it as zero would be
  // worse than no total — hence the count of unpriced steps beside it.
  let total = 0;
  let unpriced = 0;
  for (const s of steps) {
    const m = (s.cost ?? "").replace(/[$,\s]/g, "");
    const n = Number(m);
    if (m && Number.isFinite(n)) total += n;
    else if ((s.cost ?? "").trim()) unpriced += 1;
  }

  const daysLeft = i.start_date ? 90 - daysBetween(i.start_date, today) : null;

  return (
    <div>
      <StepStrip steps={steps} className="!h-2" />
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Steps"
          value={
            <span className="flex items-center gap-2">
              {(["green", "amber", "red"] as const).map((s) => (
                <span key={s} className="flex items-center gap-1" title={RAG_LABEL[s]}>
                  <span className={`h-2.5 w-2.5 rounded-full ${RAG_DOT[s]}`} />
                  <span className="tabular-nums">{by(s)}</span>
                  <span className="sr-only">{RAG_LABEL[s].toLowerCase()}</span>
                </span>
              ))}
            </span>
          }
        />
        <Stat
          label="Past due"
          value={<span className={overdue > 0 ? "text-rose-600" : ""}>{overdue}</span>}
        />
        <Stat
          label="Cost"
          value={
            <span className="tabular-nums">
              ${total.toLocaleString()}
              {unpriced > 0 && (
                <span className="ml-1 text-xs font-normal text-gray-400">+{unpriced} tbd</span>
              )}
            </span>
          }
        />
        <Stat
          label={daysLeft != null && daysLeft < 0 ? "Days over" : "Days left of 90"}
          value={
            daysLeft == null ? (
              <span className="text-gray-300">—</span>
            ) : (
              <span className={daysLeft < 0 ? "text-rose-600" : daysLeft <= 14 ? "text-amber-600" : ""}>
                {Math.abs(daysLeft)}
              </span>
            )
          }
        />
      </dl>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-runfree-indigo/50 px-3 py-2.5">
      <dd className="font-display text-base font-extrabold leading-none text-runfree-ink">{value}</dd>
      <dt className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </dt>
    </div>
  );
}

/**
 * One row of the Action Step List.
 *
 * A stacked card rather than a `<table>`: five columns at 390px would push
 * "Accountable" — the column that makes the row mean anything — off the right
 * edge.
 */
function StepRow({
  step: s,
  n,
  members,
  accessToken,
  canManage,
  today,
  onChanged,
}: {
  step: InitiativeStep;
  n: number;
  members: ProjectMember[];
  accessToken: string;
  canManage: boolean;
  today: string;
  onChanged: () => Promise<void>;
}) {
  const patch = async (p: Parameters<typeof updateStep>[2]) => {
    await updateStep(accessToken, s.id, p);
    await onChanged();
  };

  const overdue =
    s.status !== "green" && isDateish(s.by_when) && (s.by_when as string) <= today;
  const assignee = members.find((m) => m.profileId === s.assignee_profile_id);

  return (
    <li
      className={`rounded-xl bg-white px-3 py-2.5 ring-1 ${
        overdue ? "ring-rose-200" : "ring-gray-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-1 w-4 shrink-0 text-right text-xs tabular-nums text-gray-300">{n}</span>
        <div className="min-w-0 flex-1">
          <Cell
            value={s.description}
            onSave={(v) => v && void patch({ description: v })}
            disabled={!canManage}
            required
            wrap
            ariaLabel="Action step"
            className={`!px-0 font-medium !text-runfree-ink ${s.status === "green" ? "!text-gray-400 line-through decoration-gray-300" : ""}`}
          />
          <div className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
            <MiniField label="By">
              <Cell
                value={s.by_when}
                onSave={(v) => void patch({ by_when: v })}
                disabled={!canManage}
                ariaLabel="By when"
                placeholder="Date or cadence"
                className={`!text-xs ${overdue ? "!text-rose-600" : ""}`}
                display={(v) => (isDateish(v) ? prettyDate(v) : v)}
              />
            </MiniField>
            <MiniField label="Accountable">
              <Cell
                value={s.accountable}
                onSave={(v) => void patch({ accountable: v })}
                disabled={!canManage}
                ariaLabel="Accountable"
                placeholder="Who"
                className="!text-xs"
              />
            </MiniField>
            <MiniField label="Cost">
              <Cell
                value={s.cost}
                onSave={(v) => void patch({ cost: v })}
                disabled={!canManage}
                ariaLabel="Cost"
                placeholder="$"
                className="!text-xs"
              />
            </MiniField>
            <MiniField label="Assigned">
              {canManage ? (
                <select
                  value={s.assignee_profile_id ?? ""}
                  onChange={(e) => void patch({ assignee_profile_id: e.target.value || null })}
                  className="w-full min-w-0 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs text-runfree-ink outline-none transition hover:border-gray-200 focus:border-runfree-magenta focus:bg-white"
                >
                  <option value="">Nobody</option>
                  {members.map((m) => (
                    <option key={m.profileId} value={m.profileId}>
                      {m.fullName || m.email}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="block truncate text-xs text-gray-600">
                  {assignee ? assignee.fullName || assignee.email : <span className="text-gray-300">—</span>}
                </span>
              )}
            </MiniField>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
          <RagPicker value={s.status} onChange={(v) => void patch({ status: v })} disabled={!canManage} />
          {canManage && (
            <button
              onClick={async () => {
                if (!confirm(`Remove “${s.description}”?`)) return;
                await deleteStep(accessToken, s.id);
                await onChanged();
              }}
              className="text-[10px] font-semibold text-gray-500 transition hover:text-rose-600"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
