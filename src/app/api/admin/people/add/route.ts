import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { syncPersonToGHL, type GhlSyncResult } from "@/lib/ghl";
import { invitePerson } from "@/lib/invite";

/**
 * POST /api/admin/people/add
 *
 * Add one or many people from the People & Permissions screen, set each one's
 * permission level, and reconcile them with GoHighLevel.
 *
 * One route for both the single-person form and the CSV paste, because they
 * are the same operation with a different number of rows. Splitting them is
 * how the two drift until a bulk import quietly stops doing something the
 * single add does.
 *
 * Every row reports its own outcome. A spreadsheet kept by hand always has a
 * few bad rows, and "17 of 20 imported" without saying which three is not an
 * answer an admin can act on.
 *
 * Service role is unavoidable here: creating an auth user, and checking
 * whether an address already belongs to someone, are both things RLS
 * structurally cannot let a browser do — read_profiles only exposes your own
 * row, the owner's, and fellow project members'.
 */

/** Guards against a paste that would tie up the function for minutes. */
const MAX_ROWS = 500;

type AccountRole = "admin" | "runfree_team" | "framer_subscribed" | "framer" | "client";

const ROLES: AccountRole[] = ["admin", "runfree_team", "framer_subscribed", "framer", "client"];

/** Only these two levels earn the certified tag in the CRM. */
const CERTIFIED_ROLES: AccountRole[] = ["framer", "framer_subscribed"];

type Incoming = {
  email: string;
  name?: string | null;
  title?: string | null;
  role?: string | null;
};

type RowResult = {
  row: number;
  email: string;
  name: string;
  role: AccountRole | null;
  status: "created" | "updated" | "invalid" | "duplicate" | "failed";
  detail?: string;
  invited?: boolean;
  ghl?: GhlSyncResult;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Accept what an admin actually types.
 *
 * A CSV maintained by hand says "Site Admin" or "certified", not
 * "framer_subscribed". Rejecting those would make the import feel broken for
 * the most ordinary possible spreadsheet.
 */
function normaliseRole(raw: string | null | undefined): AccountRole | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((ROLES as string[]).includes(v)) return v as AccountRole;

  const aliases: Record<string, AccountRole> = {
    site_admin: "admin",
    portal_admin: "admin",
    runfree: "runfree_team",
    runfree_team_member: "runfree_team",
    team: "runfree_team",
    staff: "runfree_team",
    subscribed: "framer_subscribed",
    certified_framer_subscribed: "framer_subscribed",
    certified_framer: "framer",
    certified: "framer",
    certified_vision_framer: "framer",
    framer_certified: "framer",
    project_member: "client",
    participant: "client",
    member: "client",
    viewer: "client",
    client_: "client",
  };
  return aliases[v] ?? null;
}

async function requireAdmin(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;

  const { data: me } = await supabaseAdmin
    .from("profiles")
    .select("id, account_role, is_owner")
    .eq("id", user.id)
    .maybeSingle();

  return me?.is_owner || me?.account_role === "admin" ? me : null;
}

export async function POST(req: NextRequest) {
  const me = await requireAdmin(req);
  if (!me) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const rows: Incoming[] = Array.isArray(body?.people) ? body.people : [];
  /** Create contacts GHL doesn't have yet. Opt-in — see syncPersonToGHL. */
  const createInGhl = body?.createInGhl === true;
  /** Email an invitation now, rather than only creating the account. */
  const invite = body?.invite === true;

  if (rows.length === 0) {
    return NextResponse.json({ error: "No people supplied" }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `That's ${rows.length} rows; ${MAX_ROWS} is the limit for one import.` },
      { status: 400 }
    );
  }

  const results: RowResult[] = [];
  const seen = new Set<string>();

  for (const [i, raw] of rows.entries()) {
    const email = (raw.email ?? "").trim().toLowerCase();
    const name = (raw.name ?? "").trim();
    const title = (raw.title ?? "").trim() || null;
    const role = normaliseRole(raw.role);
    const base = { row: i + 1, email, name, role };

    if (!EMAIL.test(email)) {
      results.push({ ...base, status: "invalid", detail: "Not a valid email address" });
      continue;
    }
    if (!role) {
      results.push({
        ...base,
        status: "invalid",
        detail: `Permission missing or unrecognised${raw.role ? `: "${raw.role}"` : ""}`,
      });
      continue;
    }
    if (seen.has(email)) {
      results.push({ ...base, status: "duplicate", detail: "Appears earlier in this import" });
      continue;
    }
    seen.add(email);

    try {
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      let invited = false;

      if (existing) {
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({ account_role: role, ...(name ? { full_name: name } : {}) })
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
      } else {
        /**
         * Create the account first, then set the role.
         *
         * Not one step: handle_new_user() writes the profiles row from the
         * auth user, so no profile exists until after the auth insert — and
         * 033/034 have it inherit certification and name from the roster.
         * Setting the role in the same breath would race that trigger.
         */
        if (invite) {
          const result = await invitePerson(email, req.nextUrl.origin, name || undefined);
          if (result.outcome === "failed") {
            throw new Error(result.error ?? "Invitation failed");
          }
          invited = result.outcome === "sent";
        } else {
          const { error } = await supabaseAdmin.auth.admin.createUser({
            email,
            email_confirm: false,
            user_metadata: name ? { full_name: name } : {},
          });
          if (error) throw new Error(error.message);
        }

        const { data: made } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle();
        if (!made) throw new Error("Account created but no profile appeared");

        const { error: roleErr } = await supabaseAdmin
          .from("profiles")
          .update({ account_role: role, ...(name ? { full_name: name } : {}) })
          .eq("id", made.id);
        if (roleErr) throw new Error(roleErr.message);
      }

      /**
       * The certification roster is keyed by email and is what the CVF pages
       * read, so a certified role has to land there too — otherwise someone
       * reads as certified in the portal and is invisible to the library.
       */
      if (CERTIFIED_ROLES.includes(role)) {
        await supabaseAdmin
          .from("certified_framers")
          .upsert({ email, name: name || email }, { onConflict: "email" });
      }

      const ghl = await syncPersonToGHL({
        email,
        name,
        title,
        certified: CERTIFIED_ROLES.includes(role),
        createIfMissing: createInGhl,
      });

      results.push({ ...base, status: existing ? "updated" : "created", invited, ghl });
    } catch (err) {
      results.push({
        ...base,
        status: "failed",
        detail: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    results,
    summary: {
      created: results.filter((r) => r.status === "created").length,
      updated: results.filter((r) => r.status === "updated").length,
      failed: results.filter((r) => r.status === "failed" || r.status === "invalid").length,
    },
  });
}
