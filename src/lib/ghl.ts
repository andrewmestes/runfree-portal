import axios, { type AxiosInstance } from "axios";

/**
 * GoHighLevel tagging — portal → CRM.
 *
 * Targets the v2 API, authenticated with a Private Integration token. v1
 * (rest.gohighlevel.com) and its Location API keys have been retired from
 * newer sub-accounts: the "Api Key" panel is simply gone from Business
 * Profile, so there is no v1 credential left to issue.
 *
 * v2 differs in three ways that matter here: a different host, a required
 * Version header, and locationId on every call — a token alone doesn't imply
 * which location you mean.
 *
 * The inbound direction (GHL tag → portal access) is a workflow webhook and
 * uses none of this. It keeps working whether or not a token is configured.
 */

const GHL_API = "https://services.leadconnectorhq.com";

/** Pinned deliberately: v2 routes behaviour off this, so drift is a change. */
const GHL_VERSION = "2021-07-28";

/** The tag GHL uses to mark someone as certified. */
export const CERTIFIED_TAG = "Certified Vision Framer";

type GhlContact = {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
};

/** Both halves are required — a token without a location can't be used. */
export function isGhlConfigured(): boolean {
  return Boolean(
    process.env.GHL_API_KEY && process.env.GHL_LOCATION_ID
  );
}

/**
 * Built per call rather than at module load. A module-scope client captures
 * whatever env existed at import and would send `Bearer undefined` forever
 * after, which reads as an auth problem rather than a missing setting.
 */
function client(): AxiosInstance {
  return axios.create({
    baseURL: GHL_API,
    timeout: 10_000,
    headers: {
      Authorization: `Bearer ${process.env.GHL_API_KEY}`,
      Version: GHL_VERSION,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
}

/** Unwrap whatever GHL actually said, rather than a bare "Request failed". */
function describe(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body = error.response?.data as { message?: string } | undefined;
    const detail = body?.message || error.message;

    if (status === 401) {
      return `GoHighLevel rejected the token (401). Check GHL_API_KEY is a Private Integration token with contacts.readonly and contacts.write.`;
    }
    if (status === 403) {
      return `GoHighLevel denied the request (403) — the token is probably missing the contacts.write scope.`;
    }
    return status ? `${status}: ${detail}` : detail;
  }
  return error instanceof Error ? error.message : "Unknown GoHighLevel error";
}

/**
 * Find a contact by email address.
 *
 * v2's `query` is a fuzzy search across name, email and phone, so the result
 * is confirmed against the address before it's returned. Without that check a
 * near-miss could hand back a different person, and the caller would happily
 * tag them as certified.
 */
export async function searchGHLContactByEmail(
  email: string
): Promise<GhlContact | null> {
  const wanted = email.trim().toLowerCase();

  const response = await client().get("/contacts/", {
    params: { locationId: process.env.GHL_LOCATION_ID, query: wanted },
  });

  const contacts: GhlContact[] = response.data?.contacts || [];

  return (
    contacts.find((c) => c.email?.trim().toLowerCase() === wanted) || null
  );
}

export type GhlTagResult =
  | { status: "disabled" }
  | { status: "tagged"; contactId: string }
  | { status: "not_found" }
  | { status: "failed"; message: string };

/**
 * Tag a contact as a Certified Vision Framer.
 *
 * Returns a status rather than throwing: adding someone to the portal must
 * still succeed when GHL is unreachable, but the admin needs telling that the
 * CRM side didn't happen. Reporting "added" when the tag never landed is the
 * failure mode worth avoiding.
 */
export async function tagContactAsCertifiedFramer(
  email: string
): Promise<GhlTagResult> {
  if (!isGhlConfigured()) return { status: "disabled" };

  try {
    const contact = await searchGHLContactByEmail(email);
    if (!contact) return { status: "not_found" };

    await client().post(`/contacts/${contact.id}/tags`, {
      tags: [CERTIFIED_TAG],
    });

    return { status: "tagged", contactId: contact.id };
  } catch (error) {
    return { status: "failed", message: describe(error) };
  }
}

/** Remove the certified tag — used when access is revoked in the portal. */
export async function untagContactAsCertifiedFramer(
  email: string
): Promise<GhlTagResult> {
  if (!isGhlConfigured()) return { status: "disabled" };

  try {
    const contact = await searchGHLContactByEmail(email);
    if (!contact) return { status: "not_found" };

    // v2 takes the tag list in the body of a DELETE, which axios only sends
    // under `data`.
    await client().delete(`/contacts/${contact.id}/tags`, {
      data: { tags: [CERTIFIED_TAG] },
    });

    return { status: "tagged", contactId: contact.id };
  } catch (error) {
    return { status: "failed", message: describe(error) };
  }
}

/* -------------------------------------------------------------------------- */
/* Creating and reconciling contacts                                           */
/* -------------------------------------------------------------------------- */

export type GhlSyncResult =
  | { status: "disabled" }
  | { status: "matched"; contactId: string; tagged: boolean }
  | { status: "created"; contactId: string; tagged: boolean }
  | { status: "skipped"; reason: string }
  | { status: "failed"; message: string };

/**
 * Create a contact in GoHighLevel.
 *
 * Deliberately separate from tagging, and deliberately not called on its own
 * anywhere — syncPersonToGHL() below is the only entry point, because
 * creating a contact without first searching would duplicate anyone who is
 * already in the CRM under a slightly different name.
 *
 * `title` lands on the contact's companyName field rather than a custom
 * field: custom fields are per-location and have to exist before you can
 * write to them, so using one would make this fail on any location that
 * hasn't been prepared. companyName is standard and always present.
 */
async function createGHLContact(input: {
  email: string;
  name?: string | null;
  title?: string | null;
  tags?: string[];
}): Promise<string> {
  const parts = (input.name ?? "").trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ");

  const response = await client().post("/contacts/", {
    locationId: process.env.GHL_LOCATION_ID,
    email: input.email.trim().toLowerCase(),
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(input.title ? { companyName: input.title } : {}),
    ...(input.tags?.length ? { tags: input.tags } : {}),
    source: "RunFree Portal",
  });

  return response.data?.contact?.id ?? response.data?.id ?? "";
}

/**
 * Put a person into GoHighLevel and make their tags match their portal role.
 *
 * The rule Andrew described: match on email; tag as certified only if they
 * actually hold a certification role; create the contact if there is no
 * profile there yet, carrying their title where we have one.
 *
 *   "The check would be their name and email matching a profile in GHL, then
 *    tagging them accordingly if they're added as a certified person. if
 *    they're just a participant or staff member, I'd like them added to GHL
 *    (with their title brought in where relevant), but not tagged as
 *    'certified' unless they have that permission level."
 *
 * Matching is on EMAIL ALONE, not name+email. Names in a CRM are wrong
 * constantly — nicknames, maiden names, a typo from an old import — and
 * requiring both to agree would create a second contact for someone already
 * there, which is the one outcome worse than not syncing at all. Email is
 * unique and is what the inbound webhook already keys on.
 *
 * Never throws. A CRM that is down or misconfigured must not stop someone
 * being added to the portal; the caller reports what happened per person.
 */
export async function syncPersonToGHL(input: {
  email: string;
  name?: string | null;
  title?: string | null;
  /** The portal role being granted, which decides the certified tag. */
  certified: boolean;
  /**
   * Whether to create a contact that isn't there. Off by default: adding a
   * church viewer to the CRM puts a real person into marketing workflows,
   * which is a decision for whoever is importing, not a side effect.
   */
  createIfMissing?: boolean;
}): Promise<GhlSyncResult> {
  if (!isGhlConfigured()) return { status: "disabled" };

  const email = input.email.trim().toLowerCase();
  if (!email) return { status: "skipped", reason: "no email" };

  try {
    const existing = await searchGHLContactByEmail(email);

    if (existing) {
      if (!input.certified) return { status: "matched", contactId: existing.id, tagged: false };
      await client().post(`/contacts/${existing.id}/tags`, { tags: [CERTIFIED_TAG] });
      return { status: "matched", contactId: existing.id, tagged: true };
    }

    if (!input.createIfMissing) {
      return { status: "skipped", reason: "not in GHL, and creating was not requested" };
    }

    const contactId = await createGHLContact({
      email,
      name: input.name,
      title: input.title,
      tags: input.certified ? [CERTIFIED_TAG] : [],
    });

    return { status: "created", contactId, tagged: input.certified };
  } catch (error) {
    return { status: "failed", message: describe(error) };
  }
}
