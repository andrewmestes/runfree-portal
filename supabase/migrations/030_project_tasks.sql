-- One upload flow, three views — plus the small things dates and documents
-- were missing.
--
-- Andrew, thinking out loud about where a coach uploads: "I typically upload
-- a Session Recap, which would be the notes... but to be able to pull out
-- some homework elements or some next steps and have that populate at the
-- very top of their project would be good... Once they complete that task, it
-- should fill both in a module and turn green and greyed out."
--
-- So a task is ONE row that three places render: the banner at the top, the
-- module it belongs to, and the session that produced it. Not three lists to
-- keep in sync.
alter table sessions add column if not exists recap text;

create table project_tasks (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects on delete cascade,
  -- Where it came from. Null for a task typed straight into the banner.
  session_id   uuid references sessions on delete set null,
  -- Which module it belongs to. Null shows it only at the top.
  section      text,
  title        text not null,
  notes        text,
  due_on       date,
  is_done      boolean not null default false,
  completed_at timestamptz,
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);

create index idx_project_tasks_project on project_tasks(project_id);
create index idx_project_tasks_section on project_tasks(project_id, section);

alter table project_tasks enable row level security;

create policy read_project_tasks on project_tasks
  for select using (can_see_project(project_id));

-- Creating, editing and deleting a task is coach work.
create policy write_project_tasks on project_tasks
  for all using (
    exists (
      select 1 from project_members m
      where m.project_id = project_tasks.project_id
        and m.profile_id = auth.uid()
        and m.role in ('editor', 'admin')
    )
    or am_owner()
  );

-- But TICKING one is the whole point for the church team, and they are
-- viewers. RLS cannot restrict an UPDATE to a single column, so ticking goes
-- through a security-definer function instead of a policy: any member of the
-- project may flip is_done, and nothing else. tests/rls.test.ts 18b-18e pin
-- both halves of that.
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
  if not can_see_project(v_project) then
    raise exception 'Not your project';
  end if;
  update project_tasks
     set is_done = p_done,
         completed_at = case when p_done then now() else null end
   where id = p_task_id;
end;
$$;

revoke all on function set_task_done(uuid, boolean) from public;
grant execute on function set_task_done(uuid, boolean) to authenticated;

-- Key dates that span days, and a link to join. Andrew: "October 19th is an
-- on-site weekend — guest perspective Sunday, leader gathering Sunday night,
-- team session Monday. We need to be able to track that there are multiple
-- dates there."
alter table prep_items add column if not exists end_on date;
alter table prep_items add column if not exists meeting_url text;

-- Some of what a lead pastor sends over is not for the whole team.
alter table prep_items add column if not exists is_private boolean not null default false;

drop policy if exists read_prep_items on prep_items;
create policy read_prep_items on prep_items
  for select using (
    can_see_project(project_id)
    and (
      is_private = false
      or am_owner()
      or exists (
        select 1 from project_members m
        where m.project_id = prep_items.project_id
          and m.profile_id = auth.uid()
          and m.role in ('editor', 'admin')
      )
    )
  );
