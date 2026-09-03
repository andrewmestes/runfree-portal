/**
 * Copy one template's stored files (documents and covers) to another
 * template's folder in the private bucket.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/copy-template-files.ts <from-slug> <to-slug> [--go]
 *
 * The team coaching template (073) is the one-on-one template's rows copied
 * in SQL with `templates/{from}/…` rewritten to `templates/{to}/…`; the
 * objects themselves cannot be copied from SQL, so this does that half.
 * Also removes objects the rows no longer reference when --prune is given
 * (the Performance Practices screenshots, after 072 turned them into text).
 */
import { createClient } from "@supabase/supabase-js";

const BUCKET = "deliverable-images";
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const [from, to] = args.filter((a) => !a.startsWith("--"));
const GO = flags.includes("--go");
const PRUNE = flags.includes("--prune");
if (!from) {
  console.error("usage: copy-template-files.ts <from-slug> [<to-slug>] [--go] [--prune]");
  process.exit(1);
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function listAll(prefix: string): Promise<string[]> {
  const out: string[] = [];
  const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw error;
  for (const e of data ?? []) {
    if (e.id === null) out.push(...(await listAll(`${prefix}/${e.name}`)));
    else out.push(`${prefix}/${e.name}`);
  }
  return out;
}

async function templateId(slug: string): Promise<string> {
  const { data, error } = await admin.from("templates").select("id").eq("slug", slug).single();
  if (error || !data) throw new Error(`template ${slug}: ${error?.message ?? "not found"}`);
  return data.id;
}

async function main() {
  const fromId = await templateId(from);
  const objects = await listAll(`templates/${fromId}`);
  console.log(`${objects.length} objects under templates/${fromId}`);

  if (PRUNE) {
    const { data: rows, error } = await admin
      .from("template_resources")
      .select("file_path, thumb_path")
      .eq("template_id", fromId);
    if (error) throw error;
    const referenced = new Set<string>();
    for (const r of rows ?? []) {
      if (r.file_path) referenced.add(r.file_path);
      if (r.thumb_path) referenced.add(r.thumb_path);
    }
    const orphans = objects.filter((o) => !referenced.has(o));
    for (const o of orphans) console.log(`${GO ? "remove " : "would remove "} ${o}`);
    if (GO && orphans.length > 0) {
      const { error: rmErr } = await admin.storage.from(BUCKET).remove(orphans);
      if (rmErr) throw rmErr;
    }
  }

  if (to) {
    const toId = await templateId(to);
    let n = 0;
    for (const o of objects) {
      const target = o.replace(`templates/${fromId}/`, `templates/${toId}/`);
      console.log(`${GO ? "copy " : "would copy "} ${o} → ${target}`);
      if (!GO) continue;
      const { error } = await admin.storage.from(BUCKET).copy(o, target);
      if (error && !/already exists/i.test(error.message)) throw new Error(`${o}: ${error.message}`);
      n++;
    }
    console.log(`\n${GO ? `${n} copied` : "dry run"}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
