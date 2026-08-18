import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isGhlConfigured, tagContactAsCertifiedFramer } from "@/lib/ghl";

/**
 * POST /api/admin/framers/import
 *
 * Bulk-add people to the allowlist from a CSV.
 *
 * Deliberately does NOT create logins or send email. The portal's model is
 * that a framer creates their own account against an allowlisted address, and
 * Supabase's built-in mailer is rate-limited to a handful of messages an hour
 * — so importing a cohort of thirty and emailing each one would silently drop
 * most of them. Import puts people on the list; inviting them is a separate,
 * deliberate step from the framers screen.
 *
 * Every row comes back with its own outcome rather than a single pass/fail,
 * because a spreadsheet maintained by hand always has a few bad rows and the
 * admin needs to know which.
 */

/** Guards against a paste that would tie up the function for minutes. */
const MAX_ROWS = 500;

type RowResult = {
  row: number;
  email: string;
  name: string;
  status: "added" | "already_listed" | "invalid" | "duplicate" | "failed";
  detail?: string;
};

async function requireAdmin(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);
  if (error || !user?.email) return null;

  const { data: framer } = await supabaseAdmin
    .from("certified_framers")
    .select("id,is_admin")
    .eq("email", user.email)
    .single();

  if (framer?.is_admin) return framer;

  // Same widening as the sibling route: an account_role admin needs no
  // certified_framers row.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id,account_role")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.account_role === "admin" ? { id: profile.id, is_admin: true } : null;
}

export async function POST(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  let body: { rows?: { name?: string; email?: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rows = Array.isArray(body.rows) ? body.rows : [];

  if (rows.length === 0) {
    return NextResponse.json({ error: "Nothing to import" }, { status: 400 });
  }

  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Too many rows — ${MAX_ROWS} at a time, this had ${rows.length}` },
      { status: 400 }
    );
  }

  // Everyone already on the list, fetched once rather than per row.
  const { data: existingRows } = await supabaseAdmin
    .from("certified_framers")
    .select("email");
  const existing = new Set(
    (existingRows || []).map((r) => r.email.toLowerCase())
  );

  const seenInFile = new Set<string>();
  const results: RowResult[] = [];
  const toInsert: { email: string; name: string }[] = [];

  rows.forEach((raw, i) => {
    const email = String(raw.email || "").trim().toLowerCase();
    const name = String(raw.name || "").trim();
    const row = i + 1;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      results.push({
        row,
        email,
        name,
        status: "invalid",
        detail: email ? "Not a valid email address" : "Missing email",
      });
      return;
    }

    if (seenInFile.has(email)) {
      results.push({ row, email, name, status: "duplicate", detail: "Repeated in this file" });
      return;
    }
    seenInFile.add(email);

    if (existing.has(email)) {
      results.push({ row, email, name, status: "already_listed" });
      return;
    }

    // A missing name is recoverable — the address is what grants access, and
    // the person can be renamed later. Rejecting the row would be worse.
    toInsert.push({ email, name: name || email });
    results.push({ row, email, name: name || email, status: "added" });
  });

  if (toInsert.length > 0) {
    const { error } = await supabaseAdmin
      .from("certified_framers")
      .insert(toInsert);

    if (error) {
      return NextResponse.json(
        { error: `Import failed: ${error.message}` },
        { status: 500 }
      );
    }
  }

  /**
   * CRM tagging is best-effort and runs in small batches so a cohort import
   * doesn't fire hundreds of parallel requests at GoHighLevel. Portal access
   * is already granted by this point; a CRM hiccup must not undo it.
   */
  let ghlTagged = 0;
  let ghlMissing = 0;

  if (isGhlConfigured() && toInsert.length > 0) {
    const BATCH = 5;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH);
      const outcomes = await Promise.all(
        batch.map((r) => tagContactAsCertifiedFramer(r.email))
      );
      outcomes.forEach((o) => {
        if (o.status === "tagged") ghlTagged += 1;
        else if (o.status === "not_found") ghlMissing += 1;
      });
    }
  }

  const summary = {
    total: rows.length,
    added: results.filter((r) => r.status === "added").length,
    alreadyListed: results.filter((r) => r.status === "already_listed").length,
    invalid: results.filter((r) => r.status === "invalid").length,
    duplicate: results.filter((r) => r.status === "duplicate").length,
  };

  return NextResponse.json({
    ok: true,
    summary,
    results,
    ghl: isGhlConfigured()
      ? { configured: true, tagged: ghlTagged, notFound: ghlMissing }
      : { configured: false },
  });
}
