"use client";

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useFocusTrap } from "@/lib/useFocusTrap";

/**
 * "How to use the guide" — a guided tour of the Digital Facilitator's Guide.
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
 * document already" — so no step numbers, only a progress bar. And later the
 * same day: "each slide has an arrow … make the two sides of the card easier
 * to understand by showing both sides of the same card creatively … an
 * explainer card that shows all kinds of icons like keynote/handout/video".
 *
 * Most steps are one page of the guide with everything but `spots` dimmed, an
 * arrow into the place that matters, and a note beside it; on a `click` step
 * a live hotspot sits over the very thing you would tap in the guide and
 * moves you on exactly as the guide's own link would. Three steps are scenes
 * built from several stills (`layers`): the two sides of one card fanned
 * together, every kind of icon, and a map of the route. Every step has at
 * least one arrow. On the same page the bright spot glides to its next place.
 * The progress bar is four chapters, each a button that jumps to it. A tap on
 * the page away from the spot nudges (the spot on a click step, Next on any
 * other). On an upright phone the last note adds a tip (<OnPhone>). Next,
 * Back, the arrow keys and Escape work throughout; nothing advances on its own.
 *
 * Geometry is in the stills' own units (960 x 720, the guide page at 1.25
 * px/pt), measured from the PDF's link and text boxes on pages 1, 2, 5, 6, 89,
 * 90, 102 and 158 of the September 2026 edition. The stills are guide pages, so
 * they are private: kept in the private deliverable-images bucket
 * (site-assets/guide-tour/), served to certified framers by
 * /api/guide-howto/{name}. A new edition that moves the logo, timer, icons or
 * list needs new stills, new numbers here, and a new STILLS_VERSION so
 * browsers don't pair new numbers with day-old pictures.
 */

type Still =
  | "cover"
  | "menu"
  | "list-dj"
  | "list-kp"
  | "front"
  | "back"
  | "front-kp"
  | "icon-keynote"
  | "icon-handout"
  | "icon-video"
  | "icon-grey";
type Scene = "pair" | "icons" | "map";
type Pt = [number, number];
type Rect = [number, number, number, number]; // x, y, w, h
type Arrow = { from: Pt; c: Pt; to: Pt; /** ms, so a scene's arrows draw one after another */ delay?: number };

/**
 * One still placed in a scene, in page units. `from` (x, y, angle, scale) is where it moves in from, already
 * visible: the front settling from a whole page into a card, the back dealt out from behind it. Without
 * `from`, a layer fades up into place.
 */
type Layer = {
  still: Still;
  x: number;
  y: number;
  w: number;
  h?: number;
  rot?: number;
  z?: number;
  from?: [number, number, number, number?];
  delay?: number;
};
/** A label on a scene, centred on (x, y). */
type Tag = { x: number; y: number; text: string; tone?: "light" | "brand" };

type Step = {
  /** A still for a page of the guide, or a scene name for a composed step. */
  page: Still | Scene;
  /** The first step of a chapter carries its name. */
  chapter?: string;
  title: string;
  body: React.ReactNode;
  /** The places left bright; everything else on the page is dimmed. A scene has none. */
  spots: Rect[];
  arrows: Arrow[];
  layers?: Layer[];
  tags?: Tag[];
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
const STILLS_VERSION = "2026-09-24b";

/** "Tap" on a touch screen, "Click" with a mouse — used inside the notes. */
const TapWord = createContext("Tap");
function Tap() {
  return <>{useContext(TapWord)}</>;
}

/** True on an upright phone, where the real guide's links are small. */
const Upright = createContext(false);
function OnPhone({ children }: { children: React.ReactNode }) {
  return useContext(Upright) ? <>{children}</> : null;
}

// The two sides of 3.9, fanned: the front on top, the back dealt out from behind it.
const PAIR_FRONT: Layer = { still: "front", x: 30, y: 56, w: 450, rot: -3, z: 2, from: [30, 56, 0, 1.12] };
const PAIR_BACK: Layer = { still: "back", x: 470, y: 236, w: 450, rot: 2.5, z: 1, from: [30, 56, -3], delay: 380 };

const STEPS: Step[] = [
  {
    page: "cover",
    chapter: "Find a tool",
    title: "The Digital Facilitator’s Guide",
    body: (
      <>
        The guide you lead every session from. You don’t scroll through its 172 pages: its links take you straight to
        the tool you need. <Tap /> the title to open the menu.
      </>
    ),
    spots: [[180, 540, 600, 105]],
    click: [185, 545, 590, 95],
    hotspot: "The guide’s title: open the menu",
    arrows: [{ from: [480, 250], c: [540, 420], to: [482, 538] }],
    pop: [220, 90, 520],
  },
  {
    page: "menu",
    title: "The menu",
    body: (
      <>
        The six modules of Pivvot Vision Framing, in order. Each opens its own Tool List. <Tap /> module 3,{" "}
        <strong>Disciple’s Journey</strong>.
      </>
    ),
    spots: [[55, 285, 850, 235]],
    click: [366, 295, 82, 212],
    hotspot: "Open Disciple’s Journey",
    arrows: [{ from: [640, 600], c: [470, 610], to: [418, 522] }],
    pop: [490, 522, 450],
  },
  {
    page: "list-dj",
    title: "The Tool List",
    body: (
      <>
        Every tool in this module, in the order you lead them. 3.0 is the{" "}
        <span className="whitespace-nowrap">Pre-work</span> the team does before the session. <em>Deliverables</em>, at
        the bottom, is what the module produces, and what you put together afterwards.
      </>
    ),
    spots: [[180, 238, 460, 408]],
    arrows: [
      { from: [670, 300], c: [520, 236], to: [336, 258] },
      { from: [720, 452], c: [700, 700], to: [392, 628], delay: 250 },
    ],
    pop: [660, 250, 280],
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
    arrows: [{ from: [790, 390], c: [790, 500], to: [616, 496] }],
    pop: [660, 250, 280],
  },
  {
    page: "front",
    chapter: "The front",
    title: "The front of the card",
    body: (
      <>
        You’ve opened 3.9. Almost every tool is two pages, like the two sides of a card. This is the front: the side
        with the <strong>dark blue header</strong>.
      </>
    ),
    spots: [[0, 0, 960, 122]],
    arrows: [{ from: [160, 244], c: [118, 190], to: [150, 130] }],
    pop: [18, 232, 262],
  },
  {
    page: "front",
    title: "Number and timer",
    body: <>3.9 is tool 9 of module 3, the same number as on the Tool List. The timer is roughly how many minutes the tool takes in the room.</>,
    spots: [
      [32, 22, 80, 82],
      [764, 26, 70, 70],
    ],
    arrows: [
      { from: [320, 230], c: [110, 230], to: [72, 110] },
      { from: [640, 230], c: [810, 230], to: [800, 102], delay: 200 },
    ],
    pop: [300, 190, 360],
  },
  {
    page: "front",
    title: "What the room sees",
    body: (
      <>
        What you’ll put in front of the team: the flip chart you draw, the handout you give out or the visual you show.
        It’s often shown filled in, as an example.
      </>
    ),
    spots: [[288, 143, 378, 484]],
    arrows: [{ from: [724, 412], c: [724, 304], to: [674, 282] }],
    pop: [684, 400, 262],
    next: "Turn the card over",
  },
  {
    page: "pair",
    chapter: "The back",
    title: "Two sides of one card",
    body: (
      <>
        Here are both sides of 3.9. The <strong>front</strong> is what the room sees. The <strong>back</strong> is for
        you, and it’s the very next page: no link takes you there, so scroll down one page.
      </>
    ),
    spots: [],
    layers: [PAIR_FRONT, PAIR_BACK],
    tags: [
      { x: 170, y: 32, text: "Front · for the room", tone: "light" },
      { x: 790, y: 606, text: "Back · for you", tone: "brand" },
    ],
    arrows: [{ from: [496, 70], c: [640, 40], to: [650, 236], delay: 450 }],
    pop: [30, 432, 330],
  },
  {
    page: "back",
    title: "The back of the card",
    body: (
      <>
        The <strong>light header</strong> tells you you’re on the back: how to lead the tool. One more page down is the
        next tool, 3.10, because the guide runs in Tool List order.
      </>
    ),
    spots: [[0, 0, 960, 120]],
    arrows: [{ from: [480, 252], c: [462, 190], to: [480, 128] }],
    pop: [300, 240, 360],
  },
  {
    page: "back",
    title: "Big Idea",
    body: <>What this tool is for: what you’re setting out to do with the team. Some cards add background or a Scripture to reflect on.</>,
    spots: [[34, 202, 282, 418]],
    arrows: [{ from: [460, 330], c: [360, 290], to: [322, 266] }],
    pop: [400, 300, 300],
  },
  {
    page: "back",
    title: "How It Works",
    body: <>The steps for leading it, in order.</>,
    spots: [[332, 202, 296, 418]],
    arrows: [{ from: [692, 432], c: [662, 340], to: [634, 300] }],
    pop: [662, 420, 282],
  },
  {
    page: "back",
    title: "Coaching Tips",
    body: <>Advice for leading it well. Some cards give you a Power Phrase to use in the room.</>,
    spots: [[650, 202, 290, 418]],
    arrows: [{ from: [568, 432], c: [608, 330], to: [644, 300] }],
    pop: [300, 420, 300],
  },
  {
    page: "back",
    title: "Module and phrase",
    body: (
      <>
        The module this tool belongs to, <em>Disciple’s Journey</em>, and its phrase, <em>Build a Training Center</em>.
        It’s at the foot of both sides, so you always know where you are.
      </>
    ),
    spots: [[260, 656, 512, 52]],
    arrows: [{ from: [480, 350], c: [460, 560], to: [480, 652] }],
    pop: [240, 260, 480],
  },
  {
    page: "back",
    title: "The icons",
    body: (
      <>
        What goes with this tool. A <strong>dark blue</strong> icon opens it in the portal; a <strong>faded</strong>{" "}
        one means there isn’t one. 3.9 has a handout, but no video.
      </>
    ),
    spots: [[801, 140, 126, 66]],
    arrows: [{ from: [600, 190], c: [700, 168], to: [797, 176] }],
    pop: [330, 140, 300],
  },
  {
    page: "icons",
    title: "Every kind of icon",
    body: (
      <>
        A <strong>podium</strong> opens keynote slides to present; only a few Horizon Storyline cards have them. A{" "}
        <strong>sheet</strong> opens a handout for the team, and some tools have several. A <strong>camera</strong>{" "}
        opens a video on leading the tool.
      </>
    ),
    spots: [],
    layers: [
      { still: "icon-keynote", x: 75, y: 200, w: 150, h: 150, delay: 0 },
      { still: "icon-handout", x: 295, y: 200, w: 150, h: 150, delay: 110 },
      { still: "icon-video", x: 515, y: 200, w: 150, h: 150, delay: 220 },
      { still: "icon-grey", x: 735, y: 200, w: 150, h: 150, delay: 330 },
    ],
    tags: [
      { x: 150, y: 168, text: "Keynote", tone: "light" },
      { x: 370, y: 168, text: "Handout", tone: "light" },
      { x: 590, y: 168, text: "Video", tone: "light" },
      { x: 810, y: 168, text: "Faded = none", tone: "light" },
    ],
    arrows: [{ from: [300, 484], c: [170, 470], to: [150, 364], delay: 500 }],
    pop: [230, 470, 500],
  },
  {
    page: "back",
    chapter: "Getting around",
    title: "Back up a level",
    body: (
      <>
        <Tap /> the logo in the top-right corner to go back to this module’s Tool List. Use it rather than your
        browser’s Back button, which closes the guide.
      </>
    ),
    spots: [[849, 24, 78, 78]],
    click: [859, 34, 58, 58],
    hotspot: "The top-right logo: back to the Tool List",
    arrows: [{ from: [650, 172], c: [720, 160], to: [856, 104] }],
    pop: [350, 150, 340],
  },
  {
    page: "list-dj",
    title: "Title slide",
    body: <>Back on the Tool List. The module’s name and icon open its title slide: a clean page to show the room as the module begins.</>,
    spots: [
      [42, 162, 91, 91],
      [183, 162, 493, 62],
    ],
    arrows: [{ from: [760, 340], c: [790, 215], to: [686, 193] }],
    pop: [640, 330, 290],
  },
  {
    page: "list-dj",
    title: "And up again",
    body: <>On a Tool List, the same top-right logo goes back to the menu. The RunFree logo on the left isn’t a link.</>,
    spots: [[849, 24, 78, 78]],
    click: [859, 34, 58, 58],
    hotspot: "The top-right logo: back to the menu",
    arrows: [{ from: [800, 270], c: [870, 230], to: [882, 108] }],
    pop: [660, 270, 280],
  },
  {
    page: "menu",
    title: "Now you try",
    body: (
      <>
        Open module 4, <strong>Kingdom Platform</strong>.
      </>
    ),
    spots: [[504, 290, 93, 222]],
    click: [509, 295, 83, 212],
    hotspot: "Open Kingdom Platform",
    arrows: [{ from: [420, 630], c: [560, 650], to: [552, 524] }],
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
    arrows: [{ from: [640, 266], c: [520, 266], to: [420, 290] }],
    pop: [620, 240, 300],
  },
  {
    page: "map",
    title: "That’s the whole guide",
    body: (
      <>
        You found 4.1. <strong>Menu → Tool List → tool</strong>, and the top-right logo to go back up one level. Every
        tool works like 3.9, so you never need to scroll through 172 pages.
        <OnPhone> On a phone, turn it sideways before you open the guide: held upright, its links are small.</OnPhone>
      </>
    ),
    spots: [],
    layers: [
      { still: "menu", x: 40, y: 220, w: 260, rot: -2, delay: 0 },
      { still: "list-kp", x: 350, y: 210, w: 260, rot: 1, delay: 120 },
      { still: "front-kp", x: 660, y: 220, w: 260, rot: 2, delay: 240 },
    ],
    tags: [
      { x: 170, y: 446, text: "Menu", tone: "light" },
      { x: 480, y: 436, text: "Tool List", tone: "light" },
      { x: 790, y: 446, text: "Tool", tone: "light" },
      { x: 480, y: 560, text: "The logo: one level up", tone: "brand" },
    ],
    arrows: [
      { from: [250, 214], c: [330, 140], to: [392, 204], delay: 350 },
      { from: [560, 206], c: [640, 140], to: [702, 212], delay: 550 },
      { from: [736, 480], c: [650, 546], to: [560, 470], delay: 800 },
      { from: [430, 476], c: [340, 546], to: [250, 470], delay: 1000 },
    ],
    pop: [200, 12, 560],
  },
];

/** Chapters of the progress bar: where each starts, taken from STEPS so they cannot drift. */
const CHAPTERS = STEPS.flatMap((s, k) => (s.chapter ? [{ name: s.chapter, from: k }] : [])).map((c, k, all) => ({
  ...c,
  to: k + 1 < all.length ? all[k + 1].from : STEPS.length,
}));

const STILLS: Still[] = [
  "cover",
  "menu",
  "list-dj",
  "list-kp",
  "front",
  "back",
  "front-kp",
  "icon-keynote",
  "icon-handout",
  "icon-video",
  "icon-grey",
];

/** What each picture is, for a screen reader (the note says what the step is about). */
const ALT: Record<Still | Scene, string> = {
  cover: "The guide’s cover",
  menu: "The guide’s menu",
  "list-dj": "The Disciple’s Journey Tool List",
  "list-kp": "The Kingdom Platform Tool List",
  front: "The front of tool 3.9",
  back: "The back of tool 3.9",
  "front-kp": "The front of tool 4.1",
  "icon-keynote": "The keynote icon",
  "icon-handout": "The handout icon",
  "icon-video": "The video icon",
  "icon-grey": "A faded icon",
  pair: "The front and back of tool 3.9, the back fanned out from behind the front",
  icons: "The four kinds of icon: keynote, handout, video, and a faded one",
  map: "The route: the menu, a Tool List and a tool, with arrows back from the tool to its Tool List and on to the menu",
};

const stillsOf = (s: Step): Still[] => (s.layers ? s.layers.map((l) => l.still) : [s.page as Still]);

/** Blob URLs for the stills, kept for the life of the page so a second tour opens instantly. */
const stillCache: Partial<Record<Still, string>> = {};
const inflight: Partial<Record<Still, Promise<string>>> = {};

function loadStill(p: Still, token: string): Promise<string> {
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
 * Fetch the stills before anyone presses "How to use the guide", so the tour opens on
 * the guide's cover rather than "Loading…". Joins any fetch already under way;
 * the tour's own effect retries anything that failed.
 */
export async function prefetchGuideStills(): Promise<void> {
  if (STILLS.every((p) => stillCache[p])) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;
  await Promise.allSettled(STILLS.map((p) => loadStill(p, session.access_token)));
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
function useGlide(spots: Rect[], page: string, reduced: boolean): Rect[] {
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

function arrowGeometry({ from, c, to }: Arrow) {
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
  const [stills, setStills] = useState<Partial<Record<Still, string>>>(() => ({ ...stillCache }));
  const [failed, setFailed] = useState<Set<Still>>(() => new Set());
  const [reduced, setReduced] = useState(false);
  // Read at first render, not in an effect, so a phone never flashes "Click".
  const [coarse, setCoarse] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
  );
  const [area, setArea] = useState<{ w: number; h: number; short: boolean; upright: boolean } | null>(null);
  // A tap on the page that missed the spot on a click step: the spot and the hint answer.
  const [nudge, setNudge] = useState(false);
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

  useEffect(() => setNudge(false), [i]);
  useEffect(() => {
    if (!nudge) return;
    const t = window.setTimeout(() => setNudge(false), 1300);
    return () => window.clearTimeout(t);
  }, [nudge]);

  useEffect(() => {
    if (!open) return;
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
  }, [open]);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!open || !el) return;
    const measure = () =>
      setArea({
        w: el.clientWidth,
        h: el.clientHeight,
        short: window.innerHeight < 500,
        // Portrait and phone-sized: a small phone held sideways (under 768 px) is not "upright".
        upright: window.matchMedia("(pointer: coarse) and (orientation: portrait) and (max-width: 700px)").matches,
      });
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
    if (STILLS.every((p) => stillCache[p])) return;
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        if (!cancelled) setFailed(new Set(STILLS));
        return;
      }
      await Promise.all(
        STILLS.map((p) =>
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

  const need = stillsOf(step);
  const ready = need.every((p) => stills[p]);
  const broken = need.some((p) => failed.has(p));
  const scene = Boolean(step.layers);
  const shade = `M0 0H${W}V${H}H0Z ` + spots.map((s) => roundRect(s)).join(" ");
  const fade = reduced ? undefined : "tour-fade";
  const fadeIn = reduced ? undefined : "tour-in";
  const { mode, pw, sw } = area ? layoutFor(area.w, area.h) : { mode: "float" as const, pw: 0, sw: 0 };
  const ph = (pw * H) / W;
  const short = area?.short ?? false;
  const chapter = CHAPTERS.findIndex((c) => i >= c.from && i < c.to);
  // On a step with nothing to tap on the page, a tap there points at the way on instead.
  const nextNudge = nudge && !step.click && !reduced ? " tour-nudge" : "";
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
        <p className={`mt-2 text-xs font-semibold text-runfree-magentaDeep ${nudge && !reduced ? "tour-hint" : ""}`}>
          <Tap /> the highlighted spot, or press Next.
        </p>
      )}
    </div>
  );

  const page = (
    <div
      className="relative shrink-0"
      style={{ width: pw, height: ph }}
      onClick={(e) => {
        // A tap on the page that isn't the spot: on a click step the spot and the hint answer, on any
        // other step the Next button does. The second click of a double-click is not a miss.
        if (e.detail < 2 && !(e.target as HTMLElement).closest("button, [data-note]")) setNudge(true);
      }}
    >
      {scene ? (
        <div key={`scene-${step.page}`} className="absolute inset-0 rounded-xl bg-white/[0.06] ring-1 ring-white/10" role="img" aria-label={ALT[step.page]}>
          {ready &&
            step.layers!.map((l, k) => {
              const h = l.h ?? (l.w * H) / W;
              const style: React.CSSProperties & Record<string, string | number> = {
                left: pct(l.x, W),
                top: pct(l.y, H),
                width: pct(l.w, W),
                height: pct(h, H),
                zIndex: l.z ?? 1,
                transform: `rotate(${l.rot ?? 0}deg)`,
                "--r1": `${l.rot ?? 0}deg`,
                "--r0": `${l.from ? l.from[2] : l.rot ?? 0}deg`,
                "--dx": l.from ? `${((l.from[0] - l.x) / l.w) * 100}%` : "0%",
                "--dy": l.from ? `${((l.from[1] - l.y) / h) * 100}%` : "6%",
                "--s0": l.from?.[3] ?? 1,
                "--o0": l.from ? 1 : 0,
                animationDelay: `${l.delay ?? 0}ms`,
              };
              return (
                <div
                  key={k}
                  className={`absolute overflow-hidden rounded-lg bg-white shadow-[0_12px_40px_rgba(0,0,0,.45)] ring-1 ring-black/10 ${reduced ? "" : "tour-deal"}`}
                  style={style}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL of a private still */}
                  <img src={stills[l.still]} alt="" className="block h-full w-full object-cover" />
                </div>
              );
            })}
          {ready &&
            step.tags?.map((t, k) => (
              <span
                key={`t${k}`}
                className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full font-bold uppercase shadow-lg ${
                  pw < 520 ? "px-1.5 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px] tracking-wide sm:text-xs"
                } ${
                  t.tone === "brand" ? "bg-runfree-grad text-white" : "bg-white text-runfree-ink"
                } ${fadeIn ?? ""}`}
                style={{ left: pct(t.x, W), top: pct(t.y, H), animationDelay: "300ms" }}
              >
                {t.text}
              </span>
            ))}
        </div>
      ) : (
        <div className="absolute inset-0 overflow-hidden rounded-xl bg-white/10 shadow-2xl ring-1 ring-white/15">
          {ready && (
            // eslint-disable-next-line @next/next/no-img-element -- a blob URL of a private still
            <img key={step.page} src={stills[step.page as Still]} alt={ALT[step.page]} className={`block h-full w-full ${fadeIn ?? ""}`} />
          )}
        </div>
      )}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/70">
          {broken ? "Couldn’t load this page of the guide. Close and try again." : "Loading…"}
        </div>
      )}
      {ready && (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible"
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
          {/* Keyed by page: it fades in with a new page, and stays put (the spot gliding) on the same one. A scene is not dimmed. */}
          {!scene && (
            <g key={`shade-${step.page}`} className={fadeIn}>
              <path d={shade} fillRule="evenodd" fill="#0F1438" fillOpacity={0.66} clipPath={`url(#c${id})`} />
              {spots.map((s, k) => (
                <path key={k} d={roundRect(s)} fill="none" stroke="#fff" strokeWidth="4" />
              ))}
            </g>
          )}
          {step.arrows.map((a, k) => {
            const g = arrowGeometry(a);
            const d = a.delay ?? 0;
            const draw = reduced ? undefined : { animationDelay: `${150 + d}ms` };
            const head = reduced ? undefined : { animationDelay: `${750 + d}ms` };
            return (
              <g key={`arrow-${i}-${k}`}>
                <path d={g.path} pathLength={1} fill="none" stroke="#fff" strokeWidth="26" strokeLinecap="round" className={reduced ? undefined : "tour-draw"} style={draw} />
                <path d={g.path} pathLength={1} fill="none" stroke={`url(#g${id})`} strokeWidth="15" strokeLinecap="round" className={reduced ? undefined : "tour-draw"} style={draw} />
                <path d={g.head} fill="#F15A25" stroke="#fff" strokeWidth="7" strokeLinejoin="round" className={reduced ? undefined : "tour-head"} style={head} />
              </g>
            );
          })}
        </svg>
      )}
      {ready && hb && (
        <button
          type="button"
          onClick={(e) => {
            // The second click of a double-click lands on the next step. Harmless today, but it would skip a step if two hotspots ever shared a place.
            if (e.detail > 1) return;
            go(1);
          }}
          aria-label={step.hotspot ?? step.title}
          data-hotspot
          className="group absolute z-30 rounded-lg outline-none"
          style={{ left: hb.left, top: hb.top, width: hb.width, height: hb.height }}
        >
          <span
            className={`${nudge && !reduced ? "tour-nudge" : "tour-pulse"} pointer-events-none absolute rounded-lg group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-[6px] group-focus-visible:outline-runfree-magenta`}
            style={{ inset: `${hb.ey}px ${hb.ex}px` }}
          />
        </button>
      )}
      {mode === "float" && (
        <div
          data-note
          className="absolute z-40"
          style={{ left: pct(step.pop[0], W), top: pct(step.pop[1], H), width: pct(step.pop[2], W) }}
        >
          {note}
        </div>
      )}
    </div>
  );

  return (
    <TapWord.Provider value={coarse ? "Tap" : "Click"}>
      <Upright.Provider value={area?.upright ?? false}>
      <div className="fixed inset-0 z-50 flex flex-col bg-runfree-ink/95 backdrop-blur-md">
        <style>{`
          @keyframes tour-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
          @keyframes tour-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
          @keyframes tour-pop { from { opacity: 0; } to { opacity: 1; } }
          @keyframes tour-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(228,61,150,.65); } 50% { box-shadow: 0 0 0 14px rgba(228,61,150,0); } }
          @keyframes tour-nudge { 0% { box-shadow: 0 0 0 0 rgba(228,61,150,.95); } 100% { box-shadow: 0 0 0 30px rgba(228,61,150,0); } }
          @keyframes tour-hint { 0%, 100% { transform: none; } 20%, 60% { transform: translateX(-4px); } 40%, 80% { transform: translateX(4px); } }
          @keyframes tour-deal { from { transform: translate(var(--dx), var(--dy)) rotate(var(--r0)) scale(var(--s0)); opacity: var(--o0); } to { transform: rotate(var(--r1)); opacity: 1; } }
          .tour-fade { animation: tour-fade .35s ease both; }
          .tour-in { animation: tour-pop .35s ease both; }
          .tour-draw { stroke-dasharray: 1; animation: tour-draw .7s cubic-bezier(.2,.8,.2,1) .15s both; }
          .tour-head { animation: tour-pop .2s ease .75s both; }
          .tour-pulse { animation: tour-pulse 1.6s ease-in-out infinite; }
          .tour-nudge { animation: tour-nudge .65s ease-out 2; }
          .tour-hint { display: inline-block; animation: tour-hint .5s ease; }
          .tour-deal { animation: tour-deal .7s cubic-bezier(.2,.8,.2,1) both; }
          @media (prefers-reduced-motion: reduce) {
            .tour-fade, .tour-in, .tour-draw, .tour-head, .tour-pulse, .tour-nudge, .tour-hint, .tour-deal { animation: none !important; }
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
          <div
            className="sr-only"
            role="progressbar"
            aria-label="Tour progress"
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-valuenow={i + 1}
            aria-valuetext={`Step ${i + 1} of ${STEPS.length}${chapter >= 0 ? `: ${CHAPTERS[chapter].name}` : ""}`}
          />

          {/* Top: title, chapters (each jumps to its first step), close */}
          <div className="flex shrink-0 items-center gap-3 text-white sm:gap-4">
            <p id={`${id}-name`} className="hidden font-display text-base font-bold tracking-wide sm:block">
              How to use the guide
            </p>
            <p className="font-display text-sm font-bold tracking-wide sm:hidden" aria-hidden="true">
              {chapter >= 0 ? CHAPTERS[chapter].name : "How to use the guide"}
            </p>
            <div className="flex min-w-0 flex-1 items-start gap-1.5" role="group" aria-label="Chapters">
              {CHAPTERS.map((c, k) => {
                const done = Math.max(0, Math.min(1, (i - c.from + 1) / (c.to - c.from)));
                const here = k === chapter;
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setI(c.from)}
                    aria-label={`Go to: ${c.name}`}
                    aria-current={here ? "step" : undefined}
                    title={c.name}
                    className="group min-w-0 rounded py-[19px] text-left outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-runfree-magenta sm:py-1"
                    style={{ flexGrow: c.to - c.from, flexBasis: 0 }}
                  >
                    <span className="block h-1.5 overflow-hidden rounded-full bg-white/15 transition group-hover:bg-white/25">
                      <span
                        className="block h-full rounded-full bg-runfree-grad transition-[width] duration-500"
                        style={{ width: `${done * 100}%` }}
                      />
                    </span>
                    <span
                      className={`mt-1.5 hidden truncate text-[11px] font-semibold tracking-wide sm:block ${
                        here ? "text-white" : "text-white/45 group-hover:text-white/80"
                      }`}
                    >
                      {c.name}
                    </span>
                  </button>
                );
              })}
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
                  className={`min-h-[44px] rounded-lg bg-runfree-grad px-6 text-sm font-semibold text-white shadow-lg transition hover:opacity-90${nextNudge}`}
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
                className={`min-h-[44px] rounded-lg bg-runfree-grad px-6 text-sm font-semibold text-white shadow-lg transition hover:opacity-90${nextNudge}`}
              >
                {step.next ?? "Next"}
              </button>
            )}
          </div>
        </div>
      </div>
      </Upright.Provider>
    </TapWord.Provider>
  );
}
