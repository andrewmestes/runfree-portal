-- Three data fixes from the full-portal review of 31 Aug.
--
-- 1. Coach-facing copy shown to churches. Two Key Dates groups still carried
--    "Update these as they are set." — an instruction to the coach, rendered
--    under the heading a church reads. Same class of fix as 052.
update template_prep_groups
   set description = 'Onsite days, virtual sessions, and deadlines.'
 where kind = 'dates' and description like '%Update these as they are set.%'
   and description like 'Onsite days%';

update template_prep_groups
   set description = 'Sessions and deadlines.'
 where kind = 'dates' and description like '%Update these as they are set.%'
   and description like 'Sessions and deadlines%';

-- 2. The Application Toolbox layer had no icon, so the Vision Stack card on
--    Deliverables printed a bare "4" in its place. The plate artwork now
--    exists (see public/brand/vision-stack/), and it is the right mark: the
--    other three layers use the process icons because those layers are the
--    output of those tools; this layer's own art is the toolbox plate.
update vision_stack_layers
   set icon_path = '/brand/vision-stack/application-toolbox.png'
 where slug = 'application-toolbox' and icon_path is null;

-- 3. A highlighted book chapter cached its raw Drive filename as its title
--    ("Ch15_Measures"). buildCatalogue now uses the parsed chapter label; this
--    repairs the one row written before that — highlights cache what the card
--    draws, so fixing the rule does not fix rows already written (CLAUDE.md).
update project_highlights
   set title = regexp_replace(
         regexp_replace(title, '^[Cc]h0*(\d+)[_\s-]+', 'Chapter \1 — '),
         '_', ' ', 'g')
 where source_kind = 'book' and title ~ '^[Cc]h0*\d+[_\s-]';
