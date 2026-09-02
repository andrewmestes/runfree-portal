-- 063 re-declared the read policy on deliverable-images from 007's text and
-- silently dropped the rule 036 had added on top of it: a document under
-- `{project_id}/private/` is readable only by the owner and by editors and
-- admins. tests/rls.test.ts 16f caught it within the hour — "private document
-- was readable by a viewer" — which is the whole reason that suite runs after
-- every migration.
--
-- This is the 036 rule again, with 063's try_uuid() guard kept, so template
-- paths (templates/{template_id}/…) still evaluate to a clean false here and
-- fall through to the template policy rather than erroring on the cast.
--
-- Lesson for the next person: alter policy replaces the WHOLE using-clause.
-- Start from the migration that last touched the policy, not from the one
-- that created it.

alter policy "deliverable images: read by project members" on storage.objects
  using (
    bucket_id = 'deliverable-images'
    and can_see_project(try_uuid((storage.foldername(name))[1]))
    and (
      coalesce((storage.foldername(name))[2], '') <> 'private'
      or am_owner()
      or exists (
        select 1 from project_members m
        where m.project_id = try_uuid((storage.foldername(objects.name))[1])
          and m.profile_id = auth.uid()
          and m.role in ('editor', 'admin')
      )
    )
  );
