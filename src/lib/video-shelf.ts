import { stripModuleNumber } from "./modules";

/**
 * Which Training Videos tab a Drive walkthrough is on. /videos draws its two
 * shelves by these rules and /open/video's back link names a tab by them, so
 * they live here once. Written twice, they drifted: the full-screen page
 * sent the guide's Ted Talk and its two Crowd Cloud movie clips to
 * Facilitator Training, where /videos does not list any of them.
 * Client-safe — no server-only imports.
 */

export type Shelf = "clients" | "facilitators";

/**
 * The unnumbered "Video Clips" folder holds the films the guide's text links
 * to — the movie clips, the Carey Nieuwhof interview — which a facilitator
 * plays for the room. Andrew, 22 Sept: "the linked movie clips or carey
 * nieuhoeff video, the ones that were linked in the text of the digital
 * facilitator's guide. those are also client facing videos." So that folder
 * is a client shelf; every numbered module folder trains the facilitator.
 */
export const isClipsFolder = (g: { name: string; order: number }) =>
  g.order === Number.MAX_SAFE_INTEGER && /clip/i.test(g.name);

/**
 * "0 - Intro" holds the same films as the Orientation shelf, so /videos
 * folds it into Client Videos (foldIntroIntoOrientation) rather than
 * showing it under Facilitator Training.
 */
export const isIntroFolder = (name: string) => /^intro$/i.test(stripModuleNumber(name));

export const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Three of the clips also sit inside the Crowd Cloud folder, two under the
 * same name and the Carey Nieuwhof interview without "with Carey Nieuwhof"
 * (same film, 1319.6 s both). A module copy whose normalised title equals a
 * clip's, or is the start of one, is that clip; /videos drops it and lets
 * the Video Clips copy stand for it.
 */
export function isClipTwin(title: string, clipTitles: string[]): boolean {
  const t = normTitle(title);
  return clipTitles.some((raw) => {
    const c = normTitle(raw);
    return c === t || c.startsWith(`${t} `);
  });
}

/** The shelf's title for a walkthrough: "1.2 3 Kinds of Change", as /videos writes it. */
export const shelfTitle = (v: { num: string | null; label: string }) => (v.num ? `${v.num} ${v.label}` : v.label);

/**
 * The tab one walkthrough is on, or null when that cannot be told without
 * the Video Clips titles (`clips` null): an unnumbered film in a module
 * folder may be one of the clips. A numbered one never is.
 */
export function toolVideoShelf(
  v: { group: string; groupOrder: number; num: string | null; label: string },
  clips: { num: string | null; label: string }[] | null
): Shelf | null {
  if (isClipsFolder({ name: v.group, order: v.groupOrder })) return "clients";
  if (isIntroFolder(v.group)) return "clients";
  if (clips) return isClipTwin(shelfTitle(v), clips.map(shelfTitle)) ? "clients" : "facilitators";
  return v.num ? "facilitators" : null;
}
