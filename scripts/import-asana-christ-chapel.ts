/**
 * One-off import of the Christ Chapel material Andrew added to Asana on
 * 24 August 2026 (plus one Kingdom Concept PDF from 13 August).
 *
 * Deliberately EXCLUDES the "Team Building Profiles" task. That task holds six
 * named individuals' Insights Discovery reports — personal psychometric
 * profiles — and dropping them into a project every member can read is not a
 * call to make on someone's behalf. The portal has an is_private flag on prep
 * files built for exactly this; which of those two homes they belong in is
 * Andrew's decision, not an import script's.
 *
 * Dedupe is by original filename against every title/caption/file_name already
 * on the project, because a previous import already brought some of these
 * across — "Screenshot 2026-07-20 at 2.23.39 PM.png" and "Christ Chapel
 * Kingdom Concept Summary.pdf" are both already there.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/import-asana-christ-chapel.ts        # dry run
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/import-asana-christ-chapel.ts --go   # write
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const PROJECT = "bd6ab369-52b3-4f0b-be71-8e0351a40fe3";
const BUCKET = "deliverable-images";
const GO = process.argv.includes("--go");

/** Section strings as the PORTAL spells them — Asana's carry a trailing space. */
const DJ = "Mod #3 DISCIPLE'S JOURNEY";
const CC = "Mod #2 CROWD CLOUD";

type Item = { label: string; section: string; file: string; url: string };

const ITEMS: Item[] = [
  { label: "Coffee Questions", section: DJ, file: "Screenshot 2026-08-24 at 11.07.08 AM.png", url: "https://asanausercontent.com/us1/assets/1203651762071635/1217784286394044/1e7e01338062413e1801a3a7cdd5a0c4?e=1787603375&v=0&t=7dBVs2dcYUj9IIV-FiKUxw6GDPdGN32aG0tQMYh6p_s" },
  { label: "Shark Tank Exercise", section: DJ, file: "Screenshot 2026-08-24 at 11.07.26 AM.png", url: "https://asanausercontent.com/us1/assets/1203651762071635/1217784286394046/2b1eff93e7c392f117bc4aa6f9f3f7e9?e=1787603386&v=0&t=iq6AwAyl85F7kJ9Ka6j5XIM-tcFlznJIsAFrLmwZT9k" },
  { label: "Top 5 Saints Exercise", section: DJ, file: "Screenshot 2026-08-24 at 11.08.31 AM.png", url: "https://asanausercontent.com/us1/assets/1203651762071635/1217784286394048/684fd0bfd8db8eaa29731b9f513b2e3b?e=1787603394&v=0&t=ydOb0Ot8TEY3BjwCNP6E5i3-lDCp2sNZat5oSec92hk" },
  { label: "Character and Competencies of Jesus", section: DJ, file: "Screenshot 2026-08-24 at 11.09.01 AM.png", url: "https://asanausercontent.com/us1/assets/1203651762071635/1217784286394050/95bc0b9f1ff78234ec7eca7e29171596?e=1787603401&v=0&t=31b8vs-yY7RqvmsBuUb_RgSENfYuUydDlwZRyWoXdwk" },
  { label: "Church As a River", section: DJ, file: "Screenshot 2026-08-24 at 11.09.30 AM.png", url: "https://asanausercontent.com/us1/assets/1203651762071635/1217784286394054/25c572e14fe709d2a1536ea0e47dab32?e=1787603349&v=0&t=7lqS0IsGlzmmtqc3GC4AtJnE-sBmJyxXa-CoygdAVnM" },
  { label: "Top 5 Combined", section: DJ, file: "Screenshot 2026-08-24 at 11.10.12 AM.png", url: "https://asanausercontent.com/us1/assets/1203651762071635/1217784449541600/7724832cd96ef34345f8a2ed5cb1e7bd?e=1787603363&v=0&t=z6cTGrUbqPoMh1Dtxb0xmRri1RByiR76O79ka7DovwM" },
  { label: "Top 5 Combined", section: DJ, file: "Screenshot 2026-08-24 at 11.10.20 AM.png", url: "https://asanausercontent.com/us1/assets/1203651762071635/1217784449541602/86413848262b7ec873307b0bac067a62?e=1787603363&v=0&t=5Fn2ulBZuaSCSe7-xrP8c3j2N3WduKkpFg6aK5rwOrg" },
  { label: "Kingdom Concept for Christ Chapel", section: CC, file: "Kingdom Concept for Christ Chapel.pdf", url: "https://asanausercontent.com/us1/assets/1203651762071635/1217424708155399/131d5b79c522b78bb752d5dc2019da26?e=1787603428&v=0&t=Ca5HiYKfSCcqBrSdFJX-WSISVTN8Ipi_8_dQLS2C-Zs" },
  { label: "KC Summary Final", section: CC, file: "Screenshot 2026-08-13 at 10.20.34 AM.png", url: "https://asanausercontent.com/us1/assets/1203651762071635/1217424708155401/bcf2102188885da997d6a6cc5c73dbc2?e=1787603428&v=0&t=zjyp1EL3PKG8RWpBaNeHGkk3RKD9nPjGuLlAbs7aMS8" },
];

async function main() {
  const { data: existing, error: exErr } = await admin
    .from("deliverables")
    .select("title,caption,file_name,position")
    .eq("project_id", PROJECT);
  if (exErr) throw exErr;

  const known = new Set<string>();
  for (const d of existing ?? []) {
    for (const v of [(d as any).title, (d as any).caption, (d as any).file_name]) {
      if (v) known.add(String(v).trim().toLowerCase());
    }
  }
  let position = Math.max(0, ...(existing ?? []).map((d: any) => d.position ?? 0));

  console.log(GO ? "WRITING\n" : "DRY RUN — nothing will be written\n");
  let done = 0, skipped = 0;

  for (const it of ITEMS) {
    if (known.has(it.file.trim().toLowerCase())) {
      console.log(`skip   ${it.file}  (already on the project)`);
      skipped++;
      continue;
    }
    const isPdf = it.file.toLowerCase().endsWith(".pdf");
    const ext = isPdf ? "pdf" : "png";
    const path = `${PROJECT}/${isPdf ? "doc-" : ""}${randomUUID()}.${ext}`;

    if (!GO) {
      console.log(`would  ${it.section}  ${it.label}  <- ${it.file}`);
      done++;
      continue;
    }

    const res = await fetch(it.url);
    if (!res.ok) { console.log(`FAIL   ${it.file}: download ${res.status}`); continue; }
    const bytes = new Uint8Array(await res.arrayBuffer());

    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: isPdf ? "application/pdf" : "image/png",
      upsert: false,
    });
    if (upErr) { console.log(`FAIL   ${it.file}: upload ${upErr.message}`); continue; }

    position += 1;
    const row: Record<string, unknown> = {
      project_id: PROJECT,
      kind: "session_image",
      section: it.section,
      title: it.label,
      position,
    };
    if (isPdf) {
      row.file_path = path;
      row.file_name = it.file;
      row.file_mime = "application/pdf";
      row.file_size = bytes.byteLength;
    } else {
      row.image_path = path;
      row.caption = it.file;
    }

    const { error: insErr } = await admin.from("deliverables").insert(row as never);
    if (insErr) {
      console.log(`FAIL   ${it.file}: insert ${insErr.message}`);
      await admin.storage.from(BUCKET).remove([path]);
      continue;
    }
    console.log(`ok     ${it.section}  ${it.label}  (${(bytes.byteLength / 1024).toFixed(0)} KB)`);
    done++;
  }

  console.log(`\n${GO ? "imported" : "would import"}: ${done}   skipped as duplicates: ${skipped}`);
  console.log("NOT imported: Team Building Profiles — 6 named Insights Discovery reports. See the note at the top.");
}

main().catch((e) => { console.error(e); process.exit(1); });
