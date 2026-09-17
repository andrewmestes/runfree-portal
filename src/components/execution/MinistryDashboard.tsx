"use client";

import { useState } from "react";
import {
  createMetric,
  deleteMetric,
  updateMetric,
  type ExecutionData,
  type ScoreboardMetric,
} from "@/lib/execution";
import { BlockHeading, Cell, Icon, Label, PINK_BUTTON, RagPicker } from "./ui";

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

/**
 * The one column definition the header row and every measure row share, so
 * the two cannot drift: three columns on a phone (the label on its own row,
 * then the three numbers, then the controls), five from `sm`.
 */
const ROW_GRID =
  "grid grid-cols-3 items-center gap-x-2 gap-y-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_9.5rem] sm:gap-x-4 sm:gap-y-0";

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
        <p className="mb-4 rounded-3xl border border-dashed border-gray-200 px-5 py-8 text-center text-sm text-gray-500">
          {canEdit
            ? "Nothing on the scoreboard yet. Start with a header — Bible reading, Evangelism, Community involvement — and one measure under it."
            : "Nothing on the scoreboard yet."}
        </p>
      )}

      <div className="space-y-4">
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
          className="mt-4 rounded-3xl bg-runfree-indigo/40 px-5 py-4"
        >
          <p className="font-display text-sm font-extrabold text-runfree-ink">Add a header</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="min-w-0">
              <Label>New header</Label>
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Bible reading"
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
              />
            </label>
            <label className="min-w-0">
              <Label>Its first measure</Label>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Adults in a reading plan"
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
              />
            </label>
            <button type="submit" disabled={busy} className={PINK_BUTTON}>
              {busy ? "Adding…" : "Add header"}
            </button>
          </div>
        </form>
      )}

      {legacy.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
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
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-gray-200">
      <div className="px-4 pt-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
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
                aria-label="Header name"
                className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-runfree-magenta"
              />
              <button type="submit" className="text-xs font-semibold text-runfree-magentaDeep">
                Save
              </button>
              <button type="button" onClick={() => setRenaming(false)} className="text-xs text-gray-500">
                Cancel
              </button>
            </form>
          ) : (
            <h4 className="flex items-center gap-2 font-display text-base font-extrabold tracking-tight text-runfree-ink">
              <span
                aria-hidden
                className="grid h-6 w-6 place-items-center rounded-md bg-runfree-indigo text-runfree-navy"
              >
                <Icon name="chart" className="h-3.5 w-3.5" />
              </span>
              {category ?? "Measures"}
              {canEdit && !legacy && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(category ?? "");
                    setRenaming(true);
                  }}
                  className="ml-1 font-sans text-[11px] font-semibold text-gray-500 transition hover:text-runfree-magentaDeep"
                >
                  Rename
                </button>
              )}
            </h4>
          )}
          <p className="text-[11px] text-gray-500">
            {rows.length} measure{rows.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className={`mt-3 hidden border-b border-gray-100 pb-2 sm:grid ${ROW_GRID}`}>
          <span />
          <Label className="text-right">Prior yr.</Label>
          <Label className="text-right">Now</Label>
          <Label className="text-right">Goal (next yr.)</Label>
          <Label className="text-right">Status</Label>
        </div>
      </div>

      <ul className="divide-y divide-gray-100">
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
          className="flex items-center gap-2 border-t border-gray-100 px-4 py-2 sm:px-5"
        >
          <Icon name="plus" className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={`Add a measure under ${category ?? "Measures"}`}
            aria-label={`New measure under ${category ?? "Measures"}`}
            className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-gray-500 focus:bg-gray-50 focus-visible:ring-1 focus-visible:ring-runfree-magenta"
          />
          <button type="submit" className="text-xs font-semibold text-runfree-magentaDeep hover:underline">
            Add
          </button>
        </form>
      )}
    </div>
  );
}

const TREND_MARK: Record<"up" | "flat" | "down", string> = { up: "↑", flat: "→", down: "↓" };
const TREND_WORD: Record<"up" | "flat" | "down", string> = { up: "up", flat: "flat", down: "down" };

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
    <li className="group px-4 py-3 sm:px-5">
      <div className={ROW_GRID}>
        <div className="col-span-3 min-w-0 sm:col-span-1">
          <Cell
            value={m.label}
            onSave={(v) => v && void patch({ label: v })}
            disabled={!canEdit}
            required
            ariaLabel="Measure name"
            className="!px-0 font-display !text-sm font-bold !text-runfree-ink"
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
            aria-label={`Trend: ${m.trend ? TREND_WORD[m.trend] : "not set"}${canEdit ? ". Change" : ""}`}
            className={`w-5 text-center text-sm font-bold ${m.trend ? "text-runfree-navy" : "text-gray-400"} ${
              canEdit ? "cursor-pointer hover:text-runfree-magentaDeep" : "cursor-default"
            }`}
          >
            {m.trend ? TREND_MARK[m.trend] : "·"}
          </button>
          <RagPicker
            quiet
            value={m.status}
            onChange={(v) => void patch({ status: v })}
            disabled={!canEdit}
            label={`${m.label} light`}
          />
          {canEdit && (
            <button
              type="button"
              onClick={async () => {
                if (!confirm(`Remove “${m.label}” from the scoreboard?`)) return;
                await deleteMetric(accessToken, m.id);
                await onChanged();
              }}
              title="Remove this measure"
              aria-label={`Remove ${m.label}`}
              className="ml-1 grid h-7 w-7 place-items-center rounded-full text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
            >
              <Icon name="x" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {now != null && goal != null && (
          <div className="col-span-3 sm:col-start-2 sm:col-end-5">
            <TrajectoryChart prior={prior} now={now} goal={goal} />
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * Where a measure was, is, and is going — drawn under the three numbers it
 * plots, one mark per column. Drawn only when the numbers parse; text like
 * "many" or "?" stays text.
 *
 * The lines are a stretched SVG (non-scaling strokes keep them crisp); the
 * marks are positioned HTML, so a dot stays a dot at any width — a
 * non-uniform viewBox draws every circle as an ellipse.
 */
function TrajectoryChart({ prior, now, goal }: { prior: number | null; now: number; goal: number }) {
  const reached = goal >= (prior ?? now) ? now >= goal : now <= goal;
  const lo = Math.min(prior ?? now, now, goal);
  const hi = Math.max(prior ?? now, now, goal);
  // viewBox units 0–44, higher value higher up; a flat line sits mid-height.
  const y = (v: number) => (hi === lo ? 22 : 38 - ((v - lo) / (hi - lo)) * 32);
  const top = (v: number) => `${(y(v) / 44) * 100}%`;
  const X = { prior: 16.667, now: 50, goal: 83.333 };
  return (
    <div aria-hidden="true" className="relative mt-2 h-11 w-full">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 44" preserveAspectRatio="none">
        {[X.prior, X.now, X.goal].map((x) => (
          <line key={x} x1={x} x2={x} y1={4} y2={40} stroke="#E9EDF9" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {prior != null && (
          <path
            d={`M${X.prior},${y(prior)} L${X.now},${y(now)} L${X.now},40 L${X.prior},40 Z`}
            fill="#E43D96"
            fillOpacity={0.1}
          />
        )}
        {prior != null && (
          <path
            d={`M${X.prior},${y(prior)} L${X.now},${y(now)}`}
            fill="none"
            stroke="#C21F73"
            strokeWidth={1.75}
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path
          d={`M${X.now},${y(now)} L${X.goal},${y(goal)}`}
          fill="none"
          stroke={reached ? "#10B981" : "#F15A25"}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {prior != null && (
        <span
          title={`Prior year ${prior}`}
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-400"
          style={{ left: `${X.prior}%`, top: top(prior) }}
        />
      )}
      <span
        title={`Goal ${goal}`}
        className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white ${
          reached ? "border-emerald-500" : "border-runfree-orange"
        }`}
        style={{ left: `${X.goal}%`, top: top(goal) }}
      />
      <span
        title={`Now ${now}`}
        className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-runfree-magentaDeep shadow-sm ring-2 ring-white"
        style={{ left: `${X.now}%`, top: top(now) }}
      />
    </div>
  );
}

function LabelledValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col items-stretch">
      <Label className="text-right sm:hidden">{label}</Label>
      <span className="min-w-0">{children}</span>
    </span>
  );
}
