/**
 * One-off: load the 9/11–9/12 Athena onsite into the portal.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/athena-onsite-import.ts <dir>
 *
 * <dir> holds chart-NN.jpg, cards.json, recap-day1.html, recap-day2.html.
 * Uploads every chart to the deliverable-images bucket under the project id,
 * creates or fills the session_image cards module by module (three template
 * scaffolds are filled in place rather than duplicated), attaches the second
 * Expectations chart as an extra image, and creates the two session rows
 * with their recaps. Idempotent on title: re-running updates rather than
 * duplicating.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const PROJECT = "8820b0e9-a849-448c-a1b1-913f24fa8efd";
const BUCKET = "deliverable-images";
const dir = process.argv[2];
if (!dir) throw new Error("dir required");

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

// Template scaffolds that already exist on the project, keyed by the title
// we are giving the filled card. Filled in place so the module does not end
// up with an empty "Expectations Exercise" beside a full one.
const SCAFFOLD: Record<string, string> = {
  "Expectations Exercise": "Expectations Exercise",
  "Two Motivators — Upper Room and Lower Room": "Upper / Lower Room Assessment",
  "4 Eras Assessment": "5 Eras Assessment",
};

type Card = {
  file: string; extra?: string[]; section: string; position: number;
  title: string; caption: string; body: string;
};

async function upload(file: string): Promise<string> {
  const path = `${PROJECT}/${randomUUID()}.jpg`;
  const { error } = await admin.storage.from(BUCKET).upload(path, readFileSync(join(dir, file)), {
    contentType: "image/jpeg", upsert: false,
  });
  if (error) throw new Error(`${file}: ${error.message}`);
  return path;
}

async function main() {
  const cards: Card[] = JSON.parse(readFileSync(join(dir, "cards.json"), "utf8"));
  const now = new Date().toISOString();

  for (const c of cards) {
    // The rich-text allowlist has no table; the eras card was drafted with one.
    const body = c.body
      .replace(/<table>/g, "<ul>").replace(/<\/table>/g, "</ul>")
      .replace(/<tr><th>Era<\/th>.*?<\/tr>/, "")
      .replace(/<tr><td>(.*?)<\/td><td>(.*?)<\/td><td>(.*?)<\/td><td>(.*?)<\/td><td>(.*?)<\/td><\/tr>/g,
        "<li><strong>$1</strong> — groups $2 / $3 / $4 · average <strong>$5</strong></li>");

    const scaffoldTitle = SCAFFOLD[c.title];
    let id: string | null = null;
    // Filled scaffold first (first run), then our own title (any later run).
    for (const t of [scaffoldTitle, c.title].filter(Boolean) as string[]) {
      const { data } = await admin.from("deliverables").select("id")
        .eq("project_id", PROJECT).eq("kind", "session_image").eq("title", t).maybeSingle();
      if (data?.id) { id = data.id; break; }
    }

    const image_path = await upload(c.file);
    const row = {
      project_id: PROJECT, kind: "session_image" as const, section: c.section, title: c.title,
      caption: c.caption, body, image_path, position: c.position, published_at: now,
    };
    if (id) {
      const { error } = await admin.from("deliverables").update(row).eq("id", id);
      if (error) throw error;
    } else {
      const { data, error } = await admin.from("deliverables").insert(row).select("id").single();
      if (error) throw error;
      id = data.id;
    }

    for (const [i, extra] of (c.extra ?? []).entries()) {
      const path = await upload(extra);
      const { error } = await admin.from("deliverable_files").insert({
        deliverable_id: id!, project_id: PROJECT, path, name: `${c.title} (chart ${i + 2}).jpg`,
        mime: "image/jpeg", is_image: true, position: i,
      });
      if (error) throw error;
    }
    console.log(`card  ${c.section.padEnd(24)} ${c.position}  ${c.title}${scaffoldTitle ? "  (filled scaffold)" : ""}`);
  }

  const sessions = [
    { title: "Onsite Day 1 — Thursday, September 11", section: "Mod #1 FUNNEL FUSION", held_on: "2026-09-11", position: 0, file: "recap-day1.html",
      takeaways: "Expectations and fears named before any teaching. Three kinds of change, the Vision Frame (via Ethan's bow hunting), the process overview, collaboration dynamics, transfer of authority, the Functional Great Commission, upper room / lower room, funnel fusion, and the 4 Eras assessment in groups. The team named its own diagnosis: \"we're the teaching center.\"" },
    { title: "Onsite Day 2 — Friday, September 12", section: "Mod #2 CROWD CLOUD", held_on: "2026-09-12", position: 1, file: "recap-day2.html",
      takeaways: "Problem statement named (about 80% — refine over the month). Three kinds of words. Kingdom Concept worked circle by circle: local predicament, collective potential, apostolic esprit, each converging on a top three. Monthly Zoom set for the second Monday, 6:30–8:30 pm Pacific, starting October 12." },
  ];
  for (const s of sessions) {
    const recap = readFileSync(join(dir, s.file), "utf8");
    const { data: existing } = await admin.from("sessions").select("id").eq("project_id", PROJECT).eq("title", s.title).maybeSingle();
    const row = { project_id: PROJECT, title: s.title, section: s.section, held_on: s.held_on, position: s.position, recap, takeaways: s.takeaways, published_at: now };
    const { error } = existing
      ? await admin.from("sessions").update(row).eq("id", existing.id)
      : await admin.from("sessions").insert(row);
    if (error) throw error;
    console.log(`session ${s.held_on}  ${s.title}  (${recap.length} chars)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
