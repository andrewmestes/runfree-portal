-- The "Upper / Lower Room Master Teaching" row on the client shelf pointed at
-- an older 9-minute Loom (bbbbc289…, "18 - Upper Room Lower Room") while its
-- own description said "12 min" — the length of Will's 8/17/21 overview
-- (46ca4a2e…), which is the one the church template's Reading & Pre-Work
-- shelf already plays. Andrew, 22 Sept 2026: "i don't see this upper room
-- and lower room video in client facing videos". Same row, right film.
update training_videos
   set url = 'https://www.loom.com/share/46ca4a2e6b184bda9f2a746eb3886b78',
       updated_at = now()
 where id = 'cc588bee-c9df-4980-9f5b-a641d8b9d9b8'
   and url = 'https://www.loom.com/share/bbbbc28954d448839fc4fd249a8e3584';
