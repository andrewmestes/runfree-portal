-- Module cards a coach wrote for the church were invisible to the church.
--
-- `read_deliverables` requires published_at for a viewer, which is right for
-- the Vision Stack (finished work goes live deliberately, behind a toggle).
-- But the cards under "From our sessions" are created by SessionCardForm with
-- no published_at, and nothing in the app ever set it — so every card a coach
-- added after a session was a draft only editors could read. On Christ Chapel
-- that is eleven cards with real content, seven of them the Disciple's
-- Journey session's work, that the church has never seen.
--
-- Publish the ones that carry content. The blank exercise scaffolds seeded by
-- 054 (no file, no image, no body) stay hidden — they are placeholders, and a
-- church should not see an empty card titled "Expectations Exercise".
update deliverables
   set published_at = coalesce(published_at, created_at, now())
 where kind = 'session_image'
   and published_at is null
   and (file_path is not null or image_path is not null
        or (body is not null and btrim(body) <> ''));
