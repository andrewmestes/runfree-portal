/**
 * The Execution tab, driven — the checks a screenshot cannot make.
 *
 * `panel-shot.ts` shows what the tab looks like; this proves what it does, in
 * headless Chrome, as a throwaway admin or viewer (same account discipline as
 * `panel-shot.ts`: created, used, deleted, even on Ctrl-C). Written for the
 * September 2026 redesign, whose riskiest changes were interactions: a date
 * that is text until clicked, lights that stay faint until focused, and a
 * viewer shown one tile instead of a radio group.
 *
 * It expects the church `execution-demo-seed.ts` writes, and restores the two
 * values it changes (a Next review date and one step's light).
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/execution-interact.ts <scratch-project-id> admin
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/execution-interact.ts <scratch-project-id> viewer
 *
 * Admin: default selection, DateCell open / Escape / save, the quiet
 * RagPicker's focus reveal and arrow keys, Copy update, Close, a finished
 * initiative's pill, the Renewal unfold, no animate-rise, no console errors.
 * Viewer: the same shared checks, plus no editor copy, every light a single
 * tile, dates as text, no selects in the detail.
 *
 * Requires the dev server on 3001 (see CLAUDE.md — never `npm run` here).
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PROJECT = process.argv[2];
if (!PROJECT) {
  console.error("usage: execution-interact.ts <scratch-project-id> [admin|viewer]");
  process.exit(1);
}
const PANEL = "execution";
const ROLE = (process.argv[3] ?? "admin") as "viewer" | "editor" | "admin";
const W = 1440;
const H = 1800;
const EXPAND = false;
/** `click:<text>` — press the first button whose label contains <text>. */
const CLICK: string | null = null;
/**
 * `keep` leaves the throwaway account in place after the run.
 *
 * For two-step checks only — seed something that references the account's
 * profile id (an assigned action step, say), then shoot again. It prints a
 * loud reminder because a forgotten account shows up as a stray face in a
 * church's Team panel, which is exactly how Andrew found the last one.
 */
const KEEP = false;

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3001";
const SHOTS = "/tmp/runfree-panel-shot";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9433;
const EMAIL = "mobile-audit@example.com";
const PASSWORD = "mobile-audit-only-not-a-real-account-9931!";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const AUDIT = `(() => {
  const vw = innerWidth, de = document.documentElement, over = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || !el.getClientRects().length) continue;
    const r = el.getBoundingClientRect();
    if ((r.width === 0 && r.height === 0) || r.right <= vw + 1) continue;
    let clipped = false;
    for (let a = el.parentElement, i = 0; a && i < 6; a = a.parentElement, i++) {
      const acs = getComputedStyle(a);
      if (acs.overflowX !== "visible" || acs.overflow !== "visible") { clipped = true; break; }
    }
    if (clipped) continue;
    over.push({ tag: el.tagName.toLowerCase(), text: (el.textContent || "").trim().slice(0, 40) });
  }
  return { hScroll: de.scrollWidth > vw + 1, spills: over.slice(0, 8),
    badImgs: [...document.images].filter(i => i.getClientRects().length && !(i.complete && i.naturalWidth > 0)).map(i => (i.currentSrc || i.src).slice(0, 100)) };
})()`;

/** Delete the throwaway account. Runs on the way out, including on a signal. */
async function teardown() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const u = data.users.find((x) => x.email === EMAIL);
  if (!u) return;
  await admin.from("project_members").delete().eq("profile_id", u.id);
  await admin.from("profiles").delete().eq("id", u.id);
  await admin.auth.admin.deleteUser(u.id);
}

async function main() {
  // KEEP reuses the existing account rather than recreating it, because its
  // profile id is the whole point of a two-step check — recreate it between
  // runs and whatever you seeded against it is orphaned.
  let uid: string;
  const existing = KEEP ? (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.find((u) => u.email === EMAIL) : null;
  if (existing) {
    uid = existing.id;
  } else {
    await teardown();
    const { data: made, error } = await admin.auth.admin.createUser({
      email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { name: "Mobile Audit" },
    });
    if (error) throw error;
    uid = made.user.id;
  }
  await admin.from("project_members").upsert(
    { project_id: PROJECT, profile_id: uid, role: ROLE },
    { onConflict: "project_id,profile_id" },
  );
  // is_staff only grants the ability to CREATE a project, but it also decides
  // whether staff-only chrome renders — so a viewer run must not have it.
  await admin.from("profiles").update({ is_staff: ROLE === "admin" }).eq("id", uid);

  const store = new Map<string, string>();
  const shim = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  const signIn = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { storage: shim as never, persistSession: true, autoRefreshToken: false } });
  const { error: siErr } = await signIn.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (siErr) throw siErr;
  const [[storeKey, storeVal]] = [...store];

  mkdirSync(SHOTS, { recursive: true });
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`,
    "--user-data-dir=/tmp/runfree-panel-chrome", "--no-first-run", "--no-default-browser-check",
    "--disable-gpu", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });

  let ws!: WebSocket, id = 0, sessionId: string | null = null;
  const pending = new Map<number, { res: (v: unknown) => void; rej: (e: Error) => void }>();
  const errs: string[] = [];
  const send = (method: string, params: unknown = {}, sid: string | null = sessionId): Promise<unknown> =>
    new Promise((res, rej) => { const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params, ...(sid ? { sessionId: sid } : {}) })); });

  let wsUrl: string | undefined;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    try { wsUrl = (await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json())).webSocketDebuggerUrl; } catch { await sleep(250); }
  }
  if (!wsUrl) throw new Error("Chrome never came up — is it installed at " + CHROME + "?");
  ws = new WebSocket(wsUrl);
  await new Promise<void>((r) => { ws.onopen = () => r(); });
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
      errs.push(m.params.args.map((a: { value?: string; description?: string }) => a.value ?? a.description ?? "").join(" ").slice(0, 160));
    if (m.method === "Runtime.exceptionThrown")
      errs.push("EXCEPTION " + String(m.params.exceptionDetails?.exception?.description ?? "").slice(0, 160));
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id)!; pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  };
  const { targetId } = (await send("Target.createTarget", { url: "about:blank" }, null)) as { targetId: string };
  ({ sessionId } = (await send("Target.attachToTarget", { targetId, flatten: true }, null)) as { sessionId: string });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: false });

  const ev = async (expr: string) => {
    const r = (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })) as { result: { value: unknown }; exceptionDetails?: { text: string } };
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };

  await send("Page.navigate", { url: `${BASE}/auth/login` }); await sleep(2500);
  await ev(`localStorage.setItem(${JSON.stringify(storeKey)}, ${JSON.stringify(storeVal)}); "ok"`);

  errs.length = 0;
  await send("Page.navigate", { url: `${BASE}/projects/${PROJECT}?panel=${PANEL}` });
  await sleep(5000);

  const results: { name: string; ok: boolean; detail?: string }[] = [];
  const check = (name: string, ok: boolean, detail?: string) => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
  const J = (x: unknown) => JSON.stringify(x);

  const hasDetail = await ev(`!!document.getElementById("execution-detail")`);
  check("detail opens on the first live initiative by default", hasDetail === true);

  if (ROLE === "admin") {
    // --- DateCell: rest → native input → Escape returns focus
    const rest = await ev(`(() => { const b=[...document.querySelectorAll("button[aria-label]")].find(x=>x.getAttribute("aria-label").startsWith("Next review:")); if(!b) return null; b.click(); return b.getAttribute("aria-label"); })()`);
    await sleep(400);
    const focusedDate = await ev(`document.activeElement && document.activeElement.tagName==="INPUT" && document.activeElement.type==="date"`);
    check("DateCell: rest button opens a focused native date input", !!rest && focusedDate === true, String(rest));
    await ev(`document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})); "ok"`);
    await sleep(400);
    const back = await ev(`document.activeElement && document.activeElement.tagName==="BUTTON" && (document.activeElement.getAttribute("aria-label")||"").startsWith("Next review:")`);
    check("DateCell: Escape closes the input and returns focus to the rest button", back === true);

    // --- DateCell: a changed date saves
    const { data: before } = await admin.from("initiatives").select("id,next_review_on").eq("project_id", PROJECT).eq("name", "Fall group launch").single();
    await ev(`(() => { const b=[...document.querySelectorAll("button[aria-label]")].find(x=>x.getAttribute("aria-label").startsWith("Next review:")); b.click(); return 1; })()`);
    await sleep(400);
    await ev(`(() => { const i=document.activeElement; const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set; set.call(i,"2026-09-23"); i.dispatchEvent(new Event("input",{bubbles:true})); i.dispatchEvent(new Event("change",{bubbles:true})); i.blur(); return 1; })()`);
    await sleep(2500);
    const { data: after } = await admin.from("initiatives").select("next_review_on").eq("id", before!.id).single();
    const label = await ev(`[...document.querySelectorAll("button[aria-label]")].map(x=>x.getAttribute("aria-label")).find(a=>a.startsWith("Next review:"))`);
    check("DateCell: picking a date saves it and the rest label follows", after!.next_review_on === "2026-09-23" && String(label).includes("Sep 23, 2026"), `${before!.next_review_on} → ${after!.next_review_on}; label ${label}`);
    await admin.from("initiatives").update({ next_review_on: before!.next_review_on }).eq("id", before!.id);

    // --- quiet RagPicker: hidden options fade in on focus; arrows move the choice
    const op0 = await ev(`(() => { const g=document.querySelector('[role=radiogroup][aria-label="Step 1 light"]'); const off=g.querySelector('[aria-checked=false] span'); return getComputedStyle(off).opacity; })()`);
    await ev(`(() => { const g=document.querySelector('[role=radiogroup][aria-label="Step 1 light"]'); g.querySelector('[aria-checked=true]').focus(); return 1; })()`);
    await sleep(300);
    const op1 = await ev(`(() => { const g=document.querySelector('[role=radiogroup][aria-label="Step 1 light"]'); const off=g.querySelector('[aria-checked=false] span'); return getComputedStyle(off).opacity; })()`);
    check("quiet RagPicker: unchosen options faint at rest, full on focus", Number(op0) < 0.6 && Number(op1) === 1, `rest ${op0}, focused ${op1}`);
    const { data: step } = await admin.from("initiative_steps").select("id,status").eq("project_id", PROJECT).eq("description", "Recruit 12 group leaders").single();
    await ev(`document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowLeft",bubbles:true})); 1`);
    await sleep(2500);
    const { data: step2 } = await admin.from("initiative_steps").select("status").eq("id", step!.id).single();
    const focusedRag = await ev(`document.activeElement && document.activeElement.getAttribute("data-rag")`);
    check("quiet RagPicker: ArrowLeft moves the light and the focus", step!.status === "green" && step2!.status === "amber" && focusedRag === "amber", `${step!.status} → ${step2!.status}, focus on ${focusedRag}`);
    await admin.from("initiative_steps").update({ status: step!.status }).eq("id", step!.id);
    await ev(`location.reload(); 1`); await sleep(5000);

    // --- Copy update: the digest is what reaches the clipboard
    await ev(`window.__copied = null; navigator.clipboard.writeText = async (t) => { window.__copied = t; }; 1`);
    await ev(`[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Copy update")).click(); 1`);
    await sleep(400);
    const digest = String(await ev(`window.__copied`));
    const liveLabel = await ev(`[...document.querySelectorAll("[aria-live=polite]")].map(x=>x.textContent).join("|")`);
    check("Copy update: digest reaches the clipboard and the label says Copied", digest.startsWith("Where we are — ") && digest.includes("Fall group launch — On track") && String(liveLabel).includes("Copied"), `${digest.split("\n").length} lines`);
    writeFileSync("/tmp/execution-digest.txt", digest);
  }

  // --- Close
  await ev(`document.querySelector('button[aria-label="Close"]').click(); 1`);
  await sleep(500);
  check("Close hides the detail", (await ev(`!document.getElementById("execution-detail")`)) === true);

  // --- finished initiatives reachable
  await ev(`[...document.querySelectorAll("button")].find(b=>/Show 1 finished/.test(b.textContent)).click(); 1`);
  await sleep(400);
  await ev(`[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Leaders' cohort")).click(); 1`);
  await sleep(800);
  const title = await ev(`(document.querySelector("#execution-detail h3")||{}).textContent || (document.querySelector("#execution-detail input[aria-label='Initiative name']")||{}).value`);
  check("a finished initiative opens from its pill", String(title).includes("Leaders"), String(title));

  // --- Renewal toggle
  const count = () => ev(`(() => { const h=[...document.querySelectorAll("h3")].find(x=>x.textContent==="Renewal Cycle"); const sec=h.closest("section"); return { stops: sec.querySelectorAll("ol > li > span.w-28").length, years: [...sec.querySelectorAll("ol > li")].filter(li=>/^Year \\d/i.test(li.textContent.trim())).length, sample: [...sec.querySelectorAll("ol > li")].slice(0,2).map(li=>JSON.stringify(li.textContent.trim().slice(0,30))), current: sec.querySelectorAll("[aria-current=step]").length }; })()`);
  const c0 = await count();
  await ev(`[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Show the full three-year cycle")).click(); 1`);
  await sleep(400);
  const c1 = await count();
  await ev(`[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Show only the next stop")).click(); 1`);
  await sleep(400);
  const c2 = await count();
  check("Renewal: one stop → twelve with year chips → one", (c0 as any).stops === 1 && (c1 as any).stops === 12 && (c1 as any).years === 3 && (c2 as any).stops === 1 && (c0 as any).current === 1, `${J(c0)} → ${J(c1)} → ${J(c2)}`);

  // --- no animate-rise on board cards; foreground cards lift on hover (class present)
  const rise = await ev(`document.querySelectorAll("#execution-detail ~ *, [aria-pressed]").length && [...document.querySelectorAll("button[aria-pressed]")].some(b=>/animate-rise/.test(b.className))`);
  check("no animate-rise on any board card", rise === false);

  if (ROLE === "viewer") {
    const text = String(await ev(`document.body.innerText`));
    const leaks = ["Edit the vision", "Choose two templates", "+ Add the", "Add an initiative", "Rename", "click to write it", "Add a header", "Add a measure", "Post this week"].filter((t) => text.includes(t));
    check("viewer sees no editor copy", leaks.length === 0, leaks.join(", "));
    const groups = await ev(`document.querySelectorAll('[role=radiogroup]').length`);
    const tiles = await ev(`document.querySelectorAll('span[role=img][aria-label]').length`);
    check("viewer: every light is a single tile, no radio groups", groups === 0 && Number(tiles) > 0, `radiogroups ${groups}, tiles ${tiles}`);
    const dateButtons = await ev(`[...document.querySelectorAll("button[aria-label]")].filter(b=>/^(Start date|Next review):/.test(b.getAttribute("aria-label"))).length`);
    check("viewer: dates are plain text, not buttons", dateButtons === 0, `date buttons ${dateButtons}`);
    const selects = await ev(`document.querySelectorAll("#execution-detail select").length`);
    check("viewer: no selects in the detail", selects === 0, `selects ${selects}`);
  }

  const noise = [...new Set(errs)].filter((m) => !/GoTrueClient|React DevTools/i.test(m));
  check("no console errors", noise.length === 0, noise.join(" | "));
  chrome.kill();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed as ${ROLE}`);
  process.exitCode = failed ? 1 : 0;
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => { void teardown().finally(() => process.exit(130)); });
}
main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await teardown(); });
