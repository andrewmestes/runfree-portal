-- The team coaching template, cloned from the one-on-one one and then
-- shaped for a team. Brooke: "I think we're gonna need both … when I'm gonna
-- run a coaching session for a team, what I'm gonna really leverage are
-- going to be [the healthy team practices] … I would want the team to have,
-- like, a clarified, almost contractual agreement that's written out at the
-- end of a team training … I don't need to do that with an individual."
--
-- Will's team-coaching deliverables (the thrill lists, role description,
-- chronic complaints, storyboard, the assessments) are the visible tools
-- here; on the one-on-one template they are hidden until wanted.
--
-- Rows are copied with the storage paths rewritten to this template's id;
-- scripts/copy-template-files.ts copies the objects themselves.

insert into templates (name, slug, description, is_active, has_vision_stack, is_group,
                       process_kind, frame_elements, voice, structure, ui)
select
  'Executive Team Coaching',
  'executive-coaching-team',
  'Executive coaching for a leadership team: onboarding, sessions with prep questions and commitments, the team deliverables, the performance practices, and a team manifesto to close.',
  true, false, true, process_kind, frame_elements, voice, structure,
  ui || jsonb_build_object(
    'nav', jsonb_build_object('prepare', 'Onboarding', 'team', 'Team', 'process', 'Resources', 'execution', null),
    'wording', jsonb_build_object(
      'tasks', 'Commitments',
      'task_add', 'Add a commitment',
      'tasks_theirs', 'Team commitments',
      'team_title', 'Your Coach',
      'process_eyebrow', 'The library',
      'materials', 'Coaching materials'))
from templates where slug = 'executive-coaching'
on conflict (slug) do nothing;

insert into template_prep_groups (template_id, section, key, title, description, kind, position, client_editable, hidden_by_default)
select t2.id, g.section, g.key, g.title, g.description, g.kind, g.position, g.client_editable, g.hidden_by_default
from template_prep_groups g
join templates t1 on t1.id = g.template_id
join templates t2 on t2.slug = 'executive-coaching-team'
where t1.slug = 'executive-coaching'
on conflict (template_id, key) do nothing;

insert into template_prep_items (group_id, title, notes, external_url, position, thumb_path, drive_file_id)
select g2.id, i.title, i.notes, i.external_url, i.position, i.thumb_path, i.drive_file_id
from template_prep_items i
join template_prep_groups g1 on g1.id = i.group_id
join templates t1 on t1.id = g1.template_id
join templates t2 on t2.slug = 'executive-coaching-team'
join template_prep_groups g2 on g2.template_id = t2.id and g2.key = g1.key
where t1.slug = 'executive-coaching'
  and not exists (select 1 from template_prep_items x where x.group_id = g2.id and x.title = i.title);

insert into template_resources (template_id, section, kind, title, description, external_url, position, is_primary,
                                file_path, file_name, file_size, thumb_path, layout)
select t2.id, r.section, r.kind, r.title, r.description, r.external_url, r.position, r.is_primary,
       replace(r.file_path, t1.id::text, t2.id::text), r.file_name, r.file_size,
       replace(r.thumb_path, t1.id::text, t2.id::text), r.layout
from template_resources r
join templates t1 on t1.id = r.template_id
join templates t2 on t2.slug = 'executive-coaching-team'
where t1.slug = 'executive-coaching'
  and not exists (select 1 from template_resources x where x.template_id = t2.id and x.section = r.section and x.title = r.title);

insert into template_members (template_id, profile_id, role, org_role, position)
select t.id, p.id, 'viewer'::project_role, 'Executive Coach', 1
from templates t join profiles p on lower(p.email) = 'brooke@runfree.co'
where t.slug = 'executive-coaching-team'
on conflict do nothing;

-- A team fills in the team tools; the personal ones stay hidden.
update template_prep_groups g set hidden_by_default = false
from templates t where g.template_id = t.id and t.slug = 'executive-coaching-team'
  and g.key in ('ec-thrill-professional', 'ec-thrill-personal', 'ec-role-description',
                'ec-chronic-complaints', 'ec-storyboard', 'ec-insights', 'ec-strengths', 'ec-apest');
update template_prep_groups g set title = 'Onboarding Form',
  description = 'Each person answers for themselves before the first session — put your name at the top of each answer. Your coach reads them all.'
from templates t where g.template_id = t.id and t.slug = 'executive-coaching-team' and g.key = 'ec-onboarding-form';
update template_prep_groups g set title = 'Team Milestones',
  description = 'The story of the team''s growth: where we began, the milestones along the way, and where we are now.'
from templates t where g.template_id = t.id and t.slug = 'executive-coaching-team' and g.key = 'ec-milestones';
update template_prep_groups g set title = 'The Team''s Vision',
  description = 'What does the team want to be true about itself, its people and its results at the end of our time together?'
from templates t where g.template_id = t.id and t.slug = 'executive-coaching-team' and g.key = 'ec-vision';

insert into template_prep_groups (template_id, section, key, title, description, kind, position, client_editable, hidden_by_default)
select t.id, v.section, v.key, v.title, v.description, v.kind::prep_group_kind, v.position, v.client_editable, false
from templates t
cross join (values
  ('TEAM', 'ect-roles', 'Roles and Responsibilities',
   'Each person''s role, their top three responsibilities, and who they hand off to. One card per person.', 'notes', 5, true),
  ('TEAM', 'ect-team-insights', 'Team Insights',
   'The team''s Insights Discovery wheel and any team-level reports.', 'files', 6, false),
  ('DELIVERABLES', 'ect-outcomes', 'Team Outcomes',
   'What the team wants to be true at the end of the engagement, and how we will know.', 'notes', 7, true),
  ('DELIVERABLES', 'ect-manifesto', 'Team Manifesto',
   'The agreement the team writes together at the end of the training — how we work, how we decide, and how we hold each other to it. Signed by everyone.', 'notes', 8, true)
) as v(section, key, title, description, kind, position, client_editable)
where t.slug = 'executive-coaching-team'
on conflict (template_id, key) do nothing;

insert into template_prep_items (group_id, title, notes, position)
select g.id, v.title, v.notes, v.position
from template_prep_groups g
join templates t on t.id = g.template_id
join (values
  ('ect-outcomes', 'Outcome 1', null, 1),
  ('ect-outcomes', 'Outcome 2', null, 2),
  ('ect-outcomes', 'Outcome 3', null, 3),
  ('ect-outcomes', 'How we will know', null, 4),
  ('ect-manifesto', 'Who we are', null, 1),
  ('ect-manifesto', 'What we are committed to', null, 2),
  ('ect-manifesto', 'How we work together', null, 3),
  ('ect-manifesto', 'How we make decisions', null, 4),
  ('ect-manifesto', 'How we handle a broken commitment', null, 5),
  ('ect-manifesto', 'Signed by', 'Every name, and the date.', 6)
) as v(key, title, notes, position) on v.key = g.key
where t.slug = 'executive-coaching-team'
  and not exists (select 1 from template_prep_items x where x.group_id = g.id and x.title = v.title);
