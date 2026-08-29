/**
 * Materialise a project's Reading & Pre-Work from the template.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-prep-reading.ts <project-id> [--go]
 *
 * Preparation reading is the same for every church on a template, so it lives
 * on the template — but the PDFs cannot. Storage RLS recovers the project id
 * from `{project_id}/...` (007), so a template-owned object has no legal home
 * in that bucket. The template therefore records which *Drive* file each
 * reading is, and this copies it into the project's own folder, where the
 * existing policies apply unchanged.
 *
 * It also renders page one of each PDF to a thumbnail, so the shelf can show a
 * book cover instead of a row of identical document glyphs. That needs
 * `pdftoppm` (poppler) on the machine running this; without it the files still
 * land and the cards fall back to a glyph.
 *
 * Idempotent. Run it again after changing the template and only the difference
 * is applied.
 */
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const PROJECT = process.argv[2];
const GO = process.argv.includes("--go");
if (!PROJECT || PROJECT.startsWith("--")) {
  console.error("usage: seed-prep-reading.ts <project-id> [--go]");
  process.exit(1);
}

const BUCKET = "deliverable-images";
const GROUP = "Reading & Pre-Work";

/**
 * Rows an older hand-built project has that the template now says differently.
 * Matched on exact title so this can never take anything it was not named.
 */
const SUPERSEDED = [
  "Future Church — Parts 1 & 3",
  "Option #1 — Upper Room / Lower Room",
  "Option #2 — The seven laws of real church growth",
];

/** Same document, older wording. Keeps the project's file rather than re-fetching. */
const ALIASES: Record<string, string> = {
  "Read - Problem Statement Deck": "Problem Statement Deck",
};

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

function driveClient() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!);
  if (creds.private_key) creds.private_key = String(creds.private_key).replace(/\\n/g, "\n");
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return google.drive({ version: "v3", auth });
}

/** Page one as a PNG, or null when poppler is not installed. */
function firstPagePng(pdf: Buffer): Buffer | null {
  const dir = mkdtempSync(join(tmpdir(), "prep-thumb-"));
  try {
    const src = join(dir, "in.pdf");
    writeFileSync(src, pdf);
    execFileSync(
      "pdftoppm",
      ["-f", "1", "-l", "1", "-png", "-scale-to-x", "640", "-scale-to-y", "-1", src, join(dir, "out")],
      { stdio: ["ignore", "ignore", "ignore"] },
    );
    const png = readdirSync(dir).find((f) => f.startsWith("out") && f.endsWith(".png"));
    return png ? readFileSync(join(dir, png)) : null;
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const { data: proj, error: pErr } = await admin
    .from("projects").select("id,name,template_id").eq("id", PROJECT).single();
  if (pErr || !proj) throw new Error(`no such project: ${pErr?.message ?? PROJECT}`);

  const { data: group } = await admin
    .from("template_prep_groups").select("id,title,kind")
    .eq("template_id", (proj as { template_id: string }).template_id)
    .eq("title", GROUP).maybeSingle();
  if (!group) throw new Error(`template has no "${GROUP}" group`);
  const groupId = (group as { id: string }).id;

  const { data: tItems } = await admin
    .from("template_prep_items")
    .select("title,notes,external_url,drive_file_id,position")
    .eq("group_id", groupId).order("position");

  const { data: pItems } = await admin
    .from("prep_items").select("*").eq("project_id", PROJECT).eq("group_id", groupId);

  type Row = Record<string, unknown> & { id: string; title: string; file_path: string | null; thumb_path: string | null };
  const existing = new Map<string, Row>();
  for (const r of (pItems ?? []) as Row[]) existing.set(ALIASES[r.title] ?? r.title, r);

  console.log(`${(proj as { name: string }).name}  —  ${GO ? "WRITING" : "dry run (pass --go)"}\n`);

  // Drop what the template no longer says.
  for (const r of (pItems ?? []) as Row[]) {
    if (!SUPERSEDED.includes(r.title)) continue;
    if (!GO) { console.log(`would remove  ${r.title}`); continue; }
    await admin.from("prep_items").delete().eq("id", r.id);
    console.log(`removed       ${r.title}`);
  }

  const drive = driveClient();

  for (const t of (tItems ?? []) as {
    title: string; notes: string | null; external_url: string | null;
    drive_file_id: string | null; position: number;
  }[]) {
    const row = existing.get(t.title);
    const patch: Record<string, unknown> = {
      title: t.title, notes: t.notes, external_url: t.external_url, position: t.position,
    };

    // Fetch the file only when this row does not already have one.
    if (t.drive_file_id && !row?.file_path) {
      if (!GO) {
        console.log(`would fetch   ${t.title}`);
      } else {
        const meta = await drive.files.get({
          fileId: t.drive_file_id, fields: "name,mimeType", supportsAllDrives: true,
        });
        const res = await drive.files.get(
          { fileId: t.drive_file_id, alt: "media", supportsAllDrives: true },
          { responseType: "arraybuffer" },
        );
        const buf = Buffer.from(res.data as ArrayBuffer);
        const key = randomUUID();
        const path = `${PROJECT}/prep-${key}.pdf`;
        const up = await admin.storage.from(BUCKET)
          .upload(path, buf, { contentType: "application/pdf", upsert: true });
        if (up.error) { console.log(`FAIL upload   ${t.title}: ${up.error.message}`); continue; }

        patch.file_path = path;
        patch.file_name = meta.data.name ?? `${t.title}.pdf`;
        patch.file_mime = "application/pdf";
        patch.file_size = buf.length;

        const png = firstPagePng(buf);
        if (png) {
          const tPath = `${PROJECT}/prep-${key}-thumb.png`;
          const tUp = await admin.storage.from(BUCKET)
            .upload(tPath, png, { contentType: "image/png", upsert: true });
          if (!tUp.error) patch.thumb_path = tPath;
          else console.log(`   (thumbnail failed: ${tUp.error.message})`);
        } else {
          console.log(`   (no thumbnail — is pdftoppm installed?)`);
        }
      }
    }

    // A row that already had its PDF never went through the fetch above, so it
    // has no cover. Make one from the bytes already in storage — otherwise a
    // project that was populated by hand keeps a glyph forever.
    if (GO && row?.file_path && !row.thumb_path && !patch.thumb_path) {
      const dl = await admin.storage.from(BUCKET).download(row.file_path);
      if (dl.data) {
        const png = firstPagePng(Buffer.from(await dl.data.arrayBuffer()));
        if (png) {
          const tPath = `${PROJECT}/prep-${randomUUID()}-thumb.png`;
          const tUp = await admin.storage.from(BUCKET)
            .upload(tPath, png, { contentType: "image/png", upsert: true });
          if (!tUp.error) patch.thumb_path = tPath;
        }
      }
    }

    if (!GO) { if (!row) console.log(`would add     ${t.title}`); else console.log(`would sync    ${t.title}`); continue; }

    if (row) {
      const { error } = await admin.from("prep_items").update(patch).eq("id", row.id);
      console.log(error ? `FAIL          ${t.title}: ${error.message}`
                        : `synced        ${t.title}${patch.file_path ? "  + pdf" : ""}${patch.thumb_path ? " + cover" : ""}`);
    } else {
      const { error } = await admin.from("prep_items")
        .insert({ ...patch, project_id: PROJECT, group_id: groupId });
      console.log(error ? `FAIL          ${t.title}: ${error.message}`
                        : `added         ${t.title}${patch.file_path ? "  + pdf" : ""}${patch.thumb_path ? " + cover" : ""}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
