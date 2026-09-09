-- 079 — one dead pointer on a live project, and the Pivvot default on the
-- project that predates it.
--
-- Found by validating every project_highlights row that names a Drive file
-- against the folders the portal actually serves (the same check that turned
-- up six dead handout links in the Digital Facilitators' Guide). One row of
-- five was broken; every book pointer is fine.

-- 1. Athena's "Preparation Checklist" card opened nothing.
--    Drive id 1jXFGYy4… is not in the handout folder any more — the sheet was
--    re-uploaded as "01 Preparation Checklist - CERT.pdf" and got a new id,
--    which is the same thing that had happened to six icons in the guide.
--    /api/projects/{id}/handouts/file walks the file's parents up to the
--    library folder, so a stale id is a 404 on tap, not a broken image.
update project_highlights
   set source_id = '141e3Yz4HS50EBtmZ1Sl0-ELk5OuLngc6',
       file_size = 245296
 where source_kind = 'handout'
   and source_id = '1jXFGYy4qfE633c2A0fczDKGAokBMFbsR';

-- 2. Christ Chapel never got the template's default.
--    075 gave Pivvot `ui.default_highlights = ["Preparation Checklist"]`, but
--    it is seeded at project creation and Christ Chapel was created in August.
--    Appended, not put first: their own reading (Chapter 15 — Measures) is
--    where the engagement actually is, and a default should not demote it.
insert into project_highlights
  (project_id, source_kind, source_id, title, media_kind, file_name, file_mime, file_size, position)
select p.id,
       'handout',
       '141e3Yz4HS50EBtmZ1Sl0-ELk5OuLngc6',
       'Preparation Checklist',
       'pdf',
       'Preparation Checklist',
       'application/pdf',
       245296,
       coalesce((select max(h.position) + 1 from project_highlights h where h.project_id = p.id), 0)
  from projects p
 where p.name like 'Christ Chapel%'
   and not exists (
     select 1 from project_highlights h
      where h.project_id = p.id
        and h.source_kind = 'handout'
        and h.source_id = '141e3Yz4HS50EBtmZ1Sl0-ELk5OuLngc6'
   );
