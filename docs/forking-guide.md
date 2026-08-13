# Forking the Certified Vision Framers portal

Source: `../certified-vision-framers-portal` — live in production, and the
reason this project starts at roughly 60% rather than zero.

Everything below was written for **one shared audience**. The value is in
knowing which parts don't care about that and which parts are built on it.

---

## Carries over essentially untouched

| What | Where | Note |
| --- | --- | --- |
| Invite-only auth | `src/lib/auth.ts`, `src/lib/invite.ts`, `src/app/auth/**` | Self-signup is off in Supabase; admin-granted access only. Working email flow, branded templates. |
| Access-failure handling | `src/lib/auth.ts`, `src/components/AccessError.tsx` | Distinguishes "not on the list" from "the lookup failed" — a real bug that told certified framers their access was pending when their wifi dropped. |
| Drive mirroring | `src/lib/drive.ts`, `src/lib/drive-id.ts` | Live folder listing, no local copies. |
| Gated file serving | `src/app/api/*/file/**` | Verified in production that an arbitrary Drive id returns 404 rather than the file. Keep that property. |
| PDF preview | `src/components/PdfThumbnail.tsx`, `src/components/FilePreview.tsx` | Client-side render, bundled worker, size cap, focus trap. |
| Loom handling | `src/lib/loom.ts`, `src/lib/video.ts` | oEmbed resolution, the self-consistency check that stops one video showing another's thumbnail, manual stills for broken ones. |
| Focus trap | `src/lib/useFocusTrap.ts` | Shared by both modals. |
| Header | `src/components/PortalHeader.tsx` | Collapses to a menu below `sm`. Nav links will need to become project-aware. |
| Brand system | `tailwind.config.ts`, `src/app/globals.css` | Palette, both gradients, the 16px mobile input floor. Already copied into this repo's `public/brand`. |
| Admin patterns | `src/app/admin/framers/**` | Sorting, filtering, CSV import, invite flows. The shape is reusable; the scope is not. |

---

## Must change — single-tenant assumptions

These are the reason this is a fork and not a branch.

### Drive folder ids are environment variables

`GOOGLE_DRIVE_FOLDER_ID`, `GOOGLE_BOOKS_FOLDER_ID`, `GOOGLE_DFG_FOLDER_ID` are
read straight from `process.env`. One deploy can therefore only ever serve one
set of folders.

**Here:** the folder id lives on the project row. Shared libraries get their own
rows. Nothing about content location comes from the environment.

### Access is checked in route handlers, with the service-role key

Every CVF route calls `requireAdmin()` or looks the caller up in
`certified_framers`, then queries with the service-role key — which bypasses
RLS entirely. That is defensible when every authorised person is entitled to
identical content.

**Here it is not defensible.** One missing `where project_id = …` shows one
church's recordings to another. Queries run as the user with RLS enforcing
isolation; the service-role key is reserved for genuine admin operations that
have no user context.

### `certified_framers` is the allowlist

Membership of that one table is the entire access model — you are in or out.

**Here:** `profiles` for people, `project_members` for who sees what. There is no
global "has access" flag.

### Pages fetch one global content set

`/books`, `/videos`, `/resources`, `/guide` each load a fixed library.

**Here:** every content route is scoped to a project the caller can see. Shared
libraries are their own thing, deliberately separate from project content.

### Admin means one thing

`is_admin` on `certified_framers` grants the whole admin surface.

**Here:** `is_staff` grants creating projects and seeing team-wide ones.
`is_owner` grants everything. Neither grants access to a private project.

---

## Do not copy

- `src/lib/books.ts` and the books UI — Will's books are Pivvot/CVF library
  content. If a shared library needs them later, model it as a shared library.
- `src/lib/ghl.ts` and `src/app/api/webhooks/ghl/**` — GoHighLevel tagging is
  about certification status, not client engagements. Revisit only if a real
  need appears.
- `public/brand/books/**`, `pivvot-badge-white.svg`, `dfg-*` — Pivvot-specific
  chrome. Deliberately not copied into this repo.
- `MANUAL_STILLS` in `src/lib/loom.ts` — those seven entries are keyed to CVF
  recordings. Keep the mechanism, drop the data.

---

## Worth reading before starting

`../certified-vision-framers-portal/docs/` holds the operational writeups —
GoHighLevel sync, the custom-domain checklist, email templates. The domain
checklist generalises: nothing hardcodes the production URL, because every
redirect is built from the incoming request origin. Keep that property here and
moving to a custom domain stays a dashboard job.

Recent commits are unusually well documented on *why* — worth skimming
`git log` in that repo when something looks arbitrary. Several of those
comments record bugs that were found in production and would be easy to
reintroduce.
