-- Highlighting is a project-manager act, not an editor one.
--
-- Andrew: "I want to make sure that only project managers can see 'highlight
-- resources.'"
--
-- 046 mirrored write_deliverables, i.e. editor or admin. That is right for
-- content — an `editor` can be a non-staff client leading their own process,
-- and they should be able to write up their own sessions. It is wrong for
-- this: the shelf is the coach telling a church what to read before the next
-- session, and a church editor assigning themselves homework is not a thing
-- anyone wants.
--
-- So: admin only, plus am_owner() as everywhere else. Hiding the button
-- without this would have been security by decoration.
--
-- Consequence worth knowing: on the two live projects only Andrew is `admin`.
-- Will is `viewer` on both and Brooke is `editor` on Christ Chapel, `viewer`
-- on Athena — so neither can highlight until they are made admins on a
-- project, which is what the Access dialog is for.
drop policy if exists insert_project_highlights on project_highlights;
drop policy if exists update_project_highlights on project_highlights;
drop policy if exists delete_project_highlights on project_highlights;

create policy insert_project_highlights on project_highlights
  for insert with check (
    am_owner() or exists (
      select 1 from project_members m
       where m.project_id = project_highlights.project_id
         and m.profile_id = auth.uid()
         and m.role = 'admin'
    )
  );

create policy update_project_highlights on project_highlights
  for update using (
    am_owner() or exists (
      select 1 from project_members m
       where m.project_id = project_highlights.project_id
         and m.profile_id = auth.uid()
         and m.role = 'admin'
    )
  );

create policy delete_project_highlights on project_highlights
  for delete using (
    am_owner() or exists (
      select 1 from project_members m
       where m.project_id = project_highlights.project_id
         and m.profile_id = auth.uid()
         and m.role = 'admin'
    )
  );
