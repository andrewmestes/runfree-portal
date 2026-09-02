import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireProjectAccess } from "@/lib/api-auth";
import { VISION_FRAME, type VisionFrameElement } from "@/lib/vision-frame";
import { renderVisionFramePdf } from "@/lib/pdf/vision-frame-pdf";

/**
 * GET /api/projects/{id}/vision-frame — the frame as a one-page PDF.
 *
 * Everything goes through the caller's own client: the project row, the
 * vision_frame rows and the Strategy sketch are all read under RLS, so a
 * member gets their church's frame and nobody else's. Nothing is stored;
 * the page is drawn on request from whatever is written right now.
 */
export const maxDuration = 30;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(request, projectId);
  if (!access.ok) return access.response;
  const client = access.client;

  const [{ data: project, error: pErr }, { data: rows, error: rErr }] = await Promise.all([
    client.from("projects").select("name, templates(name, voice, frame_elements)").eq("id", projectId).maybeSingle(),
    client.from("vision_frame").select("element, body, image_path").eq("project_id", projectId),
  ]);
  if (pErr || rErr) return NextResponse.json({ error: (pErr ?? rErr)!.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tpl = project.templates as unknown as
    | { name: string; voice: "church" | "organization" | null; frame_elements: string[] | null }
    | null;
  const elements = (tpl?.frame_elements as VisionFrameElement[] | null) ?? VISION_FRAME.map((e) => e.key);
  const text: Partial<Record<VisionFrameElement, string | null>> = {};
  for (const r of rows ?? []) text[r.element as VisionFrameElement] = r.body;

  let sketch: { bytes: Uint8Array; mime: string } | null = null;
  const strategy = (rows ?? []).find((r) => r.element === "strategy");
  if (strategy?.image_path) {
    const { data } = await client.storage.from("deliverable-images").download(strategy.image_path);
    if (data) sketch = { bytes: new Uint8Array(await data.arrayBuffer()), mime: data.type };
  }

  const logo = await readFile(path.join(process.cwd(), "public", "brand", "runfree-logo-white.png")).catch(() => null);
  const church = project.name.replace(/\s*-\s*.*$/, "");

  const bytes = await renderVisionFramePdf({
    church,
    engagement: tpl?.name ?? null,
    voice: tpl?.voice ?? "church",
    elements,
    text,
    sketch,
    logo,
  });

  const slug = church.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "vision-frame";
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${slug}-vision-frame.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
