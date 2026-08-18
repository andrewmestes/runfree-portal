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

/**
 * The church's own logo. Same bucket as deliverable images and therefore the
 * same RLS — readable by the project's members, writable by its editors —
 * which is why a logo needs no infrastructure of its own. The `logo-` prefix
 * is only for humans reading a bucket listing; nothing keys off it, because
 * images render from an explicit column value and never from a listing.
 */
export async function uploadProjectLogo(
  accessToken: string,
  projectId: string,
  file: File
): Promise<{ path: string }> {
  const client = createUserClient(accessToken);
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${projectId}/logo-${crypto.randomUUID()}.${ext}`;

  const { error } = await client.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;

  return { path };
}

/**
 * Upload a document (usually a finished PDF) against a deliverable.
 *
 * Same bucket, and therefore the same RLS, as deliverable images — the
 * bucket's name is historical, see migration 014. The original filename is
 * preserved on the row rather than in the path, because two churches will
 * both have a "Vision Frame.pdf" and the path has to stay unique.
 */
export async function uploadDeliverableFile(
  accessToken: string,
  projectId: string,
  file: File
): Promise<{ path: string; name: string; mime: string; size: number }> {
  const client = createUserClient(accessToken);
  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const path = `${projectId}/doc-${crypto.randomUUID()}.${ext}`;

  const { error } = await client.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw error;

  return {
    path,
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
  };
}

/**
 * Upload a document against a preparation item — an Insights Discovery
 * profile, a guest perspective write-up.
 *
 * Same bucket, same RLS, same reasoning as uploadDeliverableFile: the path's
 * first segment is the project id, which is what
 * `007_deliverable_image_storage.sql` reads to decide who may write. The
 * `prep-` prefix is for humans reading a bucket listing and nothing else.
 */
export async function uploadPrepFile(
  accessToken: string,
  projectId: string,
  file: File
): Promise<{ path: string; name: string; mime: string; size: number }> {
  const client = createUserClient(accessToken);
  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const path = `${projectId}/prep-${crypto.randomUUID()}.${ext}`;

  const { error } = await client.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw error;

  return {
    path,
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
  };
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

/**
 * Signed URLs for many paths in one request. A module gallery plus a logo is
 * easily a dozen images, and a dozen sequential round trips is the difference
 * between a page that appears and a page that assembles itself while you
 * watch. Returns a map keyed by storage path; anything that fails to sign is
 * simply absent rather than throwing, so one bad path can't blank a gallery.
 */
export async function getSignedImageUrls(
  accessToken: string,
  paths: string[],
  expiresInSeconds = 3600
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const client = createUserClient(accessToken);
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrls(paths, expiresInSeconds);
  if (error || !data) return {};

  const out: Record<string, string> = {};
  for (const row of data) {
    if (row.signedUrl && row.path) out[row.path] = row.signedUrl;
  }
  return out;
}

export async function removeDeliverableImage(accessToken: string, path: string): Promise<void> {
  const client = createUserClient(accessToken);
  const { error } = await client.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
