-- 063's template-file policy never matched for a project member.
--
-- Inside its EXISTS subquery the FROM list carries `projects p`, and projects
-- has a `name` column — so `(storage.foldername(name))[2]` resolved to the
-- PROJECT's name, not the storage object's, and try_uuid() of a church's name
-- is null. Owner and staff passed on the first branch, which is why the admin
-- screenshot showed worksheet pills and the viewer's did not. 036 wrote
-- `objects.name` in exactly this position for exactly this reason.

alter policy "template files: read by the template's audience" on storage.objects
  using (
    bucket_id = 'deliverable-images'
    and (storage.foldername(objects.name))[1] = 'templates'
    and (
      am_owner() or am_staff()
      or exists (
        select 1 from project_members pm
        join projects p on p.id = pm.project_id
        where pm.profile_id = auth.uid()
          and p.template_id = try_uuid((storage.foldername(objects.name))[2])
      )
    )
  );
