/**
 * God Dreams, as reference data.
 *
 * Everything here is transcribed from Will's own handouts rather than
 * paraphrased, because a church has the printed version in front of them and
 * a portal that words it differently is a portal that disagrees with the
 * facilitator.
 *
 * Sources, all under `Clarity Project, The/God Dreams/`:
 *   - Handouts/12_Templates_Overview.pdf                     (the 12, and their 4 groups)
 *   - Handouts/05 Execute/06 Using 3 Types of Foreground Initiatives-f.pdf
 *   - The_Horizon_Storyline_Template.pdf                     (the 1:4:1:4 bands)
 *   - Handouts/04 Focus/01 Background Vision Notes - 3 Years-f.pdf
 *   - Handouts/05 Execute/03 Midground Milestone (One-Year Goal) Examples-f.pdf
 */

/* ------------------------------------------------------ the 12 templates */

export type TemplateGroup = "advance" | "rescue" | "become" | "overflow";

export type VisionTemplate = {
  key: string;
  /** 1-12, as the overview sheet numbers them. */
  number: number;
  name: string;
  group: TemplateGroup;
  /** Verbatim from "12 Templates Definitions". */
  definition: string;
};

export const TEMPLATE_GROUPS: {
  key: TemplateGroup;
  label: string;
  icon: string;
}[] = [
  { key: "advance", label: "Advance", icon: "/brand/god-dreams/templates/group-advance.png" },
  { key: "rescue", label: "Rescue", icon: "/brand/god-dreams/templates/group-rescue.png" },
  { key: "become", label: "Become", icon: "/brand/god-dreams/templates/group-become.png" },
  { key: "overflow", label: "Overflow", icon: "/brand/god-dreams/templates/group-overflow.png" },
];

/**
 * "The 12 Templates are Used for the Beyond-the-Horizon Vision" — which is
 * why a project's chosen templates render on the top band of the storyline
 * and nowhere else.
 */
export const VISION_TEMPLATES: VisionTemplate[] = [
  {
    key: "geographic-saturation",
    number: 1,
    name: "Geographic Saturation",
    group: "advance",
    definition:
      "Your church's vision is to bring the gospel to as many people as possible in your surrounding geography.",
  },
  {
    key: "targeted-transformation",
    number: 2,
    name: "Targeted Transformation",
    group: "advance",
    definition:
      "Your church's vision is to identify a specific people, place, or thing you want to see changed dramatically by the gospel.",
  },
  {
    key: "people-group-penetration",
    number: 3,
    name: "People-Group Penetration",
    group: "advance",
    definition:
      "Your church's vision is taking the gospel to a group of people who don't have it yet.",
  },
  {
    key: "institutional-renovation",
    number: 4,
    name: "Institutional Renovation",
    group: "rescue",
    definition:
      "Your church's vision is to rejuvenate an institution that matters to God, most often a ministry that historically has been significant but has lost a degree of relevance, focus, or momentum.",
  },
  {
    key: "need-adoption",
    number: 5,
    name: "Need Adoption",
    group: "rescue",
    definition:
      "Your church's vision is to adopt a specific need you identify, often through compassion or mercy, typically triggered by studying the needs and then responding to them.",
  },
  {
    key: "crisis-mobilization",
    number: 6,
    name: "Crisis Mobilization",
    group: "rescue",
    definition:
      "Your church's vision is to mobilize for crises, or be prepared to mobilize for a future crisis.",
  },
  {
    key: "spiritual-formation",
    number: 7,
    name: "Spiritual Formation",
    group: "become",
    definition:
      "Your church's vision is for a spiritual formation that changes people and takes them along a significant pathway toward spiritual maturity.",
  },
  {
    key: "presence-manifestation",
    number: 8,
    name: "Presence Manifestation",
    group: "become",
    definition:
      "Your church's vision is to welcome and experience God's presence anticipating ripple effects far beyond the life of your congregation.",
  },
  {
    key: "obedient-anticipation",
    number: 9,
    name: "Obedient Anticipation",
    group: "become",
    definition:
      "Your church's vision is to live in strategic or obedient anticipation of a more clear revelation from God and with the intent to respond as He leads.",
  },
  {
    key: "leadership-multiplication",
    number: 10,
    name: "Leadership Multiplication",
    group: "overflow",
    definition:
      "Your church's vision is to develop more leaders so that God can direct them where he wants them to go.",
  },
  {
    key: "cultural-replication",
    number: 11,
    name: "Cultural Replication",
    group: "overflow",
    definition:
      "Your church's vision is to replicate its model, whether via multisite or other forms, spilling over to many places, new franchises, and new brands of “our” kind of ministry, vision, and brand.",
  },
  {
    key: "anointing-amplification",
    number: 12,
    name: "Anointing Amplification",
    group: "overflow",
    definition:
      "Your church's vision is to do all you can to leverage and amplify the impact of a particular leader, often someone who is a stellar teacher.",
  },
];

export function templateByKey(key: string): VisionTemplate | undefined {
  return VISION_TEMPLATES.find((t) => t.key === key);
}

/**
 * The icon file for a template.
 *
 * Recoloured to RunFree navy at build-prep time — the source art is a warm
 * near-black that resampled muddy and matched neither brand. Andrew: "use
 * some of the images I uploaded to make it more tied to our branding."
 */
export function templateIcon(key: string): string {
  return `/brand/god-dreams/templates/${key}.png`;
}

/* --------------------------------------- the 3 foreground initiative types */

export type InitiativeKind = "cross_functional" | "ministry_subgoal" | "all_staff_driver";

/**
 * Straight off "Using 3 Types of Foreground Initiatives", whose own heading is
 * "How to Involve Everyone, Every Week" — which is exactly the cadence this
 * panel is built for.
 */
export const INITIATIVE_KINDS: {
  key: InitiativeKind;
  label: string;
  steps: string;
  /** Expected step count, used to nudge rather than to enforce. */
  stepRange: [number, number] | null;
  responsibility: string;
  complexity: string;
  review: string;
  blurb: string;
}[] = [
  {
    key: "cross_functional",
    label: "Cross-Functional Emphasis",
    steps: "Many (5–15)",
    stepRange: [5, 15],
    responsibility: "Team",
    complexity: "High",
    review: "Direct report or leadership team",
    blurb: "Cuts across departments. The big one, and the one that needs a real team behind it.",
  },
  {
    key: "ministry_subgoal",
    label: "Ministry Area Subgoal",
    steps: "Some (3–8)",
    stepRange: [3, 8],
    responsibility: "Team or individual",
    complexity: "Variable",
    review: "Direct report or leadership team",
    blurb: "Lives inside one ministry area. Owned there, reported up.",
  },
  {
    key: "all_staff_driver",
    label: "All Staff Driver",
    steps: "One",
    stepRange: [1, 1],
    responsibility: "Individual",
    complexity: "Low",
    review: "Peer to peer in staff meetings",
    blurb: "One step, one person, every week. The whole staff carries one of these.",
  },
];

export function initiativeKind(key: InitiativeKind) {
  return INITIATIVE_KINDS.find((k) => k.key === key) ?? INITIATIVE_KINDS[0];
}

/**
 * How many foreground initiatives of each type a church this size should run,
 * from the second table on the same sheet.
 *
 * Advisory only, and shown rather than enforced — a church knows its own size
 * and this is a conversation starter, not a validation rule.
 */
export const FOREGROUND_MIX: { size: string; mix: InitiativeKind[] }[] = [
  {
    size: "4,000+",
    mix: ["cross_functional", "cross_functional", "cross_functional", "all_staff_driver"],
  },
  {
    size: "1,200–4,000",
    mix: ["cross_functional", "cross_functional", "all_staff_driver", "all_staff_driver"],
  },
  {
    size: "400–1,200",
    mix: ["cross_functional", "all_staff_driver", "ministry_subgoal", "ministry_subgoal"],
  },
  {
    size: "0–400",
    mix: ["all_staff_driver", "ministry_subgoal", "ministry_subgoal", "ministry_subgoal"],
  },
];

/* ------------------------------------------- background vision note columns */

/** The three columns of "Background Vision Notes - 3 years". */
export const BACKGROUND_NOTE_FIELDS: {
  key: "where_we_stand" | "where_were_headed" | "how_well_get_there";
  label: string;
  hint: string;
}[] = [
  {
    key: "where_we_stand",
    label: "Where We Stand",
    hint: "Honestly, today. The starting line nobody gets to argue with later.",
  },
  {
    key: "where_were_headed",
    label: "Where We're Headed",
    hint: "What this looks like in three years if it goes the way you believe it should.",
  },
  {
    key: "how_well_get_there",
    label: "How We'll Get There",
    hint: "The path between the two — the moves, not the wish.",
  },
];

/**
 * The questions the "Assessing Our Midground Milestone" sheet asks before a
 * team commits to a one-year goal. Shown as guidance where the milestone is
 * written, because the sheet is what the room used to choose it.
 */
export const MIDGROUND_TESTS: string[] = [
  "Which milestone gets you personally excited?",
  "Which one sparked an immediate positive response from the vision team?",
  "Which could create the most energy for most of the people in the church?",
  "Does it give an inspiring step of faith without sounding unrealistically absurd?",
  "Will it keep you engaged after the first six months?",
  "Can you see it translating creatively into all of your ministry departments?",
  "Would it give the congregation a deep, abiding sense of accomplishment?",
];
