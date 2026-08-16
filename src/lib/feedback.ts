import { createUserClient, type Database } from "./supabase";

export type FeedbackKind = "question" | "problem" | "idea";
export type FeedbackRow = Database["public"]["Tables"]["feedback"]["Row"];

/**
 * Raise a question, problem or idea.
 *
 * profile_id is set from the caller's own id and the RLS policy requires it to
 * equal auth.uid(), so a submission cannot be attributed to anyone else even
 * if the client is tampered with.
 */
export async function submitFeedback(
  accessToken: string,
  input: {
    profileId: string;
    kind: FeedbackKind;
    message: string;
    projectId?: string | null;
    fromStaff: boolean;
  }
): Promise<void> {
  const client = createUserClient(accessToken);
  const { error } = await client.from("feedback").insert({
    profile_id: input.profileId,
    project_id: input.projectId ?? null,
    kind: input.kind,
    message: input.message.trim(),
    from_staff: input.fromStaff,
  });
  if (error) throw error;
}

/** Your own submissions; everything, if you're the owner. RLS decides which. */
export async function listFeedback(accessToken: string): Promise<FeedbackRow[]> {
  const client = createUserClient(accessToken);
  const { data, error } = await client
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

export async function resolveFeedback(accessToken: string, id: string, resolved: boolean) {
  const client = createUserClient(accessToken);
  const { error } = await client
    .from("feedback")
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}
