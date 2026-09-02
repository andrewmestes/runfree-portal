-- A fourth vertical: Vision Frame training for a nonprofit or other
-- non-church organization.
--
-- Andrew, 2 Sept 2026: "we do very similar vision frame training, it just
-- doesn't follow the 'pivvot process.' there's discovery work, and the full
-- vision frame that gets introduced, but the majority of the videos would
-- not be relevant … It would be nice to have a process overview that is
-- essentially just the vision frame icons … the final deliverables would
-- essentially be just the vision frame with a space to add some custom
-- handouts on the back end."
--
-- Three template-level facts the page did not have a column for:
--
--   process_kind   'modules'  — Pivvot's six "Mod #N" tools with their icons
--                  'sections' — Younique's days, coaching's sections (chips)
--                  'frame'    — the Vision Frame elements, as icons, every one
--                               of them present from day one even when empty
--   frame_elements which Vision Frame rows the Deliverables sheet shows; null
--                  is all seven. A nonprofit has no Kingdom Concept.
--   voice          'church' | 'organization' — the prompts and the roster's
--                  labels. "The attributes in the life of a believer" is not
--                  how a food bank describes its measures.
--
-- Handouts come from the shared Drive folder "RunFree Team > Non Church Org
-- (for profit)" through handouts_folder_id, the same route Pivvot uses. That
-- folder still has to be shared with the portal's service account; until it
-- is, the library lists empty (see CLAUDE.md on Drive).

alter table templates
  add column if not exists process_kind text not null default 'sections'
    check (process_kind in ('modules', 'sections', 'frame')),
  add column if not exists frame_elements text[],
  add column if not exists voice text not null default 'church'
    check (voice in ('church', 'organization'));

update templates set process_kind = 'modules' where slug = 'pivvot-vision-framing';

insert into templates (name, slug, description, is_active, has_vision_stack, is_group,
                       handouts_folder_id, process_kind, frame_elements, voice, structure)
values (
  'Nonprofit Vision Frame',
  'nonprofit-vision-frame',
  'Vision Frame training for a nonprofit or other non-church organization: discovery work, then the full frame — without the Pivvot process.',
  true, false, true,
  '1-ZWrZ0vecjza7HD3wKuoe-dm5WCMe7bP',
  'frame',
  array['mission', 'values', 'strategy', 'measures', 'vision_proper'],
  'organization',
  jsonb_build_object('sections', jsonb_build_array(
    'Discovery', 'Mission', 'Values', 'Strategy', 'Measures', 'Vision'))
)
on conflict (slug) do update
  set description = excluded.description,
      handouts_folder_id = excluded.handouts_folder_id,
      process_kind = excluded.process_kind,
      frame_elements = excluded.frame_elements,
      voice = excluded.voice,
      structure = excluded.structure;

insert into template_prep_groups (template_id, section, key, title, description, kind, position)
select t.id, v.section, v.key, v.title, v.description, v.kind::prep_group_kind, v.position
from templates t
cross join (values
  ('PREPARATION',  'np-key-dates', 'Key Dates',
   'Session days and deadlines.', 'dates', 1),
  ('PREPARATION',  'np-discovery', 'Discovery Work',
   'What to complete before we meet.', 'checklist', 2),
  ('TEAM',         'np-profiles',  'Team Profiles',
   'Upload completed assessments and profiles.', 'files', 3),
  ('DELIVERABLES', 'np-handouts',  'Custom Handouts',
   'Documents made for this organization — the finished frame, and anything built alongside it.', 'files', 4)
) as v(section, key, title, description, kind, position)
where t.slug = 'nonprofit-vision-frame'
on conflict (template_id, key) do nothing;

-- A starting point for Andrew to edit, not a curriculum.
insert into template_prep_items (group_id, title, notes, position)
select g.id, v.title, v.notes, v.position
from template_prep_groups g
join templates t on t.id = g.template_id
cross join (values
  ('Complete the discovery questionnaire',
   'Your facilitator sends it. It is the start of the conversation, not a test.', 1),
  ('Gather what already exists',
   'Current mission, values, strategic plan, annual report — whatever is written down, even if nobody uses it.', 2),
  ('Name the people in the room',
   'Who has to be at the table for the frame to hold once we leave.', 3)
) as v(title, notes, position)
where t.slug = 'nonprofit-vision-frame' and g.key = 'np-discovery'
  and not exists (select 1 from template_prep_items i where i.group_id = g.id and i.title = v.title);

insert into template_members (template_id, profile_id, role, org_role, position)
select t.id, p.id, 'viewer'::project_role, v.org_role, v.position
from templates t
cross join (values
  ('will@runfree.co',   'Founder and Process Creator', 1),
  ('brooke@runfree.co', 'Executive Director',          2)
) as v(email, org_role, position)
join profiles p on lower(p.email) = v.email
where t.slug = 'nonprofit-vision-frame'
on conflict do nothing;
