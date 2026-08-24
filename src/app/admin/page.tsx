"use client";

/**
 * One place for everybody, whichever side of the business they came from.
 *
 * Andrew: "a master admin section that covers both the project participants
 * as well as certified vision framers. And then access is allowed based on
 * permissions. All of these permissions are set whenever somebody is added
 * to a project or added to the whole thing manually from within the admin
 * section."
 *
 * The two portals used to answer "who is this person?" differently — the CVF
 * side by a row in certified_framers, this side by a project membership — so
 * the same human could exist twice with no single screen showing both. This
 * page is that screen: one row per profile, their account role, and what they
 * have on each side.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, type AccountRole } from "@/lib/supabase";
import { getCurrentProfile, getCurrentSession, logout } from "@/lib/auth";
import PortalHeader from "@/components/PortalHeader";
import PageLoader from "@/components/PageLoader";
import PortalFooter from "@/components/PortalFooter";
import AccessError from "@/components/AccessError";

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  is_staff: boolean;
  is_owner: boolean;
  certification_access: boolean;
  account_role: AccountRole;
};

type Row = Profile & {
  projectCount: number;
  projectNames: string[];
  /** Their per-project roles, counted — "Editor on 2, Viewer on 1". */
  roleCounts: Record<string, number>;
  isFramer: boolean;
};

/**
 * What someone is across the whole portal.
 *
 * `client` is labelled "Project Member" rather than split into editor and
 * viewer, which is what Andrew asked about. Those two are per-PROJECT roles —
 * the same person is an editor on one engagement and a viewer on another — so
 * they cannot also be an account role without meaning two different things at
 * once. The row shows what someone actually holds instead, which is the
 * question the split was really trying to answer.
 *
 * Descriptions say what the role can and cannot reach, in that order. "Every-
 * thing, everywhere" was true and useless.
 */
const ROLES: { value: AccountRole; label: string; hint: string }[] = [
  {
    value: "admin",
    label: "Site Admin",
    hint: "Manages people and permissions, edits templates and shared content, and can open a subscribed framer's projects to help them troubleshoot. Does not see other RunFree members' private projects.",
  },
  {
    value: "runfree_team",
    label: "RunFree Team",
    hint: "Creates and runs engagements, and sees anything shared team-wide. Full access to the certification library. Cannot change anyone's permissions.",
  },
  {
    value: "framer_subscribed",
    label: "Certified Framer — Subscribed",
    hint: "Everything a certified framer has, plus the ability to create and run their own client projects. Their projects stay theirs — RunFree staff cannot see them, though a Site Admin can for support.",
  },
  {
    value: "framer",
    label: "Certified Vision Framer",
    hint: "The certification library — handouts, training videos, Will's books and the Digital Facilitator's Guide. Joins a project only when invited to it.",
  },
  {
    value: "client",
    label: "Project Member",
    hint: "No portal-wide access at all. What they can do is decided project by project — view only, or edit — wherever they have been added.",
  },
];

export default function AdminPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<"checking" | "ready" | "denied" | "error">("checking");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AccountRole | "all">("all");
  // Permission first: this page exists to answer "who can reach what", and
  // grouping by permission answers it at a glance. Alphabetical is for
  // finding one known person, which is what the search box is for.
  const [sort, setSort] = useState<"first" | "last" | "role">("role");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const session = await getCurrentSession();
      if (!session) {
        router.replace("/auth/login");
        return;
      }
      const me = (await getCurrentProfile()) as Profile | null;
      if (!me) return setStatus("error");
      setProfile(me);

      // Only the owner may read every profile — read_profiles limits everyone
      // else to themselves and their fellow project members, so a non-admin
      // landing here sees a near-empty list rather than a permission error.
      if (!(me.is_owner || me.account_role === "admin")) return setStatus("denied");

      const [{ data: profiles }, { data: members }, { data: framers }, { data: projects }] =
        await Promise.all([
          supabase.from("profiles").select("*").order("email"),
          supabase.from("project_members").select("profile_id, project_id, role"),
          supabase.from("certified_framers").select("email"),
          supabase.from("projects").select("id, name"),
        ]);

      const projectName = new Map((projects ?? []).map((p) => [p.id, p.name as string]));
      const byProfile = new Map<string, string[]>();
      const rolesByProfile = new Map<string, Record<string, number>>();
      for (const m of members ?? []) {
        const list = byProfile.get(m.profile_id) ?? [];
        list.push(projectName.get(m.project_id) ?? "Untitled");
        byProfile.set(m.profile_id, list);

        const counts = rolesByProfile.get(m.profile_id) ?? {};
        counts[m.role] = (counts[m.role] ?? 0) + 1;
        rolesByProfile.set(m.profile_id, counts);
      }
      const framerEmails = new Set(
        (framers ?? []).map((f) => (f.email as string).toLowerCase())
      );

      setRows(
        (profiles ?? []).map((p) => ({
          ...(p as Profile),
          projectNames: byProfile.get(p.id) ?? [],
          projectCount: (byProfile.get(p.id) ?? []).length,
          roleCounts: rolesByProfile.get(p.id) ?? {},
          isFramer: framerEmails.has(p.email.toLowerCase()),
        }))
      );
      setStatus("ready");
    } catch (err) {
      console.error("Admin load failed:", err);
      setStatus("error");
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setRole(id: string, role: AccountRole) {
    setBusyId(id);
    try {
      const { error } = await supabase.from("profiles").update({ account_role: role }).eq("id", id);
      if (error) throw error;
      await load();
    } catch (err) {
      console.error("Role change failed:", err);
      alert("Couldn't change that role.");
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Correct a misspelled name.
   *
   * Andrew: "We may need a way to adjust the name if spelling is off. I know
   * that jacks with things looking at GHL, but if the email address can be the
   * main connection, the name might be changable here?"
   *
   * It can, and nothing overwrites it. Email is the key everywhere that
   * matters: the GHL webhook matches on it and only writes a name when
   * INSERTING a certified_framers row that didn't exist; handle_new_user
   * writes full_name once, on signup; and 034's backfill is guarded by
   * `full_name is null`. So a name corrected here survives a re-sync.
   *
   * This edits profiles.full_name — what the portal shows. It deliberately
   * does not touch certified_framers.name, which is CVF's table and GHL's to
   * own (see CLAUDE.md).
   */
  async function renamePerson(id: string, name: string) {
    const clean = name.trim();
    setBusyId(id);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: clean || null })
        .eq("id", id);
      if (error) throw error;
      await load();
    } catch (err) {
      console.error("Rename failed:", err);
      alert("Couldn't save that name.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(r: Row) {
    if (
      !confirm(
        `Remove ${r.full_name || r.email} completely?\n\nThis deletes their login, their project memberships and their place on the certification list. It cannot be undone.`
      )
    )
      return;
    setRemoving(r.id);
    try {
      const session = await getCurrentSession();
      const res = await fetch(`/api/admin/people?id=${r.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const body = await res.json();
      if (!res.ok) alert(body.error || "Couldn't remove them");
      else await load();
    } finally {
      setRemoving(null);
    }
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (filter !== "all" && r.account_role !== filter) return false;
      if (!q) return true;
      return (
        r.email.toLowerCase().includes(q) || (r.full_name ?? "").toLowerCase().includes(q)
      );
    });

    // Someone with no name sorts by the email, which is all we have to show.
    const first = (r: Row) => (r.full_name || r.email).trim().toLowerCase();
    const last = (r: Row) => {
      const parts = (r.full_name || "").trim().split(/\s+/).filter(Boolean);
      return (parts.length > 1 ? parts[parts.length - 1] : r.full_name || r.email)
        .toLowerCase();
    };
    const rank = (r: Row) => ROLES.findIndex((x) => x.value === r.account_role);

    return [...filtered].sort((a, b) => {
      if (sort === "role") return rank(a) - rank(b) || first(a).localeCompare(first(b));
      if (sort === "last") return last(a).localeCompare(last(b)) || first(a).localeCompare(first(b));
      return first(a).localeCompare(first(b));
    });
  }, [rows, query, filter, sort]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.account_role] = (c[r.account_role] ?? 0) + 1;
    return c;
  }, [rows]);

  if (status === "checking") return <PageLoader label="Loading admin…" />;
  if (status === "error") return <AccessError onRetry={load} />;

  if (status === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-200">
          <h1 className="font-display text-xl font-bold text-runfree-ink">Admins only</h1>
          <p className="mt-2 text-sm text-gray-600">
            This page manages everyone&rsquo;s access, so it is limited to RunFree admins.
          </p>
          <a
            href="/"
            className="mt-6 inline-block rounded-lg bg-runfree-grad px-4 py-2.5 text-sm font-medium text-white"
          >
            Back to your projects
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <PortalHeader
        profile={profile}
        onSignOut={async () => {
          await logout();
          router.replace("/auth/login");
        }}
        title="People &amp; Permissions"
        subtitle="Everyone with a RunFree login — church teams, the RunFree team, and certified vision framers — and what each of them can reach."
        certificationAccess
      />

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* The two screens that came over from the CVF portal. They manage
            different records than this page does — the certification roster
            and the video library — so they stay separate rather than being
            crammed into one list. */}
        <nav className="mb-6 flex flex-wrap gap-2">
          <span className="rounded-full bg-runfree-grad px-3.5 py-1.5 text-xs font-semibold text-white">
            People
          </span>
          <a
            href="/admin/framers"
            className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-500 ring-1 ring-gray-200 transition hover:text-runfree-ink"
          >
            Certified framers
          </a>
          <a
            href="/admin/videos"
            className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-500 ring-1 ring-gray-200 transition hover:text-runfree-ink"
          >
            Training videos
          </a>
        </nav>

        {/* Sits with the search and filters rather than as a banner above
            them — it is one action on this page, not its headline. */}
        {!adding && (
          <div className="mb-4">
            <button
              onClick={() => setAdding(true)}
              className="rounded-lg bg-runfree-grad px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              + Add people
            </button>
          </div>
        )}

        {adding && (
          <AddPeople
            onDone={() => {
              setAdding(false);
              void load();
            }}
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email"
            className="min-h-[44px] flex-1 rounded-xl border border-gray-300 px-3.5 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta sm:max-w-xs"
          />
          <div className="flex flex-wrap gap-1.5">
            <FilterChip on={filter === "all"} onClick={() => setFilter("all")}>
              All {rows.length}
            </FilterChip>
            {ROLES.map((r) => (
              <FilterChip
                key={r.value}
                on={filter === r.value}
                onClick={() => setFilter(r.value)}
              >
                {r.label} {counts[r.value] ?? 0}
              </FilterChip>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
            Sort by
          </span>
          {(
            [
              { key: "role", label: "Permission" },
              { key: "first", label: "First name" },
              { key: "last", label: "Last name" },
            ] as const
          ).map((o) => (
            <button
              key={o.key}
              onClick={() => setSort(o.key)}
              aria-pressed={sort === o.key}
              className={`min-h-[32px] rounded-full px-3 text-xs font-semibold transition ${
                sort === o.key
                  ? "bg-runfree-ink text-white"
                  : "bg-white text-gray-500 ring-1 ring-gray-200 hover:text-runfree-ink"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200">
          {shown.length === 0 ? (
            <p className="py-14 text-center text-sm text-gray-400">Nobody matches that.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {shown.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5">
                  <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                    {/* Editable in place. The email below it is the identity
                        and stays read-only — changing that would orphan the
                        person from their login and from GHL. */}
                    <input
                      defaultValue={r.full_name ?? ""}
                      placeholder={r.email}
                      aria-label={`Name for ${r.email}`}
                      disabled={busyId === r.id}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") {
                          e.currentTarget.value = r.full_name ?? "";
                          e.currentTarget.blur();
                        }
                      }}
                      onBlur={(e) => {
                        if (e.target.value.trim() === (r.full_name ?? "").trim()) return;
                        void renamePerson(r.id, e.target.value);
                      }}
                      className="block w-full truncate rounded-md bg-transparent px-1.5 py-0.5 text-sm font-semibold text-runfree-ink outline-none transition hover:bg-gray-100 focus:bg-white focus:ring-2 focus:ring-runfree-magenta disabled:opacity-50"
                    />
                    <span className="block truncate px-1.5 text-xs text-gray-500">{r.email}</span>
                  </span>

                  {/* Two standing facts about a person, and only those.
                      Certified in blue, Subscribed in green, both showing at
                      once for someone who is both — Andrew: "I like the blue
                      'certified' next to people's name. I want to make sure...
                      that a green 'subscribed' is also added. so someone with
                      both will have both show up there visually."

                      The per-project chips ("viewer on 2", "no projects") are
                      gone. They answered a different question from the one
                      this row asks, changed every time anyone joined a
                      project, and crowded out the two badges that matter.
                      Which projects someone is on is a property of the
                      project, and lives in Manage access there. */}
                  <span className="flex flex-wrap items-center gap-1.5">
                    {r.isFramer && (
                      <span className="rounded-full bg-runfree-indigo px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-runfree-navy">
                        Certified
                      </span>
                    )}
                    {r.account_role === "framer_subscribed" && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                        Subscribed
                      </span>
                    )}
                  </span>

                  <select
                    value={r.account_role}
                    disabled={busyId === r.id || r.id === profile?.id}
                    title={
                      r.id === profile?.id
                        ? "You cannot change your own role"
                        : ROLES.find((x) => x.value === r.account_role)?.hint
                    }
                    onChange={(e) => setRole(r.id, e.target.value as AccountRole)}
                    className="min-h-[40px] w-full rounded-lg border border-gray-300 px-2.5 text-xs font-medium text-runfree-ink outline-none focus:border-runfree-magenta disabled:bg-gray-50 disabled:text-gray-400 sm:w-auto"
                  >
                    {ROLES.map((x) => (
                      <option key={x.value} value={x.value}>
                        {x.label}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => remove(r)}
                    disabled={removing === r.id || r.id === profile?.id}
                    title={
                      r.id === profile?.id
                        ? "You cannot remove your own account"
                        : "Remove from the portal entirely"
                    }
                    className="min-h-[40px] shrink-0 rounded-md px-2.5 text-[11px] font-medium text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                  >
                    {removing === r.id ? "Removing…" : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-gray-200">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
            What each permission level means
          </h2>
          <dl className="mt-3 space-y-2">
            {ROLES.map((r) => (
              <div key={r.value} className="flex flex-col gap-x-4 gap-y-1 sm:flex-row">
                <dt className="shrink-0 text-sm font-semibold text-runfree-ink sm:w-56">
                  {r.label}
                </dt>
                <dd className="min-w-0 flex-1 text-sm leading-relaxed text-gray-600">{r.hint}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 border-t border-gray-100 pt-4 text-xs leading-relaxed text-gray-500">
            These say what someone is across the whole portal. What they can do inside any one
            engagement — view, edit, or manage its people — is set on that project itself, under
            Project access, and is shown beside their name above. Being a certified framer grants
            the library, never a project; those are always by invitation.
          </p>
        </div>
      </main>

      <PortalFooter />
    </div>
  );
}

function FilterChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-[36px] rounded-full px-3 text-xs font-semibold transition ${
        on ? "bg-runfree-grad text-white" : "bg-white text-gray-500 ring-1 ring-gray-200 hover:text-runfree-ink"
      }`}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Adding people                                                               */
/* -------------------------------------------------------------------------- */

type DraftPerson = { name: string; email: string; title: string; role: AccountRole };

const BLANK: DraftPerson = { name: "", email: "", title: "", role: "client" };

/**
 * Add people to the portal — one at a time, or a spreadsheet at once.
 *
 * Andrew: "I need to be able to add people to the site from here, also, the
 * ability to upload or import from a CSV would be great... when doing a bulk
 * import, we need to set permissions for everyone separately."
 *
 * So a pasted CSV becomes an editable table rather than being imported
 * blind. Permission is a dropdown on every row, defaulting to whatever the
 * CSV said and to Project Member when it said nothing — the safest level, and
 * the one most rows will be. Nothing is written until the table is reviewed
 * and submitted, because "import" that silently grants admin to a
 * mis-typed row is the failure worth designing out.
 */
function AddPeople({ onDone }: { onDone: () => void }) {
  const [rows, setRows] = useState<DraftPerson[]>([{ ...BLANK }]);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [createInGhl, setCreateInGhl] = useState(true);
  const [invite, setInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<
    | null
    | {
        results: {
          row: number;
          email: string;
          name: string;
          status: string;
          detail?: string;
          invited?: boolean;
          ghl?: { status: string; reason?: string; message?: string; tagged?: boolean };
        }[];
        summary: { created: number; updated: number; failed: number };
      }
  >(null);

  /**
   * Parse a pasted spreadsheet.
   *
   * Commas or tabs — copying a range straight out of Sheets gives tabs, which
   * is what someone will actually do before they ever export a .csv. Columns
   * are found by header rather than position, since that is the one thing
   * guaranteed to differ between two people's spreadsheets.
   */
  function parsePaste() {
    const lines = paste.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    const split = (l: string) => (l.includes("\t") ? l.split("\t") : l.split(","));
    const first = split(lines[0]).map((c) => c.trim().toLowerCase().replace(/^"|"$/g, ""));
    const looksLikeHeader = first.some((c) => /name|email|role|permission|title/.test(c));

    const idx = {
      name: looksLikeHeader ? first.findIndex((c) => /name/.test(c) && !/user/.test(c)) : 0,
      email: looksLikeHeader ? first.findIndex((c) => /e-?mail/.test(c)) : 1,
      title: looksLikeHeader ? first.findIndex((c) => /title|role at|position|job/.test(c)) : 2,
      role: looksLikeHeader
        ? first.findIndex((c) => /permission|access|level|^role$/.test(c))
        : 3,
    };

    const body = looksLikeHeader ? lines.slice(1) : lines;
    const parsed: DraftPerson[] = body.map((line) => {
      const cells = split(line).map((c) => c.trim().replace(/^"|"$/g, ""));
      const at = (i: number) => (i >= 0 ? (cells[i] ?? "") : "");
      return {
        name: at(idx.name),
        email: at(idx.email),
        title: at(idx.title),
        role: matchRole(at(idx.role)) ?? "client",
      };
    });

    if (parsed.length > 0) {
      // Replace a single empty starter row; otherwise append.
      const keep = rows.filter((r) => r.email.trim() || r.name.trim());
      setRows([...keep, ...parsed]);
      setPaste("");
      setShowPaste(false);
    }
  }

  async function submit() {
    const usable = rows.filter((r) => r.email.trim());
    if (usable.length === 0) return;
    setBusy(true);
    setResults(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/admin/people/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ people: usable, createInGhl, invite }),
      });
      const body = await res.json();
      if (!res.ok) {
        alert(body.error ?? "That import failed.");
        return;
      }
      setResults(body);
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm text-runfree-ink outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta";
  const ready = rows.filter((r) => r.email.trim()).length;

  return (
    <section className="mb-5 overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200">
      <div className="h-1 bg-runfree-grad" />
      <div className="space-y-4 p-5">
        {/* Typing one person in is the common case, so it leads. Andrew:
            "lead with the middle section up top. then offer the 'paste from a
            spreadsheet' option later." */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-separate border-spacing-y-1.5 text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
                <th className="pb-0.5 pr-2 font-bold">Name</th>
                <th className="pb-0.5 pr-2 font-bold">Email</th>
                <th className="pb-0.5 pr-2 font-bold">Title</th>
                <th className="pb-0.5 pr-2 font-bold">Permission</th>
                <th className="pb-0.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="pr-2">
                    <input
                      value={r.name}
                      onChange={(e) => setRows(edit(rows, i, { name: e.target.value }))}
                      placeholder="Full name"
                      className={field}
                    />
                  </td>
                  <td className="pr-2">
                    <input
                      type="email"
                      value={r.email}
                      onChange={(e) => setRows(edit(rows, i, { email: e.target.value }))}
                      placeholder="name@church.org"
                      className={field}
                    />
                  </td>
                  <td className="pr-2">
                    <input
                      value={r.title}
                      onChange={(e) => setRows(edit(rows, i, { title: e.target.value }))}
                      placeholder="Lead Pastor"
                      className={field}
                    />
                  </td>
                  <td className="pr-2">
                    <select
                      value={r.role}
                      onChange={(e) =>
                        setRows(edit(rows, i, { role: e.target.value as AccountRole }))
                      }
                      className={field}
                    >
                      {ROLES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {rows.length > 1 && (
                      <button
                        onClick={() => setRows(rows.filter((_, j) => j !== i))}
                        aria-label={`Remove row ${i + 1}`}
                        title="Remove"
                        className="grid h-8 w-8 place-items-center rounded-md text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <button
            onClick={() => setRows([...rows, { ...BLANK }])}
            className="font-semibold text-runfree-magentaDeep hover:underline"
          >
            + Another person
          </button>
          <span aria-hidden className="text-gray-300">
            ·
          </span>
          <button
            onClick={() => setShowPaste((v) => !v)}
            aria-expanded={showPaste}
            className="font-medium text-gray-500 transition hover:text-runfree-ink"
          >
            {showPaste ? "Hide spreadsheet paste" : "Paste from a spreadsheet"}
          </button>
        </div>

        {showPaste && (
          <div className="animate-fade rounded-xl bg-gray-50 p-3">
            <textarea
              rows={3}
              autoFocus
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={"Bobby Gourley, bobby@wearechapel.org, Lead Pastor, Project Member"}
              className={`${field} bg-white font-mono text-xs`}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                onClick={parsePaste}
                disabled={!paste.trim()}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-runfree-magentaDeep ring-1 ring-runfree-magenta/30 transition hover:bg-runfree-pink disabled:opacity-40"
              >
                Load into the table
              </button>
              <span className="text-[11px] text-gray-500">
                Name, email, title, permission. Commas or tabs, header row optional.
              </span>
            </div>
          </div>
        )}

        <div className="space-y-1.5 border-t border-gray-100 pt-4">
          <label className="flex items-start gap-2.5 text-sm text-runfree-ink">
            <input
              type="checkbox"
              checked={createInGhl}
              onChange={(e) => setCreateInGhl(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-runfree-magenta"
            />
            <span>
              Add to GoHighLevel if not already there
              <span className="mt-0.5 block text-xs text-gray-500">
                Matched on email, never duplicated. Only the two certified levels get the
                certified tag.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-sm text-runfree-ink">
            <input
              type="checkbox"
              checked={invite}
              onChange={(e) => setInvite(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-runfree-magenta"
            />
            <span>
              Email invitations now
              <span className="mt-0.5 block text-xs text-gray-500">
                Leave off for a big import — the mailer allows only a handful an hour. Accounts
                are created either way.
              </span>
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={submit}
            disabled={busy || ready === 0}
            className="min-h-[42px] rounded-xl bg-runfree-grad px-5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Adding…" : ready > 1 ? `Add ${ready} people` : "Add person"}
          </button>
          <button
            onClick={onDone}
            className="text-sm font-medium text-gray-500 transition hover:text-runfree-ink"
          >
            {results ? "Done" : "Cancel"}
          </button>
        </div>

        {results && (
          <div className="rounded-xl border border-gray-200 p-3.5">
            <p className="text-sm font-semibold text-runfree-ink">
              {results.summary.created} added · {results.summary.updated} updated ·{" "}
              {results.summary.failed} not done
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              {results.results.map((r) => (
                <li key={r.row} className="flex flex-wrap items-baseline gap-x-2">
                  <span
                    className={`font-semibold ${
                      r.status === "created" || r.status === "updated"
                        ? "text-runfree-magentaDeep"
                        : "text-red-600"
                    }`}
                  >
                    {r.status}
                  </span>
                  <span className="text-runfree-ink">{r.email || `row ${r.row}`}</span>
                  {r.detail && <span className="text-gray-500">— {r.detail}</span>}
                  {r.ghl && r.ghl.status !== "disabled" && (
                    <span className="text-gray-400">
                      · GHL: {r.ghl.status}
                      {r.ghl.tagged ? " (tagged)" : ""}
                      {r.ghl.message ? ` — ${r.ghl.message}` : ""}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function edit(rows: DraftPerson[], i: number, patch: Partial<DraftPerson>): DraftPerson[] {
  return rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
}

/** The same aliases the route accepts, so the table shows what will be saved. */
function matchRole(raw: string): AccountRole | null {
  const v = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const direct = ROLES.find((r) => r.value === v);
  if (direct) return direct.value;
  const byLabel = ROLES.find((r) => r.label.toLowerCase().replace(/[\s-]+/g, "_") === v);
  if (byLabel) return byLabel.value;
  const aliases: Record<string, AccountRole> = {
    site_admin: "admin",
    portal_admin: "admin",
    staff: "runfree_team",
    team: "runfree_team",
    runfree: "runfree_team",
    subscribed: "framer_subscribed",
    certified: "framer",
    certified_framer: "framer",
    participant: "client",
    member: "client",
    viewer: "client",
    project_member: "client",
  };
  return aliases[v] ?? null;
}
