-- Deliverables belong to the template, so a new project is born with them.
--
-- Until now createProject() wrote exactly two rows: the project, and the
-- creator's admin membership. Nothing read templates.structure and nothing
-- created a deliverable. Athena looks complete only because its 27 rows were
-- hand-written — 22 in seed.sql and 5 more in migration 012.
--
-- The consequence, reproduced before writing this: create a second Pivvot
-- project and it gets all 55 template_resources (handouts and videos are keyed
-- by template_id, so the module rail LOOKS correct) and ZERO deliverables —
-- every Vision Stack layer reads "Nothing in this layer yet", and the header
-- reads "0 of 0 complete". There was no way out from inside the app either:
-- the only caller of createDeliverable was the photo gallery, which makes
-- untitled session images.
--
-- Seeded by copying Athena's actual rows rather than re-typing them. Those
-- rows already carry the right section, kind and stack_layer — including the
-- three Flipcharts that migration 010 turned into session_image, and the five
-- Application Toolbox items that have no section at all. Re-typing the list
-- is how one of those details quietly goes missing.
--
-- kind and stack_layer are carried EXPLICITLY rather than being re-derived on
-- stamp. Migration 012 assigned stack_layer by matching on title with no
-- project filter; that was fine once, against one project, but as a rule it
-- would mis-file the moment two churches shared a deliverable name.

create table template_deliverables (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates on delete cascade,
  title       text not null,
  section     text,
  kind        deliverable_kind not null default 'vision_stack',
  stack_layer text references vision_stack_layers(slug) on delete set null,
  position    integer not null default 0
);

create index idx_template_deliverables_template on template_deliverables(template_id);

alter table template_deliverables enable row level security;

-- Same audience as template_resources: staff and the owner always, plus
-- anyone on a project running this template.
create policy read_template_deliverables on template_deliverables
  for select using (
    am_owner() or am_staff()
    or exists (
      select 1 from projects pr
      join project_members m on m.project_id = pr.id
      where pr.template_id = template_deliverables.template_id
        and m.profile_id = auth.uid()
    )
  );

create policy manage_template_deliverables on template_deliverables
  for all using (am_owner()) with check (am_owner());

-- Lift Athena's real rows into the Pivvot template.
insert into template_deliverables (template_id, title, section, kind, stack_layer, position)
select p.template_id, d.title, d.section, d.kind, d.stack_layer, d.position
from deliverables d
join projects p on p.id = d.project_id
where p.name = 'Athena Christian Church - Pivvot Vision Framing'
  and p.template_id is not null
  -- Only the scaffolding the template should carry. A photo someone has
  -- already uploaded to Athena is that church's work, not part of the
  -- template, and must never be stamped onto anyone else.
  and d.image_path is null
  and d.file_path is null;
