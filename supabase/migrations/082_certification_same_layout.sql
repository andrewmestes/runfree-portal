-- 082 — The certification template renders exactly like Pivvot.
--
-- Andrew, 22 Sept 2026: "i want to ensure that we have integrity to the
-- overall process templates. every single improvement needs to be the exact
-- same across all projects and templates. i don't want to customize for every
-- single project." 081 had given the cohort template its own rail labels, its
-- own task vocabulary, coaching-style prep/feedback questions, no Vision
-- Frame sheet, no Vision Stack and no Execution tab. All of that goes; the
-- template keeps only what a template is for — the content it stamps.
--
-- The one vocabulary difference that stays is the roster's word for the
-- people in the room. A cohort is not a church, and Andrew: "the
-- certification participants sometimes are not only 'organizations.' I think
-- that we could just call it group or participants." So `voice` gains
-- 'group', which the page renders as "Participants".

alter table templates drop constraint if exists templates_voice_check;
alter table templates
  add constraint templates_voice_check
  check (voice in ('church', 'organization', 'group'));

update templates
set voice = 'group',
    frame_elements = null,          -- the full Vision Frame sheet, like Pivvot
    has_vision_stack = true,
    ui = jsonb_build_object('default_highlights', ui -> 'default_highlights')
where slug = 'pivvot-certification';

-- The Vision Stack scaffolding is stamped from template_deliverables, and the
-- certification template had none. Copy Pivvot's rows so a new cohort gets
-- the same plates a church does.
insert into template_deliverables (template_id, title, section, kind, stack_layer, position)
select c.id, d.title, d.section, d.kind, d.stack_layer, d.position
from template_deliverables d
join templates p on p.id = d.template_id and p.slug = 'pivvot-vision-framing'
cross join templates c
where c.slug = 'pivvot-certification'
  and not exists (
    select 1 from template_deliverables x
    where x.template_id = c.id and lower(x.title) = lower(d.title)
  );

-- And into the two cohorts that already exist, exactly as
-- stampTemplateDeliverables would have: unpublished, skipping any title the
-- project already holds.
insert into deliverables (project_id, title, section, kind, stack_layer, position, published_at)
select pr.id, d.title, d.section, d.kind, d.stack_layer, d.position, null
from projects pr
join templates c on c.id = pr.template_id and c.slug = 'pivvot-certification'
join template_deliverables d on d.template_id = c.id
where not exists (
  select 1 from deliverables x
  where x.project_id = pr.id and lower(x.title) = lower(d.title)
);
