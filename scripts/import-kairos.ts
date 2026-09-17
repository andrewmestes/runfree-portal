/**
 * One-off: the Kairos certification cohort, from its Asana board, onto the
 * pivvot-certification template (081).
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/import-kairos.ts <kairos-dir>        # dry run
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/import-kairos.ts <kairos-dir> --go
 *
 * Andrew, 17 Sept 2026: "make sure when importing kairos, that all task notes
 * (especially in the session recordings) get transferred properly."
 *
 * <kairos-dir> holds what was pulled from Asana while its links were live:
 *
 *   files/<attachment-gid>.<ext>   the attachments (Asana's download links
 *                                  expire in about an hour, so nothing here
 *                                  fetches from Asana)
 *   recaps/<task-gid>.html|.json   the two session write-ups, converted by
 *                                  convert_asana_notes.py, which proves every
 *                                  word, line, table cell, list item and
 *                                  heading survived; .json is the recording
 *                                  lifted off the top of the notes
 *
 * What it does, each step skipped when already done:
 *
 *   1. Creates the project the New Project page's way and hands it to
 *      Andrew as creator, admin and lead (scripts/lib/stamp-project.ts).
 *   2. The Kairos logo.
 *   3. Key Dates: the four sessions (the Asana "Dates" card plus the notes).
 *   4. Sessions 1 and 2 with their full notes, takeaways and recordings, and
 *      Sessions 3 and 4 as dated rows so the pre-session questions reach the
 *      cohort.
 *   5. The Module 1 cards: each tool's example chart from the Digital
 *      Facilitator's Guide, shown in Session 2, as the cohort's board has
 *      them; 1.9 also carries the 2022 Two Motivators sheet. And the
 *      "Churches you will practice with" card.
 *   6. Module 1's "Tools covered in session", ticked: Session 2 walked 1.1
 *      through 1.13.
 *   7. Session 2's assignments as tasks: the cohort's practice and reading,
 *      and what Will and Andrew owe the group.
 *   8. Neil Reynolds as a viewer. He already has an account, so no email is
 *      sent. The other seven are NOT added here: adding them sends invites.
 *
 * Needs the dev server on 3001 for step 1 only.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { stampProjectFor } from "./lib/stamp-project";

const DIR = process.argv[2];
const GO = process.argv.includes("--go");
if (!DIR || DIR.startsWith("--")) {
  console.error("usage: import-kairos.ts <kairos-dir> [--go]");
  process.exit(1);
}

const NAME = "Kairos Certification Cohort (2026)";
const TEMPLATE = "pivvot-certification";
const BUCKET = "deliverable-images";
const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3001";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const S1 = "1215238610600149";
const S2 = "1217861657467204";
const MOD1 = "Mod #1 FUNNEL FUSION";
const MOD2 = "Mod #2 CROWD CLOUD";
const GUIDE = "Example chart from the Digital Facilitator's Guide, shown in Session 2.";

const log = (s: string) => console.log(s);
const file = (name: string) => join(DIR, "files", name);
const must = <T>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
};

type Card = {
  section: string;
  title: string;
  caption: string | null;
  body: string | null;
  face: string; // file name under files/
  faceName: string;
  extra?: { file: string; name: string; mime: string }[];
};

const CARDS: Card[] = [
  { section: MOD1, title: "1.1 Expectations Exercise", caption: GUIDE, body: null,
    face: "1217806891229673.png", faceName: "1.1 Expectations.png" },
  { section: MOD1, title: "1.2 Three Kinds of Change", caption: GUIDE, body: null,
    face: "1217806891229675.png", faceName: "1.2 Three Kinds of Change.png" },
  // Asana also has 1.2's chart on 1.3, the same stored image twice; it is left off here.
  { section: MOD1, title: "1.3 Vision Frame Introduction", caption: GUIDE, body: null,
    face: "1217806891229679.png", faceName: "1.3 Vision Frame Overview and Inside.png" },
  { section: MOD1, title: "1.5 Collaboration Dynamics", caption: GUIDE, body: null,
    face: "1217806891229681.png", faceName: "1.5 Collaboration Dynamics.png" },
  { section: MOD1, title: "1.6 Transfer of Authority", caption: GUIDE, body: null,
    face: "1217806891229683.png", faceName: "1.6 Transfer of Authority.png" },
  { section: MOD1, title: "1.7 Future Team Survey", caption: "The Future Team Survey handout.", body: null,
    face: "1217806891229685.png", faceName: "1.7 Future Team Survey.png" },
  { section: MOD1, title: "1.8 Functional Great Commission", caption: GUIDE, body: null,
    face: "1217806891229687.png", faceName: "1.8 The Functional Great Commission.png" },
  { section: MOD1, title: "1.9 Upper / Lower Room Assessment",
    caption: "The Upper Room / Lower Room drawing, captured the day after Session 1.", body: null,
    face: "1215865351086773.png", faceName: "1.9 Upper Room Lower Room.png",
    extra: [{ file: "1215237524241297.pdf", name: "7-PIV-FunnelFusionProcess-Motivators.pdf", mime: "application/pdf" }] },
  { section: MOD1, title: "1.10 Five Eras Assessment", caption: GUIDE, body: null,
    face: "1217806891229689.png", faceName: "1.10 Four Eras Assessment.png" },
  { section: MOD1, title: "1.11 Funnel Fusion", caption: GUIDE, body: null,
    face: "1217806891229691.png", faceName: "1.11 Funnel Fusion.png" },
  { section: MOD1, title: "1.12 Current Vision Frame Evaluation", caption: GUIDE, body: null,
    face: "1217806775456527.png", faceName: "1.12 Vision Frame Review.png" },
  { section: MOD1, title: "1.13 Church Problem Statement", caption: GUIDE, body: null,
    face: "1217806775456531.png", faceName: "1.13 Problem Statement.png" },
  // Asana's notes, as they are: the names and spellings are the board's.
  { section: "Certification Resources", title: "Churches you will practice with",
    caption: "From the cohort's chat, 25 August.",
    body:
      "<ul>" +
      [
        "Neil Reynolds - University Church (340)",
        "Sean Thomé - Expand Network &amp; Crossroads Christian Church",
        "Jon Reed - Long Beech, Torrance, Kindred, Chula Vista",
        "Bruce Bates - Kairos &amp; Oliver Creek Church",
        "Scott Lambert - Etna Church, Harlan Church",
        "Jon Mullican - Central Edmonton CoC, East Ridge CoC",
        "Jared King - Missio (60)",
        "Doug Peters - Vision CA",
      ].map((l) => `<li>${l}</li>`).join("") +
      "</ul>",
    face: "1217806891229669.png", faceName: "Churches you will practice with (chat).png" },
];

const SESSIONS = [
  {
    gid: S1,
    title: "Session 1 — Orientation and the Five Core Drawings",
    held_on: "2026-06-18",
    section: "PROCESS OVERVIEW",
    position: 0,
    takeaways:
      "The opening session, with seven of the eight present (Doug Peters was away). Will set the standard for the whole certification: draw the five core drawings from memory and get a breakthrough with them. The five are the Doorway (Upper Room / Lower Room), the Pathway (the six-module overview), the Master's Way (Funnel Fusion), the Vision Frame and the Horizon Storyline. He laid out the module design (four change modules for head, heart, hands and time, then two modules that produce deliverables), the flip-chart method (frame every chart) and a live Vision Frame Inside interview. He covered the five Vision Frame definitions and the new build order: Mission, then Measures, Strategy and Values, with Vision last. Andrew taught Upper Room / Lower Room, walked the group through the Asana board and the Digital Facilitator's Guide, and Will explained what can and cannot be shared. Homework: practise the hobby interview and the Upper Room / Lower Room teach-back, draw the process icons, buy a practice flip chart, and track progress on the Core Tools Success Scorecard. The next session was set for Monday 3 August and later held on 25 August.",
  },
  {
    gid: S2,
    title: "Session 2 — Practice Reps and Module 1, Tool by Tool",
    held_on: "2026-08-25",
    section: MOD1,
    position: 1,
    takeaways:
      "All eight were present. The session opened with each person naming where they will practise with a real church, followed by two unprepared teach-backs: Bruce taught Upper Room / Lower Room, and Scott and Jon Reed taught the Vision Frame. Will coached both, adding the layers Bruce left out and the difference between teaching order and build order. Because two network leaders were present, Will taught Cloud and Box off the agenda, then drew his three toolboxes (church, personal and network). He covered calling activation, including the 8-week add-on that the cohort will be invited to at the end of September, and what a client leaves with. The session closed by walking Module 1 from 1.0 to 1.13, numbered as in the August 2026 guide. Crowd Cloud and the Kingdom Concept moved to the next session. Next session 29 October; the course wraps on 2 November.",
  },
  { gid: null, title: "Session 3", held_on: "2026-10-29", section: MOD2, position: 2, takeaways: null },
  { gid: null, title: "Session 4 — certification wrap", held_on: "2026-11-02", section: null, position: 3, takeaways: null },
] as const;

const KEY_DATES = [
  { title: "Session 1", due_on: "2026-06-18", notes: null, position: 1 },
  { title: "Session 2", due_on: "2026-08-25", notes: "First planned for 3 August.", position: 2 },
  { title: "Session 3", due_on: "2026-10-29", notes: "Opens with the Kingdom Concept and Crowd Cloud.", position: 3 },
  { title: "Session 4 — certification wrap", due_on: "2026-11-02", notes: null, position: 4 },
];

type Task = { owner: "church" | "runfree"; section: string | null; title: string; notes: string | null; due_on: string | null };
const NEXT = "2026-10-29";
// Session 2's ASSIGNMENTS, in its own order and words. Session 1's list was
// re-issued by Session 2 or has been done (the recordings are posted), so it
// stays in the notes rather than becoming open tasks.
const TASKS: Task[] = [
  { owner: "church", section: MOD1, title: "Practise teaching Upper Room / Lower Room", notes: "Someone will be asked to teach it again.", due_on: NEXT },
  { owner: "church", section: MOD1, title: "Practise the Vision Frame teach-back", notes: "Sides, questions, definitions, mM- language, icons. With Upper Room / Lower Room, the two biggest tools in the toolbox.", due_on: NEXT },
  { owner: "church", section: MOD1, title: "Draw Funnel Fusion", notes: "Hardest drawing there is. Get flip charts out and run it on anyone who'll sit still.", due_on: NEXT },
  { owner: "church", section: MOD1, title: "Practise the Pivvot Vision Framing Overview", notes: "The 6 P's and mantras. Expect to be called on for a redraw.", due_on: NEXT },
  { owner: "church", section: MOD1, title: "Teach 3 Kinds of Change, and run the 4 Eras Assessment in the field", notes: "An easy standalone that adds value anywhere.", due_on: NEXT },
  { owner: "church", section: null, title: "Work toward all five core drawings cold, no notes", notes: "That's the certification standard.", due_on: NEXT },
  { owner: "church", section: null, title: "Hold the flip chart brand guidelines", notes: "Black outline, all caps red header, blue as primary.", due_on: NEXT },
  { owner: "church", section: MOD2, title: "Read the Kingdom Concept chapter in Church Unique", notes: "Next session opens there. It is chapter 9 on the Books tab.", due_on: NEXT },
  { owner: "church", section: MOD1, title: "Watch the Module 1 wrap-up video and the Problem Statement introduction video", notes: null, due_on: NEXT },
  { owner: "church", section: MOD2, title: "Finish the Crowd Cloud pre-work", notes: "7 Laws Overview, Funnel Fusion Reinforcement, the Kingdom Concept Questions answered individually, and the demographics report, which needs member home addresses collected in advance.", due_on: NEXT },
  { owner: "runfree", section: null, title: "Deliver the updated Digital Facilitator's Guide", notes: "Coming soon.", due_on: null },
  { owner: "runfree", section: null, title: "Deliver the rebranded certification handouts", notes: "Some of what's posted is still the client version.", due_on: null },
  { owner: "runfree", section: null, title: "Launch the new certification hub website", notes: "The cohort volunteered as guinea pigs.", due_on: null },
  { owner: "runfree", section: MOD1, title: "Produce the Future Team Survey, plus a handout listing the questions", notes: null, due_on: null },
  { owner: "runfree", section: MOD1, title: "Add the “verify they know the eras” pre-check to the 1.10 tips page", notes: null, due_on: null },
  { owner: "runfree", section: null, title: "Formalize the community and subscription model", notes: "By the end of September, evergreen access confirmed. Nobody loses Asana in the meantime.", due_on: "2026-09-30" },
  { owner: "runfree", section: null, title: "Send the September Common Calling and Younique invitation", notes: "With pricing and the lay-leader ask.", due_on: "2026-09-30" },
  { owner: "runfree", section: null, title: "Deliver the group dynamics training", notes: "Deferred to the next session.", due_on: NEXT },
];

async function profileByEmail(email: string): Promise<{ id: string; full_name: string | null } | null> {
  const r = await admin.from("profiles").select("id, full_name").ilike("email", email).maybeSingle();
  return must(r, `profile ${email}`) as { id: string; full_name: string | null } | null;
}

async function upload(path: string, bytes: Buffer, contentType: string) {
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(`${path}: ${error.message}`);
}

async function main() {
  for (const need of [
    ...CARDS.flatMap((c) => [c.face, ...(c.extra ?? []).map((e) => e.file)]),
    "1215238610600166.png",
  ]) {
    if (!existsSync(file(need))) throw new Error(`missing ${file(need)}`);
  }
  for (const s of SESSIONS) {
    if (s.gid && !existsSync(join(DIR, "recaps", `${s.gid}.html`))) throw new Error(`missing recap for ${s.gid}`);
  }

  log(`${GO ? "IMPORTING" : "dry run (pass --go)"} → ${NAME}\n`);

  const tpl = must(await admin.from("templates").select("id").eq("slug", TEMPLATE).single(), "template") as { id: string };
  const andrew = await profileByEmail("andrew@runfree.co");
  const neil = await profileByEmail("nreynolds@kairoschurchplanting.org");
  if (!andrew) throw new Error("no profile for andrew@runfree.co");

  // 1. The project, stamped the New Project page's way and handed to Andrew.
  const projectId = await stampProjectFor({
    admin, templateId: tpl.id, name: NAME, ownerId: andrew.id, visibility: "team", go: GO, base: BASE, log,
  });
  const now = new Date().toISOString();

  // Template group ids, by key.
  const groups = must(
    await admin.from("template_prep_groups").select("id, key").eq("template_id", tpl.id),
    "groups"
  ) as { id: string; key: string }[];
  const groupId = (key: string) => {
    const g = groups.find((x) => x.key === key);
    if (!g) throw new Error(`template has no group ${key}`);
    return g.id;
  };

  // 2. Logo.
  {
    const p = projectId
      ? (must(await admin.from("projects").select("logo_path").eq("id", projectId).single(), "logo") as { logo_path: string | null })
      : { logo_path: null };
    if (p.logo_path) log(`logo          already set`);
    else if (!GO || !projectId) log(`logo          would upload Kairos-logo-FNL-cmyka.png`);
    else {
      const path = `${projectId}/logo-${randomUUID()}.png`;
      await upload(path, readFileSync(file("1215238610600166.png")), "image/png");
      must(await admin.from("projects").update({ logo_path: path }).eq("id", projectId), "logo");
      log(`logo          set`);
    }
  }

  // 3. Key Dates.
  {
    const gid = groupId("pc-key-dates");
    const have = projectId
      ? (must(await admin.from("prep_items").select("title").eq("project_id", projectId).eq("group_id", gid), "dates") as { title: string }[])
      : [];
    for (const d of KEY_DATES) {
      if (have.some((h) => h.title === d.title)) { log(`date          exists  ${d.due_on}  ${d.title}`); continue; }
      if (!GO || !projectId) { log(`date          would add ${d.due_on}  ${d.title}`); continue; }
      must(await admin.from("prep_items").insert({ project_id: projectId, group_id: gid, ...d }), "date");
      log(`date          added   ${d.due_on}  ${d.title}`);
    }
  }

  // 4. Sessions.
  const sessionIds: Record<string, string> = {};
  for (const s of SESSIONS) {
    const recap = s.gid ? readFileSync(join(DIR, "recaps", `${s.gid}.html`), "utf8") : null;
    const recording = s.gid
      ? (JSON.parse(readFileSync(join(DIR, "recaps", `${s.gid}.json`), "utf8")) as { recording_url: string }).recording_url
      : null;
    const row = {
      title: s.title, held_on: s.held_on, section: s.section, position: s.position,
      recap, takeaways: s.takeaways, recording_url: recording, published_at: now,
    };
    const existing = projectId
      ? (must(await admin.from("sessions").select("id, recap").eq("project_id", projectId).eq("title", s.title), "session") as { id: string; recap: string | null }[])
      : [];
    const what = `${s.held_on}  ${s.title}${recap ? `  (notes ${recap.length.toLocaleString()} chars, recording ${recording})` : ""}`;
    if (existing.length) {
      sessionIds[s.title] = existing[0].id;
      // Notes are only ever written by this script when empty: an edit made in
      // the portal since the import wins.
      if (recap && !existing[0].recap && GO) {
        must(await admin.from("sessions").update({ recap }).eq("id", existing[0].id), "recap");
        log(`session       filled  ${what}`);
      } else log(`session       exists  ${what}`);
      continue;
    }
    if (!GO || !projectId) { log(`session       would add ${what}`); continue; }
    const ins = must(
      await admin.from("sessions").insert({ project_id: projectId, ...row }).select("id").single(),
      "session insert"
    ) as { id: string };
    sessionIds[s.title] = ins.id;
    log(`session       added   ${what}`);
  }

  // 5. Cards.
  for (const [i, c] of CARDS.entries()) {
    const existing = projectId
      ? (must(
          await admin.from("deliverables").select("id, image_path").eq("project_id", projectId)
            .eq("kind", "session_image").eq("title", c.title),
          "card"
        ) as { id: string; image_path: string | null }[])
      : [];
    const extras = (c.extra ?? []).map((e) => e.name).join(", ");
    if (existing.length && existing[0].image_path) { log(`card          exists  ${c.section} › ${c.title}`); continue; }
    if (!GO || !projectId) {
      log(`card          would add ${c.section} › ${c.title}  ← ${c.faceName}${extras ? ` + ${extras}` : ""}${c.body ? " + notes" : ""}`);
      continue;
    }
    const faceBytes = readFileSync(file(c.face));
    const facePath = `${projectId}/${randomUUID()}.png`;
    await upload(facePath, faceBytes, "image/png");
    const row = {
      project_id: projectId, kind: "session_image" as const, section: c.section, title: c.title,
      caption: c.caption, body: c.body, image_path: facePath, position: i, published_at: now,
    };
    const id = existing.length
      ? (must(await admin.from("deliverables").update(row).eq("id", existing[0].id).select("id").single(), "card update") as { id: string }).id
      : (must(await admin.from("deliverables").insert(row).select("id").single(), "card insert") as { id: string }).id;
    // Every attachment is a row (051), the face included, so a reader can
    // open the chart full size.
    const rows = [
      { path: facePath, name: c.faceName, mime: "image/png", size: faceBytes.length, is_image: true },
    ];
    for (const e of c.extra ?? []) {
      const bytes = readFileSync(file(e.file));
      const path = `${projectId}/doc-${randomUUID()}.pdf`;
      await upload(path, bytes, e.mime);
      rows.push({ path, name: e.name, mime: e.mime, size: bytes.length, is_image: false });
    }
    must(
      await admin.from("deliverable_files").insert(
        rows.map((r, n) => ({ ...r, deliverable_id: id, project_id: projectId, position: n }))
      ),
      "card files"
    );
    log(`card          added   ${c.section} › ${c.title}  (${rows.length} file${rows.length === 1 ? "" : "s"})`);
  }

  // 6. Module 1 covered.
  {
    const gid = groupId("pc-mod1-tools");
    const items = projectId
      ? (must(await admin.from("prep_items").select("id, is_done").eq("project_id", projectId).eq("group_id", gid), "mod1") as { id: string; is_done: boolean }[])
      : [];
    const open = items.filter((x) => !x.is_done);
    if (!projectId) log(`module 1      would tick all 13 tools covered`);
    else if (open.length === 0) log(`module 1      all ${items.length} ticked`);
    else if (!GO) log(`module 1      would tick ${open.length} of ${items.length}`);
    else {
      must(await admin.from("prep_items").update({ is_done: true }).in("id", open.map((x) => x.id)), "tick");
      log(`module 1      ticked ${open.length} of ${items.length}`);
    }
  }

  // 7. Tasks from Session 2.
  {
    const s2 = sessionIds[SESSIONS[1].title] ?? null;
    const have = projectId
      ? (must(await admin.from("project_tasks").select("title").eq("project_id", projectId), "tasks") as { title: string }[])
      : [];
    let position = have.length;
    for (const t of TASKS) {
      if (have.some((h) => h.title === t.title)) { log(`task          exists  ${t.title}`); continue; }
      if (!GO || !projectId || !s2) { log(`task          would add [${t.owner}] ${t.title}${t.due_on ? ` (by ${t.due_on})` : ""}`); continue; }
      must(
        await admin.from("project_tasks").insert({ project_id: projectId, session_id: s2, position: position++, ...t }),
        "task"
      );
      log(`task          added   [${t.owner}] ${t.title}`);
    }
  }

  // 8. Neil.
  const neilRow = neil && projectId
    ? (must(await admin.from("project_members").select("role").eq("project_id", projectId).eq("profile_id", neil.id), "neil row") as { role: string }[])
    : [];
  if (!neil) log(`member        no account for Neil Reynolds — skipped`);
  else if (neilRow.length) log(`member        exists  ${neil.full_name ?? "Neil Reynolds"} (${neilRow[0].role})`);
  else if (!projectId || !GO) log(`member        would add ${neil.full_name ?? "Neil Reynolds"} as viewer (existing account, no email)`);
  else {
    must(
      await admin.from("project_members").upsert(
        { project_id: projectId, profile_id: neil.id, role: "viewer" },
        { onConflict: "project_id,profile_id", ignoreDuplicates: true }
      ),
      "neil"
    );
    log(`member        ${neil.full_name ?? "Neil Reynolds"} is a viewer`);
  }

  log(GO ? `\ndone → ${BASE}/projects/${projectId}` : `\ndry run — add --go to write`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
