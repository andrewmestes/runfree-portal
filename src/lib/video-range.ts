/**
 * Range handling for the two routes that stream a Drive video to a <video>
 * tag: /api/tool-videos/file (a signed-in framer, by ticket) and
 * /api/clips/{slug}/video (the public clip pages).
 *
 * Every range is capped at SLICE_BYTES. A player opens with `bytes=0-`
 * ("send it all"), and Safari asks for `bytes=0-<size-1>` outright; passed
 * through, either streams the whole file through one function call, which on
 * a phone's connection can outlast the function's time limit and cut the
 * film off. Capped, the browser simply asks for the next slice, as it does
 * for the seek bar anyway. Multi-range and junk never reach Drive.
 */
export const SLICE_BYTES = 8 * 1024 * 1024;

/** The range to ask Drive for, null for no Range header, or "bad" (answer 416). */
export function clampRange(asked: string | null): string | null | "bad" {
  if (!asked) return null;
  const spec = asked.trim();
  const suffix = /^bytes=-(\d{1,12})$/.exec(spec);
  if (suffix) return `bytes=-${Math.min(Number(suffix[1]), SLICE_BYTES)}`;
  const m = /^bytes=(\d{1,12})-(\d{0,12})$/.exec(spec);
  if (!m) return "bad";
  const start = Number(m[1]);
  const end = m[2] ? Number(m[2]) : Infinity;
  if (end < start) return "bad";
  return `bytes=${start}-${Math.min(end, start + SLICE_BYTES - 1)}`;
}

/** The HTTP status a Drive error carried (gaxios puts it in either place), if any. */
export function driveErrorStatus(error: unknown): number | undefined {
  const e = error as { status?: number; response?: { status?: number } };
  return e?.response?.status ?? e?.status;
}
