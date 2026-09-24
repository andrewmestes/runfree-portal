import { NextRequest, NextResponse } from "next/server";
import { revalidateTag, unstable_cache } from "next/cache";
import { requireCertificationAccess } from "@/lib/api-auth";
import { listPortalLibrary, isDriveConfigured } from "@/lib/drive";

/**
 * GET /api/library
 *
 * The resource list, read from Drive. The portal keeps no copy of its own
 * beyond the short-lived caches below, so a change in the shared folder needs
 * nothing re-uploaded.
 *
 * Speed (Andrew, 24 Sept: "faster Keynotes and Handouts pages"). A cold
 * serverless instance used to walk Drive before answering — about two
 * seconds on the live site, every time a new instance started. The listing
 * now lives in Next's shared data cache, so any instance answers from it, and
 * the browser may keep its own copy for a minute (the hub fetches it ahead of
 * time, so opening Handouts from the hub is immediate). A handout dropped
 * into Drive shows within a few minutes; an admin's Refresh (the
 * X-Library-Fresh header, or ?fresh=1) walks Drive at once and clears the
 * shared copy.
 */
const LIBRARY_TAG = "portal-library";

/**
 * unstable_cache returns a stale entry of ANY age and refreshes it in the
 * background (next/dist/server/web/spec-extension/unstable-cache.js), so the
 * first visit after a quiet spell got the last list cached, however old —
 * Friday's list on Monday morning. Past this age the route walks Drive itself.
 */
const MAX_STALE_MS = 5 * 60_000;

const cachedLibrary = unstable_cache(
  // `fresh`, so `at` is when Drive was read, not when this instance's
  // minute-old memo was.
  async () => ({ at: Date.now(), modules: await listPortalLibrary({ fresh: true }) }),
  ["portal-library-v2"], // new key: the value's shape changed
  { revalidate: 60, tags: [LIBRARY_TAG] }
);

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

    const fresh =
      req.headers.get("x-library-fresh") === "1" ||
      req.nextUrl.searchParams.get("fresh") === "1";

    if (fresh) {
      // `fresh` reaches the Drive memo too, or Refresh would get its listing.
      const modules = await listPortalLibrary({ fresh: true });
      revalidateTag(LIBRARY_TAG);
      // Storable on purpose: the page asks with cache "reload", so this answer
      // replaces the browser's stored copy of /api/library. With no-store the
      // old list stayed stored and came back on the next visit.
      return NextResponse.json(
        { modules, cached: false },
        { headers: { "Cache-Control": "private, max-age=60" } }
      );
    }

    const cached = await cachedLibrary();
    // A stale hit has already started the background walk and put it in the
    // memo, so this shares that walk rather than starting a second. If Drive
    // fails, the old list is still better than an error.
    const modules =
      Date.now() - cached.at > MAX_STALE_MS
        ? await listPortalLibrary().catch(() => cached.modules)
        : cached.modules;
    return NextResponse.json({ modules }, { headers: { "Cache-Control": "private, max-age=60" } });
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
