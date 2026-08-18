-- The third vertical was missing from the project picker entirely.
--
-- Andrew: "the options when creating a new project doesn't include the team
-- coaching or one-on-one coaching (those can be combined into a single
-- meta-performance coaching title)."
--
-- is_group is TRUE: Meta Performance covers both team and 1:1 engagements,
-- and the group case is the one needing an organisation roster. A 1:1 client
-- is simply a roster of one, which needs no separate template.
-- has_vision_stack is false — the four-layer artefact is Pivvot's, and
-- showing an empty one here would claim a deliverable this vertical does not
-- produce.
insert into templates (name, slug, description, is_active, has_vision_stack, is_group)
values (
  'Meta Performance Coaching',
  'meta-performance-coaching',
  'Team and one-on-one performance coaching. Sessions, notes and deliverables, without the six-module Vision Framing arc.',
  true, false, true
)
on conflict (slug) do nothing;

insert into template_prep_groups (template_id, section, key, title, description, kind, position)
select t.id, v.section, v.key, v.title, v.description, v.kind::prep_group_kind, v.position
from templates t
cross join (values
  ('COACHING PREPARATION', 'mp-key-dates', 'Key Dates',
   'Sessions and deadlines. Update these as they are set.', 'dates', 1),
  ('COACHING PREPARATION', 'mp-prep', 'Preparation Work',
   'What to complete before we meet.', 'checklist', 2),
  ('TEAM', 'mp-profiles', 'Assessments and Profiles',
   'Upload completed assessments and profiles.', 'files', 3)
) as v(section, key, title, description, kind, position)
where t.slug = 'meta-performance-coaching'
on conflict (template_id, key) do nothing;

insert into template_members (template_id, profile_id, role, org_role, position)
select t.id, p.id, 'viewer'::project_role, v.org_role, v.position
from templates t
cross join (values
  ('will@runfree.co',   'Founder and Process Creator', 1),
  ('brooke@runfree.co', 'Executive Director',          2)
) as v(email, org_role, position)
join profiles p on lower(p.email) = v.email
where t.slug = 'meta-performance-coaching'
on conflict do nothing;
