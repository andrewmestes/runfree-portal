import { NextRequest, NextResponse } from "next/server";
import { requireCertificationAccess } from "@/lib/api-auth";
import { mintTicket } from "@/lib/file-ticket";
import { listPresentations, isDriveConfigured } from "@/lib/keynotes";

/**
 * GET /api/keynotes/ticket/{id}
 *
 * Trades a session for fifteen-minute download tickets to one presentation
 * — the file asked for, and its other format if the deck has one. A .key or
 * .pptx cannot be shown in a browser, so the page hands the browser a
 * ticketed URL and lets it download the file itself: the download shows in
 * the browser's own progress UI and never sits in the page as a blob.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await requireCertificationAccess(req);
    if (!access.ok) return access.response;
    if (!isDriveConfigured()) {
      return NextResponse.json({ error: "Drive is not configured on the server" }, { status: 503 });
    }

    const decks = await listPresentations();
    const deck = decks.find((d) => d.keynote?.id === id || d.powerpoint?.id === id);
    if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const describe = (
      f: { id: string; name: string; mimeType: string; sizeBytes: number | null } | null,
      format: "keynote" | "powerpoint"
    ) =>
      f
        ? {
            id: f.id,
            format,
            name: f.name,
            mimeType: f.mimeType,
            sizeBytes: f.sizeBytes,
            url: `/api/keynotes/file/${encodeURIComponent(f.id)}?t=${encodeURIComponent(
              mintTicket(f.id, access.userId).ticket
            )}`,
          }
        : null;

    const keynote = describe(deck.keynote, "keynote");
    const powerpoint = describe(deck.powerpoint, "powerpoint");
    const requested = keynote?.id === id ? keynote : powerpoint;

    return NextResponse.json({ title: deck.title, requested, keynote, powerpoint });
  } catch (error) {
    console.error("Keynote ticket failed:", error);
    return NextResponse.json({ error: "Could not open that presentation" }, { status: 500 });
  }
}
