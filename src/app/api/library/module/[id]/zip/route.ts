import { NextRequest, NextResponse } from "next/server";
import { requireCertificationAccess } from "@/lib/api-auth";
import { verifyTicket } from "@/lib/file-ticket";
import { PassThrough, Readable } from "node:stream";
// archiver v8 dropped the callable default export in favour of named classes.
import { ZipArchive } from "archiver";
import { supabaseAdmin } from "@/lib/supabase";
import {
  fetchDriveFile,
  listPortalLibrary,
  isDriveConfigured,
  type DriveFile,
} from "@/lib/drive";

// A whole module through fetchDriveFile, which needed 60s for one combined
// handout. Same allowance as /library/file and /keynotes/file.
export const maxDuration = 60;

/**
 * How many files are fetched ahead of the one being written. One at a time,
 * each file cost two Google round-trips before a byte of it moved: Crowd
 * Cloud's 19 files (5.6 MB) took 35 s against the 60 s cap above, and a cold
 * instance could be cut off with a truncated zip.
 */
const FETCH_AHEAD = 4;

/**
 * Windows refuses \ / : * ? " < > | and a trailing dot or space in a name;
 * Explorer's Extract All stops on the first one. The Pivvot Notebook is
 * "PIVVOT NOTEBOOK - CERT. 9:8:26.pdf" in Drive, so its colons become dashes
 * here. Two handouts that clean to the same name get " (2)" rather than one
 * overwriting the other on extraction.
 */
function entryName(title: string, ext: string, used: Set<string>): string {
  const base =
    title
      .replace(/[\\/:]/g, "-")
      .replace(/[*?"<>|\u0000-\u001f]/g, "")
      .replace(/[. ]+$/, "")
      .trim() || "handout";
  let name = `${base}${ext}`;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})${ext}`;
  used.add(name.toLowerCase());
  return name;
}

/**
 * GET /api/library/module/{id}/zip             (Authorization: Bearer …)
 * GET /api/library/module/{id}/zip?t={ticket}  (from /api/library/module/{id}/ticket)
 *
 * Every handout in one module as a single zip. Built and streamed on the fly —
 * the files are read from Drive at download time and a large module never has
 * to fit in memory at once. The listing is the minute-long memo in
 * listPortalLibrary, so the ticket that came just before already paid for it. The ticket form lets
 * the browser run the download itself, with its own progress, instead of the
 * page holding the whole zip as a blob first (Combined Handouts is 50 MB).
 *
 * Entries are named by their display title — "- CERT" dropped, as the list
 * shows them — and made safe for Windows.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // "zip:" so a module's ticket can never pass for a file id's, or the
    // reverse.
    if (!verifyTicket(`zip:${id}`, req.nextUrl.searchParams.get("t"))) {
      const access = await requireCertificationAccess(req);
      if (!access.ok) return access.response;
    }

    if (!isDriveConfigured()) {
      return NextResponse.json(
        { error: "Drive is not configured on the server" },
        { status: 503 }
      );
    }

    const modules = await listPortalLibrary();
    const mod = modules.find((m) => m.id === id);

    if (!mod || mod.files.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Stored, not deflated: the entries are PDFs, which do not compress, so
    // deflating only spent CPU inside the 60 s allowance.
    const archive = new ZipArchive({ store: true });
    const out = new PassThrough();
    archive.pipe(out);

    // Every Drive stream this zip opens, so a failure or a cancelled download
    // closes them all rather than leaving them open until Google gives up.
    const sources: Readable[] = [];

    // A Drive stream that dies mid-file used to be an unhandled error and a
    // truncated zip sent as a 200. Destroying the response instead makes the
    // browser report a failed download rather than save a broken archive.
    const fail = (err: unknown) => {
      if (out.destroyed) return; // already reported, or the browser left
      console.error(`Module zip ${id} failed mid-stream:`, err);
      archive.abort();
      out.destroy(err instanceof Error ? err : new Error(String(err)));
    };
    archive.on("error", fail);
    archive.on("warning", (w) => console.warn("zip warning:", w));
    // Finished, failed, or the browser cancelled: stop pulling from Drive.
    out.on("close", () => {
      archive.abort();
      for (const s of sources) s.destroy();
    });

    // Fetch ahead, append in the module's order.
    type Fetched = { drive: DriveFile; stream: Readable };
    const pending: (Promise<Fetched> | undefined)[] = [];
    const start = (i: number) => {
      if (i >= mod.files.length || pending[i]) return;
      const fetched = fetchDriveFile(mod.files[i].id).then((drive) => {
        const stream = Readable.fromWeb(
          drive.body as Parameters<typeof Readable.fromWeb>[0]
        );
        stream.on("error", fail);
        sources.push(stream);
        if (out.destroyed) stream.destroy();
        return { drive, stream };
      });
      fetched.catch(() => {}); // awaited, and handled, in the loop below
      pending[i] = fetched;
    };

    // Build in the background; the response streams as entries are added.
    (async () => {
      const used = new Set<string>();
      for (let i = 0; i < FETCH_AHEAD; i++) start(i);
      for (let i = 0; i < mod.files.length && !out.destroyed; i++) {
        start(i + FETCH_AHEAD);
        const file = mod.files[i];
        try {
          const { drive, stream } = await pending[i]!; // started up front or FETCH_AHEAD turns ago
          const ext = drive.filename.match(/\.[a-z0-9]{1,5}$/i)?.[0] ?? "";
          archive.append(stream, { name: entryName(file.title, ext, used) });
        } catch (err) {
          // One unreadable file shouldn't sink the whole archive — note it
          // and carry on.
          console.error(`Skipping ${file.name} in zip:`, err);
          archive.append(
            `This file could not be retrieved from Drive at download time.\n`,
            { name: entryName(`UNAVAILABLE - ${file.title}`, ".txt", used) }
          );
        }
      }
      if (!out.destroyed) await archive.finalize();
    })().catch(fail);

    const safeName = mod.name.replace(/[^a-z0-9 _-]/gi, "").trim() || "handouts";

    return new NextResponse(
      Readable.toWeb(out) as ReadableStream,
      {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${safeName}.zip"`,
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    console.error("Module zip failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not build the archive",
      },
      { status: 500 }
    );
  }
}
