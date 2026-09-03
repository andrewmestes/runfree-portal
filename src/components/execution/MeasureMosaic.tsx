"use client";

import {
  effectiveCurrent,
  measureProgress,
  type MeasureReading,
  type MidgroundMeasure,
} from "@/lib/execution";

/**
 * The one-year goal, as God Dreams' mosaic.
 *
 * The book's visual summary is a field of coloured tiles — teal, gold,
 * orange, red — scattered up its cover. A measure fills a row of those tiles
 * from its baseline to its target, so the progress a church makes toward the
 * Mid-Ground Horizon is drawn in the brand's own image rather than as a
 * generic bar. Andrew: "displayed in a creative way, some kind of chart,
 * graph, whatever that the church can see on there. And if it's able to be
 * connected somehow to the God Dreams brand that would be fantastic."
 *
 * Progress still counts from the baseline, not from zero (measureProgress):
 * "12% to 25%" lights no tiles at 12.
 */
const TILE_COLOURS = ["#1F6F78", "#2A8A8C", "#8FA23A", "#B5A642", "#E0A030", "#F15A25", "#E43D96", "#C21F73"];

export function MeasureMosaic({
  measure,
  readings,
  tiles = 20,
  compact = false,
}: {
  measure: MidgroundMeasure;
  readings: MeasureReading[];
  tiles?: number;
  /** The board's footer: a thinner row, no captions. */
  compact?: boolean;
}) {
  const current = effectiveCurrent(measure, readings);
  const pct = measureProgress(measure, current);
  const filled = pct == null ? 0 : Math.round(pct * tiles);
  const unit = measure.unit ?? "";
  const num = (v: number | null | undefined) => (v == null ? "—" : `${v}${unit}`);

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={`min-w-0 truncate font-semibold text-runfree-ink ${compact ? "text-[11px]" : "text-sm"}`}
        >
          {measure.label}
        </span>
        <span
          className={`shrink-0 font-display font-extrabold tabular-nums text-runfree-ink ${
            compact ? "text-xs" : "text-lg"
          }`}
        >
          {num(current)}
          <span className={`font-semibold text-gray-400 ${compact ? "text-[10px]" : "text-xs"}`}>
            {" "}
            / {num(measure.target)}
          </span>
        </span>
      </div>
      <div
        role="img"
        aria-label={`${measure.label}: ${num(current)} of ${num(measure.target)}${
          pct != null ? `, ${Math.round(pct * 100)}% of the way from the baseline` : ""
        }`}
        className={`grid gap-[3px] ${compact ? "mt-1" : "mt-2"}`}
        style={{ gridTemplateColumns: `repeat(${tiles}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: tiles }, (_, i) => {
          const on = i < filled;
          const colour = TILE_COLOURS[Math.min(TILE_COLOURS.length - 1, Math.floor((i / tiles) * TILE_COLOURS.length))];
          // A little unevenness in height is what makes it read as a mosaic
          // rather than a segmented bar.
          const tall = i % 3 === 1;
          return (
            <span
              key={i}
              className={`block rounded-[3px] transition-colors duration-500 ${
                compact ? (tall ? "h-2.5" : "mt-0.5 h-2") : tall ? "h-5" : "mt-1 h-4"
              }`}
              style={{ backgroundColor: on ? colour : "#E9EDF9" }}
            />
          );
        })}
      </div>
      {!compact && (
        <div className="mt-1.5 flex items-baseline justify-between text-[11px] text-gray-400">
          <span>Baseline {num(measure.baseline)}</span>
          {pct != null ? (
            <span className="font-semibold text-runfree-magentaDeep">
              {Math.round(pct * 100)}% of the way
            </span>
          ) : (
            <span>Set a baseline and a target to light the tiles</span>
          )}
          <span>Target {num(measure.target)}</span>
        </div>
      )}
    </div>
  );
}
