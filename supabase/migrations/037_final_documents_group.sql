-- Somewhere to put the finished work.
--
-- Andrew, on the Deliverables panel: "i want that icon driven with the vision
-- stack icons, and easy to upload final pdfs and notes."
--
-- The icons are an app change (VisionStackCard now renders
-- vision_stack_layers.icon_path from 021). The upload had nowhere to go: the
-- only group in the DELIVERABLES section was Guest Perspective Evaluation,
-- which is `notes`, so a coach with a finished Vision Frame PDF had no drop
-- zone on the panel where a client would look for it.
--
-- `files` is the kind whose card offers an upload. Groups are template-scoped
-- and render even when empty, so every project already using this template
-- picks this up with no stamping and no backfill.
--
-- Only Pivvot gets it. Meta Performance Coaching and Younique have no
-- DELIVERABLES section at all — adding one there would put an empty card on a
-- panel those verticals do not show.

insert into template_prep_groups (template_id, key, section, title, kind, position, description)
select
  t.id,
  'final-documents',
  'DELIVERABLES',
  'Final Documents',
  'files',
  2,
  'The finished pieces — upload the final PDF of each one here as it is signed off.'
from templates t
where t.name = 'Pivvot Vision Framing'
  and not exists (
    select 1 from template_prep_groups g
    where g.template_id = t.id and g.key = 'final-documents'
  );
