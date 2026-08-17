import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase";
import { resolveLoomThumbnails } from "@/lib/loom";

/**
 * Real Loom stills for a set of share URLs.
 *
 * Server-side because Loom's oEmbed endpoint is rate-limited and slow (~300ms
 * each) and lib/loom.ts caches results in module memory — neither of which
 * works from a browser. The gradient placeholders this replaces were honest
 * but anonymous: every video looked like every other video.
 *
 * Authentication is only a gate on who may spend our rate limit; the
 * thumbnails themselves are public Loom CDN URLs and reveal nothing about a
 * project. So it checks that the caller is signed in and stops there — there
 * is no per-project check to get wrong, because there is nothing per-project
 * about the answer.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }
  const accessToken = authHeader.slice("Bearer ".length);

  const client = createUserClient(accessToken);
  const {
    data: { user },
    error,
  } = await client.auth.getUser(accessToken);
  if (error || !user) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }

  let body: { urls?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const urls = Array.isArray(body.urls)
    ? body.urls.filter((u): u is string => typeof u === "string").slice(0, 60)
    : [];
  if (urls.length === 0) return NextResponse.json({ thumbnails: {} });

  try {
    return NextResponse.json({ thumbnails: await resolveLoomThumbnails(urls) });
  } catch (err) {
    // A missing thumbnail is a cosmetic loss, never a broken page.
    console.error("Loom thumbnail resolution failed:", err);
    return NextResponse.json({ thumbnails: {} });
  }
}
