-- Where a template's handouts live in Google Drive.
--
-- BRIEF.md originally assumed this was per-project ("Handout folders differ
-- per project"). Andrew has since been specific: handouts for every Pivvot
-- engagement come from ONE shared folder —
--   Shared Drive > RunFree Team > Pivvot Vision Framing > Handouts >
--   Pivvot Handouts (PDF)
-- — mirrored the way the certification handouts are on the CVF side. So the
-- folder belongs to the TEMPLATE, not the project: every church running
-- Pivvot reads the same RunFree-branded set, and updating one PDF in Drive
-- updates it for all of them with no per-project work.
--
-- Deliberately NOT the same folder as CVF's. That one is
-- .../Handouts/Certification Handouts/Pivvot Handouts (PDF), which is the
-- certification-branded set a church client should never be handed. The two
-- are siblings in Drive and easy to confuse; this comment exists so nobody
-- "fixes" the id to match the CVF env var.
--
-- projects.drive_folder_id stays, unused for now, for genuinely per-project
-- files later (a church's own uploads).

alter table templates add column handouts_folder_id text;

update templates
set handouts_folder_id = '1bbtzQA7WR1jSJmDVgnfdWqnLDfVDcLb4'
where slug = 'pivvot-vision-framing';
