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
    label: "Portal Admin",
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
    hint: "Everything a certified framer has, plus the ability to create and run their own client projects. Their projects stay theirs — RunFree staff cannot see them, though a Portal Admin can for support.",
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
  const [sort, setSort] = useState<"first" | "last" | "role">("first");
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
            className="mt-6 inline-block rounded-lg bg-runfree-grad-deep px-4 py-2.5 text-sm font-medium text-white"
          >
            Back to your projects
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
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

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* The two screens that came over from the CVF portal. They manage
            different records than this page does — the certification roster
            and the video library — so they stay separate rather than being
            crammed into one list. */}
        <nav className="mb-6 flex flex-wrap gap-2">
          <span className="rounded-full bg-runfree-grad-deep px-3.5 py-1.5 text-xs font-semibold text-white">
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
              { key: "first", label: "First name" },
              { key: "last", label: "Last name" },
              { key: "role", label: "Permission" },
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
                    <span className="block truncate text-sm font-semibold text-runfree-ink">
                      {r.full_name || r.email}
                    </span>
                    <span className="block truncate text-xs text-gray-500">{r.email}</span>
                  </span>

                  <span className="flex flex-wrap items-center gap-1.5">
                    {r.isFramer && (
                      <span className="rounded-full bg-runfree-indigo px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-runfree-navy">
                        Certified
                      </span>
                    )}
                    {/* Andrew asked whether "client" should split into editor
                        and viewer. It cannot — those are per-project — but this
                        is the question underneath it: what does this person
                        actually hold, and where. */}
                    {(["admin", "editor", "viewer"] as const)
                      .filter((role) => (r.roleCounts[role] ?? 0) > 0)
                      .map((role) => (
                        <span
                          key={role}
                          title={r.projectNames.join(", ")}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            role === "admin"
                              ? "bg-runfree-magentaDeep text-white"
                              : role === "editor"
                                ? "bg-runfree-pink text-runfree-magentaDeep"
                                : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {role} on {r.roleCounts[role]}
                        </span>
                      ))}
                    {r.projectCount === 0 && (
                      <span className="text-[10px] font-medium uppercase tracking-wide text-gray-300">
                        No projects
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
        on ? "bg-runfree-grad-deep text-white" : "bg-white text-gray-500 ring-1 ring-gray-200 hover:text-runfree-ink"
      }`}
    >
      {children}
    </button>
  );
}
