/**
 * Invite a whole cohort from a spreadsheet, at a set time.
 *
 * Andrew, 22 Sept 2026, with the September attendee list: "is it possible
 * for this list to get added and sent the welcome email in exactly 1 hour?"
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/invite-cohort.ts \
 *       <project-id> <attendees.json> [--at 2026-09-22T12:53:00-04:00] [--go] [--hub-only]
 *
 * --hub-only (Andrew, 22 Sept: "let's not add them to the project yet. just
 * give them access to the certification resources hub for now"): invite,
 * then open the certification pages — profiles.account_role 'framer' (the
 * server gate, api-auth.ts) and certification_access (the client gate and
 * the home page's "no projects → hub" redirect) — and touch no project. The
 * invite carries no project name, so the email reads "Your portal access is
 * ready … your handouts, training videos and Will's books", which is exactly
 * what it is. Promotion never demotes: an admin or RunFree person stays so.
 *
 * Without --go it is a dry run: it prints who would be invited, who already
 * has a login, and who is already a member, and sends nothing. With --at it
 * waits until that moment before doing anything, so it can be started now
 * and fire later.
 *
 * Per person it does exactly what the portal's own "Manage access" does
 * (api/projects/[id]/members): invitePerson() → the Supabase invite email,
 * addressed with the project name → wait for handle_new_user's profile row →
 * project_members as viewer, with their title as org_role. It also puts
 * them on the roster (church_contacts, which the Team panel shows as
 * Participants on a cohort) so the room has names and titles from day one.
 * Idempotent: a second run skips anyone already a member.
 *
 * The attendees file is [{ name, title, org, city, email }].
 */
import { readFileSync } from "node:fs";
import { supabaseAdmin } from "../src/lib/supabase";
import { invitePerson } from "../src/lib/invite";

const [projectId, file, ...rest] = process.argv.slice(2);
if (!projectId || !file) {
  console.error("usage: invite-cohort.ts <project-id> <attendees.json> [--at ISO] [--go]");
  process.exit(1);
}
const GO = rest.includes("--go");
const HUB_ONLY = rest.includes("--hub-only");
const at = rest.includes("--at") ? new Date(rest[rest.indexOf("--at") + 1]) : null;
const ORIGIN = process.env.PORTAL_ORIGIN ?? "https://portal.runfree.co";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Attendee = { name: string; title?: string; org?: string; city?: string; email: string };

async function main() {
  const attendees = JSON.parse(readFileSync(file, "utf8")) as Attendee[];
  const { data: proj, error: pErr } = await supabaseAdmin.from("projects").select("id,name").eq("id", projectId).single();
  if (pErr || !proj) throw new Error(`No such project: ${projectId}`);
  console.log(`${GO ? "LIVE" : "DRY RUN"} — ${attendees.length} attendees → ${HUB_ONLY ? "certification hub access only (no project)" : proj.name}`);

  if (at) {
    const wait = at.getTime() - Date.now();
    if (wait > 0) {
      console.log(`waiting until ${at.toISOString()} (${Math.round(wait / 1000)}s)…`);
      await sleep(wait);
    }
  }

  const { data: userList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const logins = new Map((userList?.users ?? []).map((u) => [u.email?.toLowerCase() ?? "", u.id]));
  const { data: members } = await supabaseAdmin.from("project_members").select("profile_id").eq("project_id", projectId);
  const memberIds = new Set((members ?? []).map((m) => m.profile_id));
  const { data: roster } = await supabaseAdmin.from("church_contacts").select("email, position").eq("project_id", projectId);
  const rosterEmails = new Set((roster ?? []).map((c) => (c.email ?? "").toLowerCase()));
  let position = Math.max(-1, ...((roster ?? []).map((c) => c.position ?? -1))) + 1;

  const report: string[] = [];
  for (const a of attendees) {
    const email = a.email.trim().toLowerCase();
    const existing = logins.get(email) ?? null;
    let line = `${a.name} <${email}>`;
    if (HUB_ONLY) {
      const { data: prof } = existing ? await supabaseAdmin.from("profiles").select("account_role, certification_access").eq("id", existing).maybeSingle() : { data: null };
      const alreadyOpen = !!prof && (["admin", "runfree_team", "framer", "framer_subscribed"].includes(prof.account_role ?? "") && prof.certification_access);
      if (alreadyOpen) { report.push(`${line} — already has hub access, skipped`); continue; }
      if (!GO) { report.push(`${line} — ${existing ? "has a login; would be granted hub access (no email)" : "would be INVITED (email) and granted hub access"}`); continue; }
      let profileId = existing;
      if (!profileId) {
        const r = await invitePerson(email, ORIGIN, a.name, null);
        if (r.outcome === "failed") { report.push(`${line} — INVITE FAILED: ${r.error}`); continue; }
        for (let i = 0; i < 20 && !profileId; i++) {
          const { data } = await supabaseAdmin.from("profiles").select("id").eq("email", email).maybeSingle();
          profileId = data?.id ?? null;
          if (!profileId) await sleep(500);
        }
        if (!profileId) { report.push(`${line} — invited, but no profile appeared`); continue; }
        line += " — invited";
      } else line += " — had a login";
      const keep = prof?.account_role && !["client"].includes(prof.account_role);
      const { error: uErr } = await supabaseAdmin.from("profiles").update({ ...(keep ? {} : { account_role: "framer" }), certification_access: true }).eq("id", profileId);
      report.push(uErr ? `${line}; grant failed: ${uErr.message}` : `${line}, hub access granted`);
      await sleep(400);
      continue;
    }

    if (existing && memberIds.has(existing)) { report.push(`${line} — already a member, skipped`); continue; }

    if (!GO) { report.push(`${line} — ${existing ? "has a login; would be added (no email)" : "would be INVITED (email) and added"}`); continue; }

    let profileId = existing;
    if (!profileId) {
      const r = await invitePerson(email, ORIGIN, a.name, proj.name);
      if (r.outcome === "failed") { report.push(`${line} — INVITE FAILED: ${r.error}`); continue; }
      for (let i = 0; i < 20 && !profileId; i++) {
        const { data } = await supabaseAdmin.from("profiles").select("id").eq("email", email).maybeSingle();
        profileId = data?.id ?? null;
        if (!profileId) await sleep(500);
      }
      if (!profileId) { report.push(`${line} — invited, but no profile appeared`); continue; }
      line += " — invited";
    } else line += " — had a login";

    const { error: mErr } = await supabaseAdmin.from("project_members").insert({ project_id: projectId, profile_id: profileId, role: "viewer", org_role: a.title ?? null });
    if (mErr && mErr.code !== "23505") { report.push(`${line}; member insert failed: ${mErr.message}`); continue; }
    line += ", added as viewer";

    if (!rosterEmails.has(email)) {
      const { error: cErr } = await supabaseAdmin.from("church_contacts").insert({ project_id: projectId, full_name: a.name, email, title: [a.title, a.org, a.city].filter(Boolean).join(" · ") || null, position: position++ });
      line += cErr ? `; roster failed: ${cErr.message}` : ", on the roster";
    }
    report.push(line);
    await sleep(400); // be gentle with the mail rate limit
  }
  console.log(report.join("\n"));
  console.log(`done ${new Date().toISOString()}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
