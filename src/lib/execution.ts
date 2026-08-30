import { createUserClient } from "./supabase";

/**
 * The Horizon Storyline, after the engagement ends.
 *
 * Andrew: "I would love to have an ongoing section that is built out from the
 * God Dreams (horizon storyline) perspective that helps integrate meeting
 * activity for a church as they pursue their initiatives and goals."
 *
 * Three objects, and each one is a sheet Will's team already hands a church:
 *
 * 1. **Initiative** — the Foreground Initiative Plan Template. Six blocks:
 *    INITIATIVE, OBJECTIVE, KEY DELIVERABLES, PLAN OF ACTION, TIMELINE, COSTS.
 * 2. **Step** — a row of the Action Step List, with Today's Status as a
 *    red-amber-green light, a "By", a cost and who is accountable.
 * 3. **Metric** — a row of the Church Ministry Dashboard, under either
 *    Strategy (Input) or Measures (Output).
 *
 * And one derived thing — `renewalCycle()` — which is the Horizon Storyline
 * Renewal Cycle handout turned into dates.
 *
 * Andrew's constraint on all of it: "We want to stay away from too much 4dx
 * overlap other than keeping the foundational principles in play." So there is
 * no WIG, no lead-measure/lag-measure split, no commitment count and no
 * percentage complete. The foundational principles are still what the shape
 * enforces — a small number of initiatives, a visible scoreboard, a named
 * person against every step, and a fixed rhythm of accountability — but they
 * are enforced in Will's vocabulary, on Will's sheets.
 */

export type RagStatus = "red" | "amber" | "green";
export type MetricTrend = "up" | "flat" | "down";
export type ScoreboardGroup = "strategy_input" | "measure_output";

export type Initiative = {
  id: string;
  project_id: string;
  name: string;
  initiative: string | null;
  objective: string | null;
  key_deliverables: string | null;
  plan_of_action: string | null;
  timeline: string | null;
  costs: string | null;
  leader: string | null;
  team: string | null;
  start_date: string | null;
  last_review_on: string | null;
  next_review_on: string | null;
  status: RagStatus;
  is_complete: boolean;
  position: number;
  created_at: string;
};

export type InitiativeStep = {
  id: string;
  initiative_id: string;
  project_id: string;
  description: string;
  status: RagStatus;
  by_when: string | null;
  cost: string | null;
  accountable: string | null;
  position: number;
  created_at: string;
};

export type ScoreboardMetric = {
  id: string;
  project_id: string;
  grouping: ScoreboardGroup;
  label: string;
  prior_year: string | null;
  current: string | null;
  next_year: string | null;
  trend: MetricTrend | null;
  status: RagStatus | null;
  position: number;
};

export type HorizonBand = "beyond" | "background" | "midground";

export type HorizonBox = {
  id: string;
  project_id: string;
  horizon: HorizonBand;
  body: string | null;
  position: number;
  updated_at: string;
};

export type ExecutionData = {
  initiatives: Initiative[];
  steps: InitiativeStep[];
  metrics: ScoreboardMetric[];
  horizon: HorizonBox[];
};

/**
 * The Horizon Storyline Template, top to bottom, as it prints.
 *
 * `boxes` is how many the sheet gives you. Four for the Background Vision and
 * four for the Foreground is not an arbitrary limit — it is the discipline the
 * method is for. A church that can name nine three-year priorities has not
 * finished choosing.
 */
export const HORIZONS: {
  key: HorizonBand;
  label: string;
  span: string;
  boxes: number;
  prompt: string;
}[] = [
  {
    key: "beyond",
    label: "Beyond the Horizon",
    span: "5–20 years",
    boxes: 1,
    prompt:
      "The long-range dream. What would people say about this church a generation from now?",
  },
  {
    key: "background",
    label: "Background Vision",
    span: "3 years",
    boxes: 4,
    prompt: "The handful of things that must be true in three years.",
  },
  {
    key: "midground",
    label: "Midground Milestone",
    span: "1 year",
    boxes: 1,
    prompt: "The one marker that says this year counted.",
  },
];

/**
 * The six blocks of the plan, in the order they print.
 *
 * `hint` is the template's own guidance where it gives any, and otherwise a
 * plain description of what belongs in the box. `short` is what fits above a
 * field on a phone.
 */
export const PLAN_FIELDS: {
  key: "initiative" | "objective" | "key_deliverables" | "plan_of_action" | "timeline" | "costs";
  label: string;
  hint: string;
}[] = [
  {
    key: "initiative",
    label: "Initiative",
    hint: "The one sentence a leader would use to describe this to the congregation.",
  },
  {
    key: "objective",
    label: "Objective",
    hint: "What is different in 90 days if this works.",
  },
  {
    key: "key_deliverables",
    label: "Key Deliverables",
    hint: "The things that will exist when this is done — a document, a hire, an event, a launched group.",
  },
  {
    key: "plan_of_action",
    label: "Plan of Action",
    hint: "How the team intends to get there. The action steps below are the detail; this is the approach.",
  },
  { key: "timeline", label: "Timeline", hint: "The dates that matter, in the team's own words." },
  { key: "costs", label: "Costs", hint: "Money, staff time, or both. “$0” is an answer." },
];

export const RAG_LABEL: Record<RagStatus, string> = {
  green: "On track",
  amber: "At risk",
  red: "Not started or stuck",
};

/**
 * The traffic light, as colour.
 *
 * `amber` rather than `yellow` in the type, but the dot is drawn in amber
 * because a yellow circle on white is close to invisible — the printed sheet
 * gets to use a black outline and the screen does not.
 */
export const RAG_DOT: Record<RagStatus, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
};

export const RAG_RING: Record<RagStatus, string> = {
  green: "ring-emerald-200 bg-emerald-50 text-emerald-800",
  amber: "ring-amber-200 bg-amber-50 text-amber-900",
  red: "ring-rose-200 bg-rose-50 text-rose-800",
};

/* ---------------------------------------------------------------- reading */

export async function getExecutionData(
  accessToken: string,
  projectId: string
): Promise<ExecutionData> {
  const client = createUserClient(accessToken);
  const [inits, steps, metrics, horizon] = await Promise.all([
    client.from("initiatives").select("*").eq("project_id", projectId).order("position"),
    client.from("initiative_steps").select("*").eq("project_id", projectId).order("position"),
    client.from("scoreboard_metrics").select("*").eq("project_id", projectId).order("position"),
    client.from("horizon_storyline").select("*").eq("project_id", projectId).order("position"),
  ]);
  if (inits.error) throw inits.error;
  if (steps.error) throw steps.error;
  if (metrics.error) throw metrics.error;
  if (horizon.error) throw horizon.error;
  return {
    initiatives: (inits.data ?? []) as Initiative[],
    steps: (steps.data ?? []) as InitiativeStep[],
    metrics: (metrics.data ?? []) as ScoreboardMetric[],
    horizon: (horizon.data ?? []) as HorizonBox[],
  };
}

/* --------------------------------------------------------------- writing */

export async function createInitiative(
  accessToken: string,
  projectId: string,
  name: string,
  position: number
): Promise<Initiative> {
  const { data, error } = await createUserClient(accessToken)
    .from("initiatives")
    .insert({ project_id: projectId, name, position })
    .select("*")
    .single();
  if (error) throw error;
  return data as Initiative;
}

export async function updateInitiative(
  accessToken: string,
  id: string,
  patch: Partial<Omit<Initiative, "id" | "project_id" | "created_at">>
): Promise<void> {
  const { error } = await createUserClient(accessToken)
    .from("initiatives")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteInitiative(accessToken: string, id: string): Promise<void> {
  const { error } = await createUserClient(accessToken).from("initiatives").delete().eq("id", id);
  if (error) throw error;
}

export async function createStep(
  accessToken: string,
  projectId: string,
  initiativeId: string,
  description: string,
  position: number
): Promise<InitiativeStep> {
  const { data, error } = await createUserClient(accessToken)
    .from("initiative_steps")
    .insert({ project_id: projectId, initiative_id: initiativeId, description, position })
    .select("*")
    .single();
  if (error) throw error;
  return data as InitiativeStep;
}

export async function updateStep(
  accessToken: string,
  id: string,
  patch: Partial<Omit<InitiativeStep, "id" | "project_id" | "initiative_id" | "created_at">>
): Promise<void> {
  const { error } = await createUserClient(accessToken)
    .from("initiative_steps")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteStep(accessToken: string, id: string): Promise<void> {
  const { error } = await createUserClient(accessToken)
    .from("initiative_steps")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function createMetric(
  accessToken: string,
  projectId: string,
  grouping: ScoreboardGroup,
  label: string,
  position: number
): Promise<ScoreboardMetric> {
  const { data, error } = await createUserClient(accessToken)
    .from("scoreboard_metrics")
    .insert({ project_id: projectId, grouping, label, position })
    .select("*")
    .single();
  if (error) throw error;
  return data as ScoreboardMetric;
}

export async function updateMetric(
  accessToken: string,
  id: string,
  patch: Partial<Omit<ScoreboardMetric, "id" | "project_id">>
): Promise<void> {
  const { error } = await createUserClient(accessToken)
    .from("scoreboard_metrics")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteMetric(accessToken: string, id: string): Promise<void> {
  const { error } = await createUserClient(accessToken)
    .from("scoreboard_metrics")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/**
 * The rows the Church Ministry Dashboard ships with.
 *
 * Offered as a starting point, never stamped automatically: a church plant
 * with no school and no life groups should not open its scoreboard and find
 * four rows it has to delete before it can begin. Andrew asked for the
 * scoreboard to be customisable, and the fastest customisation is starting
 * from the printed sheet and cutting.
 */
export const DASHBOARD_STARTER: { grouping: ScoreboardGroup; label: string }[] = [
  { grouping: "strategy_input", label: "Worship" },
  { grouping: "strategy_input", label: "Connection" },
  { grouping: "strategy_input", label: "Life Groups" },
  { grouping: "strategy_input", label: "Training" },
  { grouping: "strategy_input", label: "Students" },
  { grouping: "strategy_input", label: "Children" },
  { grouping: "strategy_input", label: "Giving" },
  { grouping: "strategy_input", label: "New Givers" },
  { grouping: "strategy_input", label: "Giving per Cap" },
];

/**
 * Write one box. Upsert on (project_id, horizon, position) so the first save
 * and every later edit are one call — a storyline is written a box at a time
 * across a retreat, so there is no moment where "create it" would belong.
 */
export async function saveHorizonBox(
  accessToken: string,
  projectId: string,
  horizon: HorizonBand,
  position: number,
  body: string | null
): Promise<void> {
  const { error } = await createUserClient(accessToken)
    .from("horizon_storyline")
    .upsert(
      { project_id: projectId, horizon, position, body, updated_at: new Date().toISOString() },
      { onConflict: "project_id,horizon,position" }
    );
  if (error) throw error;
}

export async function deleteHorizonBox(accessToken: string, id: string): Promise<void> {
  const { error } = await createUserClient(accessToken)
    .from("horizon_storyline")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/* --------------------------------------------------------- renewal cycle */

export type RenewalStop = {
  /** ISO yyyy-mm-dd. */
  on: string;
  /** "90 days", "1 year". */
  marker: string;
  /** What the handout says the gathering is. */
  length: string;
  /** What that gathering is for. */
  purpose: string;
  year: number;
};

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  // Day 1 of the target month, then clamp the day — a 31 Jan start must not
  // silently become 3 March.
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * The Horizon Storyline Renewal Cycle, as twelve dates.
 *
 * Straight off the handout, which is explicit that this is *in addition to*
 * whatever weekly and monthly meetings a church already runs: a half day at
 * 90 days, a full day at 180, a half day at 270, and a two-day retreat at the
 * year — repeated through years two and three, with a three-day retreat at the
 * end of year three to renew the background vision itself.
 *
 * Generated rather than stored, because it is a formula and a stored copy
 * would drift the moment someone changed the anchor date.
 */
export function renewalCycle(anchorIso: string): RenewalStop[] {
  const stops: RenewalStop[] = [];
  for (let year = 1; year <= 3; year++) {
    const base = (year - 1) * 12;
    stops.push(
      {
        on: addMonths(anchorIso, base + 3),
        marker: year === 1 ? "90 days" : `${base + 3} months`,
        length: "Half day",
        purpose: "Review the foreground. Renew the next 90 days.",
        year,
      },
      {
        on: addMonths(anchorIso, base + 6),
        marker: `${base + 6} months`,
        length: "Full day",
        purpose: "Review the foreground and the midground milestone.",
        year,
      },
      {
        on: addMonths(anchorIso, base + 9),
        marker: `${base + 9} months`,
        length: "Half day",
        purpose: "Review the foreground. Renew the next 90 days.",
        year,
      },
      {
        on: addMonths(anchorIso, base + 12),
        marker: year === 1 ? "1 year" : `${year} years`,
        length: year === 3 ? "Three-day retreat" : "Two-day retreat",
        purpose:
          year === 3
            ? "Renew the background vision itself, and start the cycle again."
            : "Renew the one-year milestone and set the year ahead.",
        year,
      }
    );
  }
  return stops;
}

/** The next stop that has not happened yet, or null once the cycle is done. */
export function nextRenewalStop(stops: RenewalStop[], todayIso: string): RenewalStop | null {
  return stops.find((s) => s.on >= todayIso) ?? null;
}
