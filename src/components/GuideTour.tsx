"use client";

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
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
 * On the same page the bright spot glides to its next place rather than
 * blinking. Next, Back, the arrow keys and Escape work throughout; nothing
 * advances on its own.
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

/** "Tap" on a touch screen, "Click" with a mouse — used inside the notes. */
const TapWord = createContext("Tap");
function Tap() {
  return <>{useContext(TapWord)}</>;
}

const STEPS: Step[] = [
  {
    page: "cover",
    title: "The Digital Facilitator’s Guide",
    body: (
      <>
        172 pages, built to be clicked rather than scrolled. <Tap /> the title to open the menu.
      </>
    ),
    spots: [[180, 540, 600, 105]],
    click: [185, 545, 590, 95],
    hotspot: "The guide’s title: open the menu",
    arrow: { from: [480, 250], c: [540, 420], to: [482, 538] },
    pop: [240, 110, 480],
  },
  {
    page: "menu",
    title: "The menu",
    body: <>The six modules of Pivvot Vision Framing, in order. Each one opens its own Tool List.</>,
    spots: [[55, 285, 850, 235]],
    pop: [120, 525, 720],
  },
  {
    page: "menu",
    title: "Open a module",
    body: (
      <>
        <Tap /> <strong>Disciple’s Journey</strong>.
      </>
    ),
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
        Every tool in this module, in order. 3.0 is the <span className="whitespace-nowrap">Pre-work</span> the team does
        before the session.{" "}
        <em>Deliverables</em>, at the bottom, is what the module produces, and what you put together afterwards.
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
    body: (
      <>
        <Tap /> <strong>3.9 · 4 Ways to Articulate Mission Measures</strong>.
      </>
    ),
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
    body: <>The same number as on the Tool List. Most of the walkthroughs in Training Videos → Facilitator Training start with it too.</>,
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
        The back is the very next page — just scroll down one. Its <strong>light header</strong> marks the side
        that’s for you: how to lead the tool.
      </>
    ),
    spots: [[0, 0, 960, 120]],
    pop: [300, 300, 360],
  },
  {
    page: "back",
    title: "Big Idea",
    body: <>What this tool is for: what you’re setting out to do with the team. Some cards add background or a Scripture to reflect on.</>,
    spots: [[34, 202, 282, 418]],
    arrow: { from: [460, 330], c: [360, 290], to: [322, 266] },
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
    body: <>Advice for leading it well. Some cards give you a Power Phrase to use in the room.</>,
    spots: [[650, 202, 290, 418]],
    pop: [330, 300, 300],
  },
  {
    page: "back",
    title: "Module and phrase",
    body: <>The module this tool belongs to, and its phrase from the title slide. It’s at the foot of both sides, so you always know where you are.</>,
    spots: [[260, 656, 512, 52]],
    arrow: { from: [480, 350], c: [460, 560], to: [480, 652] },
    pop: [240, 260, 480],
  },
  {
    page: "back",
    title: "The icons",
    body: (
      <>
        A coloured icon opens that tool’s handout or walkthrough video. Grey means there isn’t one: 3.9 has a
        handout, no video. On a few Horizon Storyline cards, a podium opens the keynote slides.
      </>
    ),
    spots: [[801, 140, 126, 66]],
    arrow: { from: [600, 190], c: [700, 168], to: [797, 176] },
    pop: [330, 140, 300],
  },
  {
    page: "back",
    title: "Back up a level",
    body: (
      <>
        <Tap /> the logo to go back to this module’s Tool List.
      </>
    ),
    spots: [[849, 24, 78, 78]],
    click: [859, 34, 58, 58],
    hotspot: "The logo: back to the Tool List",
    arrow: { from: [650, 172], c: [720, 160], to: [856, 104] },
    pop: [380, 150, 300],
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
    body: (
      <>
        Open <strong>Kingdom Platform</strong>.
      </>
    ),
    spots: [[504, 290, 93, 222]],
    click: [509, 295, 83, 212],
    hotspot: "Open Kingdom Platform",
    arrow: { from: [420, 630], c: [560, 650], to: [552, 524] },
    pop: [40, 522, 450],
  },
  {
    page: "list-kp",
    title: "Same layout everywhere",
    body: (
      <>
        Every module’s Tool List works the same way. Open <strong>4.1 · Strategy Exercise</strong>.
      </>
    ),
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
        and the logo to climb back. You never need to scroll through 172 pages.
      </>
    ),
    spots: [],
    pop: [230, 250, 500],
  },
];

const PAGES: Page[] = ["cover", "menu", "list-dj", "list-kp", "front", "back", "front-kp"];

/** What each still is, for a screen reader (the note says what the step is about). */
const PAGE_ALT: Record<Page, string> = {
  cover: "The guide’s cover",
  menu: "The guide’s menu",
  "list-dj": "The Disciple’s Journey Tool List",
  "list-kp": "The Kingdom Platform Tool List",
  front: "The front of tool 3.9",
  back: "The back of tool 3.9",
  "front-kp": "The front of tool 4.1",
};

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
 * Fetch the stills before anyone presses "How it works", so the tour opens on
 * the guide's cover rather than "Loading…". Joins any fetch already under way;
 * the tour's own effect retries anything that failed.
 */
export async function prefetchGuideStills(): Promise<void> {
  if (PAGES.every((p) => stillCache[p])) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;
  await Promise.allSettled(PAGES.map((p) => loadStill(p, session.access_token)));
}

/**
 * Where the note goes. The note's text is a fixed size, but the page shrinks
 * with the window, so on a short laptop screen a note floating on the page
 * grows over the arrow it explains. Below FLOAT_MIN px of page it moves
 * beside the page (a column at least SIDE_MIN wide, taking spare width up to
 * SIDE_MAX so a long note wraps to fewer lines), or under it — whichever
 * leaves the bigger page (under, on an upright phone or tablet).
 */
const FLOAT_MIN = 840;
const SIDE_MIN = 300;
const SIDE_MAX = 420;
const GAP = 20;
const DOCK_NOTE = 170;
/** px: the smallest tap area, whatever the page size — a thumb. */
const MIN_HIT = 44;
type Layout = { mode: "float" | "side" | "dock"; pw: number; sw: number };

function layoutFor(aw: number, ah: number): Layout {
  const byHeight = (ah * W) / H;
  const float = Math.min(aw, byHeight);
  if (float >= FLOAT_MIN) return { mode: "float", pw: float, sw: 0 };
  const side = Math.min(aw - SIDE_MIN - GAP, byHeight);
  const dock = Math.min(aw, (Math.max(ah - DOCK_NOTE, 120) * W) / H);
  return side >= dock
    ? { mode: "side", pw: side, sw: Math.min(SIDE_MAX, aw - side - GAP) }
    : { mode: "dock", pw: dock, sw: 0 };
}

/**
 * The bright spots on screen. On the same page, with the same number of
 * spots, they glide from wherever they are to the new step's; otherwise (a new
 * page, or reduced motion) they move at once.
 */
function useGlide(spots: Rect[], page: Page, reduced: boolean): Rect[] {
  const [shown, setShown] = useState(spots);
  const at = useRef({ spots, page });
  useLayoutEffect(() => {
    const from = at.current.spots;
    const show = (r: Rect[]) => {
      at.current = { spots: r, page };
      setShown(r);
    };
    if (from === spots) return;
    if (reduced || at.current.page !== page || from.length !== spots.length) {
      show(spots);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      // A frame's timestamp can be a moment before t0; clamp, or the first frame overshoots backwards.
      const e = 1 - (1 - Math.min(1, Math.max(0, (t - t0) / 420))) ** 3;
      show(e >= 1 ? spots : spots.map((s, k) => s.map((v, j) => from[k][j] + (v - from[k][j]) * e) as Rect));
      if (e < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spots, page, reduced]);
  return shown;
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
  /** "Open the Guide" on the last step: the page closes the tour and opens the PDF. Without it the button reads "Done". */
  onOpenGuide?: () => void;
}) {
  const [i, setI] = useState(0);
  const [stills, setStills] = useState<Partial<Record<Page, string>>>(() => ({ ...stillCache }));
  const [failed, setFailed] = useState<Set<Page>>(() => new Set());
  const [reduced, setReduced] = useState(false);
  // Read at first render, not in an effect, so a phone never flashes "Click".
  const [coarse, setCoarse] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
  );
  const [area, setArea] = useState<{ w: number; h: number; short: boolean } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, "");
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const spots = useGlide(step.spots, step.page, reduced);

  // Closing always rewinds, so the next open starts at the cover — and the
  // focus trap, which runs before any effect of ours, lands on step one's Next.
  const close = useCallback(() => {
    setI(0);
    onClose();
  }, [onClose]);

  // Also locks the page's scroll and restores it; the tour must not do that
  // itself, or the two restores run in the wrong order and leave it locked.
  useFocusTrap(dialogRef, close, open);

  // A hotspot that unmounts, Next swapping with Open the Guide, or Back
  // disabling itself on the first step would drop focus to <body>; put it back
  // on the step's main button.
  useEffect(() => {
    if (!open) return;
    const d = dialogRef.current;
    const a = document.activeElement;
    if (d && (!d.contains(a) || (a instanceof HTMLButtonElement && a.disabled)))
      d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [i, open]);

  useEffect(() => {
    if (!open) return;
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
  }, [open]);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!open || !el) return;
    const measure = () => setArea({ w: el.clientWidth, h: el.clientHeight, short: window.innerHeight < 500 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  // Fetch the stills with the session (usually already done by
  // prefetchGuideStills). Every open re-reads the cache (stills that landed
  // while the tour was closed) and retries any that failed.
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
  const shade = `M0 0H${W}V${H}H0Z ` + spots.map((s) => roundRect(s)).join(" ");
  const arrow = step.arrow ? arrowGeometry(step.arrow) : null;
  const fade = reduced ? undefined : "tour-fade";
  const fadeIn = reduced ? undefined : "tour-in";
  const { mode, pw, sw } = area ? layoutFor(area.w, area.h) : { mode: "float" as const, pw: 0, sw: 0 };
  const ph = (pw * H) / W;
  const short = area?.short ?? false;
  // The hotspot is at least a thumb wide and tall; its visible pulse stays
  // the size of the thing it marks.
  const hb =
    step.click &&
    (() => {
      const k = pw / W;
      const [x, y, w, h] = step.click.map((v) => v * k);
      const ex = Math.max(0, (MIN_HIT - w) / 2);
      const ey = Math.max(0, (MIN_HIT - h) / 2);
      return { left: x - ex, top: y - ey, width: w + 2 * ex, height: h + 2 * ey, ex, ey };
    })();

  const note = (
    <div
      key={`note-${i}`}
      className={`rounded-2xl bg-white text-left shadow-2xl ring-1 ring-black/10 ${short ? "p-4" : "p-4 sm:p-5"} ${fade ?? ""}`}
    >
      <p className={`font-display font-bold text-runfree-ink ${short ? "text-base" : "text-base sm:text-lg"}`}>{step.title}</p>
      <p className={`mt-1.5 leading-relaxed text-gray-700 ${short ? "text-sm" : "text-sm sm:text-[15px]"}`}>{step.body}</p>
      {step.click && (
        <p className="mt-2 text-xs font-semibold text-runfree-magentaDeep">
          <Tap /> the highlighted spot, or press Next.
        </p>
      )}
    </div>
  );

  const page = (
    <div className="relative shrink-0" style={{ width: pw, height: ph }}>
      <div className="absolute inset-0 overflow-hidden rounded-xl bg-white/10 shadow-2xl ring-1 ring-white/15">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- a blob URL of a private still
          <img key={step.page} src={src} alt={PAGE_ALT[step.page]} className={`block h-full w-full ${fadeIn ?? ""}`} />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/70">
            {failed.has(step.page) ? "Couldn’t load this page of the guide. Close and try again." : "Loading…"}
          </div>
        )}
      </div>
      {src && (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          aria-hidden="true"
        >
          <defs>
            {/* Sized to each arrow's own box: an arrow drawn dead straight across or down has no box, and loses its colour — give every arrow a slight bow. */}
            <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#E43D96" />
              <stop offset="100%" stopColor="#F15A25" />
            </linearGradient>
            <clipPath id={`c${id}`}>
              <rect x="0" y="0" width={W} height={H} rx="12" />
            </clipPath>
          </defs>
          {/* Keyed by page: it fades in with a new page, and stays put (the spot gliding) on the same one. */}
          <g key={`shade-${step.page}`} className={fadeIn}>
            <path
              d={shade}
              fillRule="evenodd"
              fill="#0F1438"
              fillOpacity={step.spots.length ? 0.66 : 0.5}
              clipPath={`url(#c${id})`}
            />
            {spots.map((s, k) => (
              <path key={k} d={roundRect(s)} fill="none" stroke="#fff" strokeWidth="4" />
            ))}
          </g>
          {arrow && (
            <g key={`arrow-${i}`}>
              <path d={arrow.path} pathLength={1} fill="none" stroke="#fff" strokeWidth="26" strokeLinecap="round" className={reduced ? undefined : "tour-draw"} />
              <path d={arrow.path} pathLength={1} fill="none" stroke={`url(#g${id})`} strokeWidth="15" strokeLinecap="round" className={reduced ? undefined : "tour-draw"} />
              <path d={arrow.head} fill="#F15A25" stroke="#fff" strokeWidth="7" strokeLinejoin="round" className={reduced ? undefined : "tour-head"} />
            </g>
          )}
        </svg>
      )}
      {src && hb && (
        <button
          type="button"
          onClick={(e) => {
            // The second click of a double-click: the logo sits in the same place on steps 17 and 18, so it would skip "And up again".
            if (e.detail > 1) return;
            go(1);
          }}
          aria-label={step.hotspot ?? step.title}
          className="group absolute rounded-lg outline-none"
          style={{ left: hb.left, top: hb.top, width: hb.width, height: hb.height }}
        >
          <span
            className="tour-pulse pointer-events-none absolute rounded-lg group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-[6px] group-focus-visible:outline-runfree-magenta"
            style={{ inset: `${hb.ey}px ${hb.ex}px` }}
          />
        </button>
      )}
      {mode === "float" && (
        <div className="absolute" style={{ left: pct(step.pop[0], W), top: pct(step.pop[1], H), width: pct(step.pop[2], W) }}>
          {note}
        </div>
      )}
    </div>
  );

  return (
    <TapWord.Provider value={coarse ? "Tap" : "Click"}>
      <div className="fixed inset-0 z-50 flex flex-col bg-runfree-ink/95 backdrop-blur-md">
        <style>{`
          @keyframes tour-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
          @keyframes tour-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
          @keyframes tour-pop { from { opacity: 0; } to { opacity: 1; } }
          @keyframes tour-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(228,61,150,.65); } 50% { box-shadow: 0 0 0 14px rgba(228,61,150,0); } }
          .tour-fade { animation: tour-fade .35s ease both; }
          .tour-in { animation: tour-pop .35s ease both; }
          .tour-draw { stroke-dasharray: 1; animation: tour-draw .7s cubic-bezier(.2,.8,.2,1) .15s both; }
          .tour-head { animation: tour-pop .2s ease .75s both; }
          .tour-pulse { animation: tour-pulse 1.6s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce) {
            .tour-fade, .tour-in, .tour-draw, .tour-head, .tour-pulse { animation: none !important; }
            /* The still version of the pulse, so a click step still looks clickable. */
            .tour-pulse { box-shadow: 0 0 0 4px rgba(228,61,150,.75); }
          }
        `}</style>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${id}-name`}
          aria-describedby={`${id}-step`}
          tabIndex={-1}
          className={`mx-auto flex h-full w-full max-w-6xl flex-col px-3 outline-none sm:px-6 ${short ? "py-2" : "py-3 sm:py-5"}`}
        >
          {/* One live region that never remounts, so each new step is read out;
              it is also the dialog's description, so step one is read on opening. */}
          <div id={`${id}-step`} className="sr-only" aria-live="polite" aria-atomic="true">
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
              aria-valuetext={`Step ${i + 1} of ${STEPS.length}`}
            >
              <div
                className="h-full rounded-full bg-runfree-grad transition-[width] duration-500"
                style={{ width: `${((i + 1) / STEPS.length) * 100}%` }}
              />
            </div>
            <button
              type="button"
              onClick={close}
              className={`${short ? "min-h-[36px]" : "min-h-[40px]"} rounded-lg px-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white`}
            >
              Close
            </button>
          </div>

          {/* The page, with the note on it, beside it, or under it */}
          <div className={`min-h-0 flex-1 ${short ? "py-2" : "py-3"}`}>
            <div ref={areaRef} className="h-full w-full">
              {area && mode === "float" && <div className="flex h-full items-center justify-center">{page}</div>}
              {area && mode === "side" && (
                <div className="flex h-full items-center justify-center" style={{ gap: GAP }}>
                  {page}
                  <div className="flex shrink-0 flex-col overflow-y-auto" style={{ width: sw, height: ph }}>
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
              title="Back (←)"
              aria-keyshortcuts="ArrowLeft"
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
                  {onOpenGuide ? "Open the Guide" : "Done"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-autofocus
                onClick={() => go(1)}
                title="Next (→)"
                aria-keyshortcuts="ArrowRight"
                className="min-h-[44px] rounded-lg bg-runfree-grad px-6 text-sm font-semibold text-white shadow-lg transition hover:opacity-90"
              >
                {step.next ?? "Next"}
              </button>
            )}
          </div>
        </div>
      </div>
    </TapWord.Provider>
  );
}
