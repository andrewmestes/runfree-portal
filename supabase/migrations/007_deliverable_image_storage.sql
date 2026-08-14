-- Storage for deliverable screenshots/charts, uploaded straight from the
-- browser — "no backend work needed... simply screenshot an image and drop
-- it into their project." Private bucket: a public bucket would let anyone
-- with a leaked URL view a private project's images regardless of RLS
-- elsewhere, which defeats the whole point of private projects. The app
-- reads these through signed URLs, which do respect storage.objects RLS
-- below.
--
-- Path convention: {project_id}/{random filename}. storage.foldername(name)
-- gives the path segments before the filename, so foldername(name)[1] is the
-- project id for every object in this bucket.

insert into storage.buckets (id, name, public)
values ('deliverable-images', 'deliverable-images', false)
on conflict (id) do nothing;

create policy "deliverable images: read by project members" on storage.objects
  for select using (
    bucket_id = 'deliverable-images'
    and can_see_project(((storage.foldername(name))[1])::uuid)
  );

create policy "deliverable images: write by editor/admin" on storage.objects
  for insert with check (
    bucket_id = 'deliverable-images'
    and (
      exists (
        select 1 from project_members m
        where m.project_id = ((storage.foldername(name))[1])::uuid
          and m.profile_id = auth.uid()
          and m.role in ('editor', 'admin')
      )
      or am_owner()
    )
  );

create policy "deliverable images: update by editor/admin" on storage.objects
  for update using (
    bucket_id = 'deliverable-images'
    and (
      exists (
        select 1 from project_members m
        where m.project_id = ((storage.foldername(name))[1])::uuid
          and m.profile_id = auth.uid()
          and m.role in ('editor', 'admin')
      )
      or am_owner()
    )
  );

create policy "deliverable images: delete by editor/admin" on storage.objects
  for delete using (
    bucket_id = 'deliverable-images'
    and (
      exists (
        select 1 from project_members m
        where m.project_id = ((storage.foldername(name))[1])::uuid
          and m.profile_id = auth.uid()
          and m.role in ('editor', 'admin')
      )
      or am_owner()
    )
  );
