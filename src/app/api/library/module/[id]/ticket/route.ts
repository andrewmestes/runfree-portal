import { NextRequest, NextResponse } from "next/server";
import { requireCertificationAccess } from "@/lib/api-auth";
import { mintTicket } from "@/lib/file-ticket";
import { listPortalLibrary, isDriveConfigured } from "@/lib/drive";

/**
 * GET /api/library/module/{id}/ticket
 *
 * Trades a session for a fifteen-minute ticket to one module's zip. "Download
 * all" used to fetch the zip into the page and hold it as a blob before
 * offering it — 50 MB of Combined Handouts in a phone's memory, with nothing
 * but "Zipping…" to show for it. The page now hands the browser the ticketed
 * URL and the browser runs the download, with its own progress. Same two
 * steps as the keynote downloads; this is where the access check happens.
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

    const mod = (await listPortalLibrary()).find((m) => m.id === id);
    if (!mod || mod.files.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // "zip:" so this ticket can never pass for a ticket to a file id.
    const { ticket } = mintTicket(`zip:${id}`, access.userId);
    return NextResponse.json({
      url: `/api/library/module/${encodeURIComponent(id)}/zip?t=${encodeURIComponent(ticket)}`,
    });
  } catch (error) {
    console.error("Module zip ticket failed:", error);
    return NextResponse.json({ error: "Could not prepare that download" }, { status: 500 });
  }
}
