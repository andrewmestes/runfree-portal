/**
 * Desktop capture of a project panel, in a chosen role.
 *
 * `mobile-audit.ts` answers "does this survive a 390px phone". This answers
 * the other half: what does a *viewer* actually see, at a desktop width, with
 * every disclosure open. Andrew, after a run of avoidable bugs: "I feel like a
 * lot of these are common sense mistakes ... do a full audit again and make
 * sure everything is good to go."
 *
 * Most of those bugs were one of two kinds, and neither is visible from an
 * admin session: editor-facing copy shown to a church ("add what you actually
 * watch" on a panel they cannot edit), and layout that only breaks once a
 * card is expanded. So this drives the same throwaway account as the mobile
 * audit and lets you set its role per run.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/panel-shot.ts \
 *       <project-id> [panel] [role] [width] [height] [expand]
 *
 *   scripts/panel-shot.ts <id> execution viewer 1440 4000 expand
 *
 * Height matters and is not a detail: on `lg` the project page is
 * `h-screen overflow-hidden` with the content column scrolling inside it, so
 * `captureBeyondViewport` returns one viewport and nothing more. Set the
 * height taller than the panel or you will screenshot the top third and
 * believe you have seen the page.
 *
 * Requires the dev server on 3001 (see CLAUDE.md — never `npm run` here).
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PROJECT = process.argv[2];
if (!PROJECT) {
  console.error("usage: panel-shot.ts <project-id> [panel] [role] [width] [height] [expand]");
  process.exit(1);
}
const PANEL = process.argv[3] ?? "dashboard";
const ROLE = (process.argv[4] ?? "admin") as "viewer" | "editor" | "admin";
const W = Number(process.argv[5] ?? 1440);
const H = Number(process.argv[6] ?? 2400);
const EXPAND = process.argv[7] === "expand";
/** `click:<text>` — press the first button whose label contains <text>. */
const CLICK = (process.argv[7] ?? "").startsWith("click:") ? process.argv[7].slice(6) : null;

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3001";
const SHOTS = "/tmp/runfree-panel-shot";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9401;
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
  await teardown();
  const { data: made, error } = await admin.auth.admin.createUser({
    email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { name: "Mobile Audit" },
  });
  if (error) throw error;
  const uid = made.user.id;
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
  await ev(`[...document.images].forEach((i) => { i.loading = "eager"; }); "ok"`);
  if (EXPAND) {
    await ev(`document.querySelectorAll('[aria-expanded="false"]').forEach((b) => b.click()); "ok"`);
    await sleep(1500);
  }
  // `click:Some text` presses the first button whose label contains it —
  // which is how the Execution board's detail views get captured, since each
  // one only renders when its box is selected.
  if (CLICK) {
    const hit = await ev(
      `(() => { const t = ${JSON.stringify(CLICK)}.toLowerCase();
         const b = [...document.querySelectorAll("button")].find((x) => (x.textContent||"").toLowerCase().includes(t));
         if (b) { b.click(); return true; } return false; })()`
    );
    if (!hit) console.log(`   (nothing matched "${CLICK}")`);
    await sleep(2000);
  }
  await sleep(2000);

  const a = await ev(AUDIT) as { hScroll: boolean; spills: { tag: string; text: string }[]; badImgs: string[] };
  const noise = [...new Set(errs)].filter((m) => !/GoTrueClient|React DevTools/i.test(m));
  const flags: string[] = [];
  if (a.hScroll) flags.push("H-SCROLL");
  if (a.spills.length) flags.push(`${a.spills.length} spill`);
  if (a.badImgs.length) flags.push(`${a.badImgs.length} broken img`);
  if (noise.length) flags.push(`${noise.length} console err`);
  console.log(`${flags.length ? "FAIL" : "ok  "}  ${PANEL} @${W} as ${ROLE}${EXPAND ? " (expanded)" : CLICK ? ` (clicked ${CLICK})` : ""}  ${flags.join(" | ") || "clean"}`);
  for (const sp of a.spills) console.log(`         spill <${sp.tag}> "${sp.text}"`);
  for (const b of a.badImgs) console.log(`         broken img ${b}`);
  for (const n of noise) console.log(`         console ${n}`);

  const shot = (await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true })) as { data: string };
  const out = `${SHOTS}/${PANEL}-${W}-${ROLE}${CLICK ? "-" + CLICK.toLowerCase().replace(/[^a-z0-9]+/g, "-") : ""}.png`;
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  chrome.kill();
  console.log(out);
  process.exitCode = flags.length ? 1 : 0;
}

// Same discipline as the mobile audit: a run killed halfway must not leave a
// stray face in the church's Team panel. Andrew found one exactly that way.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => { void teardown().finally(() => process.exit(130)); });
}
main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(teardown);
