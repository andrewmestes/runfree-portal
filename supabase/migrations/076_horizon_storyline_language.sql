-- The Horizon Storyline, in God Dreams' own words (Andrew, 4 Sept 2026):
--   Beyond-the-Horizon Vision (5–20 years), Background Horizon (3 years,
--   four OBJECTIVES — "we typically call those objectives, not priorities"),
--   Mid-Ground Horizon (the one-year goal), Foreground Horizon (four 90-day
--   initiatives).
--
-- Two things the sheet needed room for:
--   * a Background objective is a TITLE with a full description under it, not
--     one line — horizon_storyline.title, with body as the description;
--   * the Beyond-the-Horizon box carries the church's full vivid description
--     as a PDF they can open — file_path / file_name / file_size on the same
--     row, stored under {project_id}/… like every other project file.
-- And the Ministry Dashboard moves to measures only, grouped under headers a
-- church names itself ("Bible reading", "Evangelism", "Community
-- involvement") — scoreboard_metrics.category.
alter table horizon_storyline
  add column if not exists title text,
  add column if not exists file_path text,
  add column if not exists file_name text,
  add column if not exists file_size bigint;
alter table scoreboard_metrics add column if not exists category text;
