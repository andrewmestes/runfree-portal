/**
 * Stamp a throwaway project from a template, to see what a new client sees.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/scratch-project.ts <template-slug> "<name>"
 *       → prints the new project id
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/scratch-project.ts --delete <project-id>
 *
 * The stamp runs through createProject() with a real user token — the same
 * path the New Project page takes — using a throwaway staff account,
 * scratch-stamp@example.com, which --delete removes along with the project.
 * Only Athena and Christ Chapel should exist when you are done; a forgotten
 * scratch project is a fake church in the picker.
 */
import { createClient } from "@supabase/supabase-js";
import { createProject } from "../src/lib/projects";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const EMAIL = "scratch-stamp@example.com";
const PASSWORD = "scratch-stamp-only-not-a-real-account-4471!";

async function findUser() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === EMAIL) ?? null;
}

async function ensureUser(): Promise<string> {
  let user = await findUser();
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: "Scratch Stamp" },
    });
    if (error) throw error;
    user = data.user;
  }
  // Staff, so insert_projects lets it create one.
  const { error } = await admin
    .from("profiles")
    .update({ is_staff: true, account_role: "runfree_team", full_name: "Scratch Stamp" })
    .eq("id", user!.id);
  if (error) throw error;
  return user!.id;
}

async function token(): Promise<string> {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw error;
  return data.session!.access_token;
}

async function main() {
  const [a, b] = process.argv.slice(2);
  if (a === "--delete") {
    if (!b) throw new Error("--delete <project-id>");
    const { error } = await admin.from("projects").delete().eq("id", b);
    if (error) throw error;
    const user = await findUser();
    if (user) await admin.auth.admin.deleteUser(user.id);
    console.log(`deleted project ${b}${user ? " and the scratch account" : ""}`);
    return;
  }
  if (!a) throw new Error("usage: scratch-project.ts <template-slug> [name] | --delete <project-id>");
  const { data: tpl, error } = await admin.from("templates").select("id, name").eq("slug", a).single();
  if (error || !tpl) throw new Error(`template ${a}: ${error?.message ?? "not found"}`);
  const creatorId = await ensureUser();
  const t = await token();
  const project = await createProject(t, creatorId, {
    name: b ?? `Scratch — ${tpl.name}`,
    visibility: "private",
    templateId: tpl.id,
  });
  console.log(JSON.stringify(project));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
