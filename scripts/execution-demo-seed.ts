/**
 * Fill a SCRATCH project's Execution tab with a believable church.
 *
 * CLAUDE.md's second Execution note ended: "across both live churches there
 * is exactly one initiative, no steps and no check-ins … the rendering is not
 * [covered]." A tab that only ever renders empty cannot be judged, so this
 * writes a full storyline — vision, four objectives, a one-year goal with two
 * measures and their readings, four initiatives in four different states
 * (on track with a review due, at risk and stale, stuck, finished), steps with
 * one past due, eight check-ins and six scoreboard rows — the data behind
 * the September 2026 redesign's captures and `execution-interact.ts`.
 *
 * It wipes the project's Execution rows first, and it REFUSES any project
 * whose name does not start with "Scratch": this must never touch a church.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/scratch-project.ts pivvot-vision-framing "Scratch — Execution"
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/execution-demo-seed.ts <project-id>
 *   … capture / check …
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/scratch-project.ts --delete <project-id>
 */
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const P = process.argv[2];

async function main() {
  if (!P) throw new Error("usage: execution-demo-seed.ts <scratch-project-id>");
  const { data: proj, error: pErr } = await admin.from("projects").select("id,name").eq("id", P).single();
  if (pErr) throw pErr;
  if (!/^scratch/i.test(proj.name)) {
    throw new Error(`Refusing: "${proj.name}" is not a scratch project. This script wipes Execution data.`);
  }

  for (const t of ["initiative_updates", "initiative_steps", "initiatives", "measure_readings", "midground_measures", "scoreboard_metrics", "horizon_storyline"]) {
    const { error } = await admin.from(t).delete().eq("project_id", P);
    if (error) throw new Error(`${t}: ${error.message}`);
  }
  const ins = async (t: string, rows: Record<string, unknown>[]) => {
    const { data, error } = await admin.from(t).insert(rows).select("id");
    if (error) throw new Error(`${t}: ${error.message}`);
    return (data ?? []).map((r) => (r as { id: string }).id);
  };

  await ins("horizon_storyline", [
    { project_id: P, horizon: "beyond", position: 0, body: "A church where every neighborhood within ten minutes of us has a household that knows and is known by our people — a training center that sends more than it keeps." },
    { project_id: P, horizon: "background", position: 0, title: "Every adult in a group", body: "Move from a church of attenders to a church of groups.", where_we_stand: "38% of adults in a group; groups launch twice a year.", where_were_headed: "Two-thirds of adults in a group that meets in a home.", how_well_get_there: "Semester launches, a coach per six groups, apprentices named in every group." },
    { project_id: P, horizon: "background", position: 1, title: "A leadership pipeline", body: "Name and train the next 50 leaders.", where_we_stand: "Leaders are recruited when a hole opens.", where_were_headed: "A named apprentice behind every leader.", how_well_get_there: "The Disciple's Journey taught twice a year; a leaders' cohort each spring." },
    { project_id: P, horizon: "background", position: 2, title: "Give the building away", body: "Make the campus a community asset six days a week.", where_we_stand: "Used three days a week, by us.", where_were_headed: "Partners in the building every weekday.", how_well_get_there: "One partner a quarter; a facilities director by year two." },
    { project_id: P, horizon: "background", position: 3, title: "Plant before we're ready", body: "Send a team to the east side.", where_we_stand: "Two families have asked.", where_were_headed: "A sending church with a plant every three years.", how_well_get_there: "Residency in year one, a planter named in year two." },
    { project_id: P, horizon: "midground", position: 0, body: "By next September, grow from 38 percent of adults in a group to 55 percent, with a coach over every six groups." },
  ]);
  const [m1, m2] = await ins("midground_measures", [
    { project_id: P, label: "Adults in a group", unit: "%", baseline: 38, target: 55, current: 44, position: 0 },
    { project_id: P, label: "Group coaches", unit: "coaches", baseline: 2, target: 9, current: 5, position: 1 },
  ]);
  await ins("measure_readings", [
    { project_id: P, measure_id: m1, on_date: "2026-06-30", value: 38 },
    { project_id: P, measure_id: m1, on_date: "2026-07-31", value: 41 },
    { project_id: P, measure_id: m1, on_date: "2026-08-31", value: 44, note: "Fall launch week added 11 groups." },
    { project_id: P, measure_id: m2, on_date: "2026-06-30", value: 2 },
    { project_id: P, measure_id: m2, on_date: "2026-08-31", value: 5 },
  ]);
  const base = { project_id: P, is_complete: false };
  const [i1, i2, i3, i4] = await ins("initiatives", [
    { ...base, name: "Fall group launch", kind: "cross_functional", position: 0, status: "green", start_date: "2026-08-01", last_review_on: "2026-09-09", next_review_on: "2026-09-16", leader: "Carolyn", team: "Groups team, Comms", initiative: "Launch 12 new groups in the fall semester.", objective: "Move adults-in-groups from 38% to 46% by December.", key_deliverables: "Group directory live; 12 leaders trained; launch Sunday.", plan_of_action: "Recruit leaders in July, train in August, launch on 13 September.", timeline: "2026-10-31", costs: "$2,500" },
    { ...base, name: "Coach every six groups", kind: "ministry_subgoal", position: 1, status: "amber", start_date: "2026-08-01", last_review_on: "2026-08-20", next_review_on: "2026-09-03", leader: "Marcus", team: "Groups team", initiative: "Recruit and train five coaches.", objective: "Every group leader has someone calling them monthly.", key_deliverables: "Coach job description; five named coaches; monthly rhythm.", timeline: "Monthly", costs: "$0" },
    { ...base, name: "Sunday guest pathway", kind: "all_staff_driver", position: 2, status: "red", start_date: "2026-08-15", last_review_on: "2026-09-02", next_review_on: "2026-09-30", leader: "Deb", team: "All staff", initiative: "One clear next step for a first-time guest.", objective: "Half of first-time guests take a next step within 30 days.", key_deliverables: "Guest card; text follow-up; connect lunch monthly.", timeline: "2026-11-30", costs: "?" },
    { ...base, name: "Leaders' cohort — spring", kind: "cross_functional", position: 3, status: "green", is_complete: true, start_date: "2026-02-01", last_review_on: "2026-06-04", leader: "Pastor Jim", team: "Elders", initiative: "Run the first leaders' cohort.", objective: "Eight apprentices named.", timeline: "2026-06-01", costs: "$800" },
  ]);
  const step = (initiative_id: string, position: number, description: string, status: string, by_when: string, cost: string, accountable: string) =>
    ({ project_id: P, initiative_id, position, description, status, by_when, cost, accountable });
  await ins("initiative_steps", [
    step(i1, 0, "Recruit 12 group leaders", "green", "2026-07-31", "$0", "Carolyn"),
    step(i1, 1, "Leader training night", "green", "2026-08-21", "$300", "Marcus"),
    step(i1, 2, "Group directory on the website", "amber", "2026-09-05", "$0", "Comms"),
    step(i1, 3, "Launch Sunday", "green", "2026-09-13", "$2,200", "Carolyn"),
    step(i1, 4, "Week-4 check on every new group", "amber", "2026-10-12", "$0", "Coaches"),
    step(i2, 0, "Write the coach role", "green", "2026-08-08", "$0", "Marcus"),
    step(i2, 1, "Ask five people", "amber", "2026-08-29", "$0", "Marcus"),
    step(i2, 2, "Coach orientation", "red", "2026-09-12", "$150", "Marcus"),
    step(i3, 0, "Redesign the guest card", "green", "2026-08-30", "$120", "Deb"),
    step(i3, 1, "Text follow-up within 48 hours", "red", "2026-09-07", "$40/mo", "Deb"),
    step(i3, 2, "First connect lunch", "amber", "2026-09-28", "$250", "Hospitality"),
    step(i4, 0, "Eight apprentices named", "green", "2026-05-30", "$0", "Pastor Jim"),
  ]);
  const upd = (initiative_id: string, on_date: string, status: string, note: string) => ({ project_id: P, initiative_id, on_date, status, note });
  await ins("initiative_updates", [
    upd(i1, "2026-08-12", "amber", "Nine leaders so far; three more conversations this week."),
    upd(i1, "2026-08-26", "green", "Twelve leaders confirmed. Training night went well."),
    upd(i1, "2026-09-02", "green", "Directory is late — Comms is two weeks behind. Launch still on."),
    upd(i1, "2026-09-09", "green", "Launch Sunday ready. 11 of 12 groups have a room."),
    upd(i2, "2026-08-06", "green", "Role written and approved by the elders."),
    upd(i2, "2026-08-20", "amber", "Two yeses, one no, two still thinking. Orientation may slip."),
    upd(i3, "2026-08-19", "amber", "Card is done. Texting tool not chosen yet."),
    upd(i3, "2026-09-02", "red", "No follow-ups went out for three Sundays. Need a decision on the tool this week."),
  ]);
  const row = (grouping: string, category: string, label: string, prior_year: string, current: string, next_year: string, trend: string, status: string, position: number) =>
    ({ project_id: P, grouping, category, label, prior_year, current, next_year, trend, status, position });
  await ins("scoreboard_metrics", [
    row("strategy_input", "Worship", "Average attendance", "412", "438", "500", "up", "green", 0),
    row("strategy_input", "Groups", "Groups meeting", "31", "42", "48", "up", "green", 1),
    row("strategy_input", "Groups", "Adults in a group", "38%", "44%", "55%", "up", "amber", 2),
    row("measure_output", "Guests", "First-time guests / month", "22", "19", "30", "down", "amber", 3),
    row("measure_output", "Sending", "Baptisms", "18", "14", "30", "down", "red", 4),
    row("measure_output", "Serving", "Volunteers serving monthly", "140", "163", "200", "up", "green", 5),
  ]);
  console.log(`seeded ${proj.name} (${P})`);
}

main().catch((e) => {
  console.error("SEED FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
