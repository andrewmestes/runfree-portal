import { createUserClient } from "./supabase";

const BUCKET = "deliverable-images";

/**
 * Direct browser-to-storage upload — no route handler in between. Andrew:
 * "no backend work needed... simply screenshot an image and drop it into
 * their project." The bucket is private (007_deliverable_image_storage.sql),
 * so this still goes through the caller's own RLS-scoped client: the upload
 * itself is what proves they're an editor/admin on this project, the same
 * way any other write in this app does.
 *
 * Path is {project_id}/{random}.{ext} — storage.foldername() in the RLS
 * policies reads that first segment as the project id.
 */
export async function uploadDeliverableImage(
  accessToken: string,
  projectId: string,
  file: File
): Promise<{ path: string }> {
  const client = createUserClient(accessToken);
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${projectId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await client.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;

  return { path };
}

export async function replaceDeliverableImage(
  accessToken: string,
  oldPath: string | null,
  projectId: string,
  file: File
): Promise<{ path: string }> {
  const result = await uploadDeliverableImage(accessToken, projectId, file);
  if (oldPath) {
    const client = createUserClient(accessToken);
    await client.storage.from(BUCKET).remove([oldPath]);
  }
  return result;
}

/**
 * A private bucket has no public URL — every view has to be a signed URL,
 * which still respects the same RLS the upload did (see the "read by
 * project members" policy). Short-lived on purpose; callers should request a
 * fresh one per page load rather than cache it.
 */
export async function getSignedImageUrl(
  accessToken: string,
  path: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  const client = createUserClient(accessToken);
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function removeDeliverableImage(accessToken: string, path: string): Promise<void> {
  const client = createUserClient(accessToken);
  const { error } = await client.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
