"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useFocusTrap } from "@/lib/useFocusTrap";

/**
 * "How it works" — a guided tour of the Digital Facilitator's Guide.
 *
 * Andrew, 24 Sept 2026: "make a creative slide deck that pops up when opening
 * the 'how it works' … show the first menu, the card dims except for where an
 * arrow is pointing me to click, then I click it, it leads me to the next
 * menu, it guides me to do the next click, to show me the card, highlights
 * the logo to go back, then leads me to click another tool, and each step has
 * a pop up text near the arrow that explains the process along the way … when
 * it gets to the back of a teaching card, it describes each section like the
 * big idea, the how to, the coach tips, the module name and phrase, the icons
 * and what they mean." Also: "there are too many numbers competing in the
 * document already" — so no step numbers, only a progress bar.
 *
 * It is a product tour: each step is one page of the guide with everything
 * but `spots` dimmed, an arrow into the place that matters, a note beside it,
 * and — on a `click` step — a live hotspot over the very thing you would tap
 * in the guide, which moves you on exactly as the guide's own link would.
 * Next, Back, the arrow keys and Escape work throughout; nothing advances on
 * its own.
 *
 * Geometry is in the stills' own units (960 x 720, the guide page at 1.25
 * px/pt), measured from the PDF's link and text boxes on pages 1, 2, 5, 6, 89,
 * 90 and 102 of the September 2026 edition. The stills are guide pages, so
 * they are private: rendered at 1440 x 1080, kept in the private
 * deliverable-images bucket (site-assets/guide-tour/), served to certified
 * framers by /api/guide-howto/{name}. A new edition that moves the logo,
 * timer, icons or list needs new stills, new numbers here, and a new
 * STILLS_VERSION so browsers don't pair new numbers with day-old pictures.
 */

type Page = "cover" | "menu" | "list-dj" | "list-kp" | "front" | "back" | "front-kp";
type Pt = [number, number];
type Rect = [number, number, number, number]; // x, y, w, h

type Step = {
  page: Page;
  title: string;
  body: React.ReactNode;
  /** The places left bright; everything else on the page is dimmed. */
  spots: Rect[];
  arrow?: { from: Pt; c: Pt; to: Pt };
  /**
   * Where the note sits when it floats on the page (x, y, width), in page
   * units. Beside the page, only y is used; under it, none.
   */
  pop: [number, number, number];
  /** A live hotspot: tapping it does what the guide's own link does — moves on. */
  click?: Rect;
  /** What the hotspot is, for a screen reader. */
  hotspot?: string;
  next?: string;
};

const W = 960;
const H = 720;

/** Bump with STEPS whenever the stills are re-uploaded for a new edition. */
const STILLS_VERSION = "2026-09-24";

const STEPS: Step[] = [
  {
    page: "cover",
    title: "The Digital Facilitator’s Guide",
    body: <>172 pages, built to be clicked rather than scrolled. Tap the title to open the menu.</>,
    spots: [[180, 540, 600, 105]],
    click: [185, 545, 590, 95],
    hotspot: "The guide’s title: open the menu",
    arrow: { from: [480, 250], c: [540, 420], to: [482, 538] },
    pop: [240, 110, 480],
  },
  {
    page: "menu",
    title: "The menu",
    body: <>Page 2 is the menu: the six modules of Pivvot Vision Framing, in order. Each one opens its own Tool List.</>,
    spots: [[55, 285, 850, 235]],
    pop: [120, 525, 720],
  },
  {
    page: "menu",
    title: "Open a module",
    body: <>Tap <strong>Disciple’s Journey</strong>.</>,
    spots: [[361, 290, 92, 222]],
    click: [366, 295, 82, 212],
    hotspot: "Open Disciple’s Journey",
    arrow: { from: [640, 600], c: [470, 610], to: [418, 522] },
    pop: [490, 522, 450],
  },
  {
    page: "list-dj",
    title: "The Tool List",
    body: (
      <>
        Every tool in the module, numbered in the order the guide runs. 3.0 is the Pre-work, and{" "}
        <em>Deliverables</em>, at the bottom here, is what the module produces.
      </>
    ),
    spots: [[180, 238, 460, 408]],
    pop: [660, 250, 280],
  },
  {
    page: "list-dj",
    title: "Title slide",
    body: <>The module’s name and icon open its title slide — a clean page to put up for the room as the module begins.</>,
    spots: [
      [42, 162, 91, 91],
      [183, 162, 493, 62],
    ],
    arrow: { from: [760, 340], c: [790, 215], to: [686, 193] },
    pop: [640, 330, 290],
  },
  {
    page: "list-dj",
    title: "Open a tool",
    body: <>Tap <strong>3.9 · 4 Ways to Articulate Mission Measures</strong>.</>,
    spots: [[182, 483, 428, 26]],
    click: [189, 482, 412, 27],
    hotspot: "Open 3.9 · 4 Ways to Articulate Mission Measures",
    arrow: { from: [790, 390], c: [790, 500], to: [616, 496] },
    pop: [660, 250, 280],
  },
  {
    page: "front",
    title: "The front of the card",
    body: (
      <>
        Almost every tool is two pages, like the front and back of a card. The front is the one with the{" "}
        <strong>dark blue header</strong>.
      </>
    ),
    spots: [[0, 0, 960, 122]],
    pop: [18, 180, 262],
  },
  {
    page: "front",
    title: "Tool number",
    body: <>The same number as on the Tool List. Most of the walkthrough videos under Facilitator Training start with it too.</>,
    spots: [[32, 22, 80, 82]],
    arrow: { from: [150, 250], c: [70, 200], to: [72, 110] },
    pop: [18, 240, 262],
  },
  {
    page: "front",
    title: "Timer",
    body: <>Roughly how many minutes the tool takes in the room.</>,
    spots: [[764, 26, 70, 70]],
    arrow: { from: [800, 240], c: [812, 170], to: [800, 102] },
    pop: [682, 230, 262],
  },
  {
    page: "front",
    title: "What goes up in the room",
    body: <>The flip chart you’ll draw, the handout or the visual — often shown filled in, as an example.</>,
    spots: [[288, 143, 378, 484]],
    pop: [18, 300, 262],
    next: "Turn the card over",
  },
  {
    page: "back",
    title: "The back of the card",
    body: (
      <>
        The <strong>light header</strong>. This side is for you: how to lead the tool.
      </>
    ),
    spots: [[0, 0, 960, 120]],
    pop: [300, 300, 360],
  },
  {
    page: "back",
    title: "Big Idea",
    body: <>What this tool is for: the point you want the team to leave with. Some cards add background or a Scripture to reflect on.</>,
    spots: [[34, 202, 282, 418]],
    arrow: { from: [460, 330], c: [360, 290], to: [304, 262] },
    pop: [400, 300, 300],
  },
  {
    page: "back",
    title: "How It Works",
    body: <>The steps for leading it, in order.</>,
    spots: [[332, 202, 296, 418]],
    pop: [662, 300, 282],
  },
  {
    page: "back",
    title: "Coaching Tips",
    body: <>Practical advice for leading it well.</>,
    spots: [[650, 202, 290, 418]],
    pop: [330, 300, 300],
  },
  {
    page: "back",
    title: "The icons",
    body: (
      <>
        A coloured icon opens that tool’s handout or walkthrough video in the portal. On a few Horizon Storyline
        cards, a podium opens the keynote slides. Grey means there isn’t one — 3.9 has a handout, but no video.
      </>
    ),
    spots: [[801, 140, 126, 66]],
    arrow: { from: [700, 290], c: [770, 250], to: [803, 190] },
    pop: [410, 270, 310],
  },
  {
    page: "back",
    title: "Module and phrase",
    body: (
      <>
        <em>Disciple’s Journey · Build a Training Center</em> — the module this tool belongs to, and its
        phrase, at the foot of both sides of the card.
      </>
    ),
    spots: [[260, 656, 512, 52]],
    arrow: { from: [480, 400], c: [460, 560], to: [480, 652] },
    pop: [240, 260, 480],
  },
  {
    page: "back",
    title: "Back up a level",
    body: <>Tap the logo to go back to this module’s Tool List.</>,
    spots: [[849, 24, 78, 78]],
    click: [859, 34, 58, 58],
    hotspot: "The logo: back to the Tool List",
    arrow: { from: [740, 230], c: [840, 210], to: [870, 108] },
    pop: [460, 200, 280],
  },
  {
    page: "list-dj",
    title: "And up again",
    body: <>On a Tool List, the logo goes back to the menu.</>,
    spots: [[849, 24, 78, 78]],
    click: [859, 34, 58, 58],
    hotspot: "The logo: back to the menu",
    arrow: { from: [800, 270], c: [870, 230], to: [882, 108] },
    pop: [660, 270, 280],
  },
  {
    page: "menu",
    title: "Now you try",
    body: <>Open <strong>Kingdom Platform</strong>.</>,
    spots: [[504, 290, 93, 222]],
    click: [509, 295, 83, 212],
    hotspot: "Open Kingdom Platform",
    arrow: { from: [420, 630], c: [560, 650], to: [552, 524] },
    pop: [40, 522, 450],
  },
  {
    page: "list-kp",
    title: "Same layout everywhere",
    body: <>Every module’s Tool List works the same way. Open <strong>4.1 · Strategy Exercise</strong>.</>,
    spots: [[182, 280, 231, 29]],
    click: [189, 282, 216, 27],
    hotspot: "Open 4.1 · Strategy Exercise",
    arrow: { from: [640, 266], c: [520, 266], to: [420, 290] },
    pop: [620, 240, 300],
  },
  {
    page: "front-kp",
    title: "That’s the whole guide",
    body: (
      <>
        Every card works like 3.9: the front for the room, the back for you. <strong>Menu → Tool List → tool</strong>,
        and the logo to climb back — you never need to scroll through 172 pages. In the portal, the page box at
        the top of the viewer jumps straight to any page.
      </>
    ),
    spots: [],
    pop: [230, 250, 500],
  },
];

const PAGES: Page[] = ["cover", "menu", "list-dj", "list-kp", "front", "back", "front-kp"];

/** Blob URLs for the stills, kept for the life of the page so a second tour opens instantly. */
const stillCache: Partial<Record<Page, string>> = {};
const inflight: Partial<Record<Page, Promise<string>>> = {};

function loadStill(p: Page, token: string): Promise<string> {
  const have = stillCache[p];
  if (have) return Promise.resolve(have);
  return (inflight[p] ??= fetch(`/api/guide-howto/${p}?v=${STILLS_VERSION}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      stillCache[p] = url;
      return url;
    })
    .finally(() => {
      delete inflight[p];
    }));
}

/**
 * Where the note goes. The note's text is a fixed size, but the page shrinks
 * with the window, so on a short laptop screen a note floating on the page
 * grows over the arrow it explains. Below FLOAT_MIN px of page it moves
 * beside the page, or under it — whichever leaves the bigger page (under,
 * on a phone or an upright tablet).
 */
const FLOAT_MIN = 840;
const SIDE_W = 300;
const GAP = 20;
const DOCK_NOTE = 170;
type Layout = { mode: "float" | "side" | "dock"; pw: number };

function layoutFor(aw: number, ah: number): Layout {
  const byHeight = (ah * W) / H;
  const float = Math.min(aw, byHeight);
  if (float >= FLOAT_MIN) return { mode: "float", pw: float };
  const side = Math.min(aw - SIDE_W - GAP, byHeight);
  const dock = Math.min(aw, (Math.max(ah - DOCK_NOTE, 120) * W) / H);
  return side >= dock ? { mode: "side", pw: side } : { mode: "dock", pw: dock };
}

function roundRect([x, y, w, h]: Rect, r = 16) {
  const rr = Math.min(r, w / 2, h / 2);
  return `M${x + rr} ${y}H${x + w - rr}A${rr} ${rr} 0 0 1 ${x + w} ${y + rr}V${y + h - rr}A${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}H${x + rr}A${rr} ${rr} 0 0 1 ${x} ${y + h - rr}V${y + rr}A${rr} ${rr} 0 0 1 ${x + rr} ${y}Z`;
}

function arrowGeometry({ from, c, to }: { from: Pt; c: Pt; to: Pt }) {
  const dx = to[0] - c[0];
  const dy = to[1] - c[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const L = 44;
  const HW = 25;
  const base: Pt = [to[0] - ux * L, to[1] - uy * L];
  const end: Pt = [to[0] - ux * L * 0.55, to[1] - uy * L * 0.55];
  return {
    path: `M${from[0]} ${from[1]}Q${c[0]} ${c[1]} ${end[0]} ${end[1]}`,
    head: `M${to[0]} ${to[1]}L${base[0] - uy * HW} ${base[1] + ux * HW}L${base[0] + uy * HW} ${base[1] - ux * HW}Z`,
  };
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

export default function GuideTour({
  open,
  onClose,
  onOpenGuide,
}: {
  open: boolean;
  onClose: () => void;
  /** "Open the Guide" on the last step: the page closes the tour and opens the PDF. */
  onOpenGuide?: () => void;
}) {
  const [i, setI] = useState(0);
  const [stills, setStills] = useState<Partial<Record<Page, string>>>(() => ({ ...stillCache }));
  const [failed, setFailed] = useState<Set<Page>>(() => new Set());
  const [reduced, setReduced] = useState(false);
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, "");
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  // Closing always rewinds, so the next open starts at the cover — and the
  // focus trap, which runs before any effect of ours, lands on step one's Next.
  const close = useCallback(() => {
    setI(0);
    onClose();
  }, [onClose]);

  // Also locks the page's scroll and restores it; the tour must not do that
  // itself, or the two restores run in the wrong order and leave it locked.
  useFocusTrap(dialogRef, close, open);

  // A hotspot that unmounts, or Next swapping with Open the Guide, would drop
  // focus to <body>; put it back on the step's main button.
  useEffect(() => {
    if (!open) return;
    const d = dialogRef.current;
    if (d && !d.contains(document.activeElement)) d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [i, open]);

  useEffect(() => {
    if (open) setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, [open]);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!open || !el) return;
    const measure = () => setArea({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  // Fetch the stills with the session. Every open re-reads the cache (stills
  // that landed while the tour was closed) and retries any that failed.
  useEffect(() => {
    if (!open) return;
    setStills({ ...stillCache });
    setFailed(new Set());
    if (PAGES.every((p) => stillCache[p])) return;
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        if (!cancelled) setFailed(new Set(PAGES));
        return;
      }
      await Promise.all(
        PAGES.map((p) =>
          loadStill(p, session.access_token).then(
            () => setStills({ ...stillCache }),
            () => {
              if (!cancelled) setFailed((f) => new Set(f).add(p));
            }
          )
        )
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const go = useCallback((n: number) => setI((cur) => Math.max(0, Math.min(STEPS.length - 1, cur + n))), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go]);

  if (!open) return null;

  const src = stills[step.page];
  const shade = `M0 0H${W}V${H}H0Z ` + step.spots.map((s) => roundRect(s)).join(" ");
  const arrow = step.arrow ? arrowGeometry(step.arrow) : null;
  const fade = reduced ? undefined : "tour-fade";
  const { mode, pw } = area ? layoutFor(area.w, area.h) : { mode: "float" as const, pw: 0 };
  const ph = (pw * H) / W;
  // Under the page on a phone, the hotspot takes the whole ring: a list line
  // is otherwise a few pixels tall.
  const hit = step.click && (mode === "dock" ? step.spots[0] ?? step.click : step.click);

  const note = (
    <div
      key={`note-${i}`}
      className={`rounded-2xl bg-white p-4 text-left shadow-2xl ring-1 ring-black/10 sm:p-5 ${fade ?? ""}`}
    >
      <p className="font-display text-base font-bold text-runfree-ink sm:text-lg">{step.title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-700 sm:text-[15px]">{step.body}</p>
      {step.click && (
        <p className="mt-2 text-xs font-semibold text-runfree-magentaDeep">Tap the highlighted spot, or press Next.</p>
      )}
    </div>
  );

  const page = (
    <div className="relative shrink-0" style={{ width: pw, height: ph }}>
      <div className="absolute inset-0 overflow-hidden rounded-xl bg-white/10 shadow-2xl ring-1 ring-white/15">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- a blob URL of a private still
          <img key={step.page} src={src} alt={`Page of the guide: ${step.title}`} className={`block h-full w-full ${fade ?? ""}`} />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/70">
            {failed.has(step.page) ? "Couldn’t load this page of the guide. Close and try again." : "Loading…"}
          </div>
        )}
      </div>
      {src && (
        <svg
          key={`svg-${i}`}
          viewBox={`0 0 ${W} ${H}`}
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#E43D96" />
              <stop offset="100%" stopColor="#F15A25" />
            </linearGradient>
            <clipPath id={`c${id}`}>
              <rect x="0" y="0" width={W} height={H} rx="12" />
            </clipPath>
          </defs>
          <path
            d={shade}
            fillRule="evenodd"
            fill="#0F1438"
            fillOpacity={step.spots.length ? 0.66 : 0.5}
            clipPath={`url(#c${id})`}
            className={fade}
          />
          {step.spots.map((s, k) => (
            <path key={k} d={roundRect(s)} fill="none" stroke="#fff" strokeWidth="4" className={fade} />
          ))}
          {arrow && (
            <g>
              <path d={arrow.path} pathLength={1} fill="none" stroke="#fff" strokeWidth="26" strokeLinecap="round" className={reduced ? undefined : "tour-draw"} />
              <path d={arrow.path} pathLength={1} fill="none" stroke={`url(#g${id})`} strokeWidth="15" strokeLinecap="round" className={reduced ? undefined : "tour-draw"} />
              <path d={arrow.head} fill="#F15A25" stroke="#fff" strokeWidth="7" strokeLinejoin="round" className={reduced ? undefined : "tour-head"} />
            </g>
          )}
        </svg>
      )}
      {src && hit && (
        <button
          type="button"
          onClick={() => go(1)}
          aria-label={step.hotspot ?? step.title}
          data-tap="grow"
          className="tour-pulse absolute rounded-lg outline-none ring-2 ring-white/0 focus-visible:ring-white"
          style={{ left: pct(hit[0], W), top: pct(hit[1], H), width: pct(hit[2], W), height: pct(hit[3], H) }}
        />
      )}
      {mode === "float" && (
        <div className="absolute" style={{ left: pct(step.pop[0], W), top: pct(step.pop[1], H), width: pct(step.pop[2], W) }}>
          {note}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-runfree-ink/90 backdrop-blur-sm">
      <style>{`
        @keyframes tour-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes tour-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        @keyframes tour-pop { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tour-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(228,61,150,.65); } 50% { box-shadow: 0 0 0 14px rgba(228,61,150,0); } }
        .tour-fade { animation: tour-fade .35s ease both; }
        .tour-draw { stroke-dasharray: 1; animation: tour-draw .7s cubic-bezier(.2,.8,.2,1) .15s both; }
        .tour-head { animation: tour-pop .2s ease .75s both; }
        .tour-pulse { animation: tour-pulse 1.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .tour-fade, .tour-draw, .tour-head, .tour-pulse { animation: none !important; } }
      `}</style>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-name`}
        tabIndex={-1}
        className="mx-auto flex h-full w-full max-w-6xl flex-col px-3 py-3 outline-none sm:px-6 sm:py-5"
      >
        {/* One live region that never remounts, so each new step is read out. */}
        <div className="sr-only" aria-live="polite">
          {step.title}. {step.body}
        </div>

        {/* Top: title, progress, close */}
        <div className="flex shrink-0 items-center gap-3 text-white">
          <p id={`${id}-name`} className="font-display text-sm font-bold tracking-wide sm:text-base">
            How the guide works
          </p>
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"
            role="progressbar"
            aria-label="Tour progress"
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-valuenow={i + 1}
          >
            <div
              className="h-full rounded-full bg-runfree-grad transition-[width] duration-500"
              style={{ width: `${((i + 1) / STEPS.length) * 100}%` }}
            />
          </div>
          <button
            type="button"
            onClick={close}
            className="min-h-[40px] rounded-lg px-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            Close
          </button>
        </div>

        {/* The page, with the note on it, beside it, or under it */}
        <div className="min-h-0 flex-1 py-3">
          <div ref={areaRef} className="h-full w-full">
            {area && mode === "float" && <div className="flex h-full items-center justify-center">{page}</div>}
            {area && mode === "side" && (
              <div className="flex h-full items-center justify-center" style={{ gap: GAP }}>
                {page}
                <div className="flex shrink-0 flex-col overflow-y-auto" style={{ width: SIDE_W, height: ph }}>
                  <div className="min-h-0" style={{ height: (step.pop[1] / H) * ph, flex: "0 1 auto" }} />
                  <div className="shrink-0">{note}</div>
                </div>
              </div>
            )}
            {area && mode === "dock" && (
              <div className="flex h-full flex-col items-center">
                {page}
                <div className="mt-3 min-h-0 w-full flex-1 overflow-y-auto" style={{ maxWidth: pw }}>
                  {note}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom: back / next */}
        <div className="flex shrink-0 items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={i === 0}
            className="min-h-[44px] rounded-lg px-4 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            Back
          </button>
          {last ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setI(0)}
                className="min-h-[44px] rounded-lg px-4 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                Start over
              </button>
              <button
                type="button"
                data-autofocus
                onClick={() => {
                  close();
                  onOpenGuide?.();
                }}
                className="min-h-[44px] rounded-lg bg-runfree-grad px-6 text-sm font-semibold text-white shadow-lg transition hover:opacity-90"
              >
                Open the Guide
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-autofocus
              onClick={() => go(1)}
              className="min-h-[44px] rounded-lg bg-runfree-grad px-6 text-sm font-semibold text-white shadow-lg transition hover:opacity-90"
            >
              {step.next ?? "Next"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
