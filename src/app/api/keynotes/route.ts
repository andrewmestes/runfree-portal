import { NextRequest, NextResponse } from "next/server";
import { requireCertificationAccess } from "@/lib/api-auth";
import { listPresentations, isDriveConfigured } from "@/lib/keynotes";

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

    return NextResponse.json({ presentations: await listPresentations() });
  } catch (error) {
    console.error("Keynote list failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load presentations" },
      { status: 500 }
    );
  }
}
