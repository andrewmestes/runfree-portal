"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * The Vision Stack, as one thing you operate rather than four things you
 * scroll past.
 *
 * Andrew: "bring this functionality down into the main area, so when I click
 * on each icon, the corresponding text and elements expand out and are
 * clickable to open a PDF in a modal. This should be seamless and almost
 * Apple.com style in the beauty, engagement, and seamless functionality on
 * both desktop and mobile ... It should be epic, and feel profoundly
 * important."
 *
 * The composition is his own printed reference — the exploded stack on the
 * left, a leader line, that layer's contents on the right — made live. One
 * layer is open at a time, selection is a click, and the plates are the real
 * Pivvot artwork rather than a CSS approximation of it.
 *
 * ── Two things that are load-bearing, not decoration ──────────────────────
 *
 * **The hit area is clipped to the diamond.** The plates are transparent PNGs
 * whose visible diamond occupies about half of a rectangle that overlaps its
 * neighbours heavily. Left as rectangles, moving the pointer across the stack
 * crosses several invisible boxes at once and the hover state chatters
 * between plates — which is the glitch Andrew reported ("it glitches
 * significantly back and forth when the mouse goes over it"). `clip-path`
 * changes hit-testing as well as painting, so clipping each button to the
 * diamond makes what you can hover exactly what you can see.
 *
 * **Selection never moves the plate you are pointing at.** The earlier
 * version lifted the element that carried `onMouseEnter`, so hovering moved
 * it out from under the cursor, which fired `onMouseLeave`, which put it
 * back. Here the geometry is fixed by percentage and the only hover change is
 * brightness; the lift belongs to the *selected* plate, which is chosen by
 * click and therefore cannot oscillate.
 *
 * ── Geometry ──────────────────────────────────────────────────────────────
 *
 * Taken from the source artwork (503 x 900 for four plates), so the on-screen
 * stack has the same proportions as the file Andrew hands a church:
 *   plate height  = 39.67% of the container
 *   step          = 20.11% of the container per plate
 *   4 plates      = 3 x 20.11 + 39.67 = 100%
 * Every plate PNG is pre-normalised to one 800x567 canvas with the diamond at
 * identical coordinates, which is what lets a single clip-path fit all four.
 */

/** The diamond face inside the normalised 800x567 plate canvas. */
const DIAMOND = "polygon(50% 3.5%, 97.5% 44%, 50% 85%, 2.5% 44%)";

const PLATE_H = 39.67; // % of container height
const STEP = 20.11; // % of container height, per plate
const STACK_ASPECT = "503 / 900";

export type StackLayer = {
  slug: string;
  name: string;
  blurb: string | null;
};

export type StackEntry = {
  id: string;
  title: string | null;
  stack_layer: string | null;
  published_at: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  image_path: string | null;
};

export default function VisionStackExplorer({
  layers,
  items,
  imageUrls,
  onOpen,
  onUpload,
  onTogglePublished,
  canEdit,
}: {
  /** Foundation-first, as `vision_stack_layers.position` has them. */
  layers: StackLayer[];
  items: StackEntry[];
  imageUrls: Record<string, string>;
  /** Open this deliverable in the preview modal. */
  onOpen: (item: StackEntry) => void;
  /** Attach a file to an empty tile. Omitted for viewers. */
  onUpload?: (item: StackEntry, file: File) => Promise<void>;
  /** Flip a deliverable between Draft and Live. Omitted for viewers. */
  onTogglePublished?: (item: StackEntry) => Promise<void>;
  canEdit: boolean;
}) {
  /**
   * Top of the stack first — that is the order the plates are drawn in and
   * the order the printed graphic reads. `layers` arrives foundation-first,
   * so this is its reverse.
   */
  const plates = useMemo(() => [...layers].reverse(), [layers]);

  const [selected, setSelected] = useState(plates[0]?.slug ?? "");
  const [hovered, setHovered] = useState<string | null>(null);
  const [assembled, setAssembled] = useState(false);
  const reduced = useReducedMotion();

  // Assemble once on arrival. Held a frame so the transition has a "from"
  // state — setting the final transform in the same paint lands it there with
  // no motion at all.
  useEffect(() => {
    if (reduced) {
      setAssembled(true);
      return;
    }
    const t = window.setTimeout(() => setAssembled(true), 80);
    return () => window.clearTimeout(t);
  }, [reduced]);

  const activeIndex = plates.findIndex((p) => p.slug === selected);
  const active = plates[activeIndex];
  const layerNumber = layers.findIndex((l) => l.slug === selected) + 1;
  const mine = items.filter((d) => d.stack_layer === selected);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-10">
      {/* ───────────────────────────────────────────────── the stack ── */}
      <div className="lg:sticky lg:top-8 lg:self-start">
      <div className="relative mx-auto w-full max-w-[300px] lg:max-w-none lg:pl-[124px]">
        {/* The label rail.
         *
         * Andrew's printed sheet names every layer beside its plate, and it
         * should: without them the three unselected plates are abstract
         * shapes and nothing says they can be clicked. Each label is a real
         * button aligned to its plate's waist, which also gives the whole
         * thing a target bigger than a diamond — the difference between
         * usable and fiddly on a trackpad.
         *
         * Desktop only. Below `lg` the same names render as chips under the
         * stack, where there is width for them. */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 hidden w-[112px] lg:block">
          {plates.map((p, i) => {
            const isActive = p.slug === selected;
            return (
              <button
                key={p.slug}
                type="button"
                tabIndex={-1}
                onClick={() => setSelected(p.slug)}
                onMouseEnter={() => setHovered(p.slug)}
                onMouseLeave={() => setHovered(null)}
                className="pointer-events-auto absolute right-0 w-full -translate-y-1/2 cursor-pointer border-0 bg-transparent p-0 pr-3 text-right outline-none"
                style={{
                  top: `${i * STEP + PLATE_H * 0.44}%`,
                  transition: reduced ? "none" : "color 300ms ease, opacity 300ms ease",
                }}
              >
                <span
                  className={`block font-display text-[13px] font-extrabold leading-tight tracking-tight transition ${
                    isActive
                      ? "text-runfree-magentaDeep"
                      : hovered === p.slug
                        ? "text-runfree-ink"
                        : "text-gray-400"
                  }`}
                >
                  {p.name}
                </span>
              </button>
            );
          })}

          {/* The leader line, straight off Andrew's reference sheet: a dashed
              rule from the open plate across to its contents. Positioned in
              the plate box's own coordinates — the plates' percentages are
              relative to this element, so anywhere else it drifts. Desktop
              only; on a phone the panel sits underneath and there is nothing
              to lead across to. */}
          {active && (
            <span
              aria-hidden
              className="pointer-events-none absolute hidden lg:block"
              style={{
                top: `${activeIndex * STEP + PLATE_H * 0.44}%`,
                left: "88%",
                right: "-2.5rem",
                transition: reduced ? "none" : "top 620ms cubic-bezier(.22,1,.36,1)",
              }}
            >
              <span className="block h-px w-full border-t-2 border-dashed border-runfree-navy/20" />
            </span>
          )}
        </div>

        <div className="relative w-full" style={{ aspectRatio: STACK_ASPECT }}>
          {plates.map((p, i) => {
            const isActive = p.slug === selected;
            const isHover = hovered === p.slug && !isActive;
            return (
              <button
                key={p.slug}
                type="button"
                onClick={() => setSelected(p.slug)}
                onMouseEnter={() => setHovered(p.slug)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(p.slug)}
                onBlur={() => setHovered(null)}
                aria-pressed={isActive}
                aria-label={p.name}
                className="absolute left-0 w-full cursor-pointer border-0 bg-transparent p-0 outline-none"
                style={{
                  top: `${i * STEP}%`,
                  height: `${PLATE_H}%`,
                  zIndex: plates.length - i,
                  // Hit-testing follows the clip. This is the fix for the
                  // hover chatter, not a visual flourish.
                  clipPath: DIAMOND,
                  WebkitClipPath: DIAMOND,
                }}
              >
                <span
                  className="block h-full w-full"
                  style={{
                    transform: assembled
                      ? `translateY(${isActive && !reduced ? -10 : 0}px) scale(${
                          isActive ? 1.06 : isHover ? 1.02 : 1
                        })`
                      : "translateY(26px) scale(0.94)",
                    // Kept nearly solid. At 0.62 the unselected plates washed
                    // out against a light page and the stack stopped reading
                    // as one object — prominence comes from scale and a real
                    // shadow instead, which is what separation actually looks
                    // like.
                    opacity: assembled ? (isActive ? 1 : isHover ? 0.95 : 0.84) : 0,
                    filter: isActive
                      ? "drop-shadow(0 18px 26px rgba(19,29,69,0.28))"
                      : "drop-shadow(0 6px 10px rgba(19,29,69,0.10))",
                    transition: reduced
                      ? "none"
                      : "transform 620ms cubic-bezier(.22,1,.36,1), opacity 520ms cubic-bezier(.22,1,.36,1), filter 480ms cubic-bezier(.22,1,.36,1)",
                    transitionDelay: assembled && !reduced ? "0ms" : `${(plates.length - 1 - i) * 90}ms`,
                    transformOrigin: "50% 44%",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/brand/vision-stack/${p.slug}.png`}
                    alt=""
                    draggable={false}
                    className="h-full w-full select-none object-contain"
                  />
                </span>
              </button>
            );
          })}
        </div>

        {/* The leader line, straight off Andrew's reference sheet: a dashed
            rule from the open plate across to its contents. Desktop only —
            on a phone the panel sits underneath, so there is nothing to
            lead across to. */}
      </div>

      {/* The same four names, as chips, for every width below `lg`. A diamond
          is a small target on a phone and an unlabelled one is a guess. */}
      <div className="mt-5 flex flex-wrap justify-center gap-2 lg:hidden">
        {plates.map((p) => {
          const isActive = p.slug === selected;
          return (
            <button
              key={p.slug}
              type="button"
              onClick={() => setSelected(p.slug)}
              aria-pressed={isActive}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                isActive
                  ? "bg-runfree-grad text-white shadow-sm"
                  : "bg-white text-gray-600 ring-1 ring-gray-200"
              }`}
            >
              {p.name}
            </button>
          );
        })}
      </div>
      </div>

      {/* ──────────────────────────────────────────────── the panel ── */}
      <div className="min-w-0">
        {active && (
          <LayerPanel
            key={active.slug}
            layer={active}
            number={layerNumber}
            items={mine}
            imageUrls={imageUrls}
            onOpen={onOpen}
            onUpload={onUpload}
            onTogglePublished={onTogglePublished}
            canEdit={canEdit}
            reduced={reduced}
          />
        )}
      </div>
    </div>
  );
}

/**
 * One layer's contents.
 *
 * Remounted on every selection (via `key`), which is what makes the entrance
 * animation replay without any exit-state bookkeeping — the old panel is gone
 * and the new one arrives.
 */
function LayerPanel({
  layer,
  number,
  items,
  imageUrls,
  onOpen,
  onUpload,
  onTogglePublished,
  canEdit,
  reduced,
}: {
  layer: StackLayer;
  number: number;
  items: StackEntry[];
  imageUrls: Record<string, string>;
  onOpen: (item: StackEntry) => void;
  onUpload?: (item: StackEntry, file: File) => Promise<void>;
  onTogglePublished?: (item: StackEntry) => Promise<void>;
  canEdit: boolean;
  reduced: boolean;
}) {
  const [shown, setShown] = useState(reduced);

  useEffect(() => {
    if (reduced) return;
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, [reduced]);

  const rise = (n: number) => ({
    opacity: shown ? 1 : 0,
    transform: shown ? "translateY(0)" : "translateY(10px)",
    transition: reduced
      ? "none"
      : "opacity 480ms cubic-bezier(.22,1,.36,1), transform 480ms cubic-bezier(.22,1,.36,1)",
    transitionDelay: reduced ? "0ms" : `${n * 55}ms`,
  });

  const live = items.filter((d) => d.published_at).length;

  return (
    <div>
      <p style={rise(0)} className="text-[11px] font-bold uppercase tracking-[0.18em] text-runfree-magentaDeep">
        Layer {String(number).padStart(2, "0")}
      </p>
      <h2
        style={rise(1)}
        className="mt-1.5 font-display text-2xl font-extrabold tracking-tight text-runfree-ink sm:text-3xl"
      >
        {layer.name}
      </h2>
      {layer.blurb && (
        <p style={rise(2)} className="mt-3 max-w-xl text-base leading-relaxed text-gray-600">
          {layer.blurb}
        </p>
      )}

      <p style={rise(3)} className="mt-4 text-xs font-semibold text-gray-400">
        {items.length === 0
          ? "Nothing in this layer yet."
          : live === 0
            ? `${items.length} ${items.length === 1 ? "piece" : "pieces"} to come`
            : `${live} of ${items.length} finished`}
      </p>

      {items.length > 0 && (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item, n) => (
            <li key={item.id} style={rise(4 + n)}>
              <StackTile
                item={item}
                imageUrl={item.image_path ? imageUrls[item.image_path] : undefined}
                onOpen={onOpen}
                onUpload={onUpload}
                onTogglePublished={onTogglePublished}
                canEdit={canEdit}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One deliverable.
 *
 * Three states, and they look different on purpose: finished work with a
 * picture shows the picture; a finished document shows a document mark and
 * its name; an unfinished tile shows what it *will* be, quietly, because a
 * church that has not reached the Horizon Storyline should still be able to
 * see what is coming. Andrew's own instruction on ratios applies here —
 * nothing counts what is missing.
 */
function StackTile({
  item,
  imageUrl,
  onOpen,
  onUpload,
  onTogglePublished,
  canEdit,
}: {
  item: StackEntry;
  imageUrl?: string;
  onOpen: (item: StackEntry) => void;
  onUpload?: (item: StackEntry, file: File) => Promise<void>;
  onTogglePublished?: (item: StackEntry) => Promise<void>;
  canEdit: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const hasFile = !!item.file_path;
  const openable = hasFile || !!imageUrl;
  const title = item.title ?? "Untitled";

  async function take(file: File | undefined) {
    if (!file || !onUpload) return;
    setBusy(true);
    try {
      await onUpload(item, file);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`group relative h-full overflow-hidden rounded-2xl ring-1 transition duration-300 ${
        openable
          ? "bg-white ring-gray-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-runfree-magenta/40"
          : "bg-gray-50/70 ring-dashed ring-gray-200"
      }`}
    >
      <button
        type="button"
        onClick={() => {
          if (openable) onOpen(item);
          else if (canEdit) inputRef.current?.click();
        }}
        disabled={!openable && !canEdit}
        className="flex h-full w-full flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-runfree-magenta"
      >
        <span className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-gray-50">
          {imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-contain transition duration-500 group-hover:scale-[1.04]"
            />
          ) : hasFile ? (
            <span className="flex flex-col items-center gap-2 p-4 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-runfree-grad text-white shadow-sm transition group-hover:scale-105">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                  <path d="M14 3v5h5" />
                  <path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z" />
                </svg>
              </span>
              <span className="text-[11px] font-semibold text-runfree-magentaDeep">
                Open
              </span>
            </span>
          ) : (
            <span className="grid h-full w-full place-items-center text-gray-300">
              {busy ? (
                <span className="text-[11px] font-semibold text-gray-400">Uploading…</span>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
                  <rect x="3" y="4" width="18" height="16" rx="2.5" strokeDasharray="3 3" />
                  {canEdit && <path d="M12 9.5v5M9.5 12h5" />}
                </svg>
              )}
            </span>
          )}
        </span>

        <span className="flex flex-1 flex-col px-3.5 py-3">
          <span
            className={`text-sm font-semibold leading-snug ${
              openable ? "text-runfree-ink" : "text-gray-500"
            }`}
          >
            {title}
          </span>
          {!openable && (
            <span className="mt-1 text-[11px] text-gray-400">
              {canEdit ? "Add the finished piece" : "Not finished yet"}
            </span>
          )}
        </span>
      </button>

      {/* Draft / Live.
       *
       * Outside the tile's own button rather than inside it — a button inside
       * a button is invalid HTML and the inner one stops being reachable by
       * keyboard. It sits absolute in the corner so the tile's hit area stays
       * the whole card. */}
      {/* A Draft/Live toggle only means something once there is a file to
          publish. On a stack where nothing is uploaded yet it was a wall of
          pink DRAFT pills over empty tiles, announcing a state nobody can
          change. */}
      {canEdit && onTogglePublished && openable ? (
        <button
          type="button"
          onClick={() => void onTogglePublished(item)}
          aria-pressed={!!item.published_at}
          aria-label={
            item.published_at
              ? `${title} is visible to the church — hide it`
              : `${title} is hidden — make it visible to the church`
          }
          title={item.published_at ? "Visible to the church" : "Hidden from the church"}
          className={`absolute right-2.5 top-2.5 z-10 flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide outline-none ring-runfree-magenta/60 backdrop-blur transition focus-visible:ring-2 ${
            item.published_at
              ? "bg-runfree-pink/90 text-runfree-magentaDeep hover:bg-runfree-pink"
              : "bg-white/85 text-gray-500 ring-1 ring-gray-200 hover:bg-white"
          }`}
        >
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${item.published_at ? "bg-runfree-magenta" : "bg-gray-400"}`}
          />
          {item.published_at ? "Live" : "Draft"}
        </button>
      ) : (
        item.published_at && (
          <span className="absolute right-2.5 top-2.5 z-10 rounded-full bg-runfree-pink/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-runfree-magentaDeep backdrop-blur">
            Ready
          </span>
        )
      )}

      {canEdit && (
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            void take(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      )}
    </div>
  );
}

/**
 * Whether the viewer has asked for less motion.
 *
 * Read as state rather than inline, because the plates' entrance is a
 * transition rather than a keyframe animation — a media query in CSS cannot
 * cancel a transform that JavaScript is setting.
 */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}
