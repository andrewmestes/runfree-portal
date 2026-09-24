import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A short-lived, signed ticket that lets a plain URL stand in for a session
 * header — for the two places a browser fetches a file without being able
 * to attach one: a `<video>` tag streaming a tool video, and a download the
 * browser should run itself (a 47 MB Keynote deck is not something to hold
 * in a page's memory as a blob first).
 *
 * A ticket names one file and one person, is signed with a server secret,
 * and dies after fifteen minutes by default — long enough to start a
 * download, useless to pass around. A video ticket is minted for longer
 * (see the tool-videos ticket route): the `<video>` tag re-asks the same
 * URL for every slice of the film, so the ticket has to outlive the
 * watching, pauses included, not just the first byte. The expiry is inside
 * the signed ticket, so verifying needs no TTL. The route that mints it
 * does the access check; the file route only verifies the ticket.
 */

const TICKET_TTL_MS = 15 * 60_000;

function secret(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return s;
}

function sign(fileId: string, userId: string, exp: number): string {
  return createHmac("sha256", secret()).update(`${fileId}|${userId}|${exp}`).digest("base64url");
}

/** A ticket for one file, one person, fifteen minutes unless the caller asks for longer. */
export function mintTicket(
  fileId: string,
  userId: string,
  ttlMs = TICKET_TTL_MS
): { ticket: string; expiresAt: number } {
  const exp = Date.now() + ttlMs;
  const ticket = `${exp}.${Buffer.from(userId).toString("base64url")}.${sign(fileId, userId, exp)}`;
  return { ticket, expiresAt: exp };
}

/** True when the ticket names this file, is unexpired, and was signed here. */
export function verifyTicket(fileId: string, ticket: string | null): boolean {
  if (!ticket) return false;
  const [expRaw, userB64, sig] = ticket.split(".");
  if (!expRaw || !userB64 || !sig) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  let userId: string;
  try {
    userId = Buffer.from(userB64, "base64url").toString("utf8");
  } catch {
    return false;
  }
  const expected = sign(fileId, userId, exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
