-- Supabase's default privileges grant EXECUTE on every new public function
-- to anon/authenticated/service_role explicitly, independent of PUBLIC — so
-- a plain `REVOKE ... FROM PUBLIC` doesn't remove it (verified: it didn't).
-- The security advisor flags am_owner/am_staff/can_see_project/handle_new_user
-- as callable directly over PostgREST's /rpc endpoint. None of them leak data
-- (each only answers a question about the calling session's own access), but
-- there's no reason to leave anon able to call them, and handle_new_user is
-- never meant to run outside the on_auth_user_created trigger.

revoke execute on function am_owner() from anon, authenticated;
revoke execute on function am_staff() from anon, authenticated;
revoke execute on function can_see_project(uuid) from anon, authenticated;
revoke execute on function handle_new_user() from anon, authenticated;

-- RLS policies evaluate as the querying role, so authenticated still needs
-- EXECUTE on the three used inside policies. This is an accepted,
-- irreducible advisory warning (functions callable by authenticated via
-- /rpc) — see docs/data-model.md.
grant execute on function am_owner() to authenticated;
grant execute on function am_staff() to authenticated;
grant execute on function can_see_project(uuid) to authenticated;
