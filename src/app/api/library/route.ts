import { NextRequest, NextResponse } from "next/server";
import { revalidateTag, unstable_cache } from "next/cache";
import { requireCertificationAccess } from "@/lib/api-auth";
import { listPortalLibrary, isDriveConfigured } from "@/lib/drive";

/**
 * GET /api/library
 *
 * The resource list, read live from Drive. The portal stores no copy, so this
 * always reflects the current contents of the shared folder.
 *
 * Speed (Andrew, 24 Sept: "faster Keynotes and Handouts pages"). A cold
 * serverless instance used to walk Drive before answering — about two
 * seconds on the live site, every time a new instance started. The listing
 * now lives in Next's shared data cache for a minute, so any instance answers
 * from it, and the browser may keep its own copy for a minute (the hub
 * fetches it ahead of time, so opening Handouts from the hub is immediate).
 * A handout dropped into Drive still shows within about a minute; ?fresh=1
 * (the admin's Refresh) walks Drive now and replaces the shared copy.
 */
const LIBRARY_TAG = "portal-library";
const cachedLibrary = unstable_cache(() => listPortalLibrary(), ["portal-library-v1"], {
  revalidate: 60,
  tags: [LIBRARY_TAG],
});

export async function GET(req: NextRequest) {
  try {
    const access = await requireCertificationAccess(req);
    if (!access.ok) return access.response;

    if (!isDriveConfigured() || !process.env.GOOGLE_DRIVE_FOLDER_ID) {
      return NextResponse.json(
        { error: "Drive library is not configured on the server" },
        { status: 503 }
      );
    }

    const fresh = req.nextUrl.searchParams.get("fresh") === "1";

    if (fresh) {
      // `fresh` reaches the Drive memo too, or Refresh would get its listing.
      const modules = await listPortalLibrary({ fresh: true });
      revalidateTag(LIBRARY_TAG);
      return NextResponse.json({ modules, cached: false }, { headers: { "Cache-Control": "no-store" } });
    }

    const modules = await cachedLibrary();
    return NextResponse.json(
      { modules },
      { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" } }
    );
  } catch (error) {
    console.error("Library listing failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not read the library",
      },
      { status: 500 }
    );
  }
}
