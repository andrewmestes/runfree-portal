import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveLoomThumbnails } from "@/lib/loom";

/**
 * GET /api/videos
 *
 * The published video list plus a server-resolved thumbnail for each one.
 * The page used to read the table directly with the anon key and guess
 * thumbnail URLs client-side, which left a quarter of the grid blank — see
 * lib/loom.ts for why that guess can't work. Resolution has to happen here
 * because it needs an outbound call per video that we then cache.
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

    const fresh = req.nextUrl.searchParams.get("fresh") === "1";
    if (!fresh && cache && Date.now() - cache.at < TTL_MS) {
      return NextResponse.json({ ...(cache.payload as object), cached: true });
    }

    const { data: videos, error } = await supabaseAdmin
      .from("training_videos")
      .select("id,title,url,description,module,sort_order")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = videos || [];
    const thumbnails = await resolveLoomThumbnails(list.map((v) => v.url));

    const payload = {
      videos: list.map((v) => ({ ...v, thumbnailUrl: thumbnails[v.url] || null })),
    };
    cache = { at: Date.now(), payload };

    return NextResponse.json({ ...payload, cached: false });
  } catch (error) {
    console.error("Video listing failed:", error);
    return NextResponse.json(
      { error: "Could not load the videos" },
      { status: 500 }
    );
  }
}
