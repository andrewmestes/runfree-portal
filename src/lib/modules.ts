/**
 * The six Pivvot tools, as a client meets them.
 *
 * Stage labels and mantras are copied verbatim from the Certified Vision
 * Framers portal (`src/lib/modules.ts` there) and the co::Lab landing page —
 * a church team and the person facilitating them should hear the process
 * described in exactly the same words, or it reads as two different products.
 */

export type ModuleMeta = {
  stage: string;
  mantra: string;
};

export const MODULE_META: Record<number, ModuleMeta> = {
  1: { stage: "Module 1 · Problem", mantra: "Move the Finish Line!" },
  2: { stage: "Module 2 · Potential", mantra: "Become a Hero-Maker!" },
  3: { stage: "Module 3 · Pathway", mantra: "Build a Training Center!" },
  4: { stage: "Module 4 · People", mantra: "Empower Each One!" },
  5: { stage: "Module 5 · Portal", mantra: "Design the Culture!" },
  6: { stage: "Module 6 · Picture", mantra: "Create the Future!" },
};

/**
 * Sections that are the process itself, as opposed to the scaffolding around
 * it. Seeded from Asana as "Mod #1 FUNNEL FUSION" … "Mod #6 HORIZON
 * STORYLINE" (see supabase/seed.sql).
 *
 * Returns null for everything else — FUTURE TEAM INFO, CHURCH PREPARATION,
 * SESSION RECORDINGS, PROCESS OVERVIEW — which the project page surfaces in
 * its own right rather than hiding behind a module icon. It also returns null
 * for every Younique section ("Day 1 - Section #1"), which is the intended
 * behaviour: that vertical has no six-tool arc, so the page falls back to a
 * plain section list instead of showing six icons that mean nothing there.
 */
export function moduleOrder(section: string): number | null {
  const match = /^\s*Mod\s*#\s*(\d+)/i.exec(section);
  if (!match) return null;
  const order = Number(match[1]);
  return order >= 1 && order <= 6 ? order : null;
}

/** "Mod #2 CROWD CLOUD" -> "Crowd Cloud" */
export function moduleLabel(section: string): string {
  // Younique's day sections come out of Asana as "Day 1 - Section #1"; the
  // client reads "Day 1 · Section 1".
  const day = /^\s*Day\s*(\d+)\s*[-–—]?\s*Section\s*#?\s*(\d+)\s*$/i.exec(section);
  if (day) return `Day ${day[1]} · Section ${day[2]}`;
  const stripped = section.replace(/^\s*Mod\s*#\s*\d+\s*/i, "").trim();
  if (!stripped) return section;
  // Only re-case sections that are SHOUTED, which is how the Pivvot sections
  // come out of Asana. Anything already mixed-case was authored that way and
  // is left exactly alone — running the Younique section "Life-Making Cycle
  // Resources" through the lowercase-then-recapitalise path produced
  // "Life-making Cycle Resources", because word boundaries here are
  // whitespace only. (They have to be: including the apostrophe turns
  // "DISCIPLE'S JOURNEY" into "Disciple'S Journey".)
  const isShouted = stripped === stripped.toUpperCase() && /[A-Z]/.test(stripped);
  if (!isShouted) return stripped;

  return stripped
    .toLowerCase()
    .replace(/(^|\s)([a-z])/g, (_, lead, letter) => `${lead}${letter.toUpperCase()}`);
}

/* Ported from the CVF portal during the merge. */

/** True for the six numbered process modules, false for the extra folders. */
export function isProcessModule(order: number): boolean {
  return order >= 1 && order <= 6;
}

/** "2 - Crowd Cloud" -> "Crowd Cloud" */
export function stripModuleNumber(name: string): string {
  return name.replace(/^\s*\d+\s*-\s*/, "");
}
