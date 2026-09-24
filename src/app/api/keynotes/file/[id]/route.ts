import { NextRequest, NextResponse } from "next/server";
import { requireCertificationAccess } from "@/lib/api-auth";
import { contentDisposition } from "@/lib/content-disposition";
import { fetchDriveFileRange } from "@/lib/drive";
import { verifyTicket } from "@/lib/file-ticket";
import { findPresentationFile, isDriveConfigured } from "@/lib/keynotes";

/**
 * These are the largest files the portal serves — the God Dreams deck is
 * 47 MB. Streaming it needs the same allowance /api/library/file takes.
 */
export const maxDuration = 60;

/**
 * GET /api/keynotes/file/{driveId}            (Authorization: Bearer …)
 * GET /api/keynotes/file/{driveId}?t={ticket} (from /api/keynotes/ticket)
 *
 * Either a session or a ticket (lib/file-ticket.ts) opens it; the ticket
 * form exists so the browser can run the download itself from a plain URL.
 * The id must belong to the Keynote Presentations folder — without that
 * check an authenticated framer could read anything the service account
 * can see.
 *
 * `attachment`, not `inline` — a browser cannot render a .key or a .pptx,
 * so an inline disposition just produces a download with a worse filename.
 * Range is passed through and Content-Length is set, so a browser can show
 * progress and resume.
 *
 * Drive's content hash is the ETag, as on /api/guide/file. `/open/keynote`
 * fetches the slides PDF here with its session rather than a ticket, so the
 * URL is the same every time and a repeat open is a 304 (or the browser's
 * own copy, for five minutes) instead of the whole 9–20 MB again.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const ticket = req.nextUrl.searchParams.get("t");
    if (!verifyTicket(id, ticket)) {
      const access = await requireCertificationAccess(req);
      if (!access.ok) return access.response;
    }

    if (!isDriveConfigured()) {
      return NextResponse.json({ error: "Drive is not configured on the server" }, { status: 503 });
    }

    const f = await findPresentationFile(id);
    if (!f) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const etag = f.md5 ? `"${f.md5}"` : null;
    const cacheHeaders: Record<string, string> = etag
      ? { "Cache-Control": "private, max-age=300, must-revalidate", ETag: etag }
      : { "Cache-Control": "private, no-cache, must-revalidate" };
    if (etag && req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: cacheHeaders });
    }

    const file = await fetchDriveFileRange(id, req.headers.get("range"));

    const headers: Record<string, string> = {
      ...cacheHeaders,
      "Content-Type": file.mimeType,
      "Content-Disposition": contentDisposition("attachment", file.filename),
      "Accept-Ranges": "bytes",
    };
    if (file.contentLength) headers["Content-Length"] = file.contentLength;
    if (file.contentRange) headers["Content-Range"] = file.contentRange;

    return new NextResponse(file.body, { status: file.status, headers });
  } catch (error) {
    console.error("Keynote file fetch failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not fetch the file" },
      { status: 500 }
    );
  }
}
