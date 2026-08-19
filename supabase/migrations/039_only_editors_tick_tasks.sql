-- Ticking a task off is now an editor/admin action.
--
-- Andrew: "i want only project admins or editors to be able to check that
-- it's completed. not every single person with access to the project."
--
-- This reverses the call made in 030, where any member who could see the
-- project could tick a task — the reasoning then being "the church does the
-- homework, so the church should tick it off". In practice a project has a
-- dozen viewers and one person actually running it, and a task marked done by
-- whoever happened to click first tells the coach nothing about whether the
-- team has done it. Completion is now a statement by someone accountable for
-- the engagement.
--
-- Viewers keep reading the list; they simply cannot change its state. The
-- function still exists for the same reason it always did: manage_tasks
-- restricts UPDATE to editors and admins, and Postgres RLS cannot limit an
-- UPDATE to a single column, so without this an editor ticking a box would
-- also be able to rewrite the task's title through the same policy.

create or replace function set_task_done(p_task_id uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
begin
  select project_id into v_project from project_tasks where id = p_task_id;
  if v_project is null then
    raise exception 'No such task';
  end if;

  -- Editor or admin on THIS project, or the owner. can_see_project() is no
  -- longer enough on its own — that is what let every viewer tick.
  if not (
    am_owner()
    or exists (
      select 1 from project_members m
      where m.project_id = v_project
        and m.profile_id = auth.uid()
        and m.role in ('editor', 'admin')
    )
  ) then
    raise exception 'Only an editor or admin can mark a task complete';
  end if;

  update project_tasks
     set is_done = p_done,
         completed_at = case when p_done then now() else null end
   where id = p_task_id;
end;
$$;

revoke all on function set_task_done(uuid, boolean) from public;
grant execute on function set_task_done(uuid, boolean) to authenticated;
