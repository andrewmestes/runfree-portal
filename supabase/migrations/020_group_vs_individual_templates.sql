-- Reconstructed. This file was missing from the repo.
--
-- 020 and 021 were applied to the live database during the session that built
-- the Vision Stack and the 1:1 templates, but never written to disk — the
-- directory jumped 019 → 022. Everything the app reads was therefore present
-- in production and absent from source, so applying 001→034 to a fresh
-- project produced a database the project page could not query: is_group,
-- caption and icon_path did not exist.
--
-- Rebuilt from the live schema, and idempotent so re-applying over the
-- existing database is a no-op.

-- Only Pivvot produces the four-layer Vision Stack. Younique and Meta
-- Performance have deliverables but not that artefact, and rendering an empty
-- one claimed a thing that does not exist.
alter table templates add column if not exists has_vision_stack boolean not null default false;

-- False for a 1:1 engagement, which has no client "team" to roster.
alter table templates add column if not exists is_group boolean not null default true;

-- Andrew: "we need to name photos." A flipchart photographed in the room is
-- meaningless three months later without one.
alter table deliverables add column if not exists caption text;

update templates set has_vision_stack = true where slug = 'pivvot-vision-framing';
update templates set is_group = false where slug = 'younique-lifeplan';
