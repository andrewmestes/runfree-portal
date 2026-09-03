"use client";

import { useState } from "react";
import RichText, { RichTextView } from "@/components/RichText";
import { richTextIsEmpty } from "@/lib/rich-text";
import { HORIZON_DEFINITIONS, MIDGROUND_TESTS } from "@/lib/god-dreams";
import { MeasureMosaic } from "./MeasureMosaic";
import {
  createMeasure,
  deleteMeasure,
  deleteReading,
  logReading,
  saveHorizonBox,
  updateMeasure,
  effectiveCurrent,
  latestReading,
  type ExecutionData,
  type MeasureReading,
  type MidgroundMeasure,
} from "@/lib/execution";
import { Cell, EditorActions, prettyDate, todayIso } from "./ui";

/**
 * The Midground Milestone — the one-year goal, scored.
 *
 * Andrew: "For the Midground Horizon, i want a way of scoring and keeping
 * track of that. we always encourage people to use a qualitative and
 * quantitative aspect of the midground, so it needs to be measurable somehow
 * on the dashboard."
 *
 * That split is exactly how Will's "Midground Milestone Examples" sheet
 * works. Every example on it is a sentence with a number inside — "we will
 * see 80 percent of our church praying for three people who don't have a
 * church home every day", "double the number of people going on mission
 * trips ... from 12 percent of the congregation to 25 percent". So:
 *
 *   qualitative  -> the statement, on the horizon box
 *   quantitative -> measures, each baseline -> target with dated readings
 *
 * Progress counts FROM the baseline, not from zero: "12 percent to 25
 * percent" is 0% done at 12, not 48% done. That is the difference between a
 * bar that motivates and a bar that lies.
 */
export default function MidgroundDetail({
  data,
  projectId,
  accessToken,
  canEdit,
  canLog,
  onChanged,
}: {
  data: ExecutionData;
  projectId: string;
  accessToken: string;
  /** editor/admin — owns the statement and the measure definitions. */
  canEdit: boolean;
  /** may_manage_tasks — logs this week's number. */
  canLog: boolean;
  onChanged: () => Promise<void>;
}) {
  const box = data.horizon.find((h) => h.horizon === "midground" && h.position === 0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [showTests, setShowTests] = useState(false);
  const [newMeasure, setNewMeasure] = useState("");

  return (
    <div className="space-y-6">
      <section>
        <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-navy">
          The one-year goal — qualitative and quantitative
        </h4>
        {/* God Dreams' own definition, verbatim (Andrew: "give the specific
            definition from the book"). */}
        <blockquote className="mt-2 rounded-xl border-l-4 border-runfree-magenta/40 bg-white px-4 py-3 text-xs leading-relaxed text-gray-600 ring-1 ring-gray-200">
          {HORIZON_DEFINITIONS.midground.definition}
          <span className="mt-1 block text-[11px] text-gray-400">— God Dreams, The Horizon Storyline</span>
        </blockquote>
        {editing ? (
          <div className="mt-2 space-y-2">
            <RichText
              value={draft}
              onChange={setDraft}
              minHeight="8rem"
              placeholder="One year from now… Put a number inside the sentence — that is what makes it a milestone rather than a wish."
            />
            <EditorActions
              busy={busy}
              onSave={async () => {
                setBusy(true);
                try {
                  await saveHorizonBox(accessToken, projectId, "midground", 0, {
                    body: richTextIsEmpty(draft) ? null : draft,
                  });
                  await onChanged();
                  setEditing(false);
                } finally {
                  setBusy(false);
                }
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : richTextIsEmpty(box?.body) ? (
          <p className="mt-1.5 text-sm italic text-gray-400">
            Not written yet.
          </p>
        ) : (
          <div className="mt-1.5">
            <RichTextView html={box!.body!} className="!text-base !text-runfree-ink" />
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-4">
          {canEdit && !editing && (
            <button
              onClick={() => {
                setDraft(box?.body ?? "");
                setEditing(true);
              }}
              className="text-[11px] font-semibold text-gray-500 transition hover:text-runfree-magentaDeep"
            >
              {richTextIsEmpty(box?.body) ? "Write it" : "Edit"}
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => setShowTests((v) => !v)}
              aria-expanded={showTests}
              className="text-[11px] font-semibold text-gray-500 transition hover:text-runfree-magentaDeep"
            >
              {showTests ? "Hide" : "Is it a good one?"}
            </button>
          )}
        </div>

        {/* The "Assessing Our Midground Milestone" sheet, verbatim. It is the
            questions the room used to pick this, so it belongs beside it
            rather than in a handout nobody reopens. */}
        {showTests && (
          <ul className="mt-3 space-y-1.5 rounded-xl bg-gray-50 px-4 py-3">
            {MIDGROUND_TESTS.map((q) => (
              <li key={q} className="flex gap-2 text-xs leading-relaxed text-gray-600">
                <span className="text-runfree-magentaDeep">•</span>
                {q}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-navy">
            How we&rsquo;ll know
          </h4>
          <span className="text-[11px] text-gray-400">
            {data.measures.length === 0 ? "" : "Baseline → target, checked in over the year"}
          </span>
        </div>

        {data.measures.length === 0 ? (
          <p className="mt-2 text-xs italic leading-relaxed text-gray-400">
            {canEdit
              ? "No measures yet. Pull the number out of the milestone above — “from 12% to 25%” is a measure with a baseline of 12 and a target of 25."
              : "No measures set yet."}
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.measures.map((m) => (
              <MeasureRow
                key={m.id}
                measure={m}
                readings={data.readings.filter((r) => r.measure_id === m.id)}
                projectId={projectId}
                accessToken={accessToken}
                canEdit={canEdit}
                canLog={canLog}
                onChanged={onChanged}
              />
            ))}
          </ul>
        )}

        {canEdit && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newMeasure.trim()) return;
              await createMeasure(accessToken, projectId, newMeasure.trim(), data.measures.length);
              setNewMeasure("");
              await onChanged();
            }}
            className="mt-3 flex flex-wrap items-center gap-2"
          >
            <input
              value={newMeasure}
              onChange={(e) => setNewMeasure(e.target.value)}
              placeholder="Add a measure — “People on a mission trip”"
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
    </div>
  );
}

function MeasureRow({
  measure: m,
  readings,
  projectId,
  accessToken,
  canEdit,
  canLog,
  onChanged,
}: {
  measure: MidgroundMeasure;
  readings: MeasureReading[];
  projectId: string;
  accessToken: string;
  canEdit: boolean;
  canLog: boolean;
  onChanged: () => Promise<void>;
}) {
  const [logging, setLogging] = useState(false);
  const [value, setValue] = useState("");
  const [on, setOn] = useState(todayIso());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);

  // The latest reading wins over the stamped column — see effectiveCurrent.
  const current = effectiveCurrent(m, readings);
  const unit = m.unit ?? "";

  const patch = async (p: Parameters<typeof updateMeasure>[2]) => {
    await updateMeasure(accessToken, m.id, p);
    await onChanged();
  };

  return (
    <li className="rounded-xl bg-white px-4 py-3.5 ring-1 ring-gray-200">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <Cell
            value={m.label}
            onSave={(v) => v && void patch({ label: v })}
            disabled={!canEdit}
            className="!px-0 font-semibold !text-runfree-ink"
          />
        </div>
      </div>

      {/* The mosaic — God Dreams' tiles, lit from the baseline to the
          target. The row above already carries the label and the number;
          the mosaic repeats them small, so the caller hides its own. */}
      <div className="mt-2">
        <MeasureMosaic measure={m} readings={readings} tiles={24} />
      </div>

      {readings.length >= 2 && (
        <div className="mt-2 flex items-center gap-3">
          <Sparkline readings={readings} />
          <span className="text-[11px] text-gray-400">
            {readings.length} check-ins since {prettyDate([...readings].sort((a, b) => (a.on_date < b.on_date ? -1 : 1))[0].on_date)}
          </span>
        </div>
      )}

      {canEdit && (
        <div className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-4">
          <Small label="Baseline">
            <NumCell value={m.baseline} onSave={(v) => void patch({ baseline: v })} />
          </Small>
          <Small label="Target">
            <NumCell value={m.target} onSave={(v) => void patch({ target: v })} />
          </Small>
          <Small label="Unit">
            <Cell
              value={m.unit}
              onSave={(v) => void patch({ unit: v })}
              placeholder="%"
              className="!text-xs"
            />
          </Small>
          <Small label="Current">
            <NumCell value={m.current} onSave={(v) => void patch({ current: v })} />
          </Small>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {canLog && !logging && (
          <button
            onClick={() => {
              setValue(current != null ? String(current) : "");
              setLogging(true);
            }}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-runfree-magentaDeep ring-1 ring-gray-300 transition hover:bg-runfree-pink"
          >
            Log this week&rsquo;s number
          </button>
        )}
        {readings.length > 0 && (
          <button
            onClick={() => setHistory((v) => !v)}
            aria-expanded={history}
            className="text-[11px] font-semibold text-gray-500 transition hover:text-runfree-magentaDeep"
          >
            {history ? "Hide" : `${readings.length} reading${readings.length === 1 ? "" : "s"}`}
          </button>
        )}
        {canEdit && (
          <button
            onClick={async () => {
              if (!confirm(`Delete the measure “${m.label}” and its readings?`)) return;
              await deleteMeasure(accessToken, m.id);
              await onChanged();
            }}
            className="ml-auto text-[11px] font-semibold text-gray-500 transition hover:text-rose-600"
          >
            Remove
          </button>
        )}
      </div>

      {logging && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            // Number("") is 0, and it passed isFinite — an empty form logged
            // a reading of zero and stamped the headline to match.
            if (value.trim() === "") return;
            const n = Number(value);
            if (!Number.isFinite(n)) return;
            setBusy(true);
            try {
              await logReading(accessToken, projectId, m.id, n, on, note.trim() || null);
              setLogging(false);
              setNote("");
              await onChanged();
            } finally {
              setBusy(false);
            }
          }}
          className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-gray-50 p-3"
        >
          <label className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Value
            </span>
            <input
              autoFocus
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-0.5 w-24 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-runfree-magenta"
            />
          </label>
          <label className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Date
            </span>
            <input
              type="date"
              value={on}
              onChange={(e) => setOn(e.target.value)}
              className="mt-0.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-runfree-magenta"
            />
          </label>
          <label className="min-w-0 flex-1 basis-full sm:basis-auto">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Note (optional)
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What moved it"
              className="mt-0.5 w-full min-w-0 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-runfree-magenta"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-runfree-grad px-3.5 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Log it"}
          </button>
          <button
            type="button"
            onClick={() => setLogging(false)}
            className="px-2 py-2 text-xs text-gray-500 transition hover:text-runfree-ink"
          >
            Cancel
          </button>
        </form>
      )}

      {history && readings.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3">
          {[...readings]
            .sort((a, b) => (a.on_date < b.on_date ? 1 : -1))
            .map((r) => (
              <li key={r.id} className="flex items-baseline gap-3 text-xs text-gray-600">
                <span className="w-24 shrink-0 tabular-nums text-gray-400">
                  {prettyDate(r.on_date)}
                </span>
                <span className="w-16 shrink-0 font-semibold tabular-nums text-runfree-ink">
                  {r.value}
                  {unit}
                </span>
                <span className="min-w-0 flex-1">{r.note}</span>
                {canLog && (
                  <button
                    onClick={async () => {
                      if (!confirm(`Delete the ${prettyDate(r.on_date)} reading?`)) return;
                      await deleteReading(accessToken, r.id);
                      // Best-effort, like logReading's stamp: the stored
                      // headline follows the latest remaining reading rather
                      // than keeping a number nothing supports.
                      const latest = latestReading(readings.filter((x) => x.id !== r.id), m.id);
                      await updateMeasure(accessToken, m.id, { current: latest?.value ?? null }).catch(
                        () => {}
                      );
                      await onChanged();
                    }}
                    className="shrink-0 text-[10px] font-semibold text-gray-500 transition hover:text-rose-600"
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
        </ul>
      )}
    </li>
  );
}

function Small({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </span>
      {children}
    </label>
  );
}

/** A numeric Cell — same save-on-blur behaviour, parsed. */
function NumCell({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (v: number | null) => void;
}) {
  return (
    <Cell
      value={value == null ? null : String(value)}
      onSave={(v) => {
        if (v == null) return onSave(null);
        const n = Number(v);
        if (Number.isFinite(n)) onSave(n);
      }}
      placeholder="—"
      className="!text-xs tabular-nums"
    />
  );
}

/**
 * Readings over time.
 *
 * Two readings is the minimum where a line says anything, which is why the
 * caller gates on it — a single point drawn as a chart implies a trend that
 * does not exist yet.
 */
function Sparkline({ readings }: { readings: MeasureReading[] }) {
  const pts = [...readings].sort((a, b) => (a.on_date < b.on_date ? -1 : 1));
  const values = pts.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const W = 180;
  const H = 28;
  const d = pts
    .map((p, i) => {
      const x = (i / (pts.length - 1)) * W;
      const y = H - ((p.value - min) / span) * (H - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = pts[pts.length - 1];
  const lastX = W;
  const lastY = H - ((last.value - min) / span) * (H - 4) - 2;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-7 w-[180px] shrink-0"
      role="img"
      aria-label={`${pts.length} readings, latest ${last.value}`}
    >
      <path d={d} fill="none" stroke="#C21F73" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r="2.6" fill="#C21F73" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
