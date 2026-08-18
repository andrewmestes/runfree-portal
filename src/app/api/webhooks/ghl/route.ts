import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { inviteFramer, syncCertificationRole, type InviteOutcome } from "@/lib/invite";

/**
 * POST /api/webhooks/ghl
 *
 * Driven by a GoHighLevel Workflow with a Webhook action, not the GHL API —
 * the workflow payload already carries the contact, so there's no API key to
 * manage and nothing to poll.
 *
 * Auth is a shared secret in the x-portal-secret header, set on both the
 * workflow and GHL_WEBHOOK_SECRET in Vercel.
 *
 * Add a Custom Data pair of action=remove on a "tag removed" workflow to
 * revoke access; anything else is treated as an add.
 *
 * An add also sends the invitation, matching what adding someone by hand does
 * — being tagged certified but never hearing about it is the whole problem
 * this is meant to solve. A Custom Data pair of invite=false suppresses it,
 * which is what a bulk retag of an existing cohort wants: those people are
 * already in, and a few hundred invitations would hit the mail rate limit and
 * mostly never arrive.
 */

/** GHL's field naming varies by trigger, so accept the common shapes. */
function pick(payload: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/**
 * GHL's Standard builder nests a Webhook action's Custom Data pairs under a
 * `customData` key instead of merging them alongside the standard fields
 * (email, contact_id, names), which arrive at the top level. Without
 * flattening, a pair like action=remove is invisible to `pick` and every call
 * silently falls through to the add path — reproduced directly by sending a
 * payload shaped this way and getting "already_present" back for what should
 * have been a removal.
 *
 * Custom Data is merged UNDER the standard fields, never over them. A pair
 * named `email` is a mistake someone can make in the GHL UI, and letting it
 * win would point a revoke at a different person than the one the workflow
 * actually fired for — the contact's own identity has to come from GHL's
 * standard payload, not from a field an admin typed.
 */
function flattenCustomData(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const nested = payload.customData ?? payload.custom_data;

  let flat: Record<string, unknown> | null = null;

  if (Array.isArray(nested)) {
    flat = {};
    for (const entry of nested) {
      if (entry && typeof entry === "object") {
        const key = (entry as { key?: unknown; name?: unknown }).key
          ?? (entry as { key?: unknown; name?: unknown }).name;
        if (typeof key === "string") {
          flat[key] = (entry as { value?: unknown }).value;
        }
      }
    }
  } else if (nested && typeof nested === "object") {
    flat = { ...(nested as Record<string, unknown>) };
  }

  if (!flat) return payload;

  // Identity fields are GHL's to state, so they are re-applied last.
  return { ...flat, ...payload };
}

export async function POST(req: NextRequest) {
  const secret = process.env.GHL_WEBHOOK_SECRET;

  if (!secret) {
    console.error("GHL webhook hit but GHL_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 503 }
    );
  }

  const provided = req.headers.get("x-portal-secret");

  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  payload = flattenCustomData(payload);

  const email = pick(payload, ["email", "Email", "contact_email"]).toLowerCase();

  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "No email in payload" },
      { status: 400 }
    );
  }

  const contactId = pick(payload, ["contact_id", "contactId", "id"]);
  const action = pick(payload, ["action"]).toLowerCase();

  const fullName =
    pick(payload, ["full_name", "fullName", "name"]) ||
    [
      pick(payload, ["first_name", "firstName"]),
      pick(payload, ["last_name", "lastName"]),
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

  try {
    if (action === "remove") {
      /**
       * Admins are never revoked by a CRM tag. Someone can untag a contact in
       * GHL for reasons that have nothing to do with portal access, and losing
       * the last admin means losing the only way back into the admin screen —
       * a re-add wouldn't restore it either, since an insert doesn't carry
       * is_admin. Revoking an admin is a deliberate act, done in the portal.
       */
      const { data: target, error: lookupErr } = await supabaseAdmin
        .from("certified_framers")
        .select("id,is_admin")
        .eq("email", email)
        .maybeSingle();

      if (lookupErr) throw new Error(lookupErr.message);

      if (!target) {
        await supabaseAdmin.from("ghl_sync_log").insert({
          ghl_contact_id: contactId || email,
          status: "success",
        });
        return NextResponse.json({ ok: true, action: "not_listed", email });
      }

      if (target.is_admin) {
        await supabaseAdmin.from("ghl_sync_log").insert({
          ghl_contact_id: contactId || email,
          status: "failed",
          error_message: `Refused to revoke admin ${email} from a GHL tag removal`,
        });
        return NextResponse.json({
          ok: true,
          action: "refused_admin",
          email,
          warning:
            "This person is a portal admin. Remove their admin rights in the portal first if you really mean to revoke access.",
        });
      }

      const { error: deleteErr } = await supabaseAdmin
        .from("certified_framers")
        .delete()
        .eq("email", email);

      if (deleteErr) throw new Error(deleteErr.message);

      // Revoke the portal permission too, or the row is gone and the access
      // it stood for quietly isn't.
      await syncCertificationRole(email, false);

      await supabaseAdmin.from("ghl_sync_log").insert({
        ghl_contact_id: contactId || email,
        status: "success",
      });

      return NextResponse.json({ ok: true, action: "removed", email });
    }

    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("certified_framers")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingErr) throw new Error(existingErr.message);

    if (existing) {
      // Already on the list — just keep the GHL link current. Never
      // overwrite an existing name or touch is_admin.
      if (contactId) {
        const { error: linkErr } = await supabaseAdmin
          .from("certified_framers")
          .update({ ghl_contact_id: contactId })
          .eq("id", existing.id);
        if (linkErr) throw new Error(linkErr.message);
      }
    } else {
      const { error: insertErr } = await supabaseAdmin
        .from("certified_framers")
        .insert({
          email,
          name: fullName || email,
          ghl_contact_id: contactId || null,
        });
      if (insertErr) throw new Error(insertErr.message);
    }

    /**
     * Only invite on a genuine add. Re-running a workflow over people who are
     * already on the list is routine in GHL, and each replay would otherwise
     * be another email to someone who has been in the portal for months.
     */
    let invited: InviteOutcome = "skipped";
    let inviteError: string | null = null;

    if (!existing && pick(payload, ["invite"]).toLowerCase() !== "false") {
      const result = await inviteFramer(email, req.nextUrl.origin, fullName);
      invited = result.outcome;
      inviteError = result.error;
    }

    // AFTER the invite, not before. Inviting is what creates the auth user,
    // and the profile with it — running this first found no profile and did
    // nothing, which is how Megan Estes arrived as a 'client'. The trigger
    // (migration 033) now sets the role at creation, so this call is the
    // belt to that braces: it catches someone who already had a profile.
    await syncCertificationRole(email, true);

    await supabaseAdmin.from("ghl_sync_log").insert({
      ghl_contact_id: contactId || email,
      status: invited === "failed" ? "failed" : "success",
      error_message: inviteError,
    });

    // Still a 200 when the invite fails — access was granted, and a non-2xx
    // would make GHL retry the whole thing and duplicate the work.
    return NextResponse.json({
      ok: true,
      action: existing ? "already_present" : "added",
      email,
      invited,
      inviteError,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook processing failed";

    await supabaseAdmin.from("ghl_sync_log").insert({
      ghl_contact_id: contactId || email,
      status: "failed",
      error_message: message,
    });

    console.error("GHL webhook error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET — quick health check you can hit in a browser. */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/webhooks/ghl",
    configured: Boolean(process.env.GHL_WEBHOOK_SECRET),
  });
}
