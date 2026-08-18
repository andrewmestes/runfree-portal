import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getFacilitatorGuide, isDriveConfigured } from "@/lib/guide";

/** GET /api/guide — the current Digital Facilitator's Guide, gated same as the rest. */
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user?.email) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { data: framer } = await supabaseAdmin
      .from("certified_framers")
      .select("id")
      .eq("email", user.email)
      .single();

    if (!framer) {
      return NextResponse.json(
        { error: "Not a certified Vision Framer" },
        { status: 403 }
      );
    }

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
