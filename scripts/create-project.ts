/**
 * Create a real project for a staff member from a template, from the command
 * line, exactly as the New Project page would for them.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/create-project.ts <template-slug> "<name>" <owner-email> [--private] [--go]
 *
 * The owner becomes creator, admin and lead; the template's RunFree staff and
 * default highlights come with it. Nobody else is added and no email is sent.
 * Needs the dev server on 3001 (the highlight seeding reads /api). Then:
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-prep-reading.ts <project-id> --go
 *
 * so the Reading & Pre-Work shelf gets its PDFs and covers.
 */
import { createClient } from "@supabase/supabase-js";
import { stampProjectFor } from "./lib/stamp-project";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const GO = process.argv.includes("--go");
const PRIVATE = process.argv.includes("--private");
const [slug, name, ownerEmail] = args;
if (!slug || !name || !ownerEmail) {
  console.error('usage: create-project.ts <template-slug> "<name>" <owner-email> [--private] [--go]');
  process.exit(1);
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function main() {
  const { data: tpl, error } = await admin.from("templates").select("id, name").eq("slug", slug).single();
  if (error || !tpl) throw new Error(`template ${slug}: ${error?.message ?? "not found"}`);
  const { data: owner } = await admin.from("profiles").select("id, full_name, is_staff").ilike("email", ownerEmail).maybeSingle();
  if (!owner) throw new Error(`no profile for ${ownerEmail}`);
  if (!owner.is_staff) throw new Error(`${ownerEmail} is not staff; only staff create projects`);

  console.log(`${GO ? "CREATING" : "dry run (pass --go)"} → "${name}" from ${tpl.name}, for ${owner.full_name ?? ownerEmail}\n`);
  const id = await stampProjectFor({
    admin,
    templateId: tpl.id,
    name,
    ownerId: owner.id,
    visibility: PRIVATE ? "private" : "team",
    go: GO,
    base: process.env.AUDIT_BASE_URL ?? "http://localhost:3001",
    log: (s) => console.log(s),
  });
  console.log(id ? `\nproject ${id}` : "\ndry run — add --go to write");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
