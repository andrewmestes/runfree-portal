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
  createStep,
  deleteInitiative,
  deleteStep,
  updateInitiative,
  updateStep,
  type ExecutionData,
  type Initiative,
  type InitiativeStep,
} from "@/lib/execution";
import { Cell, Chip, DateCell, EditorActions, Field, MiniField, RagPicker, isDateish, prettyDate, todayIso } from "./ui";

/**
 * One Foreground Initiative, opened underneath the board.
 *
 * Andrew: "it could highlight the initiative below where all of the Action
 * Steps get displayed along with a tracking sheet 'scoreboard.' ... implement
 * all of the elements like a significant description of the initiative, the
 * name of it, the name of who owns it, the stoplight for each action step,
 * potential cost, etc."
 *
 * So this is the Foreground Initiative Plan and the Action Step List on one
 * screen, with a strip across the top that answers the four questions a
 * fifteen-minute standup actually asks: what is red, what is overdue, what
 * does it cost, and how long is left.
 *
 * The strip is the "some key elements they might use" from EOS/4DX that
 * Andrew left the door open to — but it is tied to the horizon rather than
 * bolted on: every number in it is derived from this initiative's own steps
 * and its own 90-day window, and there is still no percent-complete.
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
  const [editingPlan, setEditingPlan] = useState<(typeof PLAN_FIELDS)[number]["key"] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [newStep, setNewStep] = useState("");

  const steps = data.steps.filter((s) => s.initiative_id === i.id);
  const kind = initiativeKind(i.kind);
  const today = todayIso();

  const patch = async (p: Parameters<typeof updateInitiative>[2]) => {
    await updateInitiative(accessToken, i.id, p);
    await onChanged();
  };

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------- header */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        {/* No name here — the detail shell above already carries it, and
            renames in place. Two headings for one initiative is exactly the
            redundancy Andrew flagged between the board and this panel. */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${RAG_RING[i.status]}`}
            >
              {RAG_LABEL[i.status]}
            </span>
            <Chip tone="navy">{kind.label}</Chip>
            <span className="text-[11px] text-gray-500">Reviewed: {kind.review.toLowerCase()}</span>
          </div>
        </div>
        <RagPicker value={i.status} onChange={(s) => void patch({ status: s })} disabled={!canEdit} />
      </div>

      <Scoreboard initiative={i} steps={steps} today={today} />

      {/* ------------------------------------------------- header fields */}
      <div className="grid gap-x-5 gap-y-3 rounded-xl bg-gray-50 px-4 py-3.5 sm:grid-cols-2 lg:grid-cols-4">
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
        {canEdit && (
          <label className="block min-w-0 sm:col-span-2">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Type
            </span>
            <select
              value={i.kind}
              onChange={(e) => void patch({ kind: e.target.value as Initiative["kind"] })}
              className="mt-0.5 w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-runfree-ink outline-none focus:border-runfree-magenta"
            >
              {INITIATIVE_KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label} — {k.steps} step{k.steps === "One" ? "" : "s"}, {k.responsibility.toLowerCase()}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] leading-relaxed text-gray-500">{kind.blurb}</span>
          </label>
        )}
      </div>

      {/* ------------------------------------------------------- the plan */}
      <section>
        <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-navy">
          The initiative — definition, deliverables, plan, timeline, costs
        </h4>
        <div className="mt-2 space-y-3">
          {PLAN_FIELDS.map((f) => {
            const body = i[f.key];
            const isEditing = editingPlan === f.key;
            const blank = richTextIsEmpty(body);
            if (blank && !canEdit) return null;
            return (
              <div key={f.key} className="rounded-xl bg-white px-4 py-3.5 ring-1 ring-gray-200">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-navy">
                  {f.label}
                </p>
                {isEditing ? (
                  <div className="mt-2 space-y-2">
                    <RichText value={draft} onChange={setDraft} minHeight="6rem" placeholder={f.hint} />
                    <EditorActions
                      busy={busy}
                      onSave={async () => {
                        setBusy(true);
                        try {
                          await patch({ [f.key]: richTextIsEmpty(draft) ? null : draft });
                          setEditingPlan(null);
                        } finally {
                          setBusy(false);
                        }
                      }}
                      onCancel={() => setEditingPlan(null)}
                    />
                  </div>
                ) : blank ? (
                  <p className="mt-1 text-xs italic text-gray-400">{f.hint}</p>
                ) : (
                  <div className="mt-1.5">
                    <RichTextView html={body!} className="text-runfree-ink" />
                  </div>
                )}
                {canEdit && !isEditing && (
                  <button
                    onClick={() => {
                      setDraft(body ?? "");
                      setEditingPlan(f.key);
                    }}
                    className="mt-1.5 text-[11px] font-semibold text-gray-500 transition hover:text-runfree-magentaDeep"
                  >
                    {blank ? "Write it" : "Edit"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

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

/**
 * The tracking strip.
 *
 * Four numbers, each derived rather than entered: how the steps sit by
 * colour, how many are past their date, what the plan costs if the costs
 * parse, and how much of the 90 days is left.
 *
 * `daysLeft` counts from `start_date` because the foreground horizon IS
 * ninety days — that is the unit, not an arbitrary deadline someone typed.
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

  let daysLeft: number | null = null;
  if (i.start_date) {
    const [y, mo, d] = i.start_date.split("-").map(Number);
    const start = Date.UTC(y, mo - 1, d);
    const [ty, tmo, td] = today.split("-").map(Number);
    const now = Date.UTC(ty, tmo - 1, td);
    daysLeft = 90 - Math.floor((now - start) / 86_400_000);
  }

  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
        label={daysLeft != null && daysLeft < 0 ? "Days over" : "Days left"}
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
 *
 * `accountable` (free text) and `assignee_profile_id` (a real login) both
 * exist on purpose. The printed sheet has "Jeff & Carolyn" and "Comms" in
 * that column, neither of which is one account; the dropdown is the
 * additional, structured half that lets a step reach somebody.
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
            className="!px-0 font-medium !text-runfree-ink"
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
                // The initiative's Delete and a measure's Remove both ask;
                // this one, 6px under the traffic light, did not.
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
