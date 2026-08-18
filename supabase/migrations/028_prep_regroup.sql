-- Fewer, better cards, and Previous Vision Equity out of the wrong place.
--
-- Andrew: "team pre-work and team pre-reading should be combined somehow.
-- It's all one card or element or list. This feels like these are multisites
-- of separate sections."
--
-- So the two fold into one "Reading & Pre-Work" card. Its kind becomes
-- 'checklist' because the merged card holds both things a team reads and
-- things it does; the render path already links any row carrying a URL, so
-- the books keep their links and gain a tick.
update template_prep_groups
set title = 'Reading & Pre-Work',
    description = 'What the team reads and does before we begin.',
    kind = 'checklist'
where key = 'team-pre-reading';

update template_prep_items ti
set group_id = (select id from template_prep_groups where key = 'team-pre-reading'),
    position = ti.position + 10
where ti.group_id in (select id from template_prep_groups where key = 'team-optional-pre-work');

update prep_items pi
set group_id = (select id from template_prep_groups where key = 'team-pre-reading'),
    position = pi.position + 10
where pi.group_id in (select id from template_prep_groups where key = 'team-optional-pre-work');

delete from template_prep_groups where key = 'team-optional-pre-work';

-- "Current Vision Equity" was a template_resources pill, which meant it
-- rendered in the pill list under the orientation videos. Andrew: "that's not
-- a good spot for that. That should probably be up top somewhere. Also, let's
-- call it previous vision equity because we're going to be addressing and
-- changing a lot of that in the process."
--
-- As a 'files' group it gets its own card, first in the preparation block,
-- and can actually hold the documents a lead pastor sends over.
delete from template_resources where title = 'Current Vision Equity';

insert into template_prep_groups (template_id, section, key, title, description, kind, position)
select t.id, 'CHURCH PREPARATION', 'previous-vision-equity', 'Previous Vision Equity',
       'Planning documents, vision documents, and any earlier work on values, strategy or strategic plans the church already has.',
       'files', 0
from templates t where t.slug = 'pivvot-vision-framing'
on conflict (template_id, key) do nothing;
