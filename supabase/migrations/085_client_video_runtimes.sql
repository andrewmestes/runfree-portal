-- 085 — runtimes on the client video shelf.
--
-- The card's duration badge and the /watch eyebrow read the head of
-- `description` ("19 min", "Under 3 min", see splitVideoMeta in
-- src/lib/video.ts). Six rows had no length at all — among them God Dreams,
-- the longest film on the shelf at 36:29 — and three said a minute or two
-- more than the film runs. Lengths come from each Loom share page's
-- trim_duration (the length viewers actually see). Loom's oEmbed was not
-- used: it reports the same wrong 2583.52 s for five of these rows.
--
-- Written the way the existing rows are: "Under N min" below five minutes,
-- whole minutes rounded above. Each update is keyed on the Loom url and the
-- description it replaces, so a row someone has since edited by hand is
-- left alone. The ids do not change, so shared /watch links keep working.

-- No runtime at all.
update training_videos set description = '8 min', updated_at = now()   -- 7 Laws Overview Teaching, 8:15
 where url = 'https://www.loom.com/share/937fe2b1ae6d4993bd6a73345e108f91' and description is null;

update training_videos set description = '29 min', updated_at = now()  -- Future Church Book Overview Teaching, 29:15
 where url = 'https://www.loom.com/share/daca3da5c9bf485c86667c165ab7f90e' and description is null;

update training_videos set description = 'Under 5 min', updated_at = now()  -- Crowd Cloud Overview Teaching, 4:26
 where url = 'https://www.loom.com/share/87e14978ff174c9baaedb5aebfd2dcd8' and description is null;

update training_videos set description = '13 min', updated_at = now()  -- Vision Frame Overview Teaching, 13:06
 where url = 'https://www.loom.com/share/be8f8a7adae244ea927cc2938d07b186' and description is null;

-- A subtitle but no runtime. The subtitle stays, after the length.
update training_videos set description = 'Under 2 min · Reinforcement training', updated_at = now()  -- The Future Is Found in a Few, 1:29
 where url = 'https://www.loom.com/share/63a29e16f72d40a39486c056f2c68a99' and description = 'Reinforcement training';

update training_videos set description = '36 min · Horizon Storyline and the 12 Vision Templates', updated_at = now()  -- God Dreams Preparation Video, 36:29
 where url = 'https://www.loom.com/share/3eb7dffa23b04bc19b38d772a68f634e' and description = 'Horizon Storyline and the 12 Vision Templates';

-- A runtime that was wrong.
update training_videos set description = '18 min', updated_at = now()  -- Process Overview Teaching, 17:35 (said 19)
 where url = 'https://www.loom.com/share/a1572bae6a0f4b31b066f63511bae2f4' and description = '19 min';

update training_videos set description = '18 min · Vintage master teaching', updated_at = now()  -- Horizon Storyline Overview, 17:34 (said 19; Loom's own title says 18)
 where url = 'https://www.loom.com/share/392ad79dbed747709cf3106548e06337' and description = '19 min · Vintage master teaching';

update training_videos set description = '19 min', updated_at = now()  -- Disciple's Journey Overview Teaching, 18:54 (said 20)
 where url = 'https://www.loom.com/share/62f247e914c64c76bc6526f5e5d6f25f' and description = '20 min';
