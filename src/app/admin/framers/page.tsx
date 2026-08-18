"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCurrentFramer, isPortalAdmin, logout } from "@/lib/auth";
import PortalHeader from "@/components/PortalHeader";
import AccessError from "@/components/AccessError";
import { parseCsv } from "@/lib/csv";

type ImportRowResult = {
  row: number;
  email: string;
  name: string;
  status: "added" | "already_listed" | "invalid" | "duplicate" | "failed";
  detail?: string;
};

type ImportResponse = {
  summary: {
    total: number;
    added: number;
    alreadyListed: number;
    invalid: number;
    duplicate: number;
  };
  results: ImportRowResult[];
  ghl?: { configured: boolean; tagged?: number; notFound?: number };
};

type AccountStatus = "no_account" | "pending" | "confirmed";

type Framer = {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  created_at: string;
  hasAccount: boolean;
  accountStatus: AccountStatus;
};

type Me = { id: string; email: string; name: string; is_admin: boolean };

type SortKey = "name" | "email" | "status" | "added" | "role";
type SortDir = "asc" | "desc";

const STATUS_LABEL: Record<AccountStatus, string> = {
  confirmed: "Signed up",
  pending: "Unconfirmed",
  no_account: "Not signed up yet",
};

const STATUS_STYLE: Record<AccountStatus, string> = {
  confirmed: "bg-green-50 text-green-700 ring-green-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  no_account: "bg-gray-100 text-gray-600 ring-gray-200",
};

/** Least-far-along first, so the people needing a nudge sort to the top. */
const STATUS_RANK: Record<AccountStatus, number> = {
  no_account: 0,
  pending: 1,
  confirmed: 2,
};

export default function FramersAdminPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [framers, setFramers] = useState<Framer[]>([]);
  const [ghlConfigured, setGhlConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  // Set when init() throws outright, so the page stops on a retry screen
  // instead of sitting on its loader with nothing left to set it false.
  const [fatal, setFatal] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("added");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const [inviteOnAdd, setInviteOnAdd] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);

  const router = useRouter();

  const authedFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/auth/login");
        throw new Error("No session");
      }

      return fetch(url, {
        ...init,
        headers: {
          ...(init?.headers || {}),
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
      });
    },
    [router]
  );

  const load = useCallback(async () => {
    const res = await authedFetch("/api/admin/framers");
    const body = await res.json();

    if (!res.ok) {
      setError(body.error || "Could not load the list.");
      return;
    }

    setFramers(body.framers || []);
    setGhlConfigured(Boolean(body.ghlConfigured));
  }, [authedFetch]);

  useEffect(() => {
    async function init() {
      const current = (await getCurrentFramer()) as Me | null;

      if (!(await isPortalAdmin())) {
        router.replace("/");
        return;
      }

      setMe(current);
      await load();
      setLoading(false);
    }

    init().catch((err) => {
      console.error("Admin framers init failed:", err);
      setFatal(true);
      setLoading(false);
    });
  }, [router, load]);

  async function handleSignOut() {
    await logout();
    router.replace("/auth/login");
  }

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(""), 5000);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setWarning("");
    setAdding(true);

    try {
      const res = await authedFetch("/api/admin/framers", {
        method: "POST",
        body: JSON.stringify({
          email: newEmail,
          name: newName,
          invite: inviteOnAdd,
        }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Could not add them.");
        return;
      }

      const email = newEmail.trim().toLowerCase();
      const tagged = body.ghl === "tagged" ? " and tagged in GoHighLevel" : "";

      flash(
        body.invited === "sent"
          ? `${email} was added${tagged} — invitation sent.`
          : body.invited === "already_has_login"
            ? `${email} was added${tagged}. They already have a login, so no invitation was needed.`
            : `${email} was added${tagged}. Use Invite when you're ready to email them.`
      );
      if (body.warning) setWarning(body.warning);
      setNewEmail("");
      setNewName("");
      await load();
    } catch (err) {
      setError(
        err instanceof Error && err.message !== "No session"
          ? err.message
          : "Something went wrong. Check your connection and try again."
      );
    } finally {
      setAdding(false);
    }
  }

  async function toggleAdmin(f: Framer) {
    setError("");
    setBusyId(f.id);

    try {
      const res = await authedFetch("/api/admin/framers", {
        method: "PATCH",
        body: JSON.stringify({ id: f.id, isAdmin: !f.is_admin }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Could not update them.");
        return;
      }

      await load();
    } catch (err) {
      setError(
        err instanceof Error && err.message !== "No session"
          ? err.message
          : "Something went wrong. Check your connection and try again."
      );
    } finally {
      setBusyId(null);
    }
  }

  /** One button, two emails — see the PUT handler for why they differ. */
  async function sendEmail(f: Framer) {
    const invite = f.accountStatus === "no_account";
    setError("");
    setWarning("");
    setSendingId(f.id);

    try {
      const res = await authedFetch("/api/admin/framers", {
        method: "PUT",
        body: JSON.stringify({
          email: f.email,
          action: invite ? "invite" : "login",
        }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Could not send that email.");
        return;
      }

      flash(
        invite
          ? `Invite sent to ${f.email}.`
          : `Password link sent to ${f.email} — they can set or reset their password with it.`
      );
      await load();
    } catch (err) {
      setError(
        err instanceof Error && err.message !== "No session"
          ? err.message
          : "Something went wrong. Check your connection and try again."
      );
    } finally {
      setSendingId(null);
    }
  }

  async function remove(f: Framer) {
    setError("");
    setWarning("");
    setBusyId(f.id);

    try {
      const res = await authedFetch(`/api/admin/framers?id=${f.id}`, {
        method: "DELETE",
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Could not remove them.");
        return;
      }

      flash(`${f.email} no longer has access.`);
      if (body.warning) setWarning(body.warning);
      setConfirmId(null);
      await load();
    } catch (err) {
      setError(
        err instanceof Error && err.message !== "No session"
          ? err.message
          : "Something went wrong. Check your connection and try again."
      );
    } finally {
      setBusyId(null);
    }
  }

  /** Parsed live so the admin sees the row count before committing. */
  const parsed = useMemo(
    () => (csvText.trim() ? parseCsv(csvText) : null),
    [csvText]
  );

  async function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setCsvText(await file.text());
    // Let the same file be picked again after a correction.
    e.target.value = "";
  }

  async function runImport() {
    if (!parsed || parsed.rows.length === 0) return;
    setError("");
    setWarning("");
    setImportResult(null);
    setImporting(true);

    try {
      const res = await authedFetch("/api/admin/framers/import", {
        method: "POST",
        body: JSON.stringify({ rows: parsed.rows }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Could not import that file.");
        return;
      }

      setImportResult(body);
      flash(
        `${body.summary.added} added from ${body.summary.total} row${body.summary.total === 1 ? "" : "s"}.`
      );
      await load();
    } catch (err) {
      setError(
        err instanceof Error && err.message !== "No session"
          ? err.message
          : "Something went wrong. Check your connection and try again."
      );
    } finally {
      setImporting(false);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Names read naturally A-Z; dates read naturally newest-first.
      setSortDir(key === "added" ? "desc" : "asc");
    }
  }

  const counts = useMemo(() => {
    const c = { all: framers.length, confirmed: 0, pending: 0, no_account: 0 };
    for (const f of framers) c[f.accountStatus] += 1;
    return c;
  }, [framers]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const filtered = framers.filter((f) => {
      if (statusFilter !== "all" && f.accountStatus !== statusFilter) {
        return false;
      }
      if (!needle) return true;
      return (
        f.email.toLowerCase().includes(needle) ||
        f.name.toLowerCase().includes(needle)
      );
    });

    const dir = sortDir === "asc" ? 1 : -1;

    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return dir * a.name.localeCompare(b.name);
        case "email":
          return dir * a.email.localeCompare(b.email);
        case "status":
          return (
            dir * (STATUS_RANK[a.accountStatus] - STATUS_RANK[b.accountStatus]) ||
            a.name.localeCompare(b.name)
          );
        case "role":
          return (
            dir * (Number(b.is_admin) - Number(a.is_admin)) ||
            a.name.localeCompare(b.name)
          );
        case "added":
        default:
          return (
            dir *
            (new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          );
      }
    });
  }, [framers, query, statusFilter, sortKey, sortDir]);

  if (fatal) {
    return <AccessError onRetry={() => window.location.reload()} />;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-1.5 w-24 rounded-full bg-runfree-grad" />
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader
        framer={me}
        onSignOut={handleSignOut}
        title="Certified Vision Framers"
        subtitle="Who can get into the portal"
        backHref="/admin"
        backLabel="← Admin"
      />

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {warning && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {warning}
          </div>
        )}
        {notice && (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {notice}
          </div>
        )}

        {/* Add someone */}
        <div className="mb-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="h-1.5 bg-runfree-grad" />
          <form onSubmit={handleAdd} className="p-6">
            <h2 className="font-display text-lg font-bold text-runfree-ink">
              Add a Certified Vision Framer
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              They&rsquo;ll get an email invitation and set their own password —
              you don&rsquo;t set one for them.
              {ghlConfigured
                ? " They'll also be tagged in GoHighLevel as a Certified Vision Framer."
                : ""}
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Full name"
                required
                className="min-w-[10rem] flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none transition placeholder:text-gray-500 focus:border-runfree-magenta focus:ring-2 focus:ring-runfree-magenta/25"
              />
              <input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                type="email"
                placeholder="name@church.org"
                required
                className="min-w-[14rem] flex-[1.4] rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none transition placeholder:text-gray-500 focus:border-runfree-magenta focus:ring-2 focus:ring-runfree-magenta/25"
              />
              <button
                type="submit"
                disabled={adding}
                className="rounded-lg bg-runfree-grad-deep px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {adding
                  ? inviteOnAdd
                    ? "Adding & inviting…"
                    : "Adding…"
                  : inviteOnAdd
                    ? "Add & invite"
                    : "Add"}
              </button>
            </div>

            {/* Opt-out rather than opt-in: adding someone nearly always means
                letting them in, and a separate Invite click was easy to
                forget. Unticking is for the case where certification isn't
                finished yet and access should wait. */}
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={inviteOnAdd}
                onChange={(e) => setInviteOnAdd(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-runfree-magenta focus:ring-runfree-magenta/40"
              />
              Email them an invitation now
            </label>

            {!ghlConfigured && (
              <p className="mt-3 text-xs text-gray-500">
                GoHighLevel tagging is off — set{" "}
                <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px]">
                  GHL_API_KEY
                </code>{" "}
                and{" "}
                <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px]">
                  GHL_LOCATION_ID
                </code>{" "}
                to have new framers tagged in the CRM automatically.
              </p>
            )}
          </form>
        </div>

        {/* Bulk import */}
        <div className="mb-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="h-1.5 bg-runfree-grad" />
          <div className="p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-lg font-bold text-runfree-ink">
                Import a cohort
              </h2>
              <button
                onClick={() => setImportOpen((v) => !v)}
                className="ml-auto rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 ring-1 ring-gray-200 transition hover:text-runfree-magentaDeep hover:ring-runfree-magenta/40"
              >
                {importOpen ? "Close" : "Import CSV"}
              </button>
            </div>

            {importOpen && (
              <div className="mt-4 space-y-4">
                <p className="text-sm leading-relaxed text-gray-600">
                  Paste rows or choose a .csv file. A header row is optional —
                  columns named <em>name</em> and <em>email</em> are detected,
                  and otherwise whichever cell looks like an address is used.
                  Unlike adding one person, importing doesn&rsquo;t email
                  anyone — a cohort of forty invitations at once would hit your
                  mail provider&rsquo;s rate limit and most would silently never
                  arrive. Import the list, then invite from the table below.
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    onChange={handleCsvFile}
                    className="text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-runfree-pink file:px-4 file:py-2 file:text-sm file:font-semibold file:text-runfree-magentaDeep hover:file:bg-runfree-pink/70"
                  />
                </div>

                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  rows={6}
                  spellCheck={false}
                  placeholder={"name,email\nJane Smith,jane@church.org\nSam Lee,sam@church.org"}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 font-mono text-xs outline-none transition placeholder:text-gray-500 focus:border-runfree-magenta focus:ring-2 focus:ring-runfree-magenta/25"
                />

                {parsed && (
                  <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700">
                    <strong className="font-semibold text-runfree-ink">
                      {parsed.rows.length}
                    </strong>{" "}
                    {parsed.rows.length === 1 ? "person" : "people"} found
                    {parsed.detected.email &&
                      ` · email column "${parsed.detected.email}"`}
                    {parsed.detected.name &&
                      ` · name column "${parsed.detected.name}"`}
                    {parsed.skipped > 0 &&
                      ` · ${parsed.skipped} line${parsed.skipped === 1 ? "" : "s"} with no email skipped`}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={runImport}
                    disabled={!parsed || parsed.rows.length === 0 || importing}
                    className="rounded-lg bg-runfree-grad-deep px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                  >
                    {importing
                      ? "Importing…"
                      : parsed
                        ? `Import ${parsed.rows.length}`
                        : "Import"}
                  </button>
                  {csvText && (
                    <button
                      onClick={() => {
                        setCsvText("");
                        setImportResult(null);
                      }}
                      className="text-sm text-gray-500 transition hover:text-gray-700"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {importResult && (
                  <div className="rounded-lg border border-gray-200 bg-white">
                    <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-gray-100 px-4 py-3 text-sm">
                      <span className="font-semibold text-green-700">
                        {importResult.summary.added} added
                      </span>
                      {importResult.summary.alreadyListed > 0 && (
                        <span className="text-gray-500">
                          {importResult.summary.alreadyListed} already listed
                        </span>
                      )}
                      {importResult.summary.duplicate > 0 && (
                        <span className="text-gray-500">
                          {importResult.summary.duplicate} repeated in file
                        </span>
                      )}
                      {importResult.summary.invalid > 0 && (
                        <span className="text-red-600">
                          {importResult.summary.invalid} invalid
                        </span>
                      )}
                      {importResult.ghl?.configured && (
                        <span className="text-gray-500">
                          {importResult.ghl.tagged} tagged in GoHighLevel
                          {importResult.ghl.notFound
                            ? `, ${importResult.ghl.notFound} not found there`
                            : ""}
                        </span>
                      )}
                    </div>

                    {importResult.results.some(
                      (r) => r.status === "invalid" || r.status === "duplicate"
                    ) && (
                      <ul className="max-h-40 divide-y divide-gray-100 overflow-y-auto text-sm">
                        {importResult.results
                          .filter(
                            (r) =>
                              r.status === "invalid" || r.status === "duplicate"
                          )
                          .map((r) => (
                            <li
                              key={`${r.row}-${r.email}`}
                              className="flex items-center gap-3 px-4 py-2"
                            >
                              <span className="w-12 shrink-0 text-xs text-gray-500">
                                Row {r.row}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-gray-600">
                                {r.email || r.name || "(blank)"}
                              </span>
                              <span className="shrink-0 text-xs text-red-600">
                                {r.detail || r.status}
                              </span>
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full max-w-xs rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none transition placeholder:text-gray-500 focus:border-runfree-magenta focus:ring-2 focus:ring-runfree-magenta/25"
          />

          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", `All ${counts.all}`],
                ["confirmed", `Signed up ${counts.confirmed}`],
                ["pending", `Unconfirmed ${counts.pending}`],
                ["no_account", `Not signed up ${counts.no_account}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                aria-pressed={statusFilter === key}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  statusFilter === key
                    ? "bg-runfree-grad-deep text-white shadow-sm"
                    : "bg-white text-gray-600 ring-1 ring-gray-200 hover:ring-runfree-magenta/40"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="flex items-center gap-x-4 border-b border-gray-100 bg-gray-50/70 px-6 py-2.5">
            <SortHeader
              className="min-w-[12rem] flex-1"
              label="Name"
              active={sortKey === "name"}
              dir={sortDir}
              onClick={() => toggleSort("name")}
            />
            <SortHeader
              className="hidden w-32 sm:block"
              label="Status"
              active={sortKey === "status"}
              dir={sortDir}
              onClick={() => toggleSort("status")}
            />
            <SortHeader
              className="hidden w-24 lg:block"
              label="Role"
              active={sortKey === "role"}
              dir={sortDir}
              onClick={() => toggleSort("role")}
            />
            <SortHeader
              className="hidden w-28 lg:block"
              label="Added"
              active={sortKey === "added"}
              dir={sortDir}
              onClick={() => toggleSort("added")}
            />
            {/* Aligns the header row with the action buttons below it, which
                only sit in a fixed column once there's room for them. */}
            <span className="hidden w-[13rem] shrink-0 lg:block" />
          </div>

          {shown.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-gray-500">
              {framers.length === 0 ? "Nobody on the list yet." : "No matches."}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {shown.map((f) => {
                const isSelf = f.id === me?.id;
                const busy = busyId === f.id;
                const needsEmail = f.accountStatus !== "confirmed";

                return (
                  <li
                    key={f.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4 transition hover:bg-gray-50/60"
                  >
                    <div className="min-w-[12rem] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-runfree-ink">
                          {f.name}
                        </span>
                        {isSelf && (
                          <span className="text-xs text-gray-500">(you)</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">{f.email}</div>
                    </div>

                    <span
                      className={`w-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 sm:w-32 ${
                        STATUS_STYLE[f.accountStatus]
                      }`}
                    >
                      {STATUS_LABEL[f.accountStatus]}
                    </span>

                    <span className="hidden w-24 shrink-0 lg:block">
                      {f.is_admin ? (
                        <span className="rounded-full bg-runfree-pink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-runfree-magentaDeep">
                          Admin
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">Framer</span>
                      )}
                    </span>

                    <span className="hidden w-28 shrink-0 text-xs text-gray-500 lg:block">
                      {new Date(f.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>

                    <div className="flex w-full shrink-0 items-center gap-2 lg:w-[13rem] lg:justify-end">
                      {needsEmail && (
                        <button
                          onClick={() => sendEmail(f)}
                          disabled={sendingId === f.id}
                          title={
                            f.accountStatus === "no_account"
                              ? "Email them an invite to join the portal"
                              : "Email a link they can use to set or reset their password"
                          }
                          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-runfree-magentaDeep ring-1 ring-runfree-magenta/30 transition hover:bg-runfree-pink/40 disabled:opacity-50"
                        >
                          {sendingId === f.id
                            ? "Sending…"
                            : f.accountStatus === "no_account"
                              ? "Invite"
                              : "Password link"}
                        </button>
                      )}

                      <button
                        onClick={() => toggleAdmin(f)}
                        disabled={busy || isSelf}
                        title={
                          isSelf
                            ? "You can't change your own admin access"
                            : undefined
                        }
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200 transition hover:text-runfree-magentaDeep hover:ring-runfree-magenta/40 disabled:opacity-40 disabled:hover:text-gray-600 disabled:hover:ring-gray-200"
                      >
                        {f.is_admin ? "Unadmin" : "Make admin"}
                      </button>

                      {confirmId === f.id ? (
                        <span className="flex items-center gap-1.5">
                          <button
                            onClick={() => remove(f)}
                            disabled={busy}
                            className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                          >
                            {busy ? "…" : "Confirm"}
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            className="text-xs text-gray-500 hover:text-gray-700"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmId(f.id)}
                          disabled={busy || isSelf}
                          title={
                            isSelf ? "You can't remove your own access" : undefined
                          }
                          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 ring-1 ring-red-200 transition hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-gray-500">
          <strong className="font-semibold text-gray-600">Invite</strong> emails
          someone who has never created a login.{" "}
          <strong className="font-semibold text-gray-600">Password link</strong>{" "}
          is for everyone else — it lets someone who was invited but never
          finished set a first password, and someone already signed up reset a
          forgotten one.
          Removing someone revokes portal access immediately but leaves their
          login intact, so re-adding them later just works. To delete an account
          outright, use Authentication → Users in Supabase.
        </p>
      </main>
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  className = "",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-1 text-left text-[11px] font-bold uppercase tracking-wider transition ${
        active
          ? "text-runfree-magentaDeep"
          : "text-gray-500 hover:text-runfree-ink"
      } ${className}`}
    >
      {label}
      <span
        aria-hidden
        className={`text-[9px] transition ${
          active ? "opacity-100" : "opacity-0 group-hover:opacity-40"
        }`}
      >
        {active && dir === "asc" ? "▲" : "▼"}
      </span>
    </button>
  );
}
