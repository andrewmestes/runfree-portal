-- Client deliverables are uploaded to the portal, not mirrored from Drive.
--
-- Andrew: "we don't mirror any client deliverables from google drive, but
-- rather upload them to the site. most of it is just PDFs."
--
-- Until now a deliverable could hold an IMAGE (image_path) or a link
-- (external_url) and nothing else, so a finished Vision Frame PDF had nowhere
-- to go. These columns give it one.
--
-- Kept separate from image_path rather than replacing it: the two render
-- differently and should. An image is shown — a photographed flipchart is
-- legible as a thumbnail. A document is listed, with its name and size, and
-- opened deliberately. Collapsing them into one column would mean guessing
-- from the extension at render time, every time.
--
-- Files live in the same Storage bucket as deliverable images, so they
-- inherit exactly the RLS proven in migration 007 — readable by the
-- project's members, writable by its editors. The bucket is still called
-- "deliverable-images", which is now a slightly narrow name for what it
-- holds; renaming a bucket breaks every stored path, so the name stays and
-- this comment explains it.

alter table deliverables add column file_path text;
alter table deliverables add column file_name text;
alter table deliverables add column file_mime text;
alter table deliverables add column file_size bigint;
