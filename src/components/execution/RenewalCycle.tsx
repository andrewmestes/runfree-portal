"use client";

import { Fragment, useMemo, useState } from "react";
import { nextRenewalStop, renewalCycle, type ExecutionData } from "@/lib/execution";
import { BlockHeading, PINK_BUTTON, prettyDate, todayIso } from "./ui";

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
 *
 * Drawn as a timeline (17 Sept 2026): a line down the left with a node per
 * stop, the next one lit — a cadence reads as a path, not as a table.
 */
export default function RenewalCycle({
  data,
  canEdit,
}: {
  data: ExecutionData;
  canEdit: boolean;
}) {
  const today = todayIso();
  // Twelve dates over three years is a calendar, not a page. Show the next
  // stop; the rest unfolds on request.
  const [all, setAll] = useState(false);
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

  const shown = all ? stops : stops.filter((s) => s.on === next?.on || (!next && s === stops[stops.length - 1]));

  return (
    <section className="mt-12">
      <BlockHeading
        eyebrow="The rhythm"
        title="Renewal Cycle"
        note="In addition to your normal weekly and monthly meetings — this is the cadence that keeps the Horizon Storyline alive."
        action={
          <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all} className={PINK_BUTTON}>
            {all ? "Show only the next stop" : "Show the full three-year cycle — 12 dates"}
          </button>
        }
      />

      <div className="rounded-3xl bg-white px-4 py-4 shadow-sm ring-1 ring-gray-200 sm:px-5">
        <ol className="relative space-y-1 before:absolute before:bottom-3 before:left-[9px] before:top-3 before:w-px before:bg-gray-200">
          {shown.map((s, n) => {
            const past = s.on < today;
            const isNext = next?.on === s.on;
            const yearBreak = all && (n === 0 || shown[n - 1].year !== s.year);
            return (
              <Fragment key={s.on + s.marker}>
                {yearBreak && (
                  <li className="relative py-1 pl-8">
                    <span className="relative -ml-8 inline-block rounded-full bg-white px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500 ring-1 ring-gray-200">
                      Year {s.year}
                    </span>
                  </li>
                )}
                <li
                  aria-current={isNext ? "step" : undefined}
                  className={`relative flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl py-2.5 pl-8 pr-3 ${
                    isNext ? "bg-runfree-pink/50" : ""
                  }`}
                >
                  <span
                    aria-hidden
                    className={`absolute left-[3px] top-[15px] h-3.5 w-3.5 rounded-full ${
                      isNext
                        ? "bg-runfree-magentaDeep ring-4 ring-runfree-pink"
                        : past
                          ? "bg-gray-300 ring-4 ring-white"
                          : "border-2 border-runfree-navy/30 bg-white ring-4 ring-white"
                    }`}
                  />
                  <span
                    className={`w-28 shrink-0 font-display text-sm font-extrabold tabular-nums ${
                      past ? "text-gray-500" : "text-runfree-ink"
                    }`}
                  >
                    {prettyDate(s.on)}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      isNext
                        ? "bg-runfree-magentaDeep text-white"
                        : past
                          ? "bg-gray-100 text-gray-500"
                          : "bg-runfree-indigo text-runfree-navy"
                    }`}
                  >
                    {s.length}
                  </span>
                  {/* Last on a phone, third on a desktop. Left in flow it was a
                      ~60px column with the sentence broken across five lines. */}
                  <span
                    className={`order-last w-full min-w-0 text-sm sm:order-none sm:w-auto sm:flex-1 ${
                      past ? "text-gray-500" : "text-gray-600"
                    }`}
                  >
                    {s.purpose}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-gray-500">{s.marker}</span>
                </li>
              </Fragment>
            );
          })}
        </ol>
      </div>

      <p className="mt-2 text-[11px] text-gray-500">
        Counted from {prettyDate(anchor)}, the earliest start date on a live initiative.
      </p>
    </section>
  );
}
