-- Assigning tasks is an admin act, grantable to one person at a time.
--
-- Andrew: "Only project admins can assign tasks. If I want a team member (or
-- subscriber) to have access, I should be able to assign that separately than
-- the master permission list."
--
-- Two things in one sentence. The default tightens — writing a task was
-- editor-or-admin, and an editor can be a non-staff client leading their own
-- process. And the exception becomes a real per-person grant rather than a
-- reason to hand someone the whole admin role just so they can add homework.
--
-- Deliberately NOT a new role. Roles are a ladder and every rung carries
-- everything below it; "can assign tasks" has nothing to do with managing
-- members or project settings, so it hangs off the membership instead.
alter table project_members
  add column if not exists can_manage_tasks boolean not null default false;

comment on column project_members.can_manage_tasks is
  'Grants task create/edit/complete without granting the admin role. Ignored when role = admin, which already has it.';

-- One place decides, so the policy and the tick function cannot drift.
create or replace function may_manage_tasks(p uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select am_owner() or exists (
    select 1 from project_members m
     where m.project_id = p and m.profile_id = auth.uid()
       and (m.role = 'admin' or m.can_manage_tasks)
  );
$$;

revoke all on function may_manage_tasks(uuid) from public;
grant execute on function may_manage_tasks(uuid) to authenticated;

drop policy if exists write_project_tasks on project_tasks;
create policy write_project_tasks on project_tasks
  for all using (may_manage_tasks(project_id))
  with check (may_manage_tasks(project_id));

-- Ticking follows the same rule. 039 restricted it to editor/admin for a
-- reason that still holds — completion is a statement by someone accountable
-- for the engagement — and that is now precisely whoever may manage tasks.
create or replace function set_task_done(p_task_id uuid, p_done boolean)
returns void language plpgsql security definer set search_path = public
as $$
declare v_project uuid;
begin
  select project_id into v_project from project_tasks where id = p_task_id;
  if v_project is null then raise exception 'No such task'; end if;
  if not may_manage_tasks(v_project) then
    raise exception 'Only a project admin, or someone granted task access, can change a task';
  end if;
  update project_tasks
     set is_done = p_done,
         completed_at = case when p_done then now() else null end
   where id = p_task_id;
end;
$$;

revoke all on function set_task_done(uuid, boolean) from public;
grant execute on function set_task_done(uuid, boolean) to authenticated;

-- Brooke is `editor` on Christ Chapel and has been writing tasks there under
-- the old rule. Tightening the default without this would silently take that
-- away mid-engagement, so anyone who could do it yesterday keeps it.
update project_members set can_manage_tasks = true where role = 'editor';
