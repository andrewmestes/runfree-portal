-- The Strategy side of the frame is a picture, not a paragraph.
--
-- Andrew, on the Vision Frame inside the Vision Stack: "do 4 rows, one for
-- each side of the frame. the Mission statement icon and a text space for the
-- mission statement available. the only different one would be the Strategy,
-- where an image is able to be uploaded for the visual strategy to show up."
--
-- That is true to the process: Mission, Values and Measures are sentences a
-- church writes, and Strategy is the napkin sketch — a drawing of how people
-- move. It has always come out of the room as an image.
--
-- One nullable column rather than a separate table: every other side may
-- carry one too if a church draws its values, and a row that has no image is
-- exactly the common case.
alter table vision_frame
  add column image_path text;

comment on column vision_frame.image_path is
  'Storage path in deliverable-images, {project_id}/... — the visual strategy '
  'sketch. Read through getSignedImageUrl(), never a public URL.';
