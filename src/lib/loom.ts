/**
 * Loom thumbnail resolution.
 *
 * The obvious approach — guessing the CDN path from the share id — fails two
 * different ways in production (verified on the CVF portal this was forked
 * from, see docs/forking-guide.md):
 *
 *   1. Workspace-restricted recordings 403 every guessed format.
 *   2. The formats that do load are often the black pre-roll frame, or a
 *      generic placeholder shared by several unrelated videos.
 *
 * Loom's public oEmbed endpoint returns a real, working thumbnail for both
 * cases. It has its own quirk though: for some recordings it hands back a
 * thumbnail belonging to a DIFFERENT session. Showing the wrong video's
 * picture is worse than showing none, so a thumbnail is only trusted when
 * the session id embedded in the returned URL matches the video's own id.
 * Anything else falls back to the branded card, which is honest.
 *
 * Resolution happens server-side because oEmbed is rate-limited and slow
 * (~300ms each); results are cached so a page load costs nothing.
 */

const OEMBED = "https://www.loom.com/v1/oembed";

/** Long enough that a page load is free, short enough to pick up re-records. */
const TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Hand-picked stills for a recording where Loom's own thumbnail can't be
 * trusted — a black pre-roll frame, or a still that belongs to a different
 * session entirely. Empty here on purpose: CVF's seven entries were keyed to
 * its own recordings and don't apply to any RunFree client's library. Add an
 * entry the same way if a specific recording needs one — `{ loomId:
 * "/brand/videos/<id>.jpg" }` — with the real frame checked into
 * public/brand/videos.
 */
const MANUAL_STILLS: Record<string, string> = {};

type Entry = { at: number; url: string | null };

const cache = new Map<string, Entry>();

export function extractLoomId(url: string): string | null {
  const m = url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

/** The session id Loom embedded in a thumbnail URL, if we can read one. */
function thumbnailSessionId(thumbnailUrl: string): string | null {
  const m = thumbnailUrl.match(/thumbnails\/([a-zA-Z0-9]+)[-.]/);
  return m ? m[1] : null;
}

/**
 * oEmbed hands back an animated GIF, and the same path with a .jpg
 * extension serves a still of the same frame — dramatically smaller and,
 * unlike the GIF, it survives image optimisation. Optimising an animated GIF
 * yields its first frame, which for Loom is usually a transparent pre-roll,
 * so the card renders blank.
 *
 * Only swapped in when the JPEG actually exists; not every path has one.
 */
async function preferStill(gifUrl: string): Promise<string> {
  if (!gifUrl.endsWith(".gif")) return gifUrl;
  const jpg = `${gifUrl.slice(0, -4)}.jpg`;

  try {
    const res = await fetch(jpg, {
      method: "HEAD",
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok && (res.headers.get("content-type") || "").includes("image")) {
      return jpg;
    }
  } catch {
    // Fall through to the GIF.
  }
  return gifUrl;
}

async function resolveOne(loomId: string): Promise<string | null> {
  if (MANUAL_STILLS[loomId]) return MANUAL_STILLS[loomId];

  const hit = cache.get(loomId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.url;

  let url: string | null = null;

  try {
    const res = await fetch(
      `${OEMBED}?url=${encodeURIComponent(
        `https://www.loom.com/share/${loomId}`
      )}`,
      { signal: AbortSignal.timeout(8000) }
    );

    if (res.ok) {
      const body = (await res.json()) as { thumbnail_url?: string };
      const candidate = body.thumbnail_url || null;

      // Only trust a thumbnail that actually belongs to this recording.
      if (candidate && thumbnailSessionId(candidate) === loomId) {
        url = await preferStill(candidate);
      }
    }
  } catch {
    // Network hiccup or timeout — fall back to the branded card. Cached as
    // null so one slow provider can't stall every subsequent page load.
  }

  cache.set(loomId, { at: Date.now(), url });
  return url;
}

/**
 * Resolve many share URLs at once, returning a map keyed by the original URL.
 * Only Loom links are looked up; everything else resolves to null and uses
 * whatever lib/video.ts can work out on its own.
 */
export async function resolveLoomThumbnails(
  urls: string[]
): Promise<Record<string, string>> {
  const ids = new Map<string, string>();
  for (const url of urls) {
    const id = extractLoomId(url);
    if (id) ids.set(url, id);
  }

  const resolved = await Promise.all(
    [...ids.values()].map(async (id) => [id, await resolveOne(id)] as const)
  );
  const byId = new Map(resolved);

  const out: Record<string, string> = {};
  for (const [url, id] of ids) {
    const thumb = byId.get(id);
    if (thumb) out[url] = thumb;
  }
  return out;
}
