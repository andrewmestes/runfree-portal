"use client";

import { useState } from "react";
import {
  DASHBOARD_STARTER,
  createMetric,
  deleteMetric,
  updateMetric,
  type ExecutionData,
  type ScoreboardGroup,
  type ScoreboardMetric,
} from "@/lib/execution";
import { BlockHeading, Cell, RagPicker } from "./ui";

/**
 * The Church Ministry Dashboard.
 *
 * Straight off Will's sheet: Strategy (Input) down the left, Measures
 * (Output) beside it, each row carrying Prior Yr. / Now / Next Yr. with a
 * red-amber-green dot and a trend arrow.
 *
 * This is the MONTHLY half of Execution. The Midground measures are the ones
 * a team checks weekly against the one-year milestone; these are the standing
 * vital signs of the church, which is why they live at the bottom of the page
 * rather than in the standup strip at the top.
 */
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

      {/* The seed offer AND the groups' own add rows. The groups used to
          render only once a row existed, so an editor could not add a single
          custom row without first accepting Will's nine and deleting eight. */}
      {data.metrics.length === 0 && (
        <div className="mb-6 rounded-2xl bg-gray-50 px-5 py-8 text-center">
          <p className="text-sm text-gray-500">Nothing on the scoreboard yet.</p>
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
          <p className="mt-2 text-[11px] text-gray-500">
            Adds the nine rows off the printed sheet — or add your own rows below.
          </p>
        </div>
      )}
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
          label instead, because a four-column header at 390px leaves each
          heading about nine characters wide. */}
      <div className="hidden border-b border-gray-200 bg-white px-4 py-2 sm:grid sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_6.5rem] sm:gap-x-2 sm:px-5">
        <span />
        <span className="text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Prior yr.
        </span>
        <span className="text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Now
        </span>
        <span className="text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Next yr.
        </span>
        <span className="text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Status
        </span>
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
            placeholder={
              grouping === "strategy_input"
                ? "Add a ministry — Groups, Serving, Baptisms…"
                : "Add a measure"
            }
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

/**
 * Three columns on a phone, five on a desktop.
 *
 * This was one five-column grid at every width, and at 390px it put "1,180"
 * through a 55px column as "1,18", hid the Now value entirely, and printed
 * "NEX" underneath the trend arrow. Any change to these columns has to be
 * made here AND in the `sm:grid` header above — they are two elements sharing
 * one column definition.
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

  return (
    <li className="grid grid-cols-3 items-center gap-x-2 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_6.5rem] sm:gap-y-0 sm:px-5 sm:py-2">
      <div className="col-span-3 min-w-0 sm:col-span-1">
        <Cell
          value={m.label}
          onSave={(v) => v && void patch({ label: v })}
          disabled={!canEdit}
          required
          ariaLabel="Row name"
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
      <LabelledValue label="Next">
        <Cell
          value={m.next_year}
          onSave={(v) => void patch({ next_year: v })}
          disabled={!canEdit}
          ariaLabel={`${m.label} — next year`}
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
        {/* No status is no status. Defaulting the picker to amber drew every
            freshly seeded row as "At risk" — selected, announced to a screen
            reader — before anyone had made a judgement. */}
        <RagPicker
          value={m.status}
          onChange={(v) => void patch({ status: v })}
          disabled={!canEdit}
        />
        {canEdit && (
          <button
            onClick={async () => {
              // Sat 4px from the green circle at 14px square, with no way
              // back — a mis-tap on a phone erased a year of numbers.
              if (!confirm(`Remove “${m.label}” from the scoreboard?`)) return;
              await deleteMetric(accessToken, m.id);
              await onChanged();
            }}
            title="Remove this row"
            aria-label={`Remove ${m.label}`}
            className="ml-1 grid h-7 w-7 place-items-center rounded-full text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="h-3.5 w-3.5"
            >
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
 * the column heading does that job. Stacked rather than inline: side by side,
 * the caption ate half of a 110px column and truncated the number it labelled.
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
