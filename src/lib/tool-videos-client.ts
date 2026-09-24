import { supabase } from "./supabase";

/**
 * The browser half of the tool-video ticket (lib/tool-videos.ts).
 *
 * The `<video>` tag re-requests its ticketed URL for every slice of the
 * film, so a ticket that dies mid-showing stops the picture with a 401 —
 * that is what cut the longer walkthroughs off at fifteen minutes, and
 * what a film paused through a long discussion would still hit. Tickets
 * now last four hours; this is the backstop for the one that runs out
 * anyway: trade the session for a fresh ticket, point the same element at
 * it, and put the person back where they were.
 *
 * It sets `el.src` directly rather than through React state. Changing the
 * state would change the element's `key` and remount it, and a remounted
 * player starts again from zero, which is the thing this is avoiding.
 */

/** One retry per element per minute, so a file that is genuinely broken fails once and stays failed instead of looping. */
const RETRY_GAP_MS = 60_000;
const lastRetry = new WeakMap<HTMLVideoElement, { when: number; position: number }>();

/** Re-mint the ticket and resume at the same moment. True when a new source was set. */
export async function resumeWithFreshTicket(el: HTMLVideoElement, driveId: string): Promise<boolean> {
  const now = Date.now();
  const last = lastRetry.get(el);
  if (last && now - last.when < RETRY_GAP_MS) return false;

  // A retry whose own load failed before any metadata leaves currentTime at
  // zero; the place to get back to is still the one that retry was aiming for.
  const position = last && el.readyState === HTMLMediaElement.HAVE_NOTHING ? last.position : el.currentTime;
  // Only carry on playing if it was playing. A paused film in a room stays
  // paused until the facilitator presses play.
  const resume = !el.paused;
  lastRetry.set(el, { when: now, position });

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return false;
    const res = await fetch(`/api/tool-videos/ticket/${driveId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return false;
    const body = await res.json();
    // The player may have been closed while the ticket was on its way.
    if (!body.url || !el.isConnected) return false;
    el.addEventListener(
      "loadedmetadata",
      () => {
        el.currentTime = position;
        if (resume) el.play().catch(() => {});
      },
      { once: true }
    );
    el.src = body.url;
    return true;
  } catch {
    return false;
  }
}
