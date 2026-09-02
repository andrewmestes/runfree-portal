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
 * Where a prep document lives is what decides who can read it, so the path
 * is not cosmetic here the way `logo-` and `prep-` prefixes are.
 *
 * The storage read policy compares `storage.foldername(name)[2]` — the
 * second path segment — against the literal 'private', and only lets an
 * owner or an editor/admin member through when it matches. A file written
 * to `{project}/prep-x.pdf` has no second segment, so that test can never
 * fire and every project member can read it. Marking a prep item private
 * therefore hides the ROW (read_prep_items, 030) while leaving the FILE
 * readable to anyone holding a signed URL.
 *
 * Putting private uploads under `{project}/private/` is what connects the
 * checkbox to the file. Keep this in step with the policy: if one moves,
 * the other has to.
 */
function prepFilePath(projectId: string, file: File, isPrivate: boolean): string {
  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const leaf = `prep-${crypto.randomUUID()}.${ext}`;
  return isPrivate ? `${projectId}/private/${leaf}` : `${projectId}/${leaf}`;
}

/** True when a stored path is one the read policy treats as private. */
export function isPrivatePath(path: string): boolean {
  return path.split("/")[1] === "private";
}

/**
 * Upload a document against a preparation item — an Insights Discovery
 * profile, a guest perspective write-up.
 *
 * Same bucket and same RLS as uploadDeliverableImage: the path's first
 * segment is the project id, which is what
 * `007_deliverable_image_storage.sql` reads to decide who may write.
 */
export async function uploadPrepFile(
  accessToken: string,
  projectId: string,
  file: File,
  isPrivate = false
): Promise<{ path: string; name: string; mime: string; size: number }> {
  const client = createUserClient(accessToken);
  const path = prepFilePath(projectId, file, isPrivate);

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
 * Move an already-uploaded prep document between the public and private
 * paths, so that ticking Private on a document uploaded last week actually
 * restricts it rather than only hiding its row.
 *
 * Returns the path the file now lives at — unchanged when it was already on
 * the right side, so callers can assign the result unconditionally. A failed
 * move throws rather than returning the old path: silently reporting success
 * while a confidential file stays readable is the one outcome worth being
 * loud about.
 */
export async function setPrepFilePrivacy(
  accessToken: string,
  path: string,
  isPrivate: boolean
): Promise<string> {
  if (isPrivatePath(path) === isPrivate) return path;

  const segments = path.split("/");
  const projectId = segments[0];
  const leaf = segments[segments.length - 1];
  const next = isPrivate ? `${projectId}/private/${leaf}` : `${projectId}/${leaf}`;

  const client = createUserClient(accessToken);
  const { error } = await client.storage.from(BUCKET).move(path, next);
  if (error) throw error;

  return next;
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
/**
 * Twelve hours, not one.
 *
 * Every page mints its URLs once on load and holds them. At an hour, a board
 * meeting that ran long — or a tab left open over lunch — came back to tiles
 * that 400 on re-mount and a preview that says "Couldn't load that file". The
 * bucket is private and every URL is minted through the caller's own RLS, so
 * a longer life changes who can open a link only by how long they have it.
 */
const SIGNED_URL_TTL = 12 * 60 * 60;

export async function getSignedImageUrl(
  accessToken: string,
  path: string,
  expiresInSeconds = SIGNED_URL_TTL
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
  expiresInSeconds = SIGNED_URL_TTL
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
