-- Andrew: "I need the ability to delete and/or archive a project."
--
-- Archive already worked: projects.archived_at exists and manage_projects
-- covers UPDATE. Delete did not — manage_projects is `for update` only, so a
-- DELETE matched no policy and failed closed. Correct default, wrong
-- behaviour for what was asked.
--
-- Restricted to the project's admins, its creator, and the owner: everything
-- cascades from here, and that is not an undo anyone should reach by
-- accident. lib/projects.ts removes the project's Storage objects BEFORE the
-- row, because once the project is gone the policies that authorise deleting
-- its files no longer resolve and the bucket would keep them forever.
create policy delete_projects on projects
  for delete using (
    am_owner()
    or created_by = auth.uid()
    or exists (
      select 1 from project_members m
      where m.project_id = projects.id
        and m.profile_id = auth.uid()
        and m.role = 'admin'
    )
  );
