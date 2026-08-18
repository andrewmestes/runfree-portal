-- A church can read the template its own engagement runs on.
--
-- `read_templates` has been `am_staff() OR am_owner()` since migration 001,
-- which means no actual client has ever been able to read a `templates` row.
-- That is not a cosmetic gap. Two things on the project page go through that
-- table, and both silently degrade to nothing:
--
--   1. `getProjectDetail` selects `projects, templates(...)`. For a client the
--      join resolves to null, so `template` is null, so `hasVisionStack` is
--      false and the Vision Stack card — the centrepiece deliverable of a
--      six-figure engagement — never renders for the people who paid for it.
--
--   2. `/api/projects/[id]/handouts` reads `templates(handouts_folder_id)`
--      through the CALLER'S token, on purpose, so that RLS decides. Null
--      folder id means the route returns `{byModule:{}, extras:[]}` with a
--      200 and no error, and the entire 101-sheet Pivvot handout library is
--      invisible to every church.
--
-- Both failures are silent by construction — a null join and an empty-but-OK
-- API response — which is why they survived staff-account testing. Anyone
-- with `is_staff` sees a complete portal; the client sees a shell.
--
-- The fix is the policy that `template_resources` (006) and
-- `template_prep_groups` (022) already use, applied to the table those two
-- describe. It was simply left behind when they were written. A templates row
-- holds process metadata — name, slug, structure, handout folder id, the
-- is_group and has_vision_stack flags — and no client data whatsoever, so a
-- member reading the template behind their own project exposes nothing that
-- the module rail on their page is not already showing them.
--
-- Membership is still required: this grants a member their OWN template, not
-- the catalogue. A church on Pivvot still cannot read the Younique row.

drop policy if exists read_templates on templates;
create policy read_templates on templates
  for select using (
    am_staff()
    or am_owner()
    or exists (
      select 1 from projects pr
      join project_members m on m.project_id = pr.id
      where pr.template_id = templates.id
        and m.profile_id = auth.uid()
    )
  );
