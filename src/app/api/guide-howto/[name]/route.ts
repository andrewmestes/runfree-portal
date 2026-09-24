import { NextRequest, NextResponse } from "next/server";
import { requireCertificationAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/guide-howto/{name} — one still of the Digital Facilitator's Guide
 * for the "How to Use the Guide" page, for certified framers only.
 *
 * The stills are pages 2, 3, 89 and 90 of the guide — the back of 3.9 is
 * certification-only teaching (Big Idea, How It Works, Coaching Tips). They
 * live in the private `deliverable-images` bucket at
 * `site-assets/guide-howto/{name}.jpg` — not in `public/` (readable by anyone
 * with the path) and not in the repo (andrewmestes/runfree-portal is a public
 * GitHub repository). The bucket's first path segment is not a project uuid,
 * so storage RLS gives no member a read; only this route's service role does,
 * behind the same gate as the guide itself. To replace a still, upload over
 * it (upsert) — see CLAUDE.md, "How to Use the Guide, and private stills".
 */
const STILLS = new Set(["menu", "tool-list", "tool-front", "tool-back"]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const access = await requireCertificationAccess(req);
  if (!access.ok) return access.response;

  const { name } = await params;
  const key = name.replace(/\.jpg$/i, "");
  if (!STILLS.has(key)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabaseAdmin.storage
    .from("deliverable-images")
    .download(`site-assets/guide-howto/${key}.jpg`);
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const bytes = new Uint8Array(await data.arrayBuffer());
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(bytes.byteLength),
      // A signed-in framer's browser may keep them; nobody else can fetch them.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
