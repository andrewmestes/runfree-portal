import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requireCertificationAccess } from "@/lib/api-auth";
import { listPresentations, isDriveConfigured } from "@/lib/keynotes";

/**
 * The deck listing in Next's shared data cache for a minute, so a cold
 * serverless instance answers without walking Drive first (about 1.3 s on
 * the live site). Same reasoning as /api/library.
 */
const cachedPresentations = unstable_cache(() => listPresentations(), ["keynote-listing-v1"], {
  revalidate: 60,
  tags: ["keynote-listing"],
});

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

    return NextResponse.json(
      { presentations: await cachedPresentations() },
      { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" } }
    );
  } catch (error) {
    console.error("Keynote list failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load presentations" },
      { status: 500 }
    );
  }
}
