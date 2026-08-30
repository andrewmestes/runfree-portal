import { createUserClient } from "./supabase";

/**
 * The Vision Frame, as text.
 *
 * Seven elements, in the order they appear on the Vision Frame Progress sheet
 * Will's team hands to a church. The prompts are lifted from that sheet
 * verbatim, because the sheet is what the room is looking at when these get
 * written — a portal that asks the question differently is a portal that
 * disagrees with the facilitator.
 */
export type VisionFrameElement =
  | "problem_statement"
  | "kingdom_concept"
  | "mission"
  | "measures"
  | "strategy"
  | "values"
  | "vision_proper";

export type VisionFrameRow = {
  id: string;
  project_id: string;
  element: VisionFrameElement;
  body: string | null;
  updated_at: string;
};

export const VISION_FRAME: {
  key: VisionFrameElement;
  label: string;
  /** The one-word question, as the sheet frames it. */
  question: string | null;
  prompt: string;
  /** Drop the real art at this path and it appears; a mark shows until then. */
  icon: string;
}[] = [
  {
    key: "problem_statement",
    label: "Problem Statement",
    question: null,
    prompt: "To fulfill the mission of Jesus, we need… more of, and less of.",
    icon: "/brand/vision-frame/problem-statement.png",
  },
  {
    key: "kingdom_concept",
    label: "Kingdom Concept",
    question: null,
    prompt:
      "We exist to glorify God and make disciples by… the congregation, the community, the passion, and the One Word.",
    icon: "/brand/vision-frame/kingdom-concept.png",
  },
  {
    key: "mission",
    label: "Mission",
    question: "The WHAT",
    prompt: "A clear and concise statement of what we are ultimately supposed to be doing.",
    icon: "/brand/vision-frame/mission.png",
  },
  {
    key: "measures",
    label: "Measures",
    question: "The WHEN",
    prompt:
      "The attributes in the life of a believer that reflect the accomplishment of the mission.",
    icon: "/brand/vision-frame/measures.png",
  },
  {
    key: "strategy",
    label: "Strategy",
    question: "The HOW",
    prompt: "A picture of how we accomplish the mission on the broadest level.",
    icon: "/brand/vision-frame/strategy.png",
  },
  {
    key: "values",
    label: "Values",
    question: "The WHY",
    prompt: "Shared convictions that guide our decision making and reveal our strengths.",
    icon: "/brand/vision-frame/values.png",
  },
  {
    key: "vision_proper",
    label: "Vision Proper",
    question: "The WHERE",
    prompt: "Living language that illustrates and anticipates God's better future.",
    icon: "/brand/vision-frame/vision-proper.png",
  },
];

export async function listVisionFrame(
  accessToken: string,
  projectId: string
): Promise<VisionFrameRow[]> {
  const { data, error } = await createUserClient(accessToken)
    .from("vision_frame")
    .select("*")
    .eq("project_id", projectId);
  if (error) throw error;
  return (data ?? []) as VisionFrameRow[];
}

/**
 * Write one element. Upsert on (project_id, element) so the first save and
 * every later edit are the same call — there is no "create the frame" step,
 * because a church's frame comes into existence one piece at a time over six
 * months.
 */
export async function saveVisionFrameElement(
  accessToken: string,
  projectId: string,
  element: VisionFrameElement,
  body: string | null
): Promise<void> {
  const { error } = await createUserClient(accessToken)
    .from("vision_frame")
    .upsert(
      { project_id: projectId, element, body, updated_at: new Date().toISOString() },
      { onConflict: "project_id,element" }
    );
  if (error) throw error;
}
