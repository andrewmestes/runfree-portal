"use client";

import { Fragment, useMemo } from "react";
import { nextRenewalStop, renewalCycle, type ExecutionData } from "@/lib/execution";
import { BlockHeading, prettyDate, todayIso } from "./ui";

/**
 * Will's Horizon Storyline Renewal Cycle, as real dates.
 *
 * The handout is a diagram of intervals — 90 days, 180, 270, one year, three
 * times over — and a diagram is something a church reads once and files.
 * Given a start date it becomes twelve entries in a calendar, which is the
 * thing that actually changes behaviour.
 *
 * Anchored on the earliest live initiative's start date rather than a column
 * of its own: that date is already the answer to "when did we start running
 * this plan", and a second field asking the same question is a second field
 * to get wrong.
 *
 * The handout is explicit that this sits ON TOP OF normal weekly and monthly
 * meetings, not instead of them — which is why the note says so.
 */
export default function RenewalCycle({
  data,
  canEdit,
}: {
  data: ExecutionData;
  canEdit: boolean;
}) {
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
    // Only say so to someone who can fix it — the instruction is useless to a
    // viewer, and 052 is the migration that exists because coach-facing copy
    // was being shown to churches.
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
                  depended on `border-t-2` beating `border-t` in the generated
                  stylesheet — source order, not specificity — and rendered as
                  no break at all. */}
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
                    ~60px column with the sentence broken across five lines. */}
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
