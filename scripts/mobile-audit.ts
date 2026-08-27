/**
 * Mobile audit — drives the portal in Chrome as an emulated iPhone.
 *
 * "Does it look right on a phone" is two questions, and a screenshot only
 * answers the first. This answers the second: per page, does anything spill
 * past the viewport, does the page scroll sideways, did every visible image
 * actually decode, and did anything hit the console. Those are the failures
 * that survive a careful look at a screenshot.
 *
 * It signs in as a throwaway account it creates and deletes, the same pattern
 * as tests/rls.test.ts — so it never needs anyone's password and never leaves
 * an extra face in a project's Team panel.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/mobile-audit.ts <project-id>
 *
 * Requires the dev server on 3001 (see CLAUDE.md — never `npm run` here).
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PROJECT = process.argv[2];
if (!PROJECT) {
  console.error("usage: mobile-audit.ts <project-id>");
  process.exit(1);
}

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3001";
const SHOTS = "/tmp/runfree-mobile-audit";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9399;
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const EMAIL = "mobile-audit@example.com";
const PASSWORD = "mobile-audit-only-not-a-real-account-9931!";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The checks a screenshot cannot make. Runs in the page. */
const AUDIT = `(() => {
  const vw = innerWidth, de = document.documentElement, over = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || !el.getClientRects().length) continue;
    const r = el.getBoundingClientRect();
    if ((r.width === 0 && r.height === 0) || r.right <= vw + 1) continue;
    // A spill inside something that clips or scrolls is a carousel, not a bug.
    let clipped = false;
    for (let a = el.parentElement, i = 0; a && i < 6; a = a.parentElement, i++) {
      const acs = getComputedStyle(a);
      if (acs.overflowX !== "visible" || acs.overflow !== "visible") { clipped = true; break; }
    }
    if (clipped) continue;
    over.push({ tag: el.tagName.toLowerCase(), cls: (typeof el.className === "string" ? el.className : "").slice(0, 70),
      left: Math.round(r.left), right: Math.round(r.right), text: (el.textContent || "").trim().slice(0, 38) });
  }
  return {
    url: location.pathname + location.search, scrollW: de.scrollWidth, vw,
    hScroll: de.scrollWidth > vw + 1,
    spills: over.slice(0, 10),
    badImgs: [...document.images].filter(i => i.getClientRects().length && !(i.complete && i.naturalWidth > 0))
      .map(i => (i.currentSrc || i.src).slice(0, 110)),
    chars: (document.body.innerText || "").length,
  };
})()`;

async function findUser() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === EMAIL) ?? null;
}

async function teardown() {
  const u = await findUser();
  if (!u) return;
  await admin.from("project_members").delete().eq("profile_id", u.id);
  await admin.from("profiles").delete().eq("id", u.id);
  await admin.auth.admin.deleteUser(u.id);
}

async function main() {
  // A fresh account every run: a leftover one would show up in Team.
  await teardown();
  const { data: made, error: mkErr } = await admin.auth.admin.createUser({
    email: EMAIL, password: PASSWORD, email_confirm: true,
    user_metadata: { name: "Mobile Audit" },
  });
  if (mkErr) throw mkErr;
  const uid = made.user.id;
  await admin.from("project_members").upsert(
    { project_id: PROJECT, profile_id: uid, role: "admin" },
    { onConflict: "project_id,profile_id" },
  );
  await admin.from("profiles").update({ is_staff: true }).eq("id", uid);

  // Capture what supabase-js itself writes rather than guessing the format.
  const store = new Map<string, string>();
  const shim = { getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k) };
  const signIn = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { storage: shim as never, persistSession: true, autoRefreshToken: false },
  });
  const { error: siErr } = await signIn.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (siErr) throw siErr;
  const [[storeKey, storeVal]] = [...store];

  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });

  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`,
    `--user-data-dir=/tmp/runfree-audit-chrome`, "--no-first-run", "--no-default-browser-check",
    "--disable-gpu", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });

  let ws!: WebSocket, id = 0, sessionId: string | null = null;
  const pending = new Map<number, { res: (v: unknown) => void; rej: (e: Error) => void }>();
  const errs: string[] = [];
  const send = (method: string, params: unknown = {}, sid: string | null = sessionId): Promise<unknown> =>
    new Promise((res, rej) => { const n = ++id; pending.set(n, { res, rej });
      ws.send(JSON.stringify({ id: n, method, params, ...(sid ? { sessionId: sid } : {}) })); });

  let wsUrl: string | undefined;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    try { wsUrl = (await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json())).webSocketDebuggerUrl; }
    catch { await sleep(250); }
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
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id)!; pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  };
  const { targetId } = (await send("Target.createTarget", { url: "about:blank" }, null)) as { targetId: string };
  ({ sessionId } = (await send("Target.attachToTarget", { targetId, flatten: true }, null)) as { sessionId: string });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Network.setUserAgentOverride", { userAgent: IPHONE_UA });

  const ev = async (expr: string) => {
    const r = (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })) as
      { result: { value: unknown }; exceptionDetails?: { text: string } };
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };
  const go = async (u: string, settle = 4200) => { await send("Page.navigate", { url: u }); await sleep(settle); };

  await go(`${BASE}/auth/login`, 2500);
  await ev(`localStorage.setItem(${JSON.stringify(storeKey)}, ${JSON.stringify(storeVal)}); "ok"`);

  const P = `${BASE}/projects/${PROJECT}`;
  const pages: [string, string][] = [
    ["my-tasks", `${BASE}/my-work`],
    ["help", `${BASE}/help`],
    ...(["dashboard", "prepare", "process", "team", "dates", "sessions", "deliverables", "books"] as const)
      .map((k) => [`panel-${k}`, `${P}?panel=${k}`] as [string, string]),
  ];

  let bad = 0;
  for (const [name, u] of pages) {
    errs.length = 0;
    await go(u, name === "panel-books" ? 8000 : 4200);
    const a = await ev(AUDIT) as {
      hScroll: boolean; scrollW: number; vw: number; chars: number;
      spills: { tag: string; cls: string; left: number; right: number; text: string }[]; badImgs: string[];
    };
    const noise = [...new Set(errs)].filter((m) => !/GoTrueClient|React DevTools/i.test(m));
    const flags: string[] = [];
    if (a.hScroll) flags.push(`H-SCROLL ${a.scrollW}>${a.vw}`);
    if (a.spills.length) flags.push(`${a.spills.length} spill`);
    if (a.badImgs.length) flags.push(`${a.badImgs.length} broken img`);
    if (noise.length) flags.push(`${noise.length} console err`);
    if (flags.length) bad++;
    console.log(`${flags.length ? "FAIL" : "ok  "}  ${name.padEnd(18)} ${flags.join(" | ") || `${a.chars} chars`}`);
    for (const sp of a.spills) console.log(`         spill <${sp.tag}> ${sp.left}..${sp.right} "${sp.text}" .${sp.cls}`);
    for (const b of a.badImgs) console.log(`         broken img ${b}`);
    for (const n of noise) console.log(`         console ${n}`);
    const shot = (await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true })) as { data: string };
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(shot.data, "base64"));
  }

  await send("Target.closeTarget", { targetId }, null);
  chrome.kill();
  console.log(`\nscreenshots: ${SHOTS}`);
  console.log(bad === 0 ? "clean on a 390x844 iPhone" : `${bad} page(s) need a look`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await teardown(); });
