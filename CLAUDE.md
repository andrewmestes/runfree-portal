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

**The in-app preview runner cannot start this dev server either.** Its
sandbox reports `EPERM` opening `node_modules/next/dist/bin/next` — the same
colon in the path, one layer down. `.claude/launch.json` is there and correct;
start the server from Bash (`./node_modules/.bin/next dev -p 3001`) and point
the browser at it.

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

## Certification access is checked two different ways, client and server

`hasCertificationAccess()` (client, `src/lib/auth.ts`) passes on `is_owner`,
an allowed `account_role`, `profiles.certification_access`, **or** a
`certified_framers` row.

`requireCertificationAccess()` (server, `src/lib/api-auth.ts`) — which every
`/api/books`, `/api/library`, `/api/guide`, `/api/videos` and `/api/keynotes`
route uses — accepts only an allowed `account_role`
(`admin` | `runfree_team` | `framer` | `framer_subscribed`) **or** a
`certified_framers` row. It ignores `is_owner` and `certification_access`.

So a profile with `certification_access: true` and no `account_role` renders
the page and then gets 403 from its own API — the page shows "No certification
access on this account" under a working header. Every one of the nine real
profiles has an allowed `account_role`, so this does not bite in production,
but it will bite **any throwaway test account** unless you set `account_role`
as well. That cost a debugging round on the keynotes page.

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
`deliverables` | `execution` | `books`. Andrew: "it should be VERY easy for someone to navigate even
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

`books` is the books shelf (labelled just **Books** since 31 Aug — Andrew: "let's change the column from 'Will's Books' to just 'Books'"), and it is **the same `BooksShelf` component the
certification /books page renders** — Andrew asked for it to look "just like
they are displayed in the certification area", and a second copy of that
markup would have drifted within a week. What differs is the gate, not the
view: /api/books requires certification access, which a church client does not
have, so the project reads /api/projects/{id}/books, gated on membership. It
loads only when the panel is opened, because it is a live Drive read.

`access` is still not a panel: who can sign in is a property of the project,
so it is a dialog in the header.

**The rail is grouped, and `group` is load-bearing.** Andrew: "start with
Dashboard then add a small subtle line ... then do Preparation / Team / Key
Dates in it's own section, add another line, then do Sessions / The Process /
Books as a section, then Deliverables and Execution to end."

  1. Dashboard — where you land
  2. Preparation, Team, Key Dates — who, and when
  3. Sessions, The Process, Books — the work as it happens
  4. Deliverables, Execution — what it produced, and what happens after

`PanelRail` draws a hairline on any item whose `group` differs from the one
before it, and never on the first — a rule at the top of the rail reads as the
header's underline. The groups are deliberately **unnamed**: a heading per
group would cost more vertical height than the whole rail saves, and Andrew's
original complaint about this column was density.

`PanelStrip` takes `group` and ignores it. It wraps horizontally, so a rule
between groups lands somewhere different at every width.

Two consequences that are easy to get wrong:

- **If you add a panel, add it to `panelItems`** — *with a `group`* or it will be unreachable
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

**Admin only, not editor** (migration **050**). Andrew: "only project managers
can see 'highlight resources.'" `editor` is deliberately not enough — an
editor can be a non-staff client leading their own process, and a church
assigning itself homework is precisely what this prevents. The UI gates on
`canManage`, and RLS enforces the same rule, so hiding the button is
presentation rather than protection. Note the live consequence: only Andrew is
`admin` on the two projects (Will is `viewer` on both, Brooke `editor` on
Christ Chapel), so nobody else can highlight until they are promoted through
the Access dialog.

**A shelf jacket belongs to the book, not to its folder.** `buildCatalogue`
gives `coverFor(shelf.name)` only to files that ARE the book — the full text,
the visual summary, a chapter. `shelf.other` is workbooks and bullet books,
separate publications that merely live in the same Drive folder, and handing
them the shelf cover put the red Future Church jacket on the 7 Laws Bullet
Book. Those fall back to `coverForFile()` in `book-covers.ts`, which matches a
title to its own art. **Highlights cache their art**, so fixing the rule does
not fix rows already written — repair those in place.

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

## Notes are formatted HTML, and cards take any number of files

**Notes** (`deliverables.body`, `sessions.recap`) were a Markdown subset with a
placeholder that read "## Headings, - bullets and **bold** are formatted" — a
syntax to learn, which is the opposite of what Andrew asked for: "as easy as
possible for the least techy person on our team." They are now a small subset
of HTML written with buttons (`RichText`), which is also the only way to get
underline, since Markdown has none.

- **Allowlist-rebuild, never sanitise-in-place.** `cleanRichText` parses and
  emits a fresh tree of tags it recognises, so nothing unrecognised survives
  by being cleverly written. It guards both save and render, so a row edited
  straight in the database gets the same suspicion as fresh input.
- **Both formats render.** `isRichText()` picks; notes written before this are
  still Markdown and `RecapBody` still renders them. Nothing was rewritten in
  place — the same restraint as 040/041/043.
- `.rich-text` in globals.css styles the editor and the read-only view from
  one place. Without it Tailwind's preflight strips list markers and heading
  sizes, and the toolbar buttons appear to do nothing.
- `document.execCommand` is deprecated and has no equivalent replacement. The
  content is plain HTML in a column, so it survives whatever replaces this.

**Files** are `deliverable_files` (**051**). `deliverables.image_path` changed
job: it is the card's THUMBNAIL, a pointer at whichever attachment is its face,
set to the last image dropped. `file_path` is untouched for older cards and the
renderer shows it alongside the new rows. The chips count both — a card whose
only document is a `deliverable_files` row showed no PDF chip until they did.

## Task assignment is a capability, not a role

Migration **053**. Andrew: "Only project admins can assign tasks. If I want a
team member (or subscriber) to have access, I should be able to assign that
separately than the master permission list."

`project_members.can_manage_tasks` grants create/edit/complete without the
admin role. It is deliberately not a fourth role — roles are a ladder where
every rung carries the ones below, and this has nothing to do with managing
members or project settings.

`may_manage_tasks(project_id)` is the single source: the policy and
`set_task_done` both call it, so they cannot drift the way 030 and 039 did.
The migration backfills the grant to existing editors, because tightening the
default would otherwise have taken it away mid-engagement from whoever had it
yesterday.

## Execution is the God Dreams module, and it copies Will's sheets exactly

Migration **057**. Andrew: "I would love to have an ongoing section that is
built out from the God Dreams (horizon storyline) perspective that helps
integrate meeting activity for a church as they pursue their initiatives and
goals ... even an ability to have a customizable scoreboard of somekind."

Three tables, and **every column comes off a handout a church has already been
given** — not off a generic project-management model:

- **`initiatives`** — the *Foreground Initiative Plan Template*. Its six prose
  blocks are `initiative`, `objective`, `key_deliverables`, `plan_of_action`,
  `timeline`, `costs`, in that order, because that is the order they print.
  `leader` / `team` / `start_date` / `last_review_on` / `next_review_on` are
  the *Action Step List*'s header, which is a different sheet.
- **`initiative_steps`** — a row of the *Action Step List*: `description`,
  `status`, `by_when`, `cost`, `accountable`.
- **`scoreboard_metrics`** — a row of the *Church Ministry Dashboard*, under
  `strategy_input` or `measure_output`, with Prior Yr. / Now / Next Yr., a
  trend arrow and a light.

Constraints that are decisions, not oversights:

- **No percent-complete, anywhere.** Andrew: "we want to stay away from too
  much 4dx overlap other than keeping the foundational principles in play."
  Will's sheets use a traffic light and a name; a number would quietly change
  the conversation a review is meant to have. Same family of argument as the
  missing denominator on `VisionStackCard` and the reading shelf.
- **`by_when` and `cost` are TEXT, not date and numeric.** The printed case
  study has "Monthly Periodic" in the By column and "$2,500", "$0" and "?" in
  Cost. Anything that does not parse as `yyyy-mm-dd` is never counted as
  overdue — see the digest filter in `ThisWeek`.
- **The scoreboard's rows are data.** `DASHBOARD_STARTER` is offered behind a
  button and never stamped automatically: a church plant with no school should
  not have to delete four rows before it can start.
- **`renewalCycle()` is generated, not stored** — it is a formula off the
  *Horizon Storyline Renewal Cycle* handout (½ day / full day / ½ day /
  2-day retreat, three years, then a 3-day retreat), anchored on the earliest
  live initiative's `start_date`. A stored copy would drift the moment the
  anchor moved, and a second "when did we start" column would be a second
  field to get wrong.

**Three different write rules, on purpose.** The plan and the scoreboard are
content (editor/admin, same as deliverables). The action steps reuse
`may_manage_tasks()` from **053** rather than inventing a second grant — the
person accountable for a step is usually church staff, not a portal editor,
and Andrew already has one switch for exactly that. Everyone on the project
**reads** all three: a scoreboard only some people can see is not a scoreboard.

`ExecutionPanel` is an orchestrator over `src/components/execution/` —
`HorizonBoard`, the four detail views, `MinistryDashboard`, `RenewalCycle`,
and `ui.tsx`. **`ui.tsx` holds every shared primitive** (`Cell`, `RagPicker`,
`DateCell`, `Chip`, `EditorActions`, `prettyDate`) in ONE file on purpose:
`PanelRail`/`PanelStrip` is the cautionary tale, and a second copy of the
traffic light would drift the first time only one of them got a bigger tap
target.

`Cell` shows `display(value)` while it rests and the raw string once focused.
Without that an editor stared at "2026-08-19" in the By column while a viewer
saw "Aug 19, 2026".

The panel **loads its own data when opened**, like the books shelf. What rides on
`getProjectDetail` is a single `head: true` count, `hasExecution`, and it
exists only so the tab can stay hidden from a church that has not reached the
Horizon Storyline. Editors always see the tab — somebody has to start it.

**The weekly email is not built.** `ThisWeek` assembles what it *would*
contain — every initiative, every open step with owner and date, the next
review — and puts it on the clipboard. Andrew asked for a per-project weekly
email; sending is blocked on `RESEND_API_KEY`, and a Send button that silently
does nothing is worse than no button. When Resend lands, that digest is the
payload.

**The Horizon Storyline is the band above all of it** (**058**). 057 shipped
the Foreground and nothing over it, which left a church's ninety-day
initiatives laddering up to nothing. `The_Horizon_Storyline_Template.pdf` is
one page with four bands, and `horizon_storyline` holds three of them —
Beyond the Horizon (5–20 years, one box), Background Vision (3 years, four
boxes), Midground Milestone (1 year, one box). One row per box, keyed
`(project_id, horizon, position)` and upserted, the same shape as
`vision_frame` (055), because a storyline is written a box at a time across a
retreat and there is no moment where a "create it" step would belong.

**The fourth band is not stored.** It renders `initiatives`. Copying the names
into a row here would give a church two places to rename an initiative, and
one of them would be wrong by the afternoon.

`HORIZONS[].boxes` is enforced, not advisory — four Background boxes and four
Foreground. That is the discipline the method exists for, so the "add" control
disappears at four rather than growing the grid. If Andrew wants it loosened,
that is the one line to change.

**Both grids pad to four cells.** With `gap-px` over a `bg-gray-200`
container, a missing cell shows the container through as a flat grey
rectangle that reads as a rendering fault. Empty white filler cells make an
unwritten box look like the empty box it is — which is what the sheet prints
— and padding to four lands on a whole row at 1, 2 and 4 columns.

`hasExecution` counts `horizon_storyline` **as well as** `initiatives`: the
storyline usually lands first (it comes out of the retreat, the initiatives
come out of it), so counting initiatives alone would hide the tab from a
church whose vision is already written.

**The board is the navigator** (**059**). Andrew: "having two places where it
says foreground initiatives is a bit redundant ... when someone clicks on an
initiative, it could highlight the initiative below where all of the Action
Steps get displayed along with a tracking sheet 'scoreboard.'"

So `HorizonBoard` is the 1:4:1:4 sheet with **every box a button**, and ONE
`DetailShell` underneath renders whatever is selected — Beyond, one of the
four Background priorities, the Midground, or an initiative. The separate
"Foreground Initiatives" list and its accordion are gone; there is one list
(the board) and one detail view.

Consequences worth knowing:

- **The detail shell owns the title.** `InitiativeDetail` and
  `BackgroundDetail` deliberately do NOT print the name again — that was the
  same duplication, one level down. The shell takes `onRename` so an
  initiative is still renamed in place.
- **All four Background boxes exist from the start.** They used to reveal one
  at a time as the previous one was filled. Andrew: "not intuitive." A
  four-box sheet with three boxes hidden is not the sheet.
- **Selection falls back up the bands** — first live initiative, else
  midground, else beyond — so a church that has written its storyline but not
  chosen initiatives lands on something written.

**The three types of foreground initiative** (`initiatives.kind`) come off
"Using 3 Types of Foreground Initiatives", whose own heading is "How to
Involve Everyone, Every Week". Cross-Functional Emphasis (5–15 steps, team),
Ministry Area Subgoal (3–8, team or individual), All Staff Driver (one step,
individual, peer-to-peer in staff meetings). That last one is why the Action
Step List's subtitle says "for Cross Functional Teams & Ministry Subgoal" —
it does not apply to drivers. `FOREGROUND_MIX` carries the by-church-size
table and is **advisory, never enforced**.

**The Midground is the only quantitative horizon.** Andrew: "we always
encourage people to use a qualitative and quantitative aspect of the
midground." Every example on Will's sheet has a number inside the sentence
("from 12 percent of the congregation to 25 percent"), so:

- the statement is the qualitative half, on the horizon box;
- `midground_measures` is the quantitative half — baseline → target, numeric
  (unlike `scoreboard_metrics`, whose column mixes counts, dollars and
  per-capita, these three values are the same quantity and must subtract);
- `measure_readings` keeps each dated check-in, which is what makes it a
  trajectory rather than a status.

**Progress counts from the baseline, not from zero.** `measureProgress()` —
"12% to 25%" is 0% done at 12, not 48% done. It also handles a downward
target by sign rather than by a direction column.

**Logging a reading is gated on `may_manage_tasks`, not on editor.** Defining
a measure is authoring; logging this week's number is the weekly act, and the
person who knows the number is usually church staff. Same split as the action
steps. `logReading()` writes the reading and then best-effort stamps
`current` — the second write can fail for a granted viewer and that is fine,
the reading is the record.

**The 12 Vision Templates hang off Beyond, not off the project.** The handout
says so explicitly: "The 12 Templates are Used for the Beyond-the-Horizon
Vision." `MAX_TEMPLATES` is 2 — Andrew called them "their two vision
templates", and God Dreams treats it as a primary plus a secondary. One line
to loosen.

**Template icon art is recoloured, and one file is misspelt.** The source JPGs
are a warm near-black that resamples muddy; `public/brand/god-dreams/templates/`
holds them thresholded to two colours with the plate in RunFree navy. The
source file for template 9 is named "Obidient Amplification"; the template is
**Obedient Anticipation** (`obedient-anticipation.png`). That mismatch is why
`template_key` is text validated in the app rather than a Postgres enum.

**Two layouts that had to differ by width, not one grid.** `MetricRow` was a
single five-column grid at every size; at 390px it rendered "1,180" as "1,18",
hid the Now value completely and printed "NEX" on top of the trend arrow. It
is now three columns on a phone (label, then the numbers, then the controls,
each on its own row) and five from `sm`. Any change to those columns has to be
made in `MetricRow` *and* in the `sm:grid` header above it — they are two
elements sharing one column definition.

## Assigned action steps show up where the person is, not as a copy

Andrew: "the Action Steps that are assigned to people, could possibly live in
their 'dashboard' as tasks to complete or update, possibly syncing in some way
to the team's overall view of the Horizon Storyline."

There is no sync, because there is nothing to copy. `listMyActionSteps()`
reads the **same `initiative_steps` rows** the Horizon Storyline board renders,
filtered to `assignee_profile_id`. Moving a light on the dashboard moves it on
the board, because it is one row.

Mirroring steps into `project_tasks` was the obvious-looking alternative and
would have recreated precisely the problem 040/041 exist to end — Andrew, on
the old portal: "currently there's three different places where they're
looking for next steps and I need to be able to streamline that." Do not add a
fourth.

`AssignedSteps` renders in two tones because it appears on the navy What's
Important Now card and on the white /my-work page. Its light is a **single dot
that advances** red → amber → green, not the board's three-circle
`RagPicker`: in a list of things you owe, three circles per row is a wall of
dots, and the board is where you see all three and choose deliberately.

**Where each audience meets them.** A church person meets their steps on the
project Dashboard. /my-work is RunFree-only (see `project_tasks.owner`), so
that page shows them for someone carrying several engagements at once.

**Outstanding Preparation is surfaced there too**, and only `checklist` groups
— a reading shelf deliberately has no tick boxes (044/045) and a key date is
not a thing you finish. Andrew considered folding Preparation into this card
entirely and chose "surface it, don't move it", so the panel keeps everything
and the card only borrows what is still outstanding.

## The Vision Stack is one interactive object, and the plates are real art

Andrew: "bring this functionality down into the main area, so when I click on
each icon, the corresponding text and elements expand out and are clickable to
open a PDF in a modal ... almost Apple.com style."

`VisionStackExplorer` replaced `VisionStackGraphic` (a CSS-3D approximation)
and the four-accordion list under it. The plates are Andrew's own Pivvot
artwork; the composition is his printed reference made live — exploded stack
and label rail on the left, dashed leader line, that layer's contents on the
right. One layer open at a time, selection by click.

**Two things are load-bearing, not styling:**

- **`clip-path` on each plate button.** The plates are transparent PNGs whose
  visible diamond fills about half a rectangle that overlaps its neighbours
  heavily. As rectangles, moving the pointer across the stack crosses several
  invisible boxes and the hover state chatters — Andrew: "it glitches
  significantly back and forth when the mouse goes over it." `clip-path`
  changes hit-testing as well as painting, so the hoverable area becomes
  exactly the visible diamond.
- **Selection never moves the plate under the cursor.** The old component
  lifted the element carrying `onMouseEnter`, so hovering moved it out from
  under the pointer → `onMouseLeave` → back under the pointer → forever. Here
  hover only changes brightness; the lift belongs to the *selected* plate,
  which is chosen by click and cannot oscillate. **Do not animate geometry on
  hover in this component.**

**The plate PNGs are pre-normalised.** They were exported at different times
with different shadow padding — the diamond's waist sat between 44% and 53%
down its own file, so stacked they drifted and no single clip-path fitted all
four. `public/brand/vision-stack/*.png` are all 800x567 with the diamond at
identical coordinates. If a plate is ever re-exported it has to be
re-normalised to that canvas or the clip and the art stop agreeing.

Geometry comes from the source artwork (503x900 for four plates): plate height
39.67% of the container, step 20.11%, so 3 x 20.11 + 39.67 = 100%. The leader
line lives **inside** the aspect-ratio box, because that is the element the
plates' percentages resolve against.

**The transform must live on the element that carries the clip.** It sat on an
inner span, so a selected plate scaled up inside a mask that had not moved and
the artwork's corners vanished — Andrew: "the gear icon looks wonky when
zoomed, some of the tile disappears." `clip-path` resolves in the element's
local coordinates and the transform maps both together, so putting `scale()`
on the same element scales the mask with it. The drop-shadow stays on the
inner span; that one wants to follow the art, not the box.

**The Vision Frame layer is four rows, not tiles** (**060**). Andrew: "do 4
rows, one for each side of the frame ... the only different one would be the
Strategy, where an image is able to be uploaded." `FrameSides` reads the SAME
`vision_frame` rows the Deliverables panel writes — there is one copy of a
church's mission statement in this portal. Strategy alone carries
`vision_frame.image_path`, because Mission, Values and Measures come out of a
session as sentences and Strategy comes out as a napkin sketch.

`FRAME_SIDES` is a deliberate subset of `VISION_FRAME`: Problem Statement and
Kingdom Concept are Paradigm Convictions and Vision Proper is the Horizon
Storyline, so only four of the seven belong on this layer. Deliverable files
on that layer still render, demoted under a "Documents" heading.

The four side icons (`public/brand/vision-frame/`) are the RunFree-drawn marks
— compass, fire, flashlight, bullseye. They also light up `VisionFramePanel`
on the Deliverables tab, which had been rendering `onError`-hidden `<img>`
placeholders since 055 waiting for exactly these files.

**A Draft/Live toggle only renders once there is a file to publish.** On a
stack where nothing is uploaded — which is every new project — it was a wall
of pink DRAFT pills over empty tiles, announcing a state nobody could change.

**Headless Chrome cannot render a PDF in an iframe.** A blank modal body in a
desktop screenshot is the test environment, not a bug: `useCanvasPdf()`
branches on the engine, so shooting with the iOS user agent takes the pdf.js
canvas path and the document renders. Verify PDF previews on the mobile run.

## The 1 September review round — what it left behind

A full review pass (bugs, design, mobile, a11y) after the Vision Stack and
Execution work. Most of it was ordinary fixes; these are the ones that change
how the next person should work.

- **Module cards are Live on creation** — `SessionCardForm.submit` sets
  `published_at`. `read_deliverables` hides unpublished rows from viewers,
  which is right for the Vision Stack's deliberate Draft/Live toggle, but the
  cards under "From our sessions" have no toggle and are written FOR the
  church, so every card a coach added was invisible to the people it was for.
  **062** published the eleven with content already on Christ Chapel. If you
  add another kind of deliverable without a toggle, publish it on create.
- **061 and 062 are data migrations, not schema**: the placeholder
  descriptions on the Key Dates groups, the Application Toolbox plate icon,
  highlight chapter titles, and the publish above.
- **Tap targets are widened in CSS, not per component.** `globals.css` has a
  `@media (pointer: coarse)` rule that gives every 10/11px text button and
  footer link a ~44px hit area through `::after`. A new small text control is
  covered automatically; do not re-add per-button padding hacks.
- **`Cell` has three more props** — `required` (blank snaps back instead of
  sitting unsaved over a row that declined it), `wrap` (read-only text wraps;
  a step description is a sentence), `ariaLabel` (for inputs whose caption is
  not a `<label>`). Escape discards through a ref: `blur()` fires `onBlur`
  synchronously with the pre-reset draft still in scope, so "reset, then
  blur" committed exactly the edit Escape was meant to throw away.
- **`RagPicker` is a real radio group** — one tab stop, arrows move — and its
  value is `RagStatus | null`. No status is no status; never default it.
- **The latest reading wins.** `effectiveCurrent(m, readings)` is what every
  headline, gauge and digest line shows. `midground_measures.current` is a
  best-effort stamp that RLS refuses for a task-grant viewer, and deleting a
  reading re-stamps it from whatever reading remains. `measureProgress`
  returns null without a baseline — substituting zero made a downward target
  read as 100% done.
- **"Measures behind" needs a clock.** It is judged against the year since
  the earliest live initiative's `start_date`; with no anchor nothing can be
  behind, only unstarted. The heading count includes it, so the tiles and the
  headline agree.
- **`focusInitiativeId`** on `ExecutionPanel` is how a step on the dashboard
  opens its own initiative. The page clears it on any other panel change.
- **`PrepCards`/`PrepCard` take `soloTitle`.** Key Dates is the only group on
  its panel and printed its name twice; with no description or counter the
  card header is skipped entirely, not rendered empty.
- **A Vision Stack plate is two elements.** The BUTTON carries the clip-path
  and the transform, so hit-testing and the mask move together. The WRAPPER
  carries the drop-shadow, because a filter on the clipped element is clipped
  with it — the old per-plate shadow never painted at all. The default layer
  is the highest with something finished, else Layer 01; below `lg` choosing
  a plate scrolls the panel into view.
- **`useFocusTrap` reads `onClose` through a ref** and focuses
  `[data-autofocus]` first. React never writes `autoFocus` to the DOM, so that
  attribute cannot be queried — mark the field that should win.
- **Signed URLs live twelve hours** (`SIGNED_URL_TTL`, storage.ts). Every page
  mints once on load and holds them; at an hour, a meeting that ran long came
  back to tiles that 400.
- **`FilePreview` sniffs the blob.** Images render as `<img>` and download
  with their real extension; Android joins iOS on the canvas path.
- **The home page cards are divs with stretched links.** A `<button>` inside
  an `<a>` is invalid and polluted the link's accessible name; the anchor's
  `::after` covers the card and the pin sits above it.
- **`PortalHeader` fetches the profile itself** when a page passes only a
  `framer` row — a RunFree person with no certified_framers row rendered as
  "?" with no My Tasks link on every certification page.
- **`AssignedSteps` keeps a ticked step on screen with Undo** until the next
  load. The list query excludes green rows, so the row used to vanish under
  the thumb that moved it.
- **Headshots are portal-admin only** (`canEditAvatars`). The one UPDATE
  policy on `profiles` is `manage_profiles = am_admin()`, so a project admin
  who is not a portal admin got a zero-row update, no error, and an orphaned
  upload.

Still open from that review, deliberately: the highlight picker cannot offer
a module card's `deliverable_files` attachments (only its legacy `file_path`
and `image_path`); the canvas PDF path has no text layer for a screen reader;
the navigation drawer does not make the page behind it inert while open.

## Templates carry files now, and a template without modules still has a process

Andrew, 1 Sept 2026: "I also need to start thinking of a coaching template and
a younique 1-on-1 coaching template to bring in. consider Joe McGinn's
Younique project in asana as a general structure."

009 had built the Younique template from that project's task TITLES and
nothing else, and the day sections it seeded never rendered: the process
panel was gated on "Mod #N" headings, so a Younique client would have opened
a portal with every worksheet missing. Three things changed.

**`template_resources` can carry a file** (**063**): `file_path`,
`file_name`, `file_size`, stored in the private bucket under
`templates/{template_id}/{slug}.{ext}`. Pivvot's sheets still come from
Drive; this exists because Younique's fifteen LifePlan worksheets, the
Life-Making Cycle set and the retreat guides live nowhere but as attachments
on the Asana project. Readers are the template's audience — owner, staff, and
members of any project stamped from it — mirroring `read_template_resources`.
Writes are script-only:

```bash
./node_modules/.bin/tsx --env-file=.env.local scripts/import-template-files.ts manifest.json --go
```

The manifest pairs Asana attachment download URLs with (section, title).
Those URLs expire in about an hour; list them again right before a `--go`.

Two storage-policy traps, both hit on the night this landed:

- **`alter policy` replaces the whole using-clause.** 063 rewrote the read
  policy from 007's text and silently dropped 036's private-prep rule;
  `tests/rls.test.ts` 16f caught it and **065** restored it. Start from the
  migration that last touched a policy, not the one that created it.
- **Write `objects.name`, not `name`, inside a subquery on storage.objects.**
  063's subquery joined `projects`, which has a `name` column, so
  `foldername(name)` resolved to the church's name and no member ever
  matched — staff saw worksheet pills, a viewer saw none. **066** fixed it;
  16m is the check. 036 had written `objects.name` for the same reason.

007's project-id cast is now guarded by `try_uuid()`: a `templates/…` path
in the first folder used to be a runtime error inside the OR of policies, not
a false.

**A template with no module track renders its sections as The Process.**
`nonModuleSections(detail)` — declared order from `templates.structure`,
minus prep sections and the overview, limited to sections holding something —
feeds `SectionNav` (text chips, "Day 1 · Section 1") and the same
`ModulePanel` a Pivvot module uses. In that panel a section without a module
number renders its rows as a numbered walkthrough: a row with a file opens the
worksheet in the in-portal viewer, a row with a URL links out, a row with
neither is a step in the day. Pivvot sections keep their Drive handouts and
never show the walkthrough — there the exercise rows are labels for sheets
that live in Drive. `moduleLabel()` prettifies "Day 1 - Section #1".

**Younique 1-1 Life Plan** (**064**) is a real curriculum now: four prework
rows (the LDG worksheet and its three Loom videos), ten steps on Day 1
Section 1 down to three on Day 3, and seven Life-Making Cycle documents, with
21 files attached. Section names were normalised ("Day 2 Section #1" and
"Day 3 - Section #3" were Asana copy-paste artefacts). Nothing of Joe's own
content came across — only blank worksheets and the pre-work list from the
template task's note. The two 90-Day Launch attachments were byte-identical
(24 MB each); one is kept. The Younique book itself is already on the Books
shelf from Drive, so it is not duplicated here.

**Meta Performance Coaching** (also 064) has an outline — COACHING
PREPARATION, Coaching Sessions, Coaching Resources, TEAM — and three prework
items as a starting point for Andrew to edit, not a curriculum. Working Genius
is there because it is Andrew's own instrument; he has not confirmed it.

`scripts/scratch-project.ts <slug> "<name>"` stamps a throwaway project
through `createProject()` with a throwaway staff account, and `--delete
<id>` removes both. Delete it. A forgotten one is a fake church in the picker.

`PrepareSection` takes `isGroup`; a 1:1 client reads "Your Preparation", not
"Prepare Your Team".

## The nonprofit template: a template says how its process is navigated

Andrew, 2 Sept 2026: "Another template we'll need is for a nonprofit. we do
very similar vision frame training, it just doesn't follow the 'pivvot
process.' … It would be nice to have a process overview that is essentially
just the vision frame icons … the final deliverables would essentially be
just the vision frame with a space to add some custom handouts."

**067** gave `templates` three facts the page had been inferring:

- **`process_kind`** — `modules` (Pivvot's six "Mod #N" tools, `ModuleNav`),
  `sections` (Younique's days and coaching's sections, `SectionNav` chips),
  `frame` (the Vision Frame elements as icons, `FrameNav`). For `frame`,
  every declared section is on the rail from day one, empty or not — the
  frame IS the process. For `sections`, a declared section still has to
  hold something (Younique declares "Overview" and "Session Recordings",
  which hold nothing).
- **`frame_elements`** — which `vision_frame` rows the Deliverables sheet
  shows. A nonprofit has no Kingdom Concept; null means all seven.
- **`voice`** — `church` or `organization`. `framePrompt()` rewrites only
  the prompts that name a church; the roster card and the session publish
  checkbox say "Your Team" / "client team" instead of "Church Team".

`frameElementForSection()` maps a section name to its element ("Vision" →
vision_proper); "Discovery" maps to nothing and gets a search mark.

**The nonprofit template** (`nonprofit-vision-frame`): sections Discovery,
Mission, Values, Strategy, Measures, Vision; prep groups Key Dates, Discovery
Work (three placeholder items), Team Profiles, and a DELIVERABLES group
"Custom Handouts" (kind `files`) — which is the "space to add some custom
handouts": editors upload PDFs, viewers open them. `has_vision_stack` is
false, so Deliverables is the frame sheet plus that group.

**Handouts come from Drive** through `handouts_folder_id`, pointed at
"RunFree Team > Non Church Org (for profit)" (`1-ZWrZ0vecjza7HD3wKuoe-dm5WCMe7bP`).
That folder is examples and overviews, not numbered modules, so it all
arrives as `extras` and renders as `HandoutPills` under the rail. Two changes
to `listTemplateHandouts` for it: a file two levels down now belongs to the
top-level folder above it (the PDFs live in "Handouts/PDF"), and only PDFs and
images are listed (the `.pages` originals sit beside their exports). **The
folder has to be shared with `portal@runfree-portal.iam.gserviceaccount.com`
before any of it lists** — as of 2 Sept it was not, and an unshared folder
lists as empty, not as an error.

**Every ModulePanel now ends with "Sessions on this"** — the sessions filed
under that section, with Recording / Transcript / N next steps marks and a
jump to the Sessions panel. Pointers, not copies: recordings, transcripts,
notes and next steps still live on Sessions (040/041), this is the way there
from the section they belong to.

## The 2 September walkthrough — Preparation, Team, the module tiles, the one-page PDF

Andrew's notes from walking Athena Christian Church, and what each became.

- **A `files` group is a drop zone, not a form.** Andrew: "All that I really
  need in this section is to be able to add files … drag and drop any file
  that a client gives to me … also add any text notes to this area as a kind
  of separate card." `FileDump` takes any number of files by drop or click,
  each becoming a row named after the file, and a note (title + text). The
  full `PrepItemForm` with dates and links is still what Edit opens on a row;
  it is no longer the door. Previous Vision Equity, Team Building Profiles,
  Final Documents, Custom Handouts and the profile uploads are all `files`.
- **The Preparation Checklist is the PDF's own steps** (**068**). "Launch
  Preparation Checklist" has two lists, so the group became two — "Before the
  First Visit" (the five things to send) and "Room and Environment Setup"
  (the nine things to have ready, with the two order links) — stamped into
  the template and into both live Pivvot projects. The PDF itself reaches the
  panel through `checklistHandouts`, which now matches file titles as well as
  group names; the two checklist PDFs live inside "Additional Handouts" in
  Drive and a group-name match never found them.
- **Project settings live under Edit details**, not at the foot of Team.
  Andrew: "a really strange place to have that functionality." `ProjectSettings`
  takes a `className` so it can sit inside the hero's editing box.
- **"What this module produces" is tiles**, the Vision Stack's own `StackTile`
  (now exported), wired to the same open/upload/publish handlers as the stack
  page, so a file dropped on Funnel Fusion's "Church Problem Statement" is the
  file on the Paradigm Convictions plate. Assimilation Funnel left Module 1
  (068) but stays on the stack.
- **Reading & Pre-Work is two shelves**: books and PDFs on 150px tracks,
  videos on their own row on 220px tracks. A 2:3 jacket and a 16:9 still
  never sat well in one grid.
- **The Vision Stack card draws the plates** — the real artwork, the stack
  geometry, the layer names on a rail to the left — instead of a list.
- **The Vision Frame sheet has a Kingdom Concept mark** (cropped from the
  Venn diagram in Andrew's Downloads) **and opens as a one-page PDF.**
  `/api/projects/[id]/vision-frame` draws it with pdf-lib from whatever is
  written — only written sides, body size stepping down until one page holds
  it — in Montserrat and Poppins from `src/lib/pdf/fonts/`. Those fonts and
  the wordmark are listed in `next.config.ts`'s `outputFileTracingIncludes`;
  `readFile(path.join(process.cwd(), …))` is invisible to Vercel's tracer and
  the function would ship without them. The button fetches with the bearer
  token and opens the blob in `FilePreview`, where Download already lives.
- **The Vision Stack page opens with the plates in a row**, small, and they
  glide into the stack on the first scroll, wheel, touch or click — or after
  2.8s. Andrew: "the tiles are horizontal, and then as soon as I start to
  scroll, they shift over into a stack." The row boxes keep the plate's own
  aspect (26% wide by 10.3% tall of a 503x900 box) so the diamond clip still
  fits the art in flight. Reduced motion skips it. The hero is three lights on
  navy with the frame mark drawn large and faint.

## The 2 September evening notes — the stack opens, one checklist, a focused Preparation tab

Andrew's second look at the walkthrough changes, and what each one turned into:

**The Vision Stack intro opens in place instead of arriving in a row.** The
first idea (four small plates in a row, sliding into the stack on the first
scroll) "didn't look as cool as I thought it would. i couldn't even see it
when it first loaded": the row was small, sat below the fold, and had already
moved by the time he reached it. Now every plate starts on the foundation's
spot as one closed block, and when the stack box is 45% in view
(`IntersectionObserver` on `stackRef` in `VisionStackExplorer`) the upper
three rise to their places bottom first, labels following once they land. It
plays when the stack is actually looked at, not on a timer racing the reader;
a 6s fallback and any click open it regardless; reduced motion starts open.
The hero he liked ("the header looks great w the vision frame icon") is
untouched.

**One checklist PDF.** "Launch Preparation Checklist" and "Preparation
Checklist" in Drive's Additional Handouts are the same document twice.
`listTemplateHandouts` now keeps the most recently modified of any files
matching `/prep(aration)?\s*checklist/i` within a group (12 June's
"Preparation Checklist" over 2 June's "Launch …" as of this writing) — so the
Preparation card, the Process handout pills and the highlight picker all see
one. Athena also carried a byte-identical upload of the older copy on a
"Review the Preparation Checklist" prep item; that row and its storage object
were removed, since the Drive copy reaches the panel on its own. Do not add
the checklist back as a prep-item file.

**Preparation is the checklist content, nothing else.** "If the dashboard
holds all the orientation material along with the assigned reading when it's
starting up, the preparation tab can be solely focused on the content from
the checklist we prepared." `PrepareSection` no longer renders the template's
prep resources (the orientation videos and reading chips — they still exist
for the highlight picker), and the Reading & Pre-Work group is shown to
editors only, since a church meets the reading through the dashboard's
highlights. A viewer sees: the checklist PDF card, Previous Vision Equity,
Before the First Visit, Room and Environment Setup. The single-file handout
card says "One sheet", not "1 sheets".

**The Deliverables card shows the art alone.** No layer titles; the four
plates at 250px wide, pinned to the card's bottom edge with a negative margin
so the foundation bleeds off it (the card is `overflow-hidden`, which is what
makes the bleed a crop rather than an overflow).

## Executive Coaching: a template built from a live Asana project, without the client in it

Andrew, 2 Sept 2026, on a teammate's "Amy Davis Executive Coaching" project in
Asana: "scrape everything you can from that project that can be standardized
on coaching. pay attention to the column names as inspiration and guidelines.
pull every pdf and video link to bring into the template … don't bring over
any sensitive material about her. for instance, if a task says vision — just
note that we need a vision task with the ability to edit text."

So 069 turns the placeholder "Meta Performance Coaching" (an outline, three
guessed prework items, no projects) into **Executive Coaching** (slug
`executive-coaching`, same template id). Meta Performance is the school behind
this coaching, not a second offering — Jaggard's "Beyond High Performance" is
its first-month read. Nothing of the client's came across: the session notes
and whiteboard photos were never read, the intake form's answers were dropped
and only its sixteen questions kept, and every "Vision point #1" is an empty
field. The coach's own Zoom and scheduling links became two placeholder rows
("Your coach adds their scheduling link here").

**How the Asana columns landed.** Onboarding → Preparation (Key Dates, the
seven Coaching Commitments as a checklist, Getting to Know You as sixteen
editable notes, Forms and Scheduling). Sessions → Sessions. Whiteboarding →
the photo on the session it came from. Additional Resources and Healthy
Practices and Optional Life Planning and Younique Book by Chapter → declared
process sections, chips on The Process. Deliverables → thirteen `notes`
groups under `DELIVERABLES`, one per tool, every field an item the client
types into, with the five one-page worksheets as `DELIVERABLES` resources.
The 35 files (PDFs, and the eight Performance Practices cards as PNGs) sit in
template storage; `scripts/import-template-files.ts` now takes a local
`path` as well as a `url`, because Asana download links expire in an hour and
the files were pulled first.

**Three things the page learned for it.**

1. A prep group whose `section` is a section the template DECLARES in
   `structure.sections` renders inside that section's panel (ModulePanel's
   "Fill this in" block) and stays off Preparation; `nonModuleSections` no
   longer treats such a section as prep. Undeclared sections
   (`PREPARATION`, `CHURCH PREPARATION`, `TEAM`, `DELIVERABLES`) route as
   before. Dates groups go to Key Dates wherever they sit. Side effect,
   intended: Younique's "Recommended Prework" is now a chip on The Process
   holding its LDG worksheet, the three videos and its groups — those four
   resources had lost their home when Preparation stopped rendering template
   prep resources.
2. A stored image resource is a card, not a document row: ModulePanel splits
   the walkthrough into `cards` (a gallery, `IMAGE_FILE`) and `walkthrough`.
   That is the Healthy Practices section.
3. `DELIVERABLES` resources with files list on the Deliverables panel as
   Worksheets (`SheetList`), above the groups. And an EMPTY `frame_elements`
   now means "no Vision Frame sheet" (070) — null still means all seven — so
   the church frame does not sit above a coaching client's thrill lists.

**Covers (071).** `template_resources.thumb_path` — a cover under
`templates/{id}/thumbs/`, read by the same policy as the documents. A section
whose walkthrough has any cover renders as `ResourceShelf` (a ranked grid of
3:4 tiles, PDF/Link pills) instead of the numbered list; the eight Performance
Practices cards were already a gallery because they ARE images. Andrew: "can
we make the resources … a little more visual … book images/thumbnails/etc.?"
The manifest for `import-template-files.ts` takes a `thumb` (path or URL) per
entry, and a cover-only entry needs an existing row. The Younique chapter rows
share the section art their Asana card had (the frame icon on chapters 9–13,
the horizon icon on 14–25), cropped square so it fills the tile. File-backed
template resources can be highlighted now too, cover and all — before 071 the
catalogue only offered rows with a link.

**Team or one person is the project's call now.** `projects.is_group` (069,
null = the template's default) feeds `detail.isGroup`, which replaced every
`detail.template?.isGroup ?? true`; the New Project page asks "Who is this
for?" with the template's default pre-selected. Executive Coaching defaults
to one person; the same template serves a team by flipping that.

## The coaching templates after Brooke's feedback (3 Sept 2026)

Andrew met Brooke, walked her through the first Executive Coaching template,
and brought back a transcript. What it turned into (072, 073):

**Two templates.** `executive-coaching` ("Executive Coaching (1-on-1)",
one person) and `executive-coaching-team` ("Executive Team Coaching", a
team). Brooke: "I think we're gonna need both." The team one is the one-on-one
one cloned in SQL — rows copied, storage paths rewritten to the new template
id, objects copied by `scripts/copy-template-files.ts` — then shaped: Will's
team deliverables visible (thrill lists, role description, chronic
complaints, storyboard, the assessments), plus Team Outcomes, a Team
Manifesto ("a clarified, almost contractual agreement that's written out at
the end of a team training"), Roles and Responsibilities, Team Insights.

**`templates.ui` names the panels and carries the questions.** `nav`
(prepare → "Onboarding", team → "Client Info" or "Team", process →
"Resources", execution → null hides it), `wording` (tasks → "Commitments",
task_add, tasks_theirs, team_title, process_eyebrow, materials for the
highlight picker's tab), `session_prep` (Brooke's five questions before every
session, from an empty upcoming session on the Asana board), `feedback` and
`feedback_rating` (a draft — she said the Typeform "needs to be recreated"),
`baseline_group`. Brooke: "it's not a process. These are all resources."

**A client can write, in four places only.** `write_prep_items` is
editors-only and the client is a viewer, so four SECURITY DEFINER
functions open exactly what the template says: `set_prep_item_notes` and
`set_prep_item_done` (074; only on groups with `client_editable` — the
Coaching Commitments are ticked this way), `submit_session_prep`,
`submit_session_feedback` — the last two keyed by profile id in
`sessions.prep_answers` / `sessions.feedback` so a team does not overwrite
itself. RLS checks 28a–28i pin them. The onboarding form is the
"Onboarding Form" group (client_editable); a viewer sees Answer / Edit your
answer on each question. Editors still use Edit.

**Hidden tools.** `template_prep_groups.hidden_by_default` is stamped into
`projects.hidden_groups` at creation; an admin's Hide on a card and the
"Hidden tools" strip (Deliverables, and any section panel) toggle it through
`setHiddenGroups`. Hidden groups leave every list, and a worksheet whose
description names a hidden tool ("For YQ: Offenders.") goes with it. Brooke:
"we would probably want to hide that, maybe not delete it … as something
serves within a conversation, we can then share it."

**The rest of the panels.** Onboarding = Coaching Commitments (checklist),
Onboarding Form, Your Coach (contact, scheduling and video-call placeholders
— Brooke's own links were never copied). Client Info = the roster, the
Coaching Agreement (files, "start date, stop date"), Assessments and
Profiles, the baseline card ("Where we began": the onboarding answers read
back, stress as a meter), Milestones and Mountaintops. Deliverables leads
with the coaching tools (Your Vision, Vision–Reality Gap, Rackets and
Limiting Beliefs, 90-Day Sprint, FACTS Inventory, Coach's Tools) with the
Younique tools hidden behind them. Whiteboard is a `WHITEBOARD` group (files)
plus every session photo, newest first — "the price of admission". Healthy
Practices are `layout = 'practice'` rows drawn as coloured cards from the
steps in `description`; the screenshots are gone. Commitments are
`project_tasks` under their new name: the coach adds them on a session, the
client ticks them, the dashboard lists them.

**Sessions.** A viewer sees the prep questions on an upcoming session and the
feedback form on a held one; an editor sees everyone's answers, and on a held
session a "Draft the recap email" link (a mailto with the takeaways, the
summary as plain text and the commitments — no AI, just the draft Brooke
asked for). The dashboard nudges: prep due within three days, feedback due
within ten, and for the coach "No next session on the calendar".

**Not built, on purpose.** The AI pieces Brooke raised — a transcript graded
for talk ratio and questions asked, a real-time coaching assistant, birthday
gifts from a favourites list — need a model and a budget the portal does not
have; the placeholders (transcript, summary, feedback, favourites in the
onboarding form) are all in place so nothing is lost when they come. A
per-project custom GROUP (not just cards inside "Coach's Tools") would need
project-level groups, which the schema does not have yet.

## The Read & Watch shelf draws PDFs and takes an order (075)

Andrew: "when I just added that resource to Athena's project, there's no
image that loads. Please fix it to where the first page always loads from a
PDF. Also, I'd like to be able to reorder anything on that shelf."

A PDF highlight with no cover renders its own first page through the
existing `PdfThumbnail` (pdf.js in the browser, cached in localStorage by
file): `HighlightShelf` takes `fetchPdfBytes`, which the page answers from
`/handouts/file/{id}` for a Drive handout and from the signed URL for a
stored file. `ResourceCard` grew `artNode` for exactly this. Reordering is
drag on a desktop and ‹ › arrows anywhere, persisted by `reorderHighlights`
(positions 0..n); the shelf keeps a local order so a drop lands before the
round trip. The same pattern went onto a section's "From our sessions" cards
(`SessionCards`, `reorderDeliverables`), which Andrew asked for in the same
breath.

`templates.ui.default_highlights` names handout titles to highlight on a
brand-new project — "Preparation Checklist" on Pivvot. The New Project page
calls `seedDefaultHighlights` after `createProject`, matching titles against
the handout library the project just inherited; best effort, and the
shortest matching title wins. Athena's was added by hand and is the same
Drive file.

## The Horizon Storyline, in God Dreams' own words (076)

Andrew, 4 Sept 2026, on the Execution tab: "make sure that we add the
correct language." The bands are now Beyond-the-Horizon Vision (5–20
years), Background Horizon (3 years, four OBJECTIVES — "we typically call
those objectives, not priorities"), Mid-Ground Horizon (the one-year goal)
and Foreground Horizon (four 90-day initiatives). `HORIZON_DEFINITIONS` in
`god-dreams.ts` carries the four definitions verbatim from The Horizon
Storyline Overview handout; the Mid-Ground detail quotes its one.

**The vision is said up front.** The Beyond box is two columns: the vivid
description in full on the left (an editor's click opens the editor; a
reader gets text, not a button), and on the right the church's two vision
templates with their icons plus "The full vivid description" — a PDF on the
`horizon_storyline` row (`file_path`, uploaded to `{project_id}/…` by
`uploadHorizonFile`, opened through a signed URL). Andrew: "that way, we can
remove the section underneath the horizon storyline that says the long
range vision." So the Beyond detail is editor-only now and titled "Edit the
vision"; a reader is never landed on it.

**Objectives have a title and a description** (`horizon_storyline.title`;
`body` is the description; the three notes columns stay). The board shows
the title bold with the description clamped under it.

**The Foreground always shows four slots.** Empty ones read "Initiative N";
an editor's click on one opens the add form (AddInitiative's `signal`).
Opening an initiative is its dashboard: owner ("Leader" became "Owner"),
light, the strip (steps by colour, past due, cost, days left), the plan's
six blocks, the action steps with owner/cost/light. Nothing new stored —
Andrew's "each one of the four ninety day initiatives has the ability to be
tracked" was already the shape; it just had the wrong words on it.

**The Mid-Ground gauge is God Dreams' mosaic.** `MeasureMosaic` lights a row
of tiles in the visual summary's palette (teal → gold → orange → magenta)
from baseline to target — compact on the board, full with captions in the
detail. Progress still counts from the baseline. The Execute icon from the
God Dreams logo set heads the panel.

**The Ministry Dashboard is a Measures Dashboard.** Andrew: "omit the
strategy input for, like, attendance … move more towards the measures
output … fully customizable … categories like a header as well as the
individual measures." `scoreboard_metrics.category` is the header; rows are
`measure_output`; a new header is created with its first measure; headers
rename by rewriting their rows. Prior / Now / Goal (next yr.) stay, with the
light and the trend, and a `Trajectory` line under any row whose three
numbers parse. Athena's nine seeded strategy-input rows are not deleted —
they fold away under "strategy inputs — set aside for now". `DASHBOARD_STARTER`
is no longer offered.

## Checking it on a phone

`scripts/mobile-audit.ts` drives Chrome as an emulated iPhone (390x844, DPR 3,
touch, iOS user agent) and asserts what a screenshot cannot show you: nothing
spilling past the viewport, no page-level horizontal scroll, every visible
image actually decoded, nothing in the console.

```bash
./node_modules/.bin/tsx --env-file=.env.local scripts/mobile-audit.ts <project-id>
```

`scripts/panel-shot.ts` is the other half, and the half that catches a
different class of bug:

```bash
./node_modules/.bin/tsx --env-file=.env.local scripts/panel-shot.ts \
    <project-id> execution viewer 1440 4000 expand
```

Same throwaway account, but you choose its **role**, the width, and whether to
open every disclosure first. `click:<text>` presses the first button whose
label contains that text — which is how the Execution board's four detail
views get captured, since each only renders when its box is selected. A final
`keep` argument leaves the account in place for a two-step check (seed
something against its profile id, then shoot again) and **prints a reminder to
delete it** — a forgotten one shows up as a stray face in a church's Team
panel, which is how Andrew found the last one. Andrew, after a run of avoidable bugs: "I feel
like a lot of these are common sense mistakes ... do a full audit again."
Almost all of them were invisible from an admin session — editor-facing copy
shown to a church ("add what you actually watch" on a panel they cannot edit),
or layout that only breaks once a card is expanded. **Check both roles before
calling a panel done.**

The `height` argument is not a detail. On `lg` the project page is
`h-screen overflow-hidden` with the content column scrolling inside it, so
`captureBeyondViewport` returns exactly one viewport. Set it taller than the
panel or you will screenshot the top third and believe you have seen the page.

`mobile-audit.ts` creates and deletes a throwaway account the way `tests/rls.test.ts` does,
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
