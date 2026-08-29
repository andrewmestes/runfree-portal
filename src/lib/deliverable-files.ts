import { createUserClient } from "./supabase";
import { uploadDeliverableFile, uploadDeliverableImage } from "./storage";

/**
 * Attachments on a module card.
 *
 * A card used to hold one image and one document, which is what the two-input
 * form implied. One drop zone that takes anything makes the third file a real
 * question, and 051 is the answer: `deliverables.image_path` is now the card's
 * THUMBNAIL — a pointer at whichever attachment should be its face — and every
 * file dropped, image or not, gets a row here.
 */
export type DeliverableFile = {
  id: string;
  deliverable_id: string;
  project_id: string;
  path: string;
  name: string;
  mime: string | null;
  size: number | null;
  is_image: boolean;
  position: number;
};

export async function listDeliverableFiles(
  accessToken: string,
  projectId: string
): Promise<DeliverableFile[]> {
  const { data, error } = await createUserClient(accessToken)
    .from("deliverable_files")
    .select("*")
    .eq("project_id", projectId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DeliverableFile[];
}

/**
 * Upload each file and attach it, in the order they were dropped.
 *
 * Returns the storage path of the LAST image, which is what the caller sets as
 * the card's thumbnail — Andrew: "if more than one image is added, make the
 * last one uploaded the image/thumbnail for the card."
 */
export async function attachFiles(
  accessToken: string,
  projectId: string,
  deliverableId: string,
  files: File[],
  startAt: number
): Promise<{ lastImagePath: string | null }> {
  let lastImagePath: string | null = null;
  const client = createUserClient(accessToken);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const isImage = file.type.startsWith("image/");
    // Images go through the image uploader so they keep the same path shape
    // and size ceiling as every other picture in the bucket.
    const up = isImage
      ? { ...(await uploadDeliverableImage(accessToken, projectId, file)), name: file.name, mime: file.type, size: file.size }
      : await uploadDeliverableFile(accessToken, projectId, file);

    const { error } = await client.from("deliverable_files").insert({
      deliverable_id: deliverableId,
      project_id: projectId,
      path: up.path,
      name: up.name,
      mime: up.mime ?? file.type ?? null,
      size: up.size ?? file.size ?? null,
      is_image: isImage,
      position: startAt + i,
    });
    if (error) throw error;
    if (isImage) lastImagePath = up.path;
  }

  return { lastImagePath };
}

export async function removeDeliverableFile(
  accessToken: string,
  id: string
): Promise<void> {
  const { error } = await createUserClient(accessToken)
    .from("deliverable_files")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
