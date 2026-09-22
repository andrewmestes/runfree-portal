/**
 * Whole-portal capture: every page and every project panel, desktop and phone,
 * in one role. Same throwaway account and CDP driving as panel-shot.ts.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/site-shot.ts <project-id> <viewer|admin> [port]
 *
 * viewer = a church member with no account_role (what a client sees).
 * admin  = staff + framer (account_role runfree_team, is_staff) — everything.
 * Writes /tmp/runfree-site-shot/<role>/*.png and prints one audit line per page.
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PROJECT = process.argv[2]; const ROLE = (process.argv[3] ?? "viewer") as "viewer" | "admin"; const PORT = Number(process.argv[4] ?? 9411);
const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3001";
const SHOTS = `/tmp/runfree-site-shot/${ROLE}`;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const EMAIL = "mobile-audit@example.com"; const PASSWORD = "mobile-audit-only-not-a-real-account-9931!";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const AUDIT = `(() => { const vw = innerWidth, de = document.documentElement, over = [];
  for (const el of document.querySelectorAll("body *")) { const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || !el.getClientRects().length) continue;
    const r = el.getBoundingClientRect(); if ((r.width === 0 && r.height === 0) || r.right <= vw + 1) continue;
    let clipped = false; for (let a = el.parentElement, i = 0; a && i < 6; a = a.parentElement, i++) { const acs = getComputedStyle(a); if (acs.overflowX !== "visible" || acs.overflow !== "visible") { clipped = true; break; } }
    if (clipped) continue; over.push({ tag: el.tagName.toLowerCase(), text: (el.textContent || "").trim().slice(0, 40) }); }
  const tiny = [...document.querySelectorAll("body *")].filter(e => { const cs = getComputedStyle(e); return e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(cs.fontSize) < 10 && e.getClientRects().length; }).length;
  return { title: document.title, h1: (document.querySelector("h1")||{}).textContent||"", hScroll: de.scrollWidth > vw + 1, height: de.scrollHeight, spills: over.slice(0, 6), tiny,
    badImgs: [...document.images].filter(i => i.getClientRects().length && !(i.complete && i.naturalWidth > 0)).map(i => (i.currentSrc || i.src).slice(0, 100)),
    links: [...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href")).filter(h => h && !h.startsWith("#")).length }; })()`;

async function teardown() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 }); const u = data.users.find((x) => x.email === EMAIL); if (!u) return;
  await admin.from("project_members").delete().eq("profile_id", u.id); await admin.from("profiles").delete().eq("id", u.id); await admin.auth.admin.deleteUser(u.id);
}
async function main() {
  await teardown();
  const { data: made, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { name: "Site Audit" } });
  if (error) throw error; const uid = made.user.id;
  await admin.from("project_members").upsert({ project_id: PROJECT, profile_id: uid, role: ROLE }, { onConflict: "project_id,profile_id" });
  await admin.from("profiles").update({ is_staff: ROLE === "admin", account_role: ROLE === "admin" ? (process.env.ACCOUNT_ROLE ?? "runfree_team") : null }).eq("id", uid);
  const store = new Map<string, string>();
  const shim = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  const signIn = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { storage: shim as never, persistSession: true, autoRefreshToken: false } });
  const { error: siErr } = await signIn.auth.signInWithPassword({ email: EMAIL, password: PASSWORD }); if (siErr) throw siErr;
  const [[storeKey, storeVal]] = [...store];
  mkdirSync(SHOTS, { recursive: true });
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/runfree-site-chrome-${ROLE}`, "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  let ws!: WebSocket, id = 0, sessionId: string | null = null; const pending = new Map<number, { res: (v: unknown) => void; rej: (e: Error) => void }>(); const errs: string[] = [];
  const send = (method: string, params: unknown = {}, sid: string | null = sessionId): Promise<unknown> => new Promise((res, rej) => { const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params, ...(sid ? { sessionId: sid } : {}) })); });
  let wsUrl: string | undefined; for (let i = 0; i < 80 && !wsUrl; i++) { try { wsUrl = (await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json())).webSocketDebuggerUrl; } catch { await sleep(250); } }
  if (!wsUrl) throw new Error("Chrome never came up");
  ws = new WebSocket(wsUrl); await new Promise<void>((r) => { ws.onopen = () => r(); });
  ws.onmessage = (e) => { const m = JSON.parse(String(e.data));
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errs.push(m.params.args.map((a: { value?: string; description?: string }) => a.value ?? a.description ?? "").join(" ").slice(0, 160));
    if (m.method === "Runtime.exceptionThrown") errs.push("EXCEPTION " + String(m.params.exceptionDetails?.exception?.description ?? "").slice(0, 160));
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id)!; pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
  const { targetId } = (await send("Target.createTarget", { url: "about:blank" }, null)) as { targetId: string };
  ({ sessionId } = (await send("Target.attachToTarget", { targetId, flatten: true }, null)) as { sessionId: string });
  await send("Page.enable"); await send("Runtime.enable");
  const ev = async (expr: string) => { const r = (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })) as { result: { value: unknown }; exceptionDetails?: { text: string } }; if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${BASE}/auth/login` }); await sleep(3000);
  { const shot = (await send("Page.captureScreenshot", { format: "png" })) as { data: string }; writeFileSync(`${SHOTS}/login-out-1440.png`, Buffer.from(shot.data, "base64")); }
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await send("Emulation.setUserAgentOverride", { userAgent: IPHONE_UA }); await sleep(800);
  { const shot = (await send("Page.captureScreenshot", { format: "png" })) as { data: string }; writeFileSync(`${SHOTS}/login-out-390.png`, Buffer.from(shot.data, "base64")); }
  await send("Emulation.setUserAgentOverride", { userAgent: "" });
  await ev(`localStorage.setItem(${JSON.stringify(storeKey)}, ${JSON.stringify(storeVal)}); "ok"`);
  const P = `/projects/${PROJECT}`;
  const pages: [string, string][] = [["home", "/"], ["my-work", "/my-work"], ["help", "/help"], ["account", "/account"],
    ...(["dashboard","prepare","team","dates","sessions","process","books","deliverables","execution"] as const).map((p) => [`project-${p}`, `${P}?panel=${p}`] as [string, string]),
    ["videos", "/videos"], ["books", "/books"], ["keynotes", "/keynotes"], ["guide", "/guide"], ["resources", "/resources"], ["certification", "/certification"],
    ["open-handout", "/open/handout/1tWQta-q_9X4SgKr-NEPUK-a9uP2dMsFU"], ["open-video", "/open/video/1X0go06NCPcSC7g8Vvff5LRgiE2hd3Iq8"],
    ["privacy", "/privacy"], ["terms", "/terms"], ["forgot", "/auth/forgot-password"],
    ["vision-stack", `${P}/vision-stack`], ["new-project", "/projects/new"], ["admin", "/admin"], ["open-companion", "/open/companion/current"]];
  // PAGES=videos,project-dashboard narrows the run; WIDTHS=1440 skips the phone
  // pass; WAIT=12000 gives slow shelves longer to draw before the audit runs.
  const only = (process.env.PAGES ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const chosen = only.length ? pages.filter(([n]) => only.includes(n)) : pages;
  const widths = ((process.env.WIDTHS ?? "1440,390").split(",").map(Number)) as number[];
  const extraWait = Number(process.env.WAIT ?? 0);
  const results: Record<string, unknown>[] = [];
  for (const [w, mobile] of ([[1440, false], [390, true]] as [number, boolean][]).filter(([w]) => widths.includes(w))) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: mobile ? 844 : 900, deviceScaleFactor: mobile ? 2 : 1, mobile });
    if (mobile) await send("Emulation.setUserAgentOverride", { userAgent: IPHONE_UA }); else await send("Emulation.setUserAgentOverride", { userAgent: "" });
    for (const [name, path] of chosen) {
      errs.length = 0; await send("Page.navigate", { url: BASE + path }); await sleep((name.startsWith("project") || name === "books" ? 6000 : 4000) + extraWait);
      await ev(`[...document.images].forEach((i) => { i.loading = "eager"; }); "ok"`); await sleep(800);
      const a = await ev(AUDIT) as { title: string; h1: string; hScroll: boolean; height: number; spills: { tag: string; text: string }[]; tiny: number; badImgs: string[]; links: number };
      const noise = [...new Set(errs)].filter((m) => !/GoTrueClient|React DevTools|Download the React|hydrat/i.test(m));
      const flags: string[] = []; if (a.hScroll) flags.push("H-SCROLL"); if (a.spills.length) flags.push(`${a.spills.length} spill`); if (a.badImgs.length) flags.push(`${a.badImgs.length} broken img`); if (noise.length) flags.push(`${noise.length} console err`);
      // full-page capture: resize viewport to page height (lg project pages scroll inside; that's fine, they're capped)
      const hgt = name.startsWith("project") && !mobile ? 2600 : Math.min(Math.max(a.height, mobile ? 844 : 900), 6000);
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: hgt, deviceScaleFactor: mobile ? 2 : 1, mobile }); await sleep(600);
      const shot = (await send("Page.captureScreenshot", { format: "png" })) as { data: string };
      const out = `${SHOTS}/${name}-${w}.png`; writeFileSync(out, Buffer.from(shot.data, "base64"));
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: mobile ? 844 : 900, deviceScaleFactor: mobile ? 2 : 1, mobile });
      console.log(`${flags.length ? "FAIL" : "ok  "} ${ROLE} ${String(w).padStart(4)} ${name.padEnd(20)} ${String(a.height).padStart(5)}px  ${a.title.slice(0,40).padEnd(40)} ${flags.join(" | ")}`);
      for (const sp of a.spills) console.log(`         spill <${sp.tag}> "${sp.text}"`); for (const b of a.badImgs) console.log(`         broken img ${b}`); for (const n of noise) console.log(`         console ${n}`);
      results.push({ role: ROLE, w, name, ...a, console: noise });
    }
  }
  writeFileSync(`${SHOTS}/audit.json`, JSON.stringify(results, null, 1));
  chrome.kill();
}
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { void teardown().finally(() => process.exit(130)); });
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(teardown);
