import { NextRequest, NextResponse } from "next/server";
import { PassThrough, Readable } from "node:stream";
// archiver v8 dropped the callable default export in favour of named classes.
import { ZipArchive } from "archiver";
import { supabaseAdmin } from "@/lib/supabase";
import {
  fetchDriveFile,
  listPortalLibrary,
  isDriveConfigured,
} from "@/lib/drive";

/**
 * GET /api/library/module/{id}/zip
 *
 * Every handout in one module as a single zip. Built and streamed on the fly —
 * nothing is cached, so the archive always reflects what's currently in Drive,
 * and a large module never has to fit in memory at once.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    const archive = new ZipArchive({ zlib: { level: 6 } });
    const out = new PassThrough();
    archive.pipe(out);

    // Build in the background; the response streams as entries are added.
    (async () => {
      for (const file of mod.files) {
        try {
          const drive = await fetchDriveFile(file.id);
          const nodeStream = Readable.fromWeb(
            drive.body as Parameters<typeof Readable.fromWeb>[0]
          );
          archive.append(nodeStream, { name: drive.filename });
        } catch (err) {
          // One unreadable file shouldn't sink the whole archive — note it
          // and carry on.
          console.error(`Skipping ${file.name} in zip:`, err);
          archive.append(
            `This file could not be retrieved from Drive at download time.\n`,
            { name: `UNAVAILABLE - ${file.name}.txt` }
          );
        }
      }
      await archive.finalize();
    })();

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
