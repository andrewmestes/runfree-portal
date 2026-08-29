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

**The failure is silent and the exit code is a lie.** `npm run build` in this
repo prints `sh: next: command not found`, does nothing, and **exits 0**;
`npx tsc --noEmit` does the same. So a script that greps the output for
"error" sees none, the exit code says success, and you will believe a
typecheck passed when nothing ran at all. That has already happened once.
Always call the binary directly and read the actual output.

## Which Supabase project — the names read backwards

There were three Supabase projects in the org. The one **named**
`runfree-client-portal` (`fbcrofawqxdldcibevfs`) was an empty scaffold from
the first day of this repo and has been deleted. Everything real lives in the
one **named** `runfree-portal` (`txaesavbpbtyqhzhcabm`), which started life as
the CVF portal's project.

So: if you are ever picking a Supabase project by name, you will pick the
wrong one. Match the ref. (`rm-church-database` is unrelated — RunFree's
church database, not this.)

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

## Preparation cards: three tables, and which one you mean matters

Migration 022 replaced the inert "Key Dates / Preparation Checklist / Team
Pre-Reading / Team Optional Pre-Work" pills with editable cards. Those pills
were `template_resources` rows carrying a title and nothing else — the Asana
bodies never came across in the export this project was seeded from, so
there was no content to render even before the wrong-table problem.

- **`template_prep_groups`** — the buckets. Template-scoped, owner-write,
  rendered *even when empty* so every project shows the same scaffolding.
  `kind` (`dates` | `checklist` | `reading` | `files` | `notes`) decides
  which inputs the card offers and nothing else — it is not a filter and
  not a permission.
- **`template_prep_items`** — defaults stamped into a new project, same
  pattern as `template_deliverables` (015) and `template_members` (019).
  Call `stampTemplatePrepItems` *after* the creator's membership row exists,
  for the same RLS-sequencing reason those two have.
- **`prep_items`** — the real, per-project, editable rows. This is almost
  always the one you want.

A group carries a **`section`**, which is the part of the project page it
renders in. That is why Guest Perspective Evaluation ("notes + PDF upload")
is a group under `PROCESS OVERVIEW` rather than a special case in the page
component. It is also why the prepare block does **not** hardcode
`CHURCH PREPARATION`: Younique's prework sits under `Recommended Prework`,
and `page.tsx` derives the prepare sections from the groups the template
declares. Hardcoding that constant again would make Younique's prep
disappear into the orphan-section catch-all.

`prep_items` has **no `published_at`**, unlike `sessions` and
`deliverables`. Preparation work is instructions to the client, and
instructions the client cannot read are not instructions.

Prep documents live in the `deliverable-images` bucket at
`{project_id}/prep-{uuid}.ext`, so they inherit the storage RLS proven in
007 with no new bucket and no new policies. See the next section for why the
bucket's name is narrower than what it holds.

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

## The project page is panels, not a long scroll

`/projects/[id]` shows **one panel at a time**, selected by `?panel=<key>`:
`dashboard` | `prepare` | `process` | `team` | `dates` | `sessions` |
`deliverables` | `books`. Andrew: "it should be VERY easy for someone to navigate even
if they have no idea what is all included in the project."

**Dashboard is the landing panel** and the fallback for any unrecognised key.
It is the only entry that does not depend on the project having particular
content, which is why it can be the fallback at all — every other panel is
conditional on there being something in it, and a Younique project (no module
track) has no `process` panel to fall back to.

Dashboard carries What's Important Now, the next session date, the most
recent session recording, and the highlight shelf.

**What's Important Now opens every time and remembers nothing.** It used to
persist a fold in localStorage; one collapse months earlier left the panel
someone opens specifically to see what they owe permanently shut. Andrew:
"make sure the 'what's important now' defaults to open, not collapsed when
entering a project." Do not add the persistence back.

The Dashboard itself was **removed once and brought back**, and the history
matters because the arguments are symmetrical:

- Removed, because it was a landing pad whose only job was pointing at other
  panels. Its two orientation cards were floated *above* the tabs instead, so
  they showed on every panel.
- Brought back (22 Aug 2026) and renamed Dashboard, because the page has
  since gained a left column
  — and on a phone a header and a section strip too. Those two ever-present
  cards had become ~120px of furniture on top of all six other panels. One
  place to put them buys that height back everywhere else, and the panel now
  holds real content rather than signposts.

Do not "simplify" this by floating the cards above the panels again without
reading that trade — it has been made in both directions deliberately.

`books` is Will's Books, and it is **the same `BooksShelf` component the
certification /books page renders** — Andrew asked for it to look "just like
they are displayed in the certification area", and a second copy of that
markup would have drifted within a week. What differs is the gate, not the
view: /api/books requires certification access, which a church client does not
have, so the project reads /api/projects/{id}/books, gated on membership. It
loads only when the panel is opened, because it is a live Drive read.

`access` is still not a panel: who can sign in is a property of the project,
so it is a dialog in the header.

Two consequences that are easy to get wrong:

- **If you add a panel, add it to `panelItems`** or it will be unreachable
  *and* silently redirect to Dashboard.
- **Condensed view still renders everything at once** and deliberately keeps
  its `{ready}/{total}` counters. Don't "fix" those to match Dashboard:
  Condensed is the coach's scan-everything mode, where a ratio is the point.

The panel rail shows **labels only, no counts** — see the note in
`ProjectToolbar`'s successors. And Dashboard shows **no completion ratio**.
Andrew: "sometimes coaches don't finish all 23 based on what they're
delivering. sometimes we do portions of the process." A denominator turns a
deliberately partial engagement into one that reads as mostly failed.
`VisionStackCard` takes `ready` and has no `total` prop for this reason —
don't add one back.

## Navigation is a rail on desktop and a drawer on a phone

One set of markup, two shells, in `ProjectSidebar`:

- **`lg` and up** — the static navy column, always visible.
- **below `lg`** — off-canvas drawer, opened by the ☰ in `PortalHeader`
  (which only renders when the page passes `onMenuClick`).

`PanelStrip` — the horizontal section strip — renders **only between `md` and
`lg`**. Not on a phone: seven labels do not fit 375px, and the earlier version
scrolled sideways with "Key Dates" cut in half. It wraps rather than scrolls,
so nothing is ever hidden off the edge.

Two traps here, both of which have already been hit once:

- **`PortalHeader` has its own `sm:hidden` mobile menu.** It is suppressed
  when `onMenuClick` is supplied. Without that guard the project page renders
  two hamburgers below 640px. That old menu is also the only route to
  Certification below `sm`, which is why Certification is repeated at the foot
  of the drawer under `lg:hidden`.
- **`sticky` resolves against the nearest scrolling ancestor.** The strip used
  to live inside the sidebar's `overflow-y-auto` middle band, so its `sticky`
  did nothing. It has to be in the content column to stick under the header.

`PanelRail` (desktop) and `PanelStrip` (tablet) are separate components on
purpose. They were one component rendering both layouts, and that is exactly
how they drifted apart — and why removing the count badges from "the rail"
silently left them in the strip.

## Next steps live in exactly one place: `project_tasks`

Andrew, walking Brooke through the portal: "currently there's three different
places where they're looking for next steps and I need to be able to
streamline that." Those three were:

- `projects.priorities` — free text. Converted to tasks by **040**.
- `sessions.commitments` — free text. Converted to tasks by **041**.
- `project_tasks` — the one that can be ticked, dated, counted and grouped.

Both free-text columns are **kept, not dropped**, and simply no longer
rendered. If a conversion was wrong the original text is still readable.
Removing them is a later decision. Do not reintroduce a prose field for
things-to-do; that is what created the problem.

`sessions.takeaways` **survives on purpose** — it is a short "if you read
nothing else", which is a different thing from a list of things to do.

`sessions.recap` is the long write-up. It existed in the schema from the
beginning, documented as "what we covered", and nothing rendered it until
Will's sample session summary made the gap obvious. `SessionRecap` renders a
small Markdown subset (headings, bullets, bold) with no dependency, folded by
default — the sample runs to ~3,000 words for one four-hour session.

## `project_tasks.owner` — church or runfree

Migration **041**. Will's session summaries have always split action items
into "For the cohort" and "For Will & Andrew, owed to the group"; this is that
line made explicit.

- `church` (the default) — the client team's homework.
- `runfree` — what we owe them.

Two things depend on it. The project Dashboard groups What's Important Now so
a church never finds "Andrew to send the video link" inside their own
homework — and can see what they are waiting on us for. And **/my-work**
lists every unfinished `runfree` task across every engagement the caller can
see, grouped by due date rather than by church.

`/my-work` does **no scoping in app code**. `read_project_tasks` is
`can_see_project(project_id)`, so the query returns exactly what the caller is
entitled to. Do not add a project filter there "to be safe" — it would drift
from the policy, which is the thing that is actually enforcing this.

The header badge counts the same set and is deliberately **non-blocking**: it
runs after paint and the header renders fine without it. See the auth section
above for why that matters.

## Module content cards are `deliverables` rows, not a new table

The cards under *From our sessions* on each module — the ones that can carry a
photo, a PDF and written notes at once — are `deliverables` rows with
`section` set to the module. Migration **042** added `body`; the image and file
columns were already there. There is no `cards` table, and adding one would
split "the finished work" across two places for no gain.

Consequences worth knowing before you touch them:

- A card renders a disclosure control **only when it has something to reveal**
  (a body or a file). An image-only card gets no arrow, because an arrow onto
  an empty panel is worse than no arrow.
- `section_notes` is **retired but not dropped**. Migration **043** converted
  its one production row — 1,297 characters of the Expectations Exercise on
  Funnel Fusion — into a card. Same restraint as 040 and 041: the original is
  still readable if a conversion turns out wrong.
- "Homework & next steps" and "Notes & homework" are gone from the module
  panel. Next steps are `project_tasks` (see above); everything else is a
  card. Do not add a prose field back here.

**Asana attachment URLs are signed and short-lived.** `import-asana-cards.ts`
hit this: a link fetched at the start of a run had expired by the time it was
used, both uploads 403'd, and the card was created with prose and no files.
Re-fetch `get_attachments` immediately before downloading, and never let a
"row already exists" check mean "this card is complete" — check the columns.

## Reading & Pre-Work is a shelf, and the PDFs come from Drive

Migration **044**/**045**. The group's `kind` is `reading`, which renders
`ReadingShelf` — cards with covers, no tick-boxes, no ratio. `checklist` keeps
its counter; there the fraction is the point. Do not "restore" the checkboxes:
a denominator on a reading list tells a church it is behind before the first
session, the same argument that keeps `total` off `VisionStackCard`.

**The canonical list lives on `template_prep_items`, not on the project.** It
had drifted badly — two churches on one template, nine rows between them, one
attached file, and two rows carrying prose that *described* a video the portal
already had a link to.

The PDFs cannot live on the template, because storage RLS recovers the project
id from `{project_id}/...` (007) and a template-owned object has no legal home
in that bucket. So `template_prep_items.drive_file_id` records *which Drive
file* each reading is, and:

```bash
./node_modules/.bin/tsx --env-file=.env.local scripts/seed-prep-reading.ts <project-id> --go
```

copies it into the project's own folder, renders page one to `thumb_path` with
`pdftoppm`, and syncs titles/notes/links. Idempotent, and it has a dry run.
**Run it for every new Pivvot project** — `stampTemplatePrepItems` copies only
title/notes/external_url, so a fresh project gets the structure and no files.

Two traps:

- **`template_prep_items` has no `template_id`.** It hangs off `group_id`.
  Filtering it by `template_id` returns nothing and looks exactly like an
  empty table — which is what sent 044 out on a wrong premise.
- **A link beats a file in the renderer.** Clearing `external_url` is part of
  attaching a PDF to a row that used to be a Drive link, or it keeps sending
  people out to Drive.

The Preparation panel deliberately shows **only** `CHURCH PREPARATION`
resources. It used to merge `PROCESS OVERVIEW` in too, which is how "Process
Overview Teaching" and "Collaboration Dynamics Training" — neither of them
preparation — ended up under Prepare Your Team.

**Loom sometimes returns another video's thumbnail.** `loom.ts` only trusts a
still whose embedded session id matches, so a video with no cover is that
guard working, not a bug. **Three** teachings are affected — the 7 Laws,
Funnel Fusion and Crowd Cloud overviews — and Loom hands all three the same
wrong still (`96ada777…`). All three are now pinned in that file's
`MANUAL_STILLS`, using frames that had been checked into
`public/brand/videos` since 19 Aug and were never reachable because the map
was empty. The other four resolve correctly and are deliberately not pinned:
Loom's own still is fresher and survives a re-record.

## Highlighted resources are pointers, not copies

Migration **046**/**047**. `project_highlights` is what a coach has put on a
church's dashboard for right now — Andrew: "a visual overview of what is
important right now as they are moving forward in the process between
sessions."

It **points** at what it highlights (`source_kind` + `source_id`) so the same
resource cannot be added twice and stays recognisable. It also **caches what
the card draws** — title, media kind, art. That denormalisation is deliberate
and measured: Will's books and the handouts live in Drive, the books panel
takes ~7s against it, and a dashboard that had to ask Drive what a highlight
is called before rendering would become the slowest page in the portal.

Highlights carry **no done state**. What needs ticking is a `project_task`;
this is the shelf beside it. Same line as the reading shelf.

- **`ResourceCard`** draws both this and Reading & Pre-Work. One component on
  purpose — `PanelRail`/`PanelStrip` is what happens otherwise. Videos get a
  16:9 frame and object-cover, everything else **2:3** and object-contain,
  because a book jacket and a video still do not survive each other's crop.
  2:3 rather than 3:4 for a reason: at 3:4 a jacket floated inside its card
  with a gutter down each side, and the gutter's width depends on the source's
  exact ratio, so two covers of the *same* book (0.646 and 0.647) sat
  fractionally differently and read as a bug. At 2:3 a jacket fills its card.
- **Both shelves size their grid tracks**, `repeat(auto-fill,minmax(150px,1fr))`,
  rather than naming a column count. With `sm:grid-cols-3` the cards grew with
  the container, so three highlights on a wide dashboard rendered as ~380px
  posters. Sized tracks keep a card a thumbnail at every width.
- **`buildCatalogue`** flattens four tables and two Drive folders into one
  searchable list — 212 entries on Christ Chapel. A `template_resources` row
  with no `external_url` is still skipped, because for a handout that row is
  only a label; the real sheets come from the handouts library and are added
  separately as `source_kind: 'handout'` (**049**). That is a different Drive
  endpoint from a book — /handouts/file vs /books/file — which is exactly why
  it needed its own source kind rather than reusing `'book'`.
- **`byModule` is keyed by module NUMBER**, so passing the key straight
  through as a picker row's second line printed a bare "1" under every Funnel
  Fusion sheet. `buildCatalogue` recovers the readable name from the sections
  already in `detail.resources`.
- **Opening the picker triggers the books load**, the same lazy Drive read the
  books panel does. `picking` must stay in that effect's dependency array —
  the gate reads it, and without it the effect never re-runs, so "Will's
  Books" sat on "…" forever unless someone had visited that panel first. The
  comment claimed the behaviour before the dependency existed to deliver it.

**A partial unique index cannot be an ON CONFLICT target.** 046 made the index
partial so uploads (null `source_id`) would not collide; PostgREST's upsert
does not repeat the predicate, so Postgres could not infer it and every
multi-select add failed silently, adding nothing. 047 makes it plain — NULLs
are distinct in a Postgres unique index, so uploads never needed the
predicate. Found by driving the picker, not by reading it.

## Checking it on a phone

`scripts/mobile-audit.ts` drives Chrome as an emulated iPhone (390x844, DPR 3,
touch, iOS user agent) and asserts what a screenshot cannot show you: nothing
spilling past the viewport, no page-level horizontal scroll, every visible
image actually decoded, nothing in the console.

```bash
./node_modules/.bin/tsx --env-file=.env.local scripts/mobile-audit.ts <project-id>
```

It creates and deletes a throwaway account the way `tests/rls.test.ts` does,
so it needs nobody's password and leaves no extra face in the Team panel. A
spill inside an ancestor that clips or scrolls is ignored on purpose — the
books rail is a carousel, not a bug.

The iOS user agent matters: `useCanvasPdf()` in `FilePreview` branches on the
engine, not the width, so a desktop-UA run silently tests the wrong PDF path.

It forces `loading="eager"` on every image before asserting. Without that it
reports a false failure the moment a page grows past a screenful: a lazy image
below the fold has layout, so it passes the visibility check, but has not
begun loading, so `complete` is false and it looks broken. Two such "failures"
appeared the day Help gained an FAQ and Preparation gained the reading shelf,
and both URLs returned 200 when fetched directly.

## Never run `next build` while `next dev` is running

Both write to `.next/`. A production build replaces the dev server's chunk
manifest underneath it, and every subsequent request 500s with
`Cannot find module './vendor-chunks/@supabase.js'` — which looks like a
dependency problem and is really a clobbered build directory. It has happened
twice in this repo.

If it does happen: stop the dev server, `rm -rf .next`, start it again.
