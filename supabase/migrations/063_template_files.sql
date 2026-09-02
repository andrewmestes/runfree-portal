-- Template-level files: the worksheets a process hands a client, attached to
-- the template rather than to any one project.
--
-- Pivvot's sheets come from Drive through the handouts library, keyed by
-- module number. Younique's do not exist in Drive at all: the fifteen
-- LifePlan worksheets, the Life-Making Cycle set and the retreat guides live
-- as attachments on the Asana project this template was built from (009).
-- Its template_resources rows were titles with nowhere to point — and a 1:1
-- client opened a process panel that never rendered them anyway.
--
-- Storage: the private `deliverable-images` bucket, under
-- `templates/{template_id}/{file}`. 007's convention puts a PROJECT id in the
-- first folder, and its policies cast that segment to uuid unguarded — which
-- would ERROR, not deny, the moment a template path was evaluated (RLS ORs
-- every policy together). try_uuid() turns a non-uuid segment into null, and
-- can_see_project(null) is false.
--
-- Readers: the template's audience, mirroring read_template_resources (024) —
-- owner, staff, and members of any project stamped from it. Writes are
-- script-only through the service role; no user policy grants them.

create or replace function try_uuid(t text)
returns uuid language plpgsql immutable as $$
begin
  return t::uuid;
exception when others then
  return null;
end;
$$;
grant execute on function try_uuid(text) to authenticated;

alter table template_resources
  add column if not exists file_path text,
  add column if not exists file_name text,
  add column if not exists file_size integer;

alter policy "deliverable images: read by project members" on storage.objects
  using (
    bucket_id = 'deliverable-images'
    and can_see_project(try_uuid((storage.foldername(name))[1]))
  );

alter policy "deliverable images: write by editor/admin" on storage.objects
  with check (
    bucket_id = 'deliverable-images'
    and (
      exists (
        select 1 from project_members m
        where m.project_id = try_uuid((storage.foldername(name))[1])
          and m.profile_id = auth.uid()
          and m.role in ('editor', 'admin')
      )
      or am_owner()
    )
  );

alter policy "deliverable images: update by editor/admin" on storage.objects
  using (
    bucket_id = 'deliverable-images'
    and (
      exists (
        select 1 from project_members m
        where m.project_id = try_uuid((storage.foldername(name))[1])
          and m.profile_id = auth.uid()
          and m.role in ('editor', 'admin')
      )
      or am_owner()
    )
  );

alter policy "deliverable images: delete by editor/admin" on storage.objects
  using (
    bucket_id = 'deliverable-images'
    and (
      exists (
        select 1 from project_members m
        where m.project_id = try_uuid((storage.foldername(name))[1])
          and m.profile_id = auth.uid()
          and m.role in ('editor', 'admin')
      )
      or am_owner()
    )
  );

create policy "template files: read by the template's audience" on storage.objects
  for select using (
    bucket_id = 'deliverable-images'
    and (storage.foldername(name))[1] = 'templates'
    and (
      am_owner() or am_staff()
      or exists (
        select 1 from project_members pm
        join projects p on p.id = pm.project_id
        where pm.profile_id = auth.uid()
          and p.template_id = try_uuid((storage.foldername(name))[2])
      )
    )
  );
