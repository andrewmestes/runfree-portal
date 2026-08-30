"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import RichText, { RichTextView } from "./RichText";
import { richTextIsEmpty } from "@/lib/rich-text";
import {
  DASHBOARD_STARTER,
  PLAN_FIELDS,
  RAG_DOT,
  RAG_LABEL,
  RAG_RING,
  createInitiative,
  createMetric,
  createStep,
  deleteInitiative,
  deleteMetric,
  deleteStep,
  getExecutionData,
  nextRenewalStop,
  renewalCycle,
  updateInitiative,
  updateMetric,
  updateStep,
  type ExecutionData,
  type Initiative,
  type InitiativeStep,
  type RagStatus,
  type ScoreboardGroup,
  type ScoreboardMetric,
} from "@/lib/execution";

/**
 * Execution — the Horizon Storyline once the engagement is over.
 *
 * This is the one panel that is not about the six months. Andrew: "I would
 * love to have an ongoing section that is built out from the God Dreams
 * (horizon storyline) perspective that helps integrate meeting activity for a
 * church as they pursue their initiatives and goals ... even an ability to
 * have a customizable scoreboard of somekind would be amazing."
 *
 * Four blocks, in the order a team uses them:
 *
 *   This Quarter   — what is at risk and what is due, assembled from the rest.
 *   Foreground Initiatives — the Initiative Plan and its Action Step List.
 *   Ministry Dashboard     — the scoreboard, whose rows the church names.
 *   Renewal Cycle          — the twelve dates off Will's cadence handout.
 *
 * Deliberately absent, per Andrew — "we want to stay away from too much 4dx
 * overlap other than keeping the foundational principles in play": no WIG, no
 * lead/lag split, no commitment counter, no percent-complete. Where 4DX would
 * put a number, Will's sheets put a traffic light and a name, so this does
 * too. The foundational principles survive in the shape — few initiatives, a
 * visible scoreboard, a person against every step, a fixed rhythm.
 *
 * It loads its own data when opened rather than riding on `getProjectDetail`,
 * for the same reason Will's Books does: most visits to a project are not
 * this panel, and three more queries on every page load buys nothing.
 */
export default function ExecutionPanel({
  projectId,
  accessToken,
  canEdit,
  canManageSteps,
  churchName,
}: {
  projectId: string;
  accessToken: string;
  /** editor or admin: owns the plan and the scoreboard. */
  canEdit: boolean;
  /** may_manage_tasks: owns the action step rows and their status. */
  canManageSteps: boolean;
  churchName: string;
}) {
  const [data, setData] = useState<ExecutionData | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error) {
    return <p className="py-10 text-center text-sm text-gray-500">{error}</p>;
  }
  if (!data) {
    return <p className="py-10 text-center text-sm text-gray-400">Loading…</p>;
  }

  const empty =
    data.initiatives.length === 0 && data.metrics.length === 0;

  return (
    <section className="pb-16">
      <header className="text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-runfree-magentaDeep">
          Making it happen
        </p>
        <h2 className="mt-1.5 font-display text-2xl font-extrabold tracking-tight text-runfree-ink sm:text-3xl">
          Execution
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-gray-500">
          The Horizon Storyline, ninety days at a time. Foreground initiatives, the
          numbers you watch, and the rhythm that keeps them both in front of the
          team.
        </p>
      </header>

      {empty && !canEdit ? (
        <p className="mt-10 text-center text-sm text-gray-500">
          Nothing here yet. Your team will fill this in once the Horizon Storyline
          is set.
        </p>
      ) : (
        <>
          <ThisQuarter data={data} />
          <Initiatives
            data={data}
            projectId={projectId}
            accessToken={accessToken}
            canEdit={canEdit}
            canManageSteps={canManageSteps}
            onChanged={load}
          />
          <Scoreboard
            data={data}
            projectId={projectId}
            accessToken={accessToken}
            canEdit={canEdit}
            churchName={churchName}
            onChanged={load}
          />
          <RenewalCycle data={data} canEdit={canEdit} />
        </>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Small shared pieces                                                        */
/* -------------------------------------------------------------------------- */

/** Local calendar date, not UTC — a US evening is tomorrow in UTC. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function prettyDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * The sheet's three radio circles.
 *
 * Not a single button that cycles: the printed Action Step List shows all
 * three states at once with one filled, and a cycling control hides the two
 * you are not on — which matters in a room where someone is reading the screen
 * over a shoulder and needs to see that "green" was a choice among three.
 */
function RagPicker({
  value,
  onChange,
  disabled,
}: {
  value: RagStatus;
  onChange: (s: RagStatus) => void;
  disabled?: boolean;
}) {
  const options: RagStatus[] = ["red", "amber", "green"];
  return (
    <span className="inline-flex items-center" role="radiogroup" aria-label="Today's status">
      {options.map((s) => {
        const on = value === s;
        return (
          /* The dot stays 16px, but the thing you tap is 28. A 16px target is
             about a third of the minimum a thumb can hit reliably, and this
             gets used standing up in a room, not sitting at a desk. */
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={RAG_LABEL[s]}
            title={RAG_LABEL[s]}
            disabled={disabled}
            onClick={() => !disabled && onChange(s)}
            className={`grid h-7 w-7 place-items-center rounded-full ${
              disabled ? "cursor-default" : "cursor-pointer"
            }`}
          >
            <span
              className={`h-4 w-4 rounded-full ring-1 transition ${
                on ? `${RAG_DOT[s]} ring-transparent` : "bg-gray-100 ring-gray-300"
              }`}
            />
          </button>
        );
      })}
    </span>
  );
}

/**
 * A text field that saves when you leave it, and only if it changed.
 *
 * Save-on-blur rather than debounced-as-you-type: this gets edited live in a
 * review meeting, where a half-typed value flushing to the database and then
 * being corrected produces two writes and a visible flicker on everyone
 * else's screen.
 */
function Cell({
  value,
  onSave,
  placeholder,
  disabled,
  className = "",
  align = "left",
  display,
}: {
  value: string | null;
  onSave: (next: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  align?: "left" | "right";
  /**
   * How to render the value when it is read-only. The editable field always
   * shows the raw stored string — you edit what is there — but a viewer
   * should see "Aug 18, 2026" rather than "2026-08-18".
   */
  display?: (v: string) => string;
}) {
  const [draft, setDraft] = useState(value ?? "");
  // Re-seed when the row's value changes underneath (a reload, another editor).
  useEffect(() => setDraft(value ?? ""), [value]);

  if (disabled) {
    return (
      <span className={`block truncate text-sm text-gray-600 ${align === "right" ? "text-right" : ""} ${className}`}>
        {value ? (display ? display(value) : value) : <span className="text-gray-300">—</span>}
      </span>
    );
  }

  return (
    <input
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.trim() === "" ? null : draft.trim();
        if ((value ?? null) !== next) onSave(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value ?? "");
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={`w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-runfree-ink outline-none transition placeholder:text-gray-300 hover:border-gray-200 focus:border-runfree-magenta focus:bg-white ${
        align === "right" ? "text-right" : ""
      } ${className}`}
    />
  );
}

function BlockHeading({ eyebrow, title, note }: { eyebrow: string; title: string; note?: string }) {
  return (
    <header className="mb-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-runfree-magentaDeep">
        {eyebrow}
      </p>
      <h3 className="mt-1 font-display text-xl font-extrabold tracking-tight text-runfree-ink">
        {title}
      </h3>
      {note && <p className="mt-1 text-sm leading-relaxed text-gray-500">{note}</p>}
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* This Quarter                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The digest, assembled rather than written.
 *
 * Andrew: "this is actually where I think a weekly email could be beneficial
 * if a team wants to use and customize that moving forward. this would be
 * customized per project."
 *
 * The send is not built — that is blocked on `RESEND_API_KEY`, and shipping a
 * Send button that silently does nothing is worse than not shipping one. What
 * IS built is the thing the email would contain, on the page, with a copy
 * button: everything off track, everything due, and the next renewal date.
 * When Resend is configured this block is the payload; until then it is
 * something a leader can paste into their own Monday email.
 */
function ThisQuarter({ data }: { data: ExecutionData }) {
  const today = todayIso();
  const [copied, setCopied] = useState(false);

  const live = data.initiatives.filter((i) => !i.is_complete);
  const attention = live.filter((i) => i.status !== "green");
  const stepsOf = (id: string) => data.steps.filter((s) => s.initiative_id === id);

  // "Due" means a By that parses as a date and has arrived. The column also
  // holds "Monthly Periodic", which is a cadence rather than a deadline and
  // must not be reported as overdue every single week.
  const due = data.steps.filter((s) => {
    if (s.status === "green") return false;
    return /^\d{4}-\d{2}-\d{2}$/.test(s.by_when ?? "") && (s.by_when as string) <= today;
  });

  const anchor = live.map((i) => i.start_date).filter(Boolean).sort()[0] ?? null;
  const next = anchor ? nextRenewalStop(renewalCycle(anchor), today) : null;

  if (live.length === 0) return null;

  const lines: string[] = [];
  lines.push(`Where we are — ${prettyDate(today)}`, "");
  for (const i of live) {
    lines.push(`${i.name} — ${RAG_LABEL[i.status]}${i.leader ? ` (${i.leader})` : ""}`);
    for (const s of stepsOf(i.id).filter((s) => s.status !== "green")) {
      lines.push(
        `   • ${s.description}${s.accountable ? ` — ${s.accountable}` : ""}${
          s.by_when ? ` — by ${/^\d{4}-\d{2}-\d{2}$/.test(s.by_when) ? prettyDate(s.by_when) : s.by_when}` : ""
        }`
      );
    }
    lines.push("");
  }
  if (next) lines.push(`Next review: ${prettyDate(next.on)} — ${next.length}, ${next.marker} in.`);
  const digest = lines.join("\n").trim();

  return (
    <section className="mt-10">
      <div className="rounded-2xl bg-runfree-navyDeep px-5 py-5 text-white sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">
              Where we are
            </p>
            <h3 className="mt-1 font-display text-xl font-extrabold tracking-tight">
              {live.length} initiative{live.length === 1 ? "" : "s"} in the foreground
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
          <Stat n={attention.length} label="Need attention" tone={attention.length > 0 ? "amber" : undefined} />
          <Stat n={due.length} label="Past due" tone={due.length > 0 ? "rose" : undefined} />
          <div className="rounded-xl bg-white/5 px-3 py-3">
            <dd className="font-display text-sm font-extrabold leading-tight">
              {next ? prettyDate(next.on) : "—"}
            </dd>
            <dt className="mt-1 text-[11px] uppercase tracking-wide text-white/50">Next review</dt>
          </div>
        </dl>

        {(attention.length > 0 || due.length > 0) && (
          <ul className="mt-4 space-y-1.5 border-t border-white/10 pt-4">
            {attention.map((i) => (
              <li key={i.id} className="flex items-start gap-2 text-sm text-white/80">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${RAG_DOT[i.status]}`} />
                <span>
                  <span className="font-semibold text-white">{i.name}</span> — {RAG_LABEL[i.status].toLowerCase()}
                  {i.leader ? ` · ${i.leader}` : ""}
                </span>
              </li>
            ))}
            {due.map((s) => (
              <li key={s.id} className="flex items-start gap-2 text-sm text-white/80">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose-400" />
                <span>
                  {s.description}
                  {s.accountable ? ` · ${s.accountable}` : ""} — due {prettyDate(s.by_when)}
                </span>
              </li>
            ))}
          </ul>
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

/* -------------------------------------------------------------------------- */
/* Foreground Initiatives                                                     */
/* -------------------------------------------------------------------------- */

function Initiatives({
  data,
  projectId,
  accessToken,
  canEdit,
  canManageSteps,
  onChanged,
}: {
  data: ExecutionData;
  projectId: string;
  accessToken: string;
  canEdit: boolean;
  canManageSteps: boolean;
  onChanged: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [showDone, setShowDone] = useState(false);

  const live = data.initiatives.filter((i) => !i.is_complete);
  const done = data.initiatives.filter((i) => i.is_complete);

  return (
    <section className="mt-12">
      <BlockHeading
        eyebrow="The next 90 days"
        title="Foreground Initiatives"
        note="Each one is a plan with an owner, a set of action steps, and a light that says where it stands today."
      />

      {live.length === 0 && !adding && (
        <p className="rounded-2xl bg-gray-50 px-5 py-8 text-center text-sm text-gray-500">
          {canEdit
            ? "No initiatives yet. Add the first one your team committed to."
            : "No initiatives in the foreground right now."}
        </p>
      )}

      <div className="space-y-4">
        {live.map((i) => (
          <InitiativeCard
            key={i.id}
            initiative={i}
            steps={data.steps.filter((s) => s.initiative_id === i.id)}
            projectId={projectId}
            accessToken={accessToken}
            canEdit={canEdit}
            canManageSteps={canManageSteps}
            onChanged={onChanged}
          />
        ))}
      </div>

      {canEdit && (
        <div className="mt-4">
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
              className="flex flex-wrap items-center gap-2"
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
            <button
              onClick={() => setAdding(true)}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-runfree-magentaDeep transition hover:bg-runfree-pink"
            >
              + Add an initiative
            </button>
          )}
        </div>
      )}

      {done.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowDone((v) => !v)}
            className="text-xs font-semibold text-gray-400 transition hover:text-runfree-magentaDeep"
          >
            {showDone ? "Hide" : "Show"} {done.length} finished initiative
            {done.length === 1 ? "" : "s"}
          </button>
          {showDone && (
            <div className="mt-4 space-y-4">
              {done.map((i) => (
                <InitiativeCard
                  key={i.id}
                  initiative={i}
                  steps={data.steps.filter((s) => s.initiative_id === i.id)}
                  projectId={projectId}
                  accessToken={accessToken}
                  canEdit={canEdit}
                  canManageSteps={canManageSteps}
                  onChanged={onChanged}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function InitiativeCard({
  initiative: i,
  steps,
  projectId,
  accessToken,
  canEdit,
  canManageSteps,
  onChanged,
}: {
  initiative: Initiative;
  steps: InitiativeStep[];
  projectId: string;
  accessToken: string;
  canEdit: boolean;
  canManageSteps: boolean;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<(typeof PLAN_FIELDS)[number]["key"] | null>(null);
  const [draft, setDraft] = useState("");
  const [newStep, setNewStep] = useState("");

  const patch = async (p: Parameters<typeof updateInitiative>[2]) => {
    await updateInitiative(accessToken, i.id, p);
    await onChanged();
  };

  const openSteps = steps.filter((s) => s.status !== "green").length;

  return (
    <article
      className={`overflow-hidden rounded-2xl ring-1 transition ${
        i.is_complete ? "bg-gray-50 ring-gray-200" : "bg-white ring-gray-200"
      }`}
    >
      {/* The head row. Everything a leader needs without opening anything. */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3 px-4 py-4 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {canEdit ? (
              <Cell
                value={i.name}
                onSave={(v) => v && patch({ name: v })}
                className="!px-0 font-display !text-base font-extrabold tracking-tight !text-runfree-ink"
              />
            ) : (
              <h4 className="font-display text-base font-extrabold tracking-tight text-runfree-ink">
                {i.name}
              </h4>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            {/* The status word, not just the colour. On a phone the three
                dots are the only indicator otherwise, and a filled circle
                with no label is a colour, not a status. */}
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${RAG_RING[i.status]}`}
            >
              {RAG_LABEL[i.status]}
            </span>
            {i.leader && <span>Led by {i.leader}</span>}
            {i.team && <span>{i.team}</span>}
            {i.next_review_on && <span>Next review {prettyDate(i.next_review_on)}</span>}
            <span>
              {openSteps} of {steps.length} step{steps.length === 1 ? "" : "s"} open
            </span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <RagPicker
            value={i.status}
            onChange={(s) => void patch({ status: s })}
            disabled={!canEdit}
          />
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-runfree-ink"
            title={open ? "Collapse" : "Open the plan"}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-200 bg-gray-50/60 px-4 py-5 sm:px-5">
          {/* Header fields, as they sit on the Action Step List sheet. */}
          <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Leader">
              <Cell value={i.leader} onSave={(v) => void patch({ leader: v })} disabled={!canEdit} placeholder="Who owns this" />
            </Field>
            <Field label="Team">
              <Cell value={i.team} onSave={(v) => void patch({ team: v })} disabled={!canEdit} placeholder="Who is on it" />
            </Field>
            <Field label="Start date">
              <DateCell value={i.start_date} onSave={(v) => void patch({ start_date: v })} disabled={!canEdit} />
            </Field>
            <Field label="Next review">
              <DateCell value={i.next_review_on} onSave={(v) => void patch({ next_review_on: v })} disabled={!canEdit} />
            </Field>
          </div>

          {/* The six blocks of the plan template. */}
          <div className="mt-6 space-y-4">
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
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            await patch({ [f.key]: richTextIsEmpty(draft) ? null : draft });
                            setEditingPlan(null);
                          }}
                          className="rounded-lg bg-runfree-grad px-3.5 py-2 text-xs font-semibold text-white transition hover:opacity-90"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingPlan(null)}
                          className="px-2 py-2 text-xs text-gray-500 transition hover:text-runfree-ink"
                        >
                          Cancel
                        </button>
                      </div>
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
                      className="mt-1.5 text-[11px] font-semibold text-gray-400 transition hover:text-runfree-magentaDeep"
                    >
                      {blank ? "Write it" : "Edit"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* The Action Step List. */}
          <div className="mt-7">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-navy">
              Action Steps
            </p>

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
                    accessToken={accessToken}
                    canManage={canManageSteps}
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
          </div>

          {canEdit && (
            <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-gray-200 pt-4">
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
                className="text-xs font-semibold text-gray-400 transition hover:text-rose-600"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <span className="mt-0.5 block">{children}</span>
    </label>
  );
}

function DateCell({
  value,
  onSave,
  disabled,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className="block px-1.5 py-1 text-sm text-gray-600">
        {value ? prettyDate(value) : <span className="text-gray-300">—</span>}
      </span>
    );
  }
  return (
    <input
      type="date"
      value={value ?? ""}
      onChange={(e) => onSave(e.target.value || null)}
      className="w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-runfree-ink outline-none transition hover:border-gray-200 focus:border-runfree-magenta focus:bg-white"
    />
  );
}

/**
 * One row of the Action Step List.
 *
 * A table on desktop and a stacked card on a phone. Not a `<table>` with
 * horizontal scroll: five columns at 390px would put "Accountable" — the
 * column that makes the row mean anything — off the right edge, and the
 * mobile audit exists precisely to stop that shipping.
 */
function StepRow({
  step: s,
  n,
  accessToken,
  canManage,
  onChanged,
}: {
  step: InitiativeStep;
  n: number;
  accessToken: string;
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const patch = async (p: Parameters<typeof updateStep>[2]) => {
    await updateStep(accessToken, s.id, p);
    await onChanged();
  };

  return (
    <li className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-gray-200">
      <div className="flex items-start gap-3">
        <span className="mt-1 w-4 shrink-0 text-right text-xs tabular-nums text-gray-300">{n}</span>
        <div className="min-w-0 flex-1">
          <Cell
            value={s.description}
            onSave={(v) => v && void patch({ description: v })}
            disabled={!canManage}
            className="!px-0 font-medium !text-runfree-ink"
          />
          <div className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-3">
            <MiniField label="By">
              <Cell
                value={s.by_when}
                onSave={(v) => void patch({ by_when: v })}
                disabled={!canManage}
                placeholder="Date or cadence"
                className="!text-xs"
                // A real date reads as a date; "Monthly Periodic" passes
                // through untouched, which is why this column is text.
                display={(v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? prettyDate(v) : v)}
              />
            </MiniField>
            <MiniField label="Accountable">
              <Cell
                value={s.accountable}
                onSave={(v) => void patch({ accountable: v })}
                disabled={!canManage}
                placeholder="Who"
                className="!text-xs"
              />
            </MiniField>
            <MiniField label="Cost">
              <Cell
                value={s.cost}
                onSave={(v) => void patch({ cost: v })}
                disabled={!canManage}
                placeholder="$"
                className="!text-xs"
              />
            </MiniField>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
          <RagPicker value={s.status} onChange={(v) => void patch({ status: v })} disabled={!canManage} />
          {canManage && (
            <button
              onClick={async () => {
                await deleteStep(accessToken, s.id);
                await onChanged();
              }}
              className="text-[10px] font-semibold text-gray-300 transition hover:text-rose-600"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Ministry Dashboard                                                          */
/* -------------------------------------------------------------------------- */

const GROUP_META: Record<ScoreboardGroup, { title: string; note: string }> = {
  strategy_input: {
    title: "Strategy (Input)",
    note: "What the church is doing — the activity behind the numbers.",
  },
  measure_output: {
    title: "Measures (Output)",
    note: "What the Vision Frame said you would watch. The result, not the effort.",
  },
};

function Scoreboard({
  data,
  projectId,
  accessToken,
  canEdit,
  churchName,
  onChanged,
}: {
  data: ExecutionData;
  projectId: string;
  accessToken: string;
  canEdit: boolean;
  churchName: string;
  onChanged: () => Promise<void>;
}) {
  const groups: ScoreboardGroup[] = ["strategy_input", "measure_output"];
  const [seeding, setSeeding] = useState(false);

  if (data.metrics.length === 0 && !canEdit) return null;

  return (
    <section className="mt-12">
      <BlockHeading
        eyebrow="The scoreboard"
        title="Ministry Dashboard"
        note={
          canEdit
            ? `The rows are ${churchName}'s own — add what you actually watch, and delete what you don't.`
            : `What ${churchName} watches, against last year and where you're headed.`
        }
      />

      {data.metrics.length === 0 ? (
        <div className="rounded-2xl bg-gray-50 px-5 py-8 text-center">
          <p className="text-sm text-gray-500">
            Nothing on the scoreboard yet.
          </p>
          <button
            disabled={seeding}
            onClick={async () => {
              setSeeding(true);
              try {
                // Sequential, not Promise.all: `position` is what orders the
                // sheet, and nine concurrent inserts land in whatever order
                // the connection pool decides.
                for (let n = 0; n < DASHBOARD_STARTER.length; n++) {
                  const row = DASHBOARD_STARTER[n];
                  await createMetric(accessToken, projectId, row.grouping, row.label, n);
                }
                await onChanged();
              } finally {
                setSeeding(false);
              }
            }}
            className="mt-3 rounded-lg bg-runfree-grad px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {seeding ? "Adding…" : "Start from Will's dashboard"}
          </button>
          <p className="mt-2 text-[11px] text-gray-400">
            Adds the nine rows off the printed sheet. Rename or remove any of them.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => {
            const rows = data.metrics.filter((m) => m.grouping === g);
            if (rows.length === 0 && !canEdit) return null;
            return (
              <MetricGroup
                key={g}
                grouping={g}
                rows={rows}
                projectId={projectId}
                accessToken={accessToken}
                canEdit={canEdit}
                nextPosition={data.metrics.length}
                onChanged={onChanged}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function MetricGroup({
  grouping,
  rows,
  projectId,
  accessToken,
  canEdit,
  nextPosition,
  onChanged,
}: {
  grouping: ScoreboardGroup;
  rows: ScoreboardMetric[];
  projectId: string;
  accessToken: string;
  canEdit: boolean;
  nextPosition: number;
  onChanged: () => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const meta = GROUP_META[grouping];

  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-gray-200">
      <div className="bg-runfree-indigo/60 px-4 py-3 sm:px-5">
        <p className="font-display text-sm font-extrabold tracking-tight text-runfree-ink">
          {meta.title}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">{meta.note}</p>
      </div>

      {/* Column headings, desktop only — on a phone each cell carries its own
          label instead, because a four-column header over 390px leaves each
          heading about nine characters wide. */}
      <div className="hidden border-b border-gray-200 bg-white px-4 py-2 sm:grid sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_6.5rem] sm:gap-x-2 sm:px-5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400" />
        <span className="text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400">Prior yr.</span>
        <span className="text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400">Now</span>
        <span className="text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400">Next yr.</span>
        <span className="text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400">Status</span>
      </div>

      <ul className="divide-y divide-gray-100 bg-white">
        {rows.map((m) => (
          <MetricRow
            key={m.id}
            metric={m}
            accessToken={accessToken}
            canEdit={canEdit}
            onChanged={onChanged}
          />
        ))}
      </ul>

      {canEdit && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!label.trim()) return;
            await createMetric(accessToken, projectId, grouping, label.trim(), nextPosition);
            setLabel("");
            await onChanged();
          }}
          className="flex flex-wrap items-center gap-2 border-t border-gray-200 bg-gray-50 px-4 py-2.5 sm:px-5"
        >
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={grouping === "strategy_input" ? "Add a ministry — Groups, Serving, Baptisms…" : "Add a measure"}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
          />
          <button
            type="submit"
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-runfree-magentaDeep ring-1 ring-gray-300 transition hover:bg-runfree-pink"
          >
            Add
          </button>
        </form>
      )}
    </div>
  );
}

const TREND_MARK: Record<"up" | "flat" | "down", string> = { up: "↑", flat: "→", down: "↓" };

function MetricRow({
  metric: m,
  accessToken,
  canEdit,
  onChanged,
}: {
  metric: ScoreboardMetric;
  accessToken: string;
  canEdit: boolean;
  onChanged: () => Promise<void>;
}) {
  const patch = async (p: Parameters<typeof updateMetric>[2]) => {
    await updateMetric(accessToken, m.id, p);
    await onChanged();
  };

  const cycleTrend = () => {
    const order: (ScoreboardMetric["trend"])[] = [null, "up", "flat", "down"];
    void patch({ trend: order[(order.indexOf(m.trend) + 1) % order.length] });
  };

  return (
    /* Three columns on a phone, five on a desktop.
     *
     * This was one five-column grid at every width, and at 390px it put
     * "1,180" through a 55px column as "1,18", hid the Now value entirely,
     * and printed "NEX" underneath the trend arrow. The label and the
     * controls each take the full width on mobile and the three numbers get
     * a row of their own, which is the only arrangement where all three are
     * legible at that size. */
    <li className="grid grid-cols-3 items-center gap-x-2 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_6.5rem] sm:gap-y-0 sm:px-5 sm:py-2">
      <div className="col-span-3 min-w-0 sm:col-span-1">
        <Cell
          value={m.label}
          onSave={(v) => v && void patch({ label: v })}
          disabled={!canEdit}
          className="!px-0 font-semibold !text-runfree-ink"
        />
      </div>
      <LabelledValue label="Prior">
        <Cell value={m.prior_year} onSave={(v) => void patch({ prior_year: v })} disabled={!canEdit} align="right" className="tabular-nums" placeholder="—" />
      </LabelledValue>
      <LabelledValue label="Now">
        <Cell value={m.current} onSave={(v) => void patch({ current: v })} disabled={!canEdit} align="right" className="font-semibold tabular-nums" placeholder="—" />
      </LabelledValue>
      <LabelledValue label="Next">
        <Cell value={m.next_year} onSave={(v) => void patch({ next_year: v })} disabled={!canEdit} align="right" className="tabular-nums" placeholder="—" />
      </LabelledValue>
      <div className="col-span-3 flex items-center justify-end gap-1 sm:col-span-1">
        <button
          type="button"
          onClick={canEdit ? cycleTrend : undefined}
          disabled={!canEdit}
          title={m.trend ? `Trending ${m.trend}` : "No trend set"}
          className={`w-4 text-center text-sm text-gray-500 ${canEdit ? "cursor-pointer hover:text-runfree-ink" : "cursor-default"}`}
        >
          {m.trend ? TREND_MARK[m.trend] : <span className="text-gray-300">·</span>}
        </button>
        <RagPicker
          value={m.status ?? "amber"}
          onChange={(v) => void patch({ status: v })}
          disabled={!canEdit}
        />
        {canEdit && (
          <button
            onClick={async () => {
              await deleteMetric(accessToken, m.id);
              await onChanged();
            }}
            title="Remove this row"
            className="text-gray-300 transition hover:text-rose-600"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * On a phone each number carries its own caption, stacked above it; from `sm`
 * the column heading does that job and the caption disappears.
 *
 * Stacked rather than inline: side by side, the caption ate half of a 110px
 * column and the number it labelled got truncated, which is how "1,180"
 * became "1,18".
 */
function LabelledValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col items-stretch">
      <span className="text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400 sm:hidden">
        {label}
      </span>
      <span className="min-w-0">{children}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Renewal Cycle                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Will's Horizon Storyline Renewal Cycle, as real dates.
 *
 * The handout is a diagram of intervals — 90 days, 180, 270, one year, three
 * times over — and a diagram is something a church reads once and files. Given
 * a start date it becomes twelve entries in a calendar, which is the thing
 * that actually changes behaviour.
 *
 * Anchored on the earliest live initiative's start date rather than a column
 * of its own: that date is already the answer to "when did we start running
 * this plan", and a second field asking the same question is a second field to
 * get wrong.
 */
function RenewalCycle({ data, canEdit }: { data: ExecutionData; canEdit: boolean }) {
  const today = todayIso();
  const anchor = useMemo(
    () =>
      data.initiatives
        .filter((i) => !i.is_complete)
        .map((i) => i.start_date)
        .filter((d): d is string => !!d)
        .sort()[0] ?? null,
    [data.initiatives]
  );

  if (!anchor) {
    // Nothing to count from. Only say so to someone who can fix it — the
    // instruction is useless to a viewer, and 052 is the migration that
    // exists because coach-facing copy was being shown to churches.
    if (data.initiatives.length === 0 || !canEdit) return null;
    return (
      <section className="mt-12">
        <BlockHeading
          eyebrow="The rhythm"
          title="Renewal Cycle"
          note="Set a start date on an initiative and the three-year cadence fills in here."
        />
      </section>
    );
  }

  const stops = renewalCycle(anchor);
  const next = nextRenewalStop(stops, today);

  return (
    <section className="mt-12">
      <BlockHeading
        eyebrow="The rhythm"
        title="Renewal Cycle"
        note="In addition to your normal weekly and monthly meetings — this is the cadence that keeps the Horizon Storyline alive."
      />

      <ol className="overflow-hidden rounded-2xl ring-1 ring-gray-200">
        {stops.map((s, n) => {
          const past = s.on < today;
          const isNext = next?.on === s.on;
          const yearBreak = n === 0 || stops[n - 1].year !== s.year;
          return (
            <Fragment key={s.on + s.marker}>
              {/* A labelled row rather than a heavier rule. The border version
                  of this depended on `border-t-2` beating `border-t` in the
                  generated stylesheet, which is source order rather than
                  specificity — and it rendered as no break at all. A year
                  heading is both unambiguous and worth reading. */}
              {yearBreak && (
                <li className="border-t border-gray-200 bg-gray-50 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 first:border-t-0 sm:px-5">
                  Year {s.year}
                </li>
              )}
            <li
              className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-gray-200 px-4 py-3 sm:px-5 ${
                isNext ? "bg-runfree-pink/60" : past ? "bg-gray-50 text-gray-400" : "bg-white"
              }`}
            >
              <span
                className={`w-24 shrink-0 text-sm font-semibold tabular-nums ${
                  past ? "text-gray-400" : "text-runfree-ink"
                }`}
              >
                {prettyDate(s.on)}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  isNext
                    ? "bg-runfree-magentaDeep text-white"
                    : past
                      ? "bg-gray-200 text-gray-500"
                      : "bg-runfree-indigo text-runfree-navy"
                }`}
              >
                {s.length}
              </span>
              {/* Last on a phone, third on a desktop. Left in flow it was a
                  ~60px column with "Review the foreground." broken across
                  five lines; given the full width it is one readable
                  sentence under the date it belongs to. */}
              <span
                className={`order-last w-full min-w-0 text-sm sm:order-none sm:w-auto sm:flex-1 ${
                  past ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {s.purpose}
              </span>
              <span className="ml-auto shrink-0 text-[11px] uppercase tracking-wide text-gray-400">
                {s.marker}
              </span>
            </li>
            </Fragment>
          );
        })}
      </ol>

      <p className="mt-2.5 text-[11px] text-gray-400">
        Counted from {prettyDate(anchor)}, the earliest start date on a live initiative.
      </p>
    </section>
  );
}
