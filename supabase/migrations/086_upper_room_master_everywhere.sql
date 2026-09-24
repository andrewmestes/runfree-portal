-- 086 — one Upper / Lower Room teaching, everywhere.
--
-- Three different Loom recordings played under "Upper / Lower Room":
--   A 46ca4a2e… "Upper Room - Lower Room // Overview - Will Mancini (8/17/21)", 12:07
--   B bbbbc289… "18 - Upper Room Lower Room", 9:11
--   C ef1ec3b7… "Upper/Lower Room Identity", 12:12
-- Andrew, 24 Sept 2026: "use this as the master upper room / lower room
-- everywhere https://www.loom.com/share/46ca4a2e6b184bda9f2a746eb3886b78".
-- A already played on the Client Videos tab and in Reading & Pre-Work in
-- both templates. This moves the template Process-tab rows and the two
-- cohort highlight cards (copied from the certification template when the
-- projects were made, so the template change alone does not reach them).
-- Each update is keyed on the id AND the url it replaces, so a row someone
-- has since changed by hand is left alone. Titles follow each section's own
-- pattern, with A's length.

-- Certification template, Process tab, Master Teaching Videos (was C).
update template_resources
   set external_url = 'https://www.loom.com/share/46ca4a2e6b184bda9f2a746eb3886b78'
 where id = 'fc7b406e-8315-4d09-8800-71bd66d29a38'
   and external_url = 'https://www.loom.com/share/ef1ec3b7a5f646b2b22b1409b34fec60';

-- Certification template, Process tab, Mod #1 (was B, "1.9 … Teaching (9 min.)").
update template_resources
   set external_url = 'https://www.loom.com/share/46ca4a2e6b184bda9f2a746eb3886b78',
       title = '1.9 Upper / Lower Room Master Teaching (12 min.)'
 where id = 'd2d34852-c712-4012-9c57-85562d93606b'
   and external_url = 'https://www.loom.com/share/bbbbc28954d448839fc4fd249a8e3584';

-- Church template (pivvot-vision-framing), Process tab, Mod #1 (was B).
update template_resources
   set external_url = 'https://www.loom.com/share/46ca4a2e6b184bda9f2a746eb3886b78',
       title = 'Upper / Lower Room Master Teaching (12 min.)'
 where id = '33f7cf1d-d2ae-4d7c-84b4-654a6775ebb8'
   and external_url = 'https://www.loom.com/share/bbbbc28954d448839fc4fd249a8e3584';

-- The Kairos and North Carolina cohorts' highlight cards (were C).
update project_highlights
   set external_url = 'https://www.loom.com/share/46ca4a2e6b184bda9f2a746eb3886b78'
 where id in ('4e680551-d234-4f52-9b28-22eae6b33fca', '184fcbda-a4a3-4020-95d9-34e0fe6e4954')
   and external_url = 'https://www.loom.com/share/ef1ec3b7a5f646b2b22b1409b34fec60';
