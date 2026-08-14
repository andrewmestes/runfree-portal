# RunFree Client Portal

A private portal replacing how RunFree uses Asana with clients. Each engagement
gets its own space holding session recordings, coaching notes, transcripts,
deliverables and materials — visible only to the people on it.

**Pivvot Vision Framing is live end to end** as of 2026-08-14: schema, RLS,
the actual project page (view/edit sessions and deliverables, image uploads,
team management), the creation flow, and the real first project — Athena
Christian Church — seeded from the actual Asana template, not a mockup. See
`docs/data-model.md` for what's built and `tests/rls.test.ts` for what's
verified. Meta Performance and Younique are still just plans below.

---

## The scoping fact that shrinks this

**RunFree uses Asana only as a client-facing display surface.** No internal task
management, no assignments, dependencies, sprints or workload views. "Replace
Asana" therefore does not mean building a task manager. It means an engagement
portal — which is very close to something that already exists and works.

## Fork, don't start from scratch

`../certified-vision-framers-portal` is live in production and roughly 60% of
what's needed here. See `docs/forking-guide.md` for what carries over untouched
and — more importantly — the single-tenant assumptions that must not come with it.

## Verticals in scope

Each is a **template** that gets stamped onto a new project. Templates are the
load-bearing concept, not a nicety: RunFree currently copies a generic Asana
board per engagement, and each vertical needs a different shape.

| Vertical | Shape |
| --- | --- |
| Pivvot Vision Framing | Sessions, handouts, Vision Frame deliverables |
| Meta Performance Coaching | Coaching notes, transcripts, 1:1 and team recordings |
| Younique / Life Plan | One-on-one life plan engagements |

Out of scope: **Calling for the Best of Us**. It is a public, self-serve,
sequenced course — a different product with a different access model. Parked
pending a RightNow Media conversation that may mean it is never built here.

### Two Pivvot templates, or one?

Asana also has a **"RUN FREE Pivvot coaching Template DO NOT CHANGE"** — same
modules, plus a Facilitator's Guide, Pilot Experiences, and an Application
Toolbox, for certifying someone to lead the process themselves. Andrew, not
yet decided: *"a project portal for their church, and access to the
certification tools, that might be sufficient"* — i.e. `certification_access`
(see Access model) plus an `editor`/`admin` grant on the client's own project
might be the whole answer, with no second template needed. Only the Pivvot
Vision Framing template is built; don't build the coaching one speculatively.

## Access model — read this before writing any query

Being on the RunFree team grants **nothing** by itself. Visibility works
through membership of a specific project — a client's and a coach's access
are the same mechanism, just usually a different tier. The only portal-wide
capability staff have is that they can *create* projects.

**Implemented as three per-project tiers, not a fixed client/coach split**
(built out in `005_project_member_roles.sql` and `006_client_portal_expansion.sql`
— the original two-role design couldn't express Pivvot Coaching, where the
client leads their own process and needs to write, not just read):

| Role | Can |
| --- | --- |
| `viewer` | Read published sessions/deliverables. Nothing else. |
| `editor` | Everything a viewer can, plus write sessions and deliverables. |
| `admin` | Everything an editor can, plus add/remove members and change roles. |

Anyone — staff or client — can hold any tier on a project they're a member of.
A self-facilitating Pivvot Coaching client is `editor` or `admin` on their own
project without being RunFree staff; a RunFree teammate who's just there to
observe can be `viewer`.

- **Private project** — visible only to its explicit members.
- **Team-wide project** — visible to every RunFree staff member, regardless
  of tier they'd hold if they joined explicitly.

A staff member opening a new engagement picks a template (or starts from
scratch), picks private or team-wide, and is added as `admin` on what they
just made. Nobody else provisions it for them, and nothing is visible by
default.

`profiles.certification_access` is a separate, portal-wide boolean,
independent of any project membership — the mechanism for "this client also
gets certification/training content," which may end up being the entire
answer to whether a dedicated Pivvot Coaching *template* is ever needed (see
"Two templates, or one?" below).

**Enforce this with Postgres row-level security, not with checks inside route
handlers.** One forgotten filter shows one church's recordings to another. That
is a different order of problem from any bug in the CVF portal, where everyone
is entitled to the same content. See `docs/data-model.md`.

## Shared Supabase project — read before creating anything

**Done, as of 2026-08-14.** This portal runs on the same Supabase project as
Certified Vision Framers (`txaesavbpbtyqhzhcabm`), not a separate one. It
briefly existed on its own project (`fbcrofawqxdldcibevfs`, created by a
parallel session while forking) — migrations `001-004` were re-applied
verbatim against the CVF project via the Supabase MCP, `.env.local` in both
repos now points at the same `NEXT_PUBLIC_SUPABASE_URL`, and `tests/rls.test.ts`
passes all 11 checks against it. The standalone project is dormant, not
deleted — nothing has been invited into it, so there is nothing on it worth
recovering, but deleting a Supabase project is a separate, one-way decision
that hasn't been made yet.

`auth.users` is shared, so one person has one login even if they are both a
certified framer and a client.

That direction is one-way. Sharing later would mean re-inviting every certified
framer and losing their passwords; splitting later is trivial. It also removes a
standing tax: one set of email templates, one SMTP config, one redirect
allowlist, one place to add or remove a person.

The table sets do not collide — CVF owns `certified_framers`, `training_videos`
and `ghl_sync_log`; this portal owns `profiles`, `projects`, `project_members`,
`sessions`, `deliverables`, `templates`. RLS is per-table.

**The one real risk is a careless migration.** The CVF portal is live and
serving real church leaders. Never write a migration that touches a table this
project does not own, and never disable RLS on one to debug the other.

### Invitation emails need solving separately

Supabase allows one set of email templates per project, and they are already
branded for Certified Vision Framers. A church client must not receive an email
about certification.

So this portal should **not** use Supabase's built-in invite email. Mint the
link with the admin API (`generateLink`) and send the message from the app with
its own branding. That is the only way to get per-portal email copy out of a
shared auth system, and it is the standard approach when one auth project backs
more than one product.

## Domains

- `certified.runfree.co` — Certified Vision Framers portal (and any future
  certification; named for certification, not for Vision Framing)
- `portal.runfree.co` — this portal
- DNS is AWS Route 53, with a `*.runfree.co` wildcard already pointing unclaimed
  subdomains at the Plesk web host. A specific CNAME overrides it, but nothing
  looks broken beforehand because the subdomain already resolves — to the wrong
  place.

## Settled decisions

- **Web app first.** No native iOS/Android. The same codebase installs as a PWA
  later — home screen icon, full screen, push notifications on iOS 16.4+.
- **Recordings are links.** Loom throughout, Zoom occasionally. No video hosting,
  storage or transcoding to build.
- **Coaching notes are one kind, all client-visible.** Written by the coach:
  transcripts, recordings, key takeaways, commitments. There is no separate
  private working note.
- **Handout folders differ per project.** RunFree-branded rather than
  Pivvot-branded. This is why the Drive folder id must live on the project row.

## Store notes as separate fields, not one blob

Andrew wants a finished coaching call to eventually populate its own next steps
and takeaways automatically. Loom and Zoom both produce transcripts, so this is
close to feasible.

Nothing needs building for it now. But store `recording_url`, `transcript` and
`takeaways` as **separate columns from the start**. If notes go in as one block
of pasted text, adding the automation later means re-entering every note by hand.

## Build order

Each step ends somewhere usable, so work can stop or re-prioritise without
stranding a half-migration.

1. ~~**New repo forked from the CVF portal.** Multi-tenant schema and RLS from
   the first commit.~~ Done.
2. ~~**Pivvot template, with Athena Christian Church as the first real
   project.** One vertical, one live client, end to end.~~ Done — real
   content from Asana, not a mockup.
3. **Coaching notes and the Meta Performance template.** Proves templates handle
   a second, differently shaped vertical rather than one hard-coded layout.
   Not started — needs the real Meta Performance Asana board read first, the
   same way Pivvot's was.
4. ~~**Coaches creating their own projects.** Private by default, from a
   template, without anyone provisioning it.~~ Done, and further than
   planned: `/projects/new` also supports starting from scratch with no
   template — any RunFree staff member can do this today, from a template or
   not. This is the step that actually takes RunFree off Asana.
5. **Younique life plans, then migrating the rest of the roster.** Not
   started. Andrew: no clean reusable Younique template currently exists in
   Asana — only one finished engagement (Joe McGinn's) to reverse-model from,
   differently shaped (day/section-numbered, not modular) from Pivvot.

## Deliberately later

Named so they don't quietly expand the first build.

- Client replies on notes and sessions (turns a reading surface into a
  conversation — brings notifications, unread state, moderation)
- Automatic note generation from call transcripts
- Client uploads
- Home-screen install and push notifications
- Folding the Certified Vision Framers portal in as one more team-wide project

## Before designing further

The Asana connector is authorised and was used to build the Pivvot Vision
Framing template and the Athena Christian Church project directly from the
real boards — see `supabase/seed.sql` for exactly what was read and how it
maps to the schema. Do the same for Meta Performance and Younique before
building their templates: read the real boards, don't model from description.

Full plan, including reasoning:
https://claude.ai/code/artifact/eca4f455-a5c0-414b-af2d-517bfcea66c0
