-- Bug found by tests/rls.test.ts scenario 5 ("a coach can create a project
-- and is a member of it immediately"): can_see_project() only granted
-- visibility through project_members, ownership, or team-wide + staff. A
-- brand-new private project has no project_members row yet — that's the very
-- next statement the app runs — so `insert into projects (...) returning *`
-- failed: the row satisfies create_projects' WITH CHECK but Postgres also
-- enforces the SELECT policy on a RETURNING clause, and can_see_project()
-- said no to its own creator.
--
-- manage_projects (UPDATE) already treats created_by = auth.uid() as
-- sufficient; read access was the inconsistent one.

create or replace function can_see_project(p uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from project_members m
    where m.project_id = p and m.profile_id = auth.uid()
  )
  or exists (
    select 1 from projects pr
    join profiles me on me.id = auth.uid()
    where pr.id = p
      and (
        me.is_owner
        or pr.created_by = auth.uid()
        or (pr.visibility = 'team' and me.is_staff)
      )
  );
$$;
