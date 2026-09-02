/**
 * Every surface of the portal, screenshotted, in the roles and widths that
 * matter — the input to a full review.
 *
 * Andrew: "review everything in this project ... check for bugs obviously,
 * but looking at overall design, functionality, animations, mobile friendly,
 * engagement, user experience in general."
 *
 * One throwaway account, three passes: admin at 1440, viewer at 1440, admin
 * as an emulated iPhone. Each page gets the same spill/console/broken-image
 * audit the mobile audit runs, so the sweep is a regression check as well as
 * a gallery. Output lands in /tmp/runfree-sweep/<pass>/<page>.png with a
 * manifest.json of the audit results.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/sweep.ts <project-id>
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PROJECT = process.argv[2];
if (!PROJECT) { console.error("usage: sweep.ts <project-id> [pass-filter] [page-filter]"); process.exit(1); }
/** Substrings, e.g. `390` to run only the phone pass, `panel-team` for one page. */
const PASS_FILTER = process.argv[3] ?? "";
const PAGE_FILTER = process.argv[4] ?? "";
const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3001";
const OUT = "/tmp/runfree-sweep";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9405;
const EMAIL = "mobile-audit@example.com";
const PASSWORD = "mobile-audit-only-not-a-real-account-9931!";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
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
  const tinyEls = [...document.querySelectorAll("button, a")].filter(el => {
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0) || innerWidth >= 500) return false;
    // Off-canvas drawer contents are inert; nobody can tap them.
    if (el.closest("[inert]")) return false;
    // globals.css widens small text controls with an absolutely positioned
    // ::after under (pointer: coarse), and a stretched link's ::after covers
    // its whole card; the element box includes neither.
    let h = r.height;
    for (const side of ["::after", "::before"]) {
      const ps = getComputedStyle(el, side);
      if (ps.content === "none" || ps.position !== "absolute") continue;
      const t = parseFloat(ps.top), b = parseFloat(ps.bottom);
      if (!Number.isFinite(t) || !Number.isFinite(b)) continue;
      if (t === 0 && b === 0) return false; // inset-0: it fills its positioned ancestor
      h += Math.max(0, -t) + Math.max(0, -b);
    }
    return h < 24;
  });
  const tiny = tinyEls.length;
  const tinyList = tinyEls.slice(0, 25).map(el => {
    const r = el.getBoundingClientRect();
    return { tag: el.tagName.toLowerCase(), text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40), cls: (el.className || "").toString().slice(0, 90), h: Math.round(r.height), w: Math.round(r.width) };
  });
  return { url: location.pathname + location.search, hScroll: de.scrollWidth > vw + 1,
    spills: over.slice(0, 8), tinyTargets: tiny, tinyList,
    badImgs: [...document.images].filter(i => i.getClientRects().length && !(i.complete && i.naturalWidth > 0)).map(i => (i.currentSrc || i.src).slice(0, 100)),
    chars: (document.body.innerText || "").length, h: de.scrollHeight };
})()`;

type Pass = { name: string; role: "admin" | "viewer"; width: number; height: number; mobile: boolean };
const PASSES: Pass[] = [
  { name: "admin-1440", role: "admin", width: 1440, height: 1200, mobile: false },
  { name: "viewer-1440", role: "viewer", width: 1440, height: 1200, mobile: false },
  { name: "admin-390", role: "admin", width: 390, height: 844, mobile: true },
];

async function teardown() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const u = data.users.find((x) => x.email === EMAIL);
  if (!u) return;
  await admin.from("project_members").delete().eq("profile_id", u.id);
  await admin.from("profiles").delete().eq("id", u.id);
  await admin.auth.admin.deleteUser(u.id);
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  const manifest: Record<string, unknown>[] = [];

  for (const pass of PASSES) {
    if (PASS_FILTER && !pass.name.includes(PASS_FILTER)) continue;
    await teardown();
    const { data: made, error } = await admin.auth.admin.createUser({
      email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { name: "Mobile Audit" },
    });
    if (error) throw error;
    const uid = made.user.id;
    await admin.from("project_members").upsert({ project_id: PROJECT, profile_id: uid, role: pass.role }, { onConflict: "project_id,profile_id" });
    // Admin pass doubles as the RunFree-staff pass so the certification and
    // /my-work surfaces render; the viewer pass is a church person.
    await admin.from("profiles").update(
      pass.role === "admin"
        ? { is_staff: true, certification_access: true, account_role: "runfree_team" }
        : { is_staff: false, certification_access: false, account_role: null }
    ).eq("id", uid);

    const store = new Map<string, string>();
    const shim = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const signIn = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { storage: shim as never, persistSession: true, autoRefreshToken: false } });
    const { error: siErr } = await signIn.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (siErr) throw siErr;
    const [[storeKey, storeVal]] = [...store];

    const dir = `${OUT}/${pass.name}`;
    mkdirSync(dir, { recursive: true });

    const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/runfree-sweep-chrome-${pass.name}`,
      "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
    let ws!: WebSocket, id = 0, sessionId: string | null = null;
    const pending = new Map<number, { res: (v: unknown) => void; rej: (e: Error) => void }>();
    const errs: string[] = [];
    const send = (method: string, params: unknown = {}, sid: string | null = sessionId): Promise<unknown> =>
      new Promise((res, rej) => { const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params, ...(sid ? { sessionId: sid } : {}) })); });
    let wsUrl: string | undefined;
    for (let i = 0; i < 80 && !wsUrl; i++) { try { wsUrl = (await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json())).webSocketDebuggerUrl; } catch { await sleep(250); } }
    if (!wsUrl) throw new Error("Chrome never came up");
    ws = new WebSocket(wsUrl);
    await new Promise<void>((r) => { ws.onopen = () => r(); });
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errs.push(m.params.args.map((a: { value?: string; description?: string }) => a.value ?? a.description ?? "").join(" ").slice(0, 160));
      if (m.method === "Runtime.exceptionThrown") errs.push("EXCEPTION " + String(m.params.exceptionDetails?.exception?.description ?? "").slice(0, 160));
      if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id)!; pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    };
    const { targetId } = (await send("Target.createTarget", { url: "about:blank" }, null)) as { targetId: string };
    ({ sessionId } = (await send("Target.attachToTarget", { targetId, flatten: true }, null)) as { sessionId: string });
    await send("Page.enable"); await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: pass.width, height: pass.height, deviceScaleFactor: pass.mobile ? 3 : 2, mobile: pass.mobile });
    if (pass.mobile) {
      await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await send("Network.setUserAgentOverride", { userAgent: IPHONE_UA });
    }
    const ev = async (expr: string) => {
      const r = (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })) as { result: { value: unknown }; exceptionDetails?: { text: string } };
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
      return r.result.value;
    };

    // Login page first, unauthenticated, then plant the session.
    await send("Page.navigate", { url: `${BASE}/auth/login` }); await sleep(3000);
    if (pass.name === "admin-1440" || pass.name === "admin-390") {
      const shot = (await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true })) as { data: string };
      writeFileSync(`${dir}/login.png`, Buffer.from(shot.data, "base64"));
    }
    await ev(`localStorage.setItem(${JSON.stringify(storeKey)}, ${JSON.stringify(storeVal)}); "ok"`);

    const P = `${BASE}/projects/${PROJECT}`;
    const pages: [string, string, number][] = [
      ["home", `${BASE}/`, 4500],
      ...(["dashboard", "prepare", "process", "team", "dates", "sessions", "deliverables", "execution", "books"] as const)
        .map((k) => [`panel-${k}`, `${P}?panel=${k}`, k === "books" ? 9000 : 4500] as [string, string, number]),
      ["vision-stack", `${P}/vision-stack`, 6000],
      ["help", `${BASE}/help`, 3500],
      ["account", `${BASE}/account`, 3500],
      ...(pass.role === "admin"
        ? ([
            ["my-work", `${BASE}/my-work`, 4000],
            ["certification", `${BASE}/certification`, 3500],
            ["resources", `${BASE}/resources`, 9000],
            ["videos", `${BASE}/videos`, 6000],
            ["books", `${BASE}/books`, 9000],
            ["guide", `${BASE}/guide`, 6000],
            ["keynotes", `${BASE}/keynotes`, 9000],
            ["admin", `${BASE}/admin`, 4000],
            ["projects-new", `${BASE}/projects/new`, 3500],
          ] as [string, string, number][])
        : []),
    ];

    for (const [name, u, settle] of pages) {
      if (PAGE_FILTER && !name.includes(PAGE_FILTER)) continue;
      errs.length = 0;
      await send("Page.navigate", { url: u });
      await sleep(settle);
      await ev(`[...document.images].forEach((i) => { i.loading = "eager"; }); "ok"`);
      await sleep(1500);
      const a = await ev(AUDIT) as { url: string; hScroll: boolean; spills: unknown[]; tinyTargets: number; tinyList: { tag: string; text: string; cls: string; h: number; w: number }[]; badImgs: string[]; chars: number; h: number };
      const noise = [...new Set(errs)].filter((m) => !/GoTrueClient|React DevTools/i.test(m));
      const flags: string[] = [];
      if (a.hScroll) flags.push("H-SCROLL");
      if (a.spills.length) flags.push(`${a.spills.length} spill`);
      if (a.badImgs.length) flags.push(`${a.badImgs.length} broken img`);
      if (noise.length) flags.push(`${noise.length} console`);
      if (pass.mobile && a.tinyTargets > 0) flags.push(`${a.tinyTargets} tiny targets`);
      console.log(`${flags.length ? "FAIL" : "ok  "}  ${pass.name.padEnd(12)} ${name.padEnd(18)} ${flags.join(" | ") || `${a.chars} chars, ${a.h}px`}`);
      for (const n of noise) console.log(`         console ${n}`);
      if (pass.mobile) for (const t of a.tinyList) console.log(`         tiny ${t.tag} ${t.w}x${t.h} "${t.text}" [${t.cls}]`);
      manifest.push({ pass: pass.name, page: name, ...a, console: noise });
      const shot = (await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true })) as { data: string };
      writeFileSync(`${dir}/${name}.png`, Buffer.from(shot.data, "base64"));
    }
    chrome.kill();
    await sleep(500);
  }
  writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1));
  console.log(`\nsweep: ${OUT}`);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { void teardown().finally(() => process.exit(130)); });
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(teardown);
