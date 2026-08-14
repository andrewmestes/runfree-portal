# RunFree Client Portal

A private portal replacing how RunFree uses Asana with clients. Each engagement
gets its own space holding session recordings, coaching notes, transcripts,
deliverables and materials — visible only to the people on it.

Not started. This folder holds the plan, the schema, and the brand assets.

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

## Access model — read this before writing any query

Being on the RunFree team grants **nothing** by itself. A coach's visibility
works exactly like a client's, through membership of a specific project. The
only extra capability staff have is that they can *create* projects.

- **Private project** — visible only to its explicit members. A coaching
  relationship is private and invisible to the rest of the team.
- **Team-wide project** — visible to every RunFree staff member. Team training
  videos are team-wide.

A coach opening a new engagement picks a template, picks private or team-wide,
and is a member of what they just made. Nobody provisions it for them, and
nothing is visible by default.

| Role | Sees |
| --- | --- |
| Client | Only the projects they are on |
| Coach / staff | Their own projects, plus anything team-wide |
| Owner (Andrew) | Everything, plus managing people and templates |

**Enforce this with Postgres row-level security, not with checks inside route
handlers.** One forgotten filter shows one church's recordings to another. That
is a different order of problem from any bug in the CVF portal, where everyone
is entitled to the same content. See `docs/data-model.md`.

## Shared Supabase project — read before creating anything

**This is the decision, not yet the fact.** The current migrations
(`supabase/migrations/001-004`) were applied against a new, separate Supabase
project — `runfree-client-portal`, isolated from CVF. Andrew has confirmed he
wants one shared project instead. Re-pointing `.env.local` at the CVF project
and re-running the migrations there is the reconciliation; cheap right now
since nothing real has been invited into either side of this portal yet, and
`002`'s function-grant fix plus the schema itself are project-agnostic SQL —
nothing about them assumes which project they run against.

Once reconciled: **the same Supabase project as the Certified Vision Framers
portal**, so `auth.users` is shared and one person has one login even if they
are both a certified framer and a client.

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

1. **New repo forked from the CVF portal.** Multi-tenant schema and RLS from the
   first commit.
2. **Pivvot template, with Athena Christian Church as the first real project.**
   One vertical, one live client, end to end.
3. **Coaching notes and the Meta Performance template.** Proves templates handle
   a second, differently shaped vertical rather than one hard-coded layout.
4. **Coaches creating their own projects.** Private by default, from a template,
   without anyone provisioning it. This is the step that actually takes RunFree
   off Asana.
5. **Younique life plans, then migrating the rest of the roster.**

## Deliberately later

Named so they don't quietly expand the first build.

- Client replies on notes and sessions (turns a reading surface into a
  conversation — brings notifications, unread state, moderation)
- Automatic note generation from call transcripts
- Client uploads
- Home-screen install and push notifications
- Folding the Certified Vision Framers portal in as one more team-wide project

## Before designing further

If Andrew authorises the **Asana connector**, read the real Pivvot and Meta
Performance boards and model the templates from their actual structure rather
than from description. It needs authorising in his claude.ai connector settings.

Full plan, including reasoning:
https://claude.ai/code/artifact/eca4f455-a5c0-414b-af2d-517bfcea66c0
