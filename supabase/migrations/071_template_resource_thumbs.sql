-- A cover for a template resource. Andrew, on the coaching template: "can we
-- make the resources … a little more visual when displayed? … can we get book
-- images/thumbnails/etc.?" The Asana cards had one; the walkthrough rows did
-- not. Stored in the private bucket under templates/{template_id}/thumbs/…,
-- read by the same template-files policy (063/066) as the documents.
alter table template_resources add column if not exists thumb_path text;
