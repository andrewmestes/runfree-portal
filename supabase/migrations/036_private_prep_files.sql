-- Private preparation documents, enforced on the file and not only the row.
--
-- 030 added prep_items.is_private and taught read_prep_items to hide those
-- rows from viewers. That is half the promise. The file itself lives in
-- storage, governed by the policies in 007, which let every project member
-- read anything under the project's folder — so a document marked private
-- was hidden from the page while remaining readable to any member who held
-- or obtained a signed URL.
--
-- The rule below closes that by reading the SECOND path segment: anything
-- under `{project_id}/private/` is restricted to the owner and to
-- editor/admin members, matching read_prep_items exactly so the row and the
-- file can never disagree about who may see a document.
--
-- This policy was applied directly to production while the repository could
-- not be written to; it is recorded here so a rebuilt database reproduces it
-- rather than silently dropping the enforcement. Written idempotently for
-- that reason — re-running against production is a no-op.
--
-- The app side is src/lib/storage.ts: uploadPrepFile() chooses the path from
-- the checkbox, and setPrepFilePrivacy() moves an existing file when the
-- checkbox changes later. All three have to agree on the literal 'private'.

drop policy if exists "deliverable images: read by project members" on storage.objects;

create policy "deliverable images: read by project members" on storage.objects
  for select using (
    bucket_id = 'deliverable-images'
    and can_see_project(((storage.foldername(name))[1])::uuid)
    and (
      coalesce((storage.foldername(name))[2], '') <> 'private'
      or am_owner()
      or exists (
        select 1 from project_members m
        where m.project_id = ((storage.foldername(objects.name))[1])::uuid
          and m.profile_id = auth.uid()
          and m.role in ('editor', 'admin')
      )
    )
  );
