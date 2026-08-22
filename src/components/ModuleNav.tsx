"use client";

import Image from "next/image";
import { MODULE_META, isProcessModule, moduleLabel } from "@/lib/modules";

export type NavModule = {
  /** The raw section string, e.g. "Mod #2 CROWD CLOUD". Used as the key. */
  section: string;
  /**
   * What to show, when `section` is not a readable name.
   *
   * The certification handouts page keys its modules by Google Drive folder
   * id, so deriving the label from `section` there rendered a row of buttons
   * captioned "1nT5EtZoyLb9F5FU8KyZDuGXpEveJnomu". The project page has no
   * ids for its sections and passes none of these, so it keeps deriving.
   */
  label?: string;
  order: number;
  count: number;
};

/**
 * The six Pivvot process icons as primary navigation, ported from the
 * Certified Vision Framers portal so a church team and the person
 * facilitating them navigate the process the same way.
 *
 * A track runs behind the icons — the six tools are a sequence, not a menu,
 * and the line is what says so. The segment up to the selected tool fills
 * with the brand gradient, which doubles as a progress read.
 *
 * The one change from CVF: there, this filtered a folder of handouts. Here it
 * filters *everything* for a module — videos, handouts, session images,
 * deliverables — which is what lets the whole engagement live on one page
 * with no back-and-forth navigation.
 */
export default function ModuleNav({
  modules,
  active,
  onSelect,
}: {
  modules: NavModule[];
  active: string;
  onSelect: (section: string) => void;
}) {
  const process = [...modules].sort((a, b) => a.order - b.order);

  const activeIndex = process.findIndex((m) => m.section === active);
  const activeModule = activeIndex >= 0 ? process[activeIndex] : null;
  const meta = activeModule ? MODULE_META[activeModule.order] : null;

  // Fill the track up to the middle of the selected icon.
  const fillPercent =
    activeIndex < 0 || process.length < 2
      ? 0
      : (activeIndex / (process.length - 1)) * 100;

  return (
    <nav aria-label="Process modules">
      <div className="relative">
        {/* Track — it must start and end at the CENTRE of the outer icons.
            The items are flex-1, so with n of them each centre sits half an
            item in from its edge: 50/n percent. The old version hardcoded
            70px, which is only right when the items happen to be 140px wide
            — true for the six-module process track it was written for, and
            wrong for the nine-entry certification one, where the line
            visibly stopped short at both ends. */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-10 hidden h-[3px] sm:block"
          style={{
            left: `${50 / Math.max(process.length, 1)}%`,
            right: `${50 / Math.max(process.length, 1)}%`,
          }}
        >
          <div className="h-full w-full rounded-full bg-gray-200" />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-runfree-grad transition-all duration-500 ease-out"
            style={{ width: `${fillPercent}%` }}
          />
        </div>

        <ul className="relative flex flex-wrap items-start justify-center gap-x-1 gap-y-8 sm:flex-nowrap sm:gap-x-2">
          {process.map((m) => {
            const isActive = active === m.section;
            const label = m.label ?? moduleLabel(m.section);

            return (
              <li key={m.section} className="flex-1">
                <button
                  onClick={() => onSelect(m.section)}
                  aria-pressed={isActive}
                  className="group flex w-full min-w-[104px] flex-col items-center rounded-xl outline-none ring-runfree-magenta/60 focus-visible:ring-2 focus-visible:ring-offset-2"
                >
                  <span
                    className={`relative flex h-20 w-20 items-center justify-center rounded-full transition-transform duration-300 ease-out will-change-transform ${
                      isActive
                        ? "-translate-y-1 scale-110"
                        : "group-hover:-translate-y-1 group-hover:scale-110 group-focus-visible:-translate-y-1"
                    }`}
                  >
                    {/* Opaque plate so the track passes behind, not through. */}
                    <span
                      aria-hidden
                      className="absolute inset-1 rounded-full bg-gray-50"
                    />
                    <span
                      aria-hidden
                      className={`absolute inset-0 rounded-full bg-runfree-magenta/25 blur-xl transition-opacity duration-300 ${
                        isActive ? "opacity-100" : "opacity-0 group-hover:opacity-70"
                      }`}
                    />
                    {/* Only the six process tools have an icon. The extra
                        entries — the Field Guide at 0, Additional and Combined
                        Handouts after 6 — were requesting /brand/modules/0.png
                        and 7.png, which do not exist, so the certification
                        handouts page rendered three broken-image glyphs in the
                        middle of the track. They get a folder mark instead. */}
                    {isProcessModule(m.order) ? (
                      <Image
                        src={`/brand/modules/${m.order}.png`}
                        alt=""
                        width={76}
                        height={76}
                        className={`relative h-[72px] w-[72px] object-contain transition duration-300 ${
                          isActive
                            ? ""
                            : "opacity-70 saturate-50 group-hover:opacity-100 group-hover:saturate-100"
                        }`}
                      />
                    ) : (
                      <span
                        className={`relative grid h-[72px] w-[72px] place-items-center rounded-full transition duration-300 ${
                          isActive
                            ? "bg-runfree-grad text-white"
                            : "bg-white text-runfree-navy/60 ring-1 ring-gray-200 group-hover:text-runfree-magentaDeep group-hover:ring-runfree-magenta/40"
                        }`}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-8 w-8"
                          aria-hidden="true"
                        >
                          <path d="M14 3v5h5" />
                          <path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z" />
                        </svg>
                      </span>
                    )}
                  </span>

                  {/* Wrap naturally inside a narrow column rather than
                      forcing one word per line. The per-word split kept the
                      six two-word tool names tidy, but "Vision Frame Field
                      Guide" became four stacked lines inside a fixed 40px
                      box — overflowing it and running into the mantra below.
                      That is the glitch. A min height keeps the shorter
                      labels on a common baseline without capping the long
                      ones. */}
                  <span
                    className={`mt-3 block min-h-10 max-w-[11ch] text-balance text-center text-[15px] font-semibold leading-[1.15] transition-colors ${
                      isActive ? "text-runfree-ink" : "text-gray-500 group-hover:text-runfree-ink"
                    }`}
                  >
                    {label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* The mantra gets its own line, sized to actually carry. Keyed on the
          module so it re-animates each time the selection changes. */}
      <div className="mt-8 flex min-h-[68px] items-center justify-center px-4">
        {meta && activeModule && (
          <div key={activeModule.section} className="animate-rise text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-magentaDeep">
              {meta.stage}
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold tracking-tight text-runfree-ink sm:text-3xl">
              {meta.mantra}
            </p>
          </div>
        )}
      </div>
    </nav>
  );
}
