-- The prep cards get RunFree's actual words, not my guesses.
--
-- Migration 022 seeded Team Pre-Reading with three whole books (Church
-- Unique, God Dreams, Future Church) chosen by inference. The Asana task body
-- says something different and more specific:
--
--   "Please read: 1. Parts 1 & 3 of Future Church. 2. The 7 Laws Bullet Book.
--    3. Problem Statement Deck"
--
-- Guessed content in front of a church paying five figures is worse than an
-- empty card, so the guess is deleted rather than merged with.
--
-- Team Optional Pre-Work had real content in Asana all along — two named
-- options — which the seed import dropped along with every other task body.
-- Both are reproduced verbatim.
--
-- Note for whoever reads this next: "The 7 Laws Bullet Book" and "Problem
-- Statement Deck" are PDFs that live as Asana attachments. The portal has no
-- copy of either, so they appear as titles without links until someone
-- uploads them. That is deliberate — a dead link is worse than a plain title.

delete from template_prep_items ti
using template_prep_groups g, templates t
where ti.group_id = g.id and g.template_id = t.id
  and t.slug = 'pivvot-vision-framing' and g.key = 'team-pre-reading';

delete from prep_items pi
using template_prep_groups g, templates t
where pi.group_id = g.id and g.template_id = t.id
  and t.slug = 'pivvot-vision-framing' and g.key = 'team-pre-reading';

update template_prep_groups g
set description = 'Please read these before we begin.'
from templates t
where t.id = g.template_id and t.slug = 'pivvot-vision-framing' and g.key = 'team-pre-reading';

insert into template_prep_items (group_id, title, notes, external_url, position)
select g.id, v.title, v.notes, v.external_url, v.position
from template_prep_groups g
join templates t on t.id = g.template_id
cross join (values
  ('Future Church — Parts 1 & 3',
   'Will Mancini and Cory Hartman.',
   'https://www.amazon.com/s?k=Future%20Church%20Will%20Mancini%20Cory%20Hartman', 1),
  ('The 7 Laws Bullet Book',
   'Created as an opportunity to scan and appreciate the 7 Laws without having to read the bulk of Future Church itself. The bullet book covers Future Church Part 2.',
   null, 2),
  ('Problem Statement Deck',
   null,
   null, 3)
) as v(title, notes, external_url, position)
where t.slug = 'pivvot-vision-framing' and g.key = 'team-pre-reading';

insert into template_prep_items (group_id, title, notes, external_url, position)
select g.id, v.title, v.notes, null, v.position
from template_prep_groups g
join templates t on t.id = g.template_id
cross join (values
  ('Option #1 — Upper Room / Lower Room',
   'Watch the master teaching on Upper Room / Lower Room and force rank your current lower room (1-4) as they occur to you individually. The number one represents your current congregation''s strongest attraction or draw to your lower room.', 1),
  ('Option #2 — The seven laws of real church growth',
   'Watch the brief overview of the seven laws of real church growth as a team and have each person read the one chapter on the law they are most interested in.', 2)
) as v(title, notes, position)
where t.slug = 'pivvot-vision-framing' and g.key = 'team-optional-pre-work'
  and not exists (
    select 1 from template_prep_items x where x.group_id = g.id and x.title = v.title
  );

insert into prep_items (project_id, group_id, title, notes, external_url, position)
select pr.id, ti.group_id, ti.title, ti.notes, ti.external_url, ti.position
from projects pr
join template_prep_groups g on g.template_id = pr.template_id
join template_prep_items ti on ti.group_id = g.id
where g.key in ('team-pre-reading', 'team-optional-pre-work')
  and not exists (
    select 1 from prep_items pi
    where pi.project_id = pr.id and pi.group_id = ti.group_id and pi.title = ti.title
  );
