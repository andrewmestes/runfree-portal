# RunFree Client Portal — working notes

Read this before touching the codebase. It documents traps that are real,
verified, and easy to reintroduce — not general advice.

## The npm colon-in-path bug (same as CVF portal)

This repo lives under a directory with a literal colon: `.../ChatGPT:Claude
Data/runfree-client-portal`. `npm run <script>` prepends `<cwd>/node_modules/.bin`
to `PATH`, and PATH is colon-delimited — so the prepended entry gets split at
the colon in the directory name, and binary resolution breaks silently
(`sh: next: command not found`, `sh: tsx: command not found`).

**Never run `npm run dev` / `npm run test:rls` / etc. in this repo.** Invoke
the binary directly instead:

```bash
./node_modules/.bin/next dev -p 3001
./node_modules/.bin/tsx --env-file=.env.local tests/rls.test.ts
```

## This project runs on the CVF portal's Supabase project — on purpose

`NEXT_PUBLIC_SUPABASE_URL` points at `txaesavbpbtyqhzhcabm`, the **same**
project as `certified-vision-framers-portal`, not a separate one. `auth.users`
is shared. See `BRIEF.md`'s "Shared Supabase project" section for why, and
the one rule that matters: **never write a migration that touches a table
this project doesn't own** (`certified_framers`, `resources`,
`resource_access_logs`, `ghl_sync_log`, `training_videos` are CVF's).

`handle_new_user()` only fires on `INSERT` into `auth.users`. Anyone who had
a login *before* migration 001 (every existing certified framer) needed a
one-time backfill (`008_backfill_profiles_from_existing_users.sql`) to get a
`profiles` row at all — the trigger alone doesn't reach them. If a future
migration adds a new profile-adjacent table with the same "provision on
signup" intent, remember this gap exists and backfill explicitly.

## Access model: viewer / editor / admin, not client / coach

`project_members.role` is `viewer` | `editor` | `admin` (migration 005 renamed
the enum values in place from the original `client`/`coach`). This is
**per-project**, not portal-wide — the same person can be `admin` on one
project and have no access at all to another. `profiles.is_staff` only grants
the ability to *create* a project; it grants nothing on any specific project.

- `viewer` — read published sessions/deliverables only.
- `editor` — writes sessions/deliverables. Can be a non-staff person: this is
  what lets a Pivvot Coaching client lead their own process.
- `admin` — editor + can manage `project_members` (insert/update/delete) and
  project settings. Only tier that can add or remove people.

`am_owner()` (Andrew) bypasses all of this via RLS — treat it as a superuser,
not a role to reason about alongside the other three.

## template_resources vs. sessions/deliverables — know which one you're editing

- **`template_resources`** — identical across every project stamped from one
  template (handouts, teaching videos, exercises). Owner-only to write
  (`manage_template_resources`), readable by staff or any member of a project
  using that template. Edit this when a change should apply to every Pivvot
  engagement everywhere.
- **`sessions`** / **`deliverables`** — per-project. `section` is a free-text
  column (e.g. `"Mod #1 FUNNEL FUSION"`), not an enum — a from-scratch project
  has no template to constrain it to, and different templates use different
  module names, so this can never be a fixed set of values.

Both `sessions` and `deliverables` gate on `published_at`: null = draft,
visible only to `editor`/`admin`/owner. This is the same pattern as CVF's
`is_published` flag, extended to two tables instead of one.

## Deliverable images: private Storage bucket, signed URLs only

`deliverable-images` is **not public** — a public bucket would let anyone
with a leaked URL view a private project's images regardless of every other
RLS policy in this app. Every read goes through
`getSignedImageUrl()` (`src/lib/storage.ts`), which itself goes through
`storage.objects` RLS (`007_deliverable_image_storage.sql`) via the caller's
own token. Path convention is `{project_id}/{random}.{ext}` —
`storage.foldername(name)[1]` is how the RLS policies recover the project id
from the path, so never change this convention without updating those
policies too.

## The one legitimate service-role route: adding a member by email

`src/app/api/projects/[id]/members/route.ts` is the only server route in this
app, and it exists for exactly one reason: `read_profiles` RLS only lets you
see your own row, the owner's, or a fellow project member's — a project admin
adding someone brand new to the portal has no relationship with them yet, so
no policy could ever let them look up that stranger's profile from the
browser. The lookup (and, for a new person, the invite) has to run as the
service role.

The actual `project_members` **write** in that route does NOT use the service
role — it goes through the caller's own token, so `insert_members`'s
admin-only check is what decides whether it succeeds, not app code
re-deriving that same rule. If you add another route, keep this split: service
role only for what RLS structurally cannot do, the real authorization-bearing
write through the user's own client.

Known limitation, not yet fixed: new-person invites still go through
`invitePerson()` → Supabase's one project-wide email template, which is
branded for Certified Vision Framers. A church client currently gets a
certification-flavored email. See `BRIEF.md`, "Invitation emails need solving
separately" — the fix is `generateLink()` + a portal-branded send, gated on
having `RESEND_API_KEY` (not yet configured).

## "Multiple GoTrueClient instances" console warning is expected, not a bug

`createUserClient(accessToken)` creates a fresh Supabase client per call
rather than reusing a singleton, and the plain `supabase` export is a second,
separate client — both read/write the same `sb-<ref>-auth-token` localStorage
key. The warning is cosmetic. Don't "fix" it by making `createUserClient`
memoize/cache clients — that would reintroduce exactly the stale-identity
risk the CVF portal's service-role pattern had, which this fork's whole
architecture exists to avoid (see `src/lib/supabase.ts`'s own comments).

## RLS is the source of truth — verify against it, not against the UI

`tests/rls.test.ts` runs real queries against the real (shared) Supabase
project through `createUserClient`, the same code path a real request takes.
It is not a mock. Run it after any migration:

```bash
./node_modules/.bin/tsx --env-file=.env.local tests/rls.test.ts
```

23 checks as of migration 008. If you add a table, a policy, or a role
capability, add a check here before trusting it — the RETURNING-clause bug in
`can_see_project()` (`003`/`004_*.sql`) was found exactly this way, by testing
against the live database instead of reasoning about the policy on paper.
