import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requireCertificationAccess } from "@/lib/api-auth";
import { listPresentations, isDriveConfigured } from "@/lib/keynotes";

/**
 * The deck listing in Next's shared data cache, so a cold serverless instance
 * answers without walking Drive first (about 1.3 s on the live site). Same
 * reasoning as /api/library, including the age limit: unstable_cache hands
 * back a stale entry of any age, so past MAX_STALE_MS the route walks Drive
 * itself, and a new deck shows within a few minutes. There is no Refresh here.
 */
const MAX_STALE_MS = 5 * 60_000;

const cachedPresentations = unstable_cache(
  async () => ({ at: Date.now(), presentations: await listPresentations() }),
  ["keynote-listing-v2"], // new key: the value's shape changed
  { revalidate: 60, tags: ["keynote-listing"] }
);

/** GET /api/keynotes — the decks, each with whichever formats exist in Drive. */
export async function GET(req: NextRequest) {
  try {
    const access = await requireCertificationAccess(req);
    if (!access.ok) return access.response;

    if (!isDriveConfigured()) {
      return NextResponse.json(
        { error: "Drive is not configured on the server" },
        { status: 503 }
      );
    }

    const c = await cachedPresentations();
    // A stale hit has already started the background walk and put it in the
    // memo, so this shares it. If Drive fails, the old list beats an error.
    const presentations =
      Date.now() - c.at > MAX_STALE_MS
        ? await listPresentations().catch(() => c.presentations)
        : c.presentations;
    return NextResponse.json(
      { presentations },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  } catch (error) {
    console.error("Keynote list failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load presentations" },
      { status: 500 }
    );
  }
}
