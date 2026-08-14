-- Follows 005 (project_role now has viewer/editor/admin, committed). This
-- migration:
--   1. adds a portal-wide certification/training-content flag to profiles —
--      Andrew: a client project plus this flag might replace a whole separate
--      "Pivvot Coaching" template, so it's a capability independent of any
--      one project's membership.
--   2. adds freeform section grouping to sessions/deliverables — a template's
--      modules ("Mod #1 FUNNEL FUSION", DENOMINEE's "Mod #1 PROBLEM") differ
--      per vertical, and a from-scratch project has no template to constrain
--      it to at all, so this can't be an enum.
--   3. adds deliverables.image_path for direct-upload screenshots/charts
--      (Andrew: "no backend work needed... simply screenshot an image and
--      drop it into their project") — storage bucket + RLS lands in 007.
--   4. adds template_resources: the content that's IDENTICAL across every
--      project stamped from one template (handouts, teaching videos,
--      exercises), modeled directly off the real Asana template content, not
--      invented. Distinct from sessions/deliverables, which are per-project.
--   5. re-points every policy that referenced the old coach/client roles at
--      editor/admin, and adds what didn't exist before: an UPDATE policy on
--      project_members (promote/demote without delete+reinsert), and admin
--      membership as a second path into manage_projects alongside the
--      creator and the owner.

alter table profiles add column certification_access boolean not null default false;

alter table sessions add column section text;
alter table deliverables add column section text;
alter table deliverables add column image_path text;

-- ---------------------------------------------------------------------------
-- template_resources
-- ---------------------------------------------------------------------------

create type template_resource_kind as enum ('handout', 'video', 'exercise', 'team_bio', 'link');

create table template_resources (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references templates on delete cascade,
  section       text not null,
  kind          template_resource_kind not null,
  title         text not null,
  description   text,
  external_url  text,
  drive_file_id text,
  position      integer not null default 0,
  created_at    timestamptz not null default now()
);

create index idx_template_resources_template on template_resources(template_id);

alter table template_resources enable row level security;

-- Visible to staff/owner always, and to any member of any project running
-- this template — a client has to be able to read "Funnel Fusion Handouts",
-- which is the whole reason this table exists.
create policy read_template_resources on template_resources
  for select using (
    am_owner() or am_staff()
    or exists (
      select 1 from projects pr
      join project_members m on m.project_id = pr.id
      where pr.template_id = template_resources.template_id
        and m.profile_id = auth.uid()
    )
  );

-- Owner-only, matching manage_templates: these are the Asana "DO NOT CHANGE"
-- masters' equivalent here.
create policy manage_template_resources on template_resources
  for all using (am_owner()) with check (am_owner());

-- ---------------------------------------------------------------------------
-- Re-point role-gated policies at editor/admin
-- ---------------------------------------------------------------------------

drop policy if exists insert_members on project_members;
create policy insert_members on project_members
  for insert with check (
    (
      profile_id = auth.uid()
      and role = 'admin'
      and exists (
        select 1 from projects pr
        where pr.id = project_id and pr.created_by = auth.uid()
      )
    )
    or exists (
      select 1 from project_members m
      where m.project_id = project_members.project_id
        and m.profile_id = auth.uid()
        and m.role = 'admin'
    )
    or am_owner()
  );

drop policy if exists delete_members on project_members;
create policy delete_members on project_members
  for delete using (
    exists (
      select 1 from project_members m
      where m.project_id = project_members.project_id
        and m.profile_id = auth.uid()
        and m.role = 'admin'
    )
    or am_owner()
  );

-- New: promote/demote a member's role in place.
create policy update_members on project_members
  for update using (
    exists (
      select 1 from project_members m
      where m.project_id = project_members.project_id
        and m.profile_id = auth.uid()
        and m.role = 'admin'
    )
    or am_owner()
  )
  with check (
    exists (
      select 1 from project_members m
      where m.project_id = project_members.project_id
        and m.profile_id = auth.uid()
        and m.role = 'admin'
    )
    or am_owner()
  );

drop policy if exists read_sessions on sessions;
create policy read_sessions on sessions
  for select using (
    can_see_project(project_id)
    and (
      published_at is not null
      or exists (
        select 1 from project_members m
        where m.project_id = sessions.project_id
          and m.profile_id = auth.uid()
          and m.role in ('editor', 'admin')
      )
      or am_owner()
    )
  );

drop policy if exists write_sessions on sessions;
create policy write_sessions on sessions
  for all using (
    exists (
      select 1 from project_members m
      where m.project_id = sessions.project_id
        and m.profile_id = auth.uid()
        and m.role in ('editor', 'admin')
    )
    or am_owner()
  );

drop policy if exists read_deliverables on deliverables;
create policy read_deliverables on deliverables
  for select using (
    can_see_project(project_id)
    and (
      published_at is not null
      or exists (
        select 1 from project_members m
        where m.project_id = deliverables.project_id
          and m.profile_id = auth.uid()
          and m.role in ('editor', 'admin')
      )
      or am_owner()
    )
  );

drop policy if exists write_deliverables on deliverables;
create policy write_deliverables on deliverables
  for all using (
    exists (
      select 1 from project_members m
      where m.project_id = deliverables.project_id
        and m.profile_id = auth.uid()
        and m.role in ('editor', 'admin')
    )
    or am_owner()
  );

-- Admin members can now also manage project settings, not just the creator.
drop policy if exists manage_projects on projects;
create policy manage_projects on projects
  for update using (
    am_owner()
    or created_by = auth.uid()
    or exists (
      select 1 from project_members m
      where m.project_id = projects.id and m.profile_id = auth.uid() and m.role = 'admin'
    )
  )
  with check (
    am_owner()
    or created_by = auth.uid()
    or exists (
      select 1 from project_members m
      where m.project_id = projects.id and m.profile_id = auth.uid() and m.role = 'admin'
    )
  );
