import { NextRequest, NextResponse } from "next/server";
import { requireCertificationAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getFacilitatorGuide, isDriveConfigured } from "@/lib/guide";

/** GET /api/guide — the current Digital Facilitator's Guide, gated same as the rest. */
export async function GET(req: NextRequest) {
  try {
    const access = await requireCertificationAccess(req);
    if (!access.ok) return access.response;

    if (!isDriveConfigured() || !process.env.GOOGLE_DFG_FOLDER_ID) {
      return NextResponse.json(
        { error: "Facilitator's Guide is not configured on the server" },
        { status: 503 }
      );
    }

    const file = await getFacilitatorGuide();
    return NextResponse.json({ file });
  } catch (error) {
    console.error("Guide lookup failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read the guide" },
      { status: 500 }
    );
  }
}
