"use client";

import { useState } from "react";
import {
  createMetric,
  deleteMetric,
  updateMetric,
  type ExecutionData,
  type ScoreboardMetric,
} from "@/lib/execution";
import { BlockHeading, Cell, RagPicker } from "./ui";

/**
 * The Measures Dashboard.
 *
 * Off Will's Church Ministry Dashboard sheet, narrowed the way Andrew asked
 * on 4 Sept 2026: "Let's omit the strategy input for, like, attendance and
 * things like that for now and move more towards the measures output to
 * help encourage that for leaders … fully customizable, obviously, for a
 * church to input either categories like a header as well as the individual
 * measures." So the rows are output measures — the marks of a disciple the
 * Vision Frame named — grouped under headers the church writes itself:
 * Bible reading, evangelism, community involvement.
 *
 * Each row keeps the sheet's Prior Yr. / Now / Next Yr., its light and its
 * trend, and draws the three numbers as a small trajectory when they parse.
 * A strategy-input row a church already had is kept, folded away.
 */
const NONE = "__none__";

export default function MinistryDashboard({
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
  const outputs = data.metrics.filter((m) => m.grouping === "measure_output");
  const legacy = data.metrics.filter((m) => m.grouping === "strategy_input");
  const [showLegacy, setShowLegacy] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);

  // Categories in the order their first row appears; uncategorised rows last.
  const categories: string[] = [];
  for (const m of outputs) {
    const key = m.category?.trim() || NONE;
    if (!categories.includes(key)) categories.push(key);
  }
  if (categories.includes(NONE)) {
    categories.splice(categories.indexOf(NONE), 1);
    categories.push(NONE);
  }

  if (data.metrics.length === 0 && !canEdit) return null;

  return (
    <section className="mt-12">
      <BlockHeading
        eyebrow="The scoreboard"
        title="Measures Dashboard"
        note={
          canEdit
            ? `What ${churchName} watches — the marks of a disciple your Vision Frame named. Add a header for each area and the measures under it.`
            : `What ${churchName} watches — the marks of a disciple your Vision Frame named — against last year and next year's goal.`
        }
      />

      {outputs.length === 0 && (
        <p className="mb-6 rounded-2xl bg-gray-50 px-5 py-6 text-center text-sm text-gray-500">
          {canEdit
            ? "Nothing on the scoreboard yet. Start with a header — Bible reading, Evangelism, Community involvement — and one measure under it."
            : "Nothing on the scoreboard yet."}
        </p>
      )}

      <div className="space-y-6">
        {categories.map((c) => (
          <CategoryGroup
            key={c}
            category={c === NONE ? null : c}
            rows={outputs.filter((m) => (m.category?.trim() || NONE) === c)}
            projectId={projectId}
            accessToken={accessToken}
            canEdit={canEdit}
            nextPosition={data.metrics.length}
            onChanged={onChanged}
          />
        ))}
      </div>

      {canEdit && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newCategory.trim() || !newLabel.trim()) return;
            setBusy(true);
            try {
              await createMetric(
                accessToken,
                projectId,
                "measure_output",
                newLabel.trim(),
                data.metrics.length,
                newCategory.trim()
              );
              setNewCategory("");
              setNewLabel("");
              await onChanged();
            } finally {
              setBusy(false);
            }
          }}
          className="mt-6 flex flex-wrap items-end gap-2 rounded-2xl border border-dashed border-gray-300 px-4 py-3.5 sm:px-5"
        >
          <label className="min-w-0 flex-1 basis-40">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              New header
            </span>
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Bible reading"
              className="mt-0.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
            />
          </label>
          <label className="min-w-0 flex-1 basis-56">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Its first measure
            </span>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Adults in a reading plan"
              className="mt-0.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-runfree-grad px-3.5 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add header"}
          </button>
        </form>
      )}

      {legacy.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowLegacy((v) => !v)}
            aria-expanded={showLegacy}
            className="text-xs font-semibold text-gray-500 transition hover:text-runfree-magentaDeep"
          >
            {showLegacy ? "Hide" : "Show"} {legacy.length} strategy input{legacy.length === 1 ? "" : "s"} — set aside for now
          </button>
          {showLegacy && (
            <div className="mt-3">
              <CategoryGroup
                category="Strategy inputs"
                rows={legacy}
                projectId={projectId}
                accessToken={accessToken}
                canEdit={canEdit}
                nextPosition={data.metrics.length}
                onChanged={onChanged}
                legacy
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CategoryGroup({
  category,
  rows,
  projectId,
  accessToken,
  canEdit,
  nextPosition,
  onChanged,
  legacy = false,
}: {
  category: string | null;
  rows: ScoreboardMetric[];
  projectId: string;
  accessToken: string;
  canEdit: boolean;
  nextPosition: number;
  onChanged: () => Promise<void>;
  legacy?: boolean;
}) {
  const [label, setLabel] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(category ?? "");

  async function renameCategory() {
    const next = draft.trim() || null;
    await Promise.all(rows.map((m) => updateMetric(accessToken, m.id, { category: next })));
    setRenaming(false);
    await onChanged();
  }

  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-gray-200">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-runfree-indigo/60 px-4 py-3 sm:px-5">
        {renaming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void renameCategory();
            }}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm outline-none focus:border-runfree-magenta"
            />
            <button type="submit" className="text-xs font-semibold text-runfree-magentaDeep">Save</button>
            <button type="button" onClick={() => setRenaming(false)} className="text-xs text-gray-500">Cancel</button>
          </form>
        ) : (
          <p className="font-display text-sm font-extrabold tracking-tight text-runfree-ink">
            {category ?? "Measures"}
            {canEdit && !legacy && (
              <button
                onClick={() => {
                  setDraft(category ?? "");
                  setRenaming(true);
                }}
                className="ml-3 text-[11px] font-semibold text-gray-500 transition hover:text-runfree-magentaDeep"
              >
                Rename
              </button>
            )}
          </p>
        )}
        <p className="text-[11px] text-gray-500">
          {rows.length} measure{rows.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="hidden border-b border-gray-200 bg-white px-4 py-2 sm:grid sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_6.5rem] sm:gap-x-2 sm:px-5">
        <span />
        <span className="text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400">Prior yr.</span>
        <span className="text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400">Now</span>
        <span className="text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400">Goal (next yr.)</span>
        <span className="text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400">Status</span>
      </div>

      <ul className="divide-y divide-gray-100 bg-white">
        {rows.map((m) => (
          <MetricRow key={m.id} metric={m} accessToken={accessToken} canEdit={canEdit} onChanged={onChanged} />
        ))}
      </ul>

      {canEdit && !legacy && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!label.trim()) return;
            await createMetric(accessToken, projectId, "measure_output", label.trim(), nextPosition, category);
            setLabel("");
            await onChanged();
          }}
          className="flex flex-wrap items-center gap-2 border-t border-gray-200 bg-gray-50 px-4 py-2.5 sm:px-5"
        >
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={`Add a measure under ${category ?? "Measures"}`}
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

function asNumber(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Three columns on a phone, five on a desktop, and a trajectory underneath
 * when the three numbers parse: where it was, where it is, where it is going.
 */
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
    const order: ScoreboardMetric["trend"][] = [null, "up", "flat", "down"];
    void patch({ trend: order[(order.indexOf(m.trend) + 1) % order.length] });
  };

  const prior = asNumber(m.prior_year);
  const now = asNumber(m.current);
  const goal = asNumber(m.next_year);

  return (
    <li className="px-4 py-3 sm:px-5 sm:py-2.5">
      <div className="grid grid-cols-3 items-center gap-x-2 gap-y-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_6.5rem] sm:gap-y-0">
        <div className="col-span-3 min-w-0 sm:col-span-1">
          <Cell
            value={m.label}
            onSave={(v) => v && void patch({ label: v })}
            disabled={!canEdit}
            required
            ariaLabel="Measure name"
            className="!px-0 font-semibold !text-runfree-ink"
          />
        </div>
        <LabelledValue label="Prior">
          <Cell
            value={m.prior_year}
            onSave={(v) => void patch({ prior_year: v })}
            disabled={!canEdit}
            ariaLabel={`${m.label} — prior year`}
            align="right"
            className="tabular-nums"
            placeholder="—"
          />
        </LabelledValue>
        <LabelledValue label="Now">
          <Cell
            value={m.current}
            onSave={(v) => void patch({ current: v })}
            disabled={!canEdit}
            ariaLabel={`${m.label} — now`}
            align="right"
            className="font-semibold tabular-nums"
            placeholder="—"
          />
        </LabelledValue>
        <LabelledValue label="Goal">
          <Cell
            value={m.next_year}
            onSave={(v) => void patch({ next_year: v })}
            disabled={!canEdit}
            ariaLabel={`${m.label} — next year's goal`}
            align="right"
            className="tabular-nums"
            placeholder="—"
          />
        </LabelledValue>
        <div className="col-span-3 flex items-center justify-end gap-1 sm:col-span-1">
          <button
            type="button"
            onClick={canEdit ? cycleTrend : undefined}
            disabled={!canEdit}
            title={m.trend ? `Trending ${m.trend}` : "No trend set"}
            className={`w-4 text-center text-sm text-gray-500 ${
              canEdit ? "cursor-pointer hover:text-runfree-ink" : "cursor-default"
            }`}
          >
            {m.trend ? TREND_MARK[m.trend] : <span className="text-gray-300">·</span>}
          </button>
          <RagPicker value={m.status} onChange={(v) => void patch({ status: v })} disabled={!canEdit} />
          {canEdit && (
            <button
              onClick={async () => {
                if (!confirm(`Remove “${m.label}” from the scoreboard?`)) return;
                await deleteMetric(accessToken, m.id);
                await onChanged();
              }}
              title="Remove this measure"
              aria-label={`Remove ${m.label}`}
              className="ml-1 grid h-7 w-7 place-items-center rounded-full text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {now != null && goal != null && <Trajectory prior={prior} now={now} goal={goal} />}
    </li>
  );
}

/**
 * Where a measure was, is, and is going — one line with three marks. Drawn
 * only when the numbers parse; text like "many" or "?" stays text.
 */
function Trajectory({ prior, now, goal }: { prior: number | null; now: number; goal: number }) {
  const lo = Math.min(prior ?? now, now, goal);
  const hi = Math.max(prior ?? now, now, goal);
  const span = hi - lo || 1;
  const x = (v: number) => 4 + ((v - lo) / span) * 92;
  const reached = goal >= (prior ?? now) ? now >= goal : now <= goal;
  return (
    <svg viewBox="0 0 100 10" className="mt-1.5 h-2.5 w-full max-w-md" aria-hidden="true" preserveAspectRatio="none">
      <line x1="4" y1="5" x2="96" y2="5" stroke="#E5E7EB" strokeWidth="2" strokeLinecap="round" />
      {prior != null && (
        <line x1={x(prior)} y1="5" x2={x(now)} y2="5" stroke="#1F378C" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      )}
      {prior != null && <circle cx={x(prior)} cy="5" r="2.2" fill="#9CA3AF" />}
      <circle cx={x(goal)} cy="5" r="2.6" fill="none" stroke={reached ? "#10B981" : "#F15A25"} strokeWidth="1.6" />
      <circle cx={x(now)} cy="5" r="2.8" fill="#C21F73" />
    </svg>
  );
}

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
