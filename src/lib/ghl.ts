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
