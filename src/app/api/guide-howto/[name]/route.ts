import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireCertificationAccess } from "@/lib/api-auth";

/**
 * GET /api/guide-howto/{name} — one still of the Digital Facilitator's Guide
 * for the "How to Use the Guide" page, for certified framers only.
 *
 * The stills are pages 2, 3, 89 and 90 of the guide — the back of 3.9 is
 * certification-only teaching (Big Idea, How It Works, Coaching Tips), and
 * `public/` is readable by anyone with the path (the same reason the Kairos
 * recordings' guide-page covers were never pinned there). So they live in
 * `private/guide-howto/`, are listed in next.config.ts's
 * outputFileTracingIncludes (a runtime readFile is invisible to Vercel's
 * tracer), and are served here behind the same gate as the guide itself.
 */
const STILLS = new Set(["menu", "tool-list", "tool-front", "tool-back"]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const access = await requireCertificationAccess(req);
  if (!access.ok) return access.response;

  const { name } = await params;
  const key = name.replace(/\.jpg$/i, "");
  if (!STILLS.has(key)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const bytes = await readFile(path.join(process.cwd(), "private", "guide-howto", `${key}.jpg`));
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(bytes.byteLength),
      // A signed-in framer's browser may keep them; nobody else can fetch them.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
