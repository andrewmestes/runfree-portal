/**
 * The Execution tab's pure helpers.
 *
 * These three decide what the weekly meeting is told: whether a review the
 * team booked is still outstanding, whether an initiative is behind its own
 * ninety days, and what the light has been doing lately. All three are date
 * arithmetic over data that is hard to stage by hand in the UI — an
 * initiative that is two-thirds through its quarter with a quarter of its
 * steps closed is not something you can click your way to on a Tuesday — so
 * they are tested here rather than found wrong in a standup.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local tests/execution.test.ts
 *
 * (--env-file because importing the lib pulls in the Supabase client, which
 * wants a URL at module load even though nothing here touches the network.)
 */
import { reviewDue, initiativePace, trendFor, type Initiative, type InitiativeStep, type InitiativeUpdate } from "../src/lib/execution";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log("PASS —", name); }
  else { fail++; console.log("FAIL —", name, got !== undefined ? `got ${JSON.stringify(got)}` : ""); }
}

const base: Initiative = {
  id: "i1", project_id: "p", name: "Launch the path", initiative: null, objective: null,
  key_deliverables: null, plan_of_action: null, timeline: null, costs: null, leader: "Jeff",
  team: null, start_date: null, last_review_on: null, next_review_on: null, status: "green",
  is_complete: false, kind: "cross_functional", position: 0, created_at: "",
};
const step = (id: string, status: InitiativeStep["status"]): InitiativeStep => ({
  id, initiative_id: "i1", project_id: "p", description: id, status, by_when: null,
  cost: null, accountable: null, assignee_profile_id: null, position: 0, created_at: "",
});
const upd = (id: string, status: InitiativeUpdate["status"], on: string, init = "i1"): InitiativeUpdate => ({
  id, initiative_id: init, project_id: "p", status, note: null, on_date: on,
  author_profile_id: null, created_at: on,
});

// ---- reviewDue
ok("no date is not due", reviewDue(base, [], "2026-09-10") === false);
ok("future date is not due", reviewDue({ ...base, next_review_on: "2026-09-20" }, [], "2026-09-10") === false);
ok("today is due", reviewDue({ ...base, next_review_on: "2026-09-10" }, [], "2026-09-10") === true);
ok("past date is due", reviewDue({ ...base, next_review_on: "2026-09-01" }, [], "2026-09-10") === true);
ok("finished initiative is never due", reviewDue({ ...base, next_review_on: "2026-09-01", is_complete: true }, [], "2026-09-10") === false);
ok("free text in the date field is ignored", reviewDue({ ...base, next_review_on: "every Monday" }, [], "2026-09-10") === false);

ok("a check-in on the day clears it",
  reviewDue({ ...base, next_review_on: "2026-09-01" }, [upd("u1","green","2026-09-01")], "2026-09-10") === false);
ok("a check-in after it clears it",
  reviewDue({ ...base, next_review_on: "2026-09-01" }, [upd("u1","green","2026-09-05")], "2026-09-10") === false);
ok("a check-in BEFORE it does not clear it",
  reviewDue({ ...base, next_review_on: "2026-09-01" }, [upd("u1","green","2026-08-20")], "2026-09-10") === true);

// ---- initiativePace
ok("no start date → null", initiativePace(base, [step("a","green"),step("b","amber"),step("c","amber")], "2026-09-10") === null);
ok("fewer than three steps → null",
  initiativePace({ ...base, start_date: "2026-06-01" }, [step("a","amber"),step("b","amber")], "2026-09-10") === null);
{
  // day 8 of 90 with nothing done — far too early to judge
  const p = initiativePace({ ...base, start_date: "2026-09-02" }, [step("a","amber"),step("b","amber"),step("c","amber"),step("d","amber")], "2026-09-10");
  ok("week one is never behind", p !== null && p.behind === false, p);
}
{
  // day 71 of 90 (79%) with 1 of 4 done (25%) — the real conversation
  const p = initiativePace({ ...base, start_date: "2026-07-01" }, [step("a","green"),step("b","amber"),step("c","amber"),step("d","amber")], "2026-09-10");
  ok("late and unmoved is behind", p !== null && p.behind === true, p);
  ok("  …and reports the two numbers", p !== null && Math.round(p.elapsed*100) === 79 && Math.round(p.done*100) === 25, p);
}
{
  // same clock, three of four done — keeping up
  const p = initiativePace({ ...base, start_date: "2026-07-01" }, [step("a","green"),step("b","green"),step("c","green"),step("d","amber")], "2026-09-10");
  ok("late but moving is not behind", p !== null && p.behind === false, p);
}
{
  // an explicit end date shortens the clock
  const p = initiativePace({ ...base, start_date: "2026-09-01", timeline: "2026-09-15" }, [step("a","amber"),step("b","amber"),step("c","amber")], "2026-09-10");
  ok("a dated timeline is the denominator", p !== null && p.behind === true && p.elapsed > 0.6, p);
}
ok("a finished initiative has no pace",
  initiativePace({ ...base, start_date: "2026-07-01", is_complete: true }, [step("a","amber"),step("b","amber"),step("c","amber")], "2026-09-10") === null);

// ---- trendFor
const updates = [upd("u5","red","2026-09-08"), upd("u4","amber","2026-09-01"), upd("u3","green","2026-08-25"), upd("x1","green","2026-09-07","other")];
{
  const t = trendFor(updates, "i1");
  ok("only this initiative's check-ins", t.length === 3, t.map(u=>u.id));
  ok("oldest first", t[0].id === "u3" && t[2].id === "u5", t.map(u=>u.id));
}
{
  const many = Array.from({length:12},(_,n)=>upd(`m${n}`,"green",`2026-09-${String(12-n).padStart(2,"0")}`));
  const t = trendFor(many, "i1");
  ok("capped at eight, keeping the newest", t.length === 8 && t[7].id === "m0", t.map(u=>u.id));
}
ok("no check-ins is an empty trend", trendFor([], "i1").length === 0);

console.log(`\n${pass}/${pass+fail} passed`);
process.exit(fail ? 1 : 0);
