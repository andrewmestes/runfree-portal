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
  isFramer: boolean;
};

const ROLES: { value: AccountRole; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Everything, everywhere." },
  { value: "runfree_team", label: "RunFree team", hint: "Creates projects; sees team-wide work." },
  {
    value: "framer_subscribed",
    label: "Framer — subscribed",
    hint: "Certification content, and runs their own client projects.",
  },
  { value: "framer", label: "Certified Vision Framer", hint: "Certification content only." },
  { value: "client", label: "Client", hint: "Only what a project gives them." },
];

export default function AdminPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<"checking" | "ready" | "denied" | "error">("checking");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AccountRole | "all">("all");
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
          supabase.from("project_members").select("profile_id, project_id"),
          supabase.from("certified_framers").select("email"),
          supabase.from("projects").select("id, name"),
        ]);

      const projectName = new Map((projects ?? []).map((p) => [p.id, p.name as string]));
      const byProfile = new Map<string, string[]>();
      for (const m of members ?? []) {
        const list = byProfile.get(m.profile_id) ?? [];
        list.push(projectName.get(m.project_id) ?? "Untitled");
        byProfile.set(m.profile_id, list);
      }
      const framerEmails = new Set(
        (framers ?? []).map((f) => (f.email as string).toLowerCase())
      );

      setRows(
        (profiles ?? []).map((p) => ({
          ...(p as Profile),
          projectNames: byProfile.get(p.id) ?? [],
          projectCount: (byProfile.get(p.id) ?? []).length,
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

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.account_role !== filter) return false;
      if (!q) return true;
      return (
        r.email.toLowerCase().includes(q) || (r.full_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, filter]);

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
        title="Everyone"
        subtitle="Project participants and certified vision framers, in one list."
        certificationAccess
      />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
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

        <div className="mt-5 overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200">
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
                    {r.projectCount > 0 && (
                      <span
                        title={r.projectNames.join(", ")}
                        className="rounded-full bg-runfree-pink px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-runfree-magentaDeep"
                      >
                        {r.projectCount} project{r.projectCount === 1 ? "" : "s"}
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
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-gray-200">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
            What each role means
          </h2>
          <dl className="mt-3 space-y-2">
            {ROLES.map((r) => (
              <div key={r.value} className="flex flex-wrap gap-x-3">
                <dt className="w-44 shrink-0 text-sm font-semibold text-runfree-ink">{r.label}</dt>
                <dd className="min-w-0 flex-1 text-sm text-gray-600">{r.hint}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-gray-500">
            A role here says what someone is across the whole portal. What they can do on any one
            project — view, edit, or manage people — is set on that project, under Project access.
            A certified framer still has to be invited to each project they work on.
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
