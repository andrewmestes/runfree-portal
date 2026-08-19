-- Pin a project to the top of your own list.
--
-- Andrew: "when listing projects, I'd like to be able to reorder these, maybe
-- even star or pin them to the top the way Asana does."
--
-- Pinning is PER PERSON, not per project, which is why the column lives on
-- project_members rather than on projects. Andrew running six engagements
-- wants the two he is actively facilitating at the top; Will, on the same
-- projects, will want a different two. A flag on `projects` would have made
-- one person's shortlist everyone's.
--
-- A timestamp rather than a boolean so the pinned group has a stable order of
-- its own — most recently pinned first, which is what someone pinning a third
-- project expects to see happen.

alter table project_members add column if not exists pinned_at timestamptz;

-- Why a function instead of a policy: `manage_members` restricts UPDATE on
-- project_members to project admins, and rightly so — that table decides who
-- can see what. But pinning is a personal preference that any member should
-- be able to set on their own row, and Postgres RLS cannot restrict an UPDATE
-- to a single column. Widening the policy would let any viewer edit their own
-- `role`, which is a privilege escalation. The same reasoning produced
-- set_task_done() in 030 and the is_owner guard in 035.
--
-- This function is the narrow hole: it touches exactly one column, only ever
-- on the caller's own membership row.
create or replace function set_project_pinned(p_project_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  update project_members
     set pinned_at = case when p_pinned then now() else null end
   where project_id = p_project_id
     and profile_id = auth.uid();

  -- No row means the caller is not a member of that project. Silence would
  -- read to the app as success and leave the star toggled in the UI.
  if not found then
    raise exception 'Not your project';
  end if;
end;
$$;

revoke all on function set_project_pinned(uuid, boolean) from public;
grant execute on function set_project_pinned(uuid, boolean) to authenticated;
