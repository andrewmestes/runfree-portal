/**
 * Attach files to a template's resources (063).
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/import-template-files.ts <manifest.json>        # dry run
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/import-template-files.ts <manifest.json> --go
 *
 * The manifest:
 *   { "template": "younique-lifeplan",
 *     "files": [ { "section": "Day 1 - Section #1", "title": "Life Drifts Grid",
 *                  "url": "https://asanausercontent.com/…", "name": "03_lifedriftsgrid.pdf",
 *                  "kind"?: "exercise" | "handout", "position"?: 9, "description"?: "…" } ] }
 *
 * Files land in the private bucket under templates/{template_id}/{slug}.{ext}
 * and the matching template_resources row (by section + title) gets
 * file_path / file_name / file_size. A row that does not exist yet is
 * inserted with the manifest's kind and position. Idempotent: re-running
 * overwrites the object and re-points the row.
 *
 * Asana attachment download URLs expire after about an hour. List them again
 * (get_attachments) right before a --go run; an expired one fails loudly with
 * the HTTP status rather than storing an error page as a PDF.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

type Entry = {
  section: string;
  title: string;
  url: string;
  name: string;
  kind?: "handout" | "exercise" | "link" | "video";
  position?: number;
  description?: string;
};
type Manifest = { template: string; files: Entry[] };

const [manifestPath, ...rest] = process.argv.slice(2);
const GO = rest.includes("--go");
if (!manifestPath) {
  console.error("usage: import-template-files.ts <manifest.json> [--go]");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
const BUCKET = "deliverable-images";

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function ext(name: string, type: string | null): string {
  const m = /\.([a-z0-9]{2,5})$/i.exec(name);
  if (m) return m[1].toLowerCase();
  if (type?.includes("pdf")) return "pdf";
  if (type?.startsWith("image/")) return type.slice(6).replace("jpeg", "jpg");
  return "bin";
}

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

async function main() {
  const { data: tpl, error } = await admin
    .from("templates")
    .select("id, name")
    .eq("slug", manifest.template)
    .single();
  if (error || !tpl) throw new Error(`template ${manifest.template}: ${error?.message ?? "not found"}`);
  console.log(`${GO ? "importing" : "dry run"} → ${tpl.name} (${tpl.id})\n`);

  let done = 0;
  for (const f of manifest.files) {
    const { data: rows, error: qErr } = await admin
      .from("template_resources")
      .select("id, file_path")
      .eq("template_id", tpl.id)
      .eq("section", f.section)
      .eq("title", f.title);
    if (qErr) throw qErr;
    const row = rows?.[0] ?? null;
    console.log(`${row ? "attach       " : "insert+attach"}  ${f.section} › ${f.title}  ←  ${f.name}`);
    if (!GO) continue;

    const res = await fetch(f.url);
    if (!res.ok) throw new Error(`${f.name}: HTTP ${res.status} — expired URL? list the attachments again`);
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get("content-type");
    const e = ext(f.name, type);
    if (e === "pdf" && buf.subarray(0, 4).toString() !== "%PDF") {
      throw new Error(`${f.name}: not a PDF (${type}) — expired URL served a page instead`);
    }
    const path = `templates/${tpl.id}/${slug(f.title)}.${e}`;
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: MIME[e] ?? type ?? "application/octet-stream", upsert: true });
    if (upErr) throw new Error(`${f.name}: upload — ${upErr.message}`);

    const patch = { file_path: path, file_name: f.name, file_size: buf.length };
    if (row) {
      const { error: e2 } = await admin.from("template_resources").update(patch).eq("id", row.id);
      if (e2) throw e2;
    } else {
      const { error: e3 } = await admin.from("template_resources").insert({
        template_id: tpl.id,
        section: f.section,
        title: f.title,
        kind: f.kind ?? "exercise",
        position: f.position ?? 99,
        description: f.description ?? null,
        ...patch,
      });
      if (e3) throw e3;
    }
    done++;
    console.log(`               ✓ ${path}  ${(buf.length / 1024).toFixed(0)} KB`);
  }
  console.log(GO ? `\n${done} file${done === 1 ? "" : "s"} attached` : "\ndry run — add --go to write");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
