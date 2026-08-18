import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { listPortalLibrary, isDriveConfigured } from "@/lib/drive";

/**
 * GET /api/library
 *
 * The resource list, read live from Drive. The portal stores no copy, so this
 * always reflects the current contents of the shared folder.
 *
 * Cached briefly so a burst of page loads doesn't hammer the Drive API;
 * pass ?fresh=1 to bypass it.
 */

type Cached = { at: number; payload: unknown };
let cache: Cached | null = null;
const TTL_MS = 60_000;

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

    if (!isDriveConfigured() || !process.env.GOOGLE_DRIVE_FOLDER_ID) {
      return NextResponse.json(
        { error: "Drive library is not configured on the server" },
        { status: 503 }
      );
    }

    const fresh = req.nextUrl.searchParams.get("fresh") === "1";

    if (!fresh && cache && Date.now() - cache.at < TTL_MS) {
      return NextResponse.json({ modules: cache.payload, cached: true });
    }

    const modules = await listPortalLibrary();
    cache = { at: Date.now(), payload: modules };

    return NextResponse.json({ modules, cached: false });
  } catch (error) {
    console.error("Library listing failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not read the library",
      },
      { status: 500 }
    );
  }
}
