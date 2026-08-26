-- A card can carry text as well as an image and a file.
--
-- Andrew, describing what he does in Asana today: "for Christ Chapel, I was in
-- person with them when running the Expectations exercise. I have a chart
-- image of that, but I'd want the text added inside that card and have the
-- image of the chart be the primary thing people see ... with the ability to
-- open or uncollapse the card to see the text. For the Leadership Survey, I'd
-- like to see a card with a screen shot of the image I created for that, and
-- when they click on the card it opens ... to show the PDF they can download
-- plus any notes."
--
-- Both of those are one Asana task carrying a name, a description and one or
-- two attachments. Checking the real board bears that out: "Expectations
-- Exercise" has a long description and a chart photo; "Leadership Team Survey"
-- has both a PDF and a screenshot on the same task.
--
-- `deliverables` already models most of that — it has image_path AND file_path
-- on the same row, so one record can already hold a chart photo and a PDF. The
-- only thing it could not hold was the writing. Hence one column rather than a
-- new table: the shape was already right.
--
-- Nullable and with no default, because the overwhelming majority of existing
-- rows are exactly what they were: a photo with a caption.

alter table deliverables add column if not exists body text;

comment on column deliverables.body is
  'Long-form notes on a card — the Asana task description equivalent. A card can carry an image, a file and this text all at once; see migration 042.';
