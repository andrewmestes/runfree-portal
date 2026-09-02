"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentProfile, getCurrentSession, getCurrentUser, logout } from "@/lib/auth";
import { listTasksOwedByRunFree, setTaskDone, type OwedTask } from "@/lib/projects";
import PortalHeader from "@/components/PortalHeader";
import AssignedSteps from "@/components/AssignedSteps";
import { listMyActionSteps, type MyStep } from "@/lib/my-steps";
import PortalFooter from "@/components/PortalFooter";
import PageLoader from "@/components/PageLoader";
import AccessError from "@/components/AccessError";

/**
 * What RunFree owes, across every engagement.
 *
 * Andrew: "it might be nice as a RunFree team member, or subscribed level
 * permission person, to have their own dashboard of tasks needed from all
 * clients."
 *
 * Grouped by WHEN, not by which church. The question this page answers is
 * "what do I need to do", and a coach with six engagements does not think in
 * projects when they open it — they think in deadlines. The church is context
 * on the row rather than the organising principle. Overdue leads, because an
 * overdue promise to a client is the single most expensive thing on here.
 *
 * Only tasks owned by "runfree" appear. A church's own homework is theirs to
 * see on their project, not ours to carry around.
 */
type Group = { key: string; label: string; hint: string; tasks: OwedTask[] };

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function parseDue(due: string | null): number | null {
  if (!due) return null;
  const [y, m, d] = due.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getTime();
}

function groupTasks(tasks: OwedTask[]): Group[] {
  const today = startOfToday();
  const weekOut = today + 7 * 24 * 60 * 60 * 1000;

  const overdue: OwedTask[] = [];
  const soon: OwedTask[] = [];
  const later: OwedTask[] = [];
  const undated: OwedTask[] = [];

  for (const t of tasks) {
    const due = parseDue(t.due_on);
    if (due === null) undated.push(t);
    else if (due < today) overdue.push(t);
    else if (due <= weekOut) soon.push(t);
    else later.push(t);
  }

  return [
    { key: "overdue", label: "Overdue", hint: "Past the date we gave them.", tasks: overdue },
    { key: "soon", label: "Next seven days", hint: "Due this week.", tasks: soon },
    { key: "later", label: "Later", hint: "Dated, but not yet.", tasks: later },
    { key: "undated", label: "No date", hint: "Owed, but never scheduled.", tasks: undated },
  ].filter((g) => g.tasks.length > 0);
}

function formatDue(due: string | null): string {
  const t = parseDue(due);
  if (t === null) return "";
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function MyWorkPage() {
  const [tasks, setTasks] = useState<OwedTask[]>([]);
  /**
   * Horizon Storyline steps assigned to me, across every engagement.
   *
   * A church person meets these on their own project dashboard; this page is
   * RunFree-only and exists for someone carrying several engagements at once,
   * so their steps belong here beside what they owe.
   */
  const [mySteps, setMySteps] = useState<MyStep[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  /** Held so the step list can write back without re-fetching the session. */
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<Parameters<typeof PortalHeader>[0]["profile"] | null>(null);
  const [status, setStatus] = useState<"checking" | "denied" | "ready" | "error">("checking");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    const session = await getCurrentSession();
    if (!session) return;
    setTasks(await listTasksOwedByRunFree(session.access_token));
  }, []);

  const loadSteps = useCallback(async (profileId: string) => {
    const session = await getCurrentSession();
    if (!session) return;
    setToken(session.access_token);
    try {
      setMySteps(await listMyActionSteps(session.access_token, profileId));
    } catch {
      // A missing list is not worth a broken page.
    }
  }, []);

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser();
      if (!user) {
        router.replace("/auth/login");
        return;
      }

      const prof = (await getCurrentProfile()) as
        | { is_staff?: boolean; account_role?: string; full_name?: string; email?: string }
        | null;

      // RunFree people only. A church has one engagement and sees what we owe
      // them on their own dashboard; this view exists for someone carrying
      // several at once.
      const isRunFree =
        !!prof?.is_staff ||
        ["admin", "runfree_team"].includes(prof?.account_role ?? "");
      if (!isRunFree) {
        setStatus("denied");
        return;
      }

      setProfile(prof as never);
      const id = (prof as { id?: string } | null)?.id ?? null;
      setMyId(id);
      if (id) void loadSteps(id);
      await load();
      setStatus("ready");
    }

    init().catch(() => setStatus("error"));
  }, [router, load]);

  async function complete(task: OwedTask) {
    const session = await getCurrentSession();
    if (!session) return;
    setBusy(task.id);
    setActionError(null);
    try {
      await setTaskDone(session.access_token, task.id, true);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (err) {
      // set_task_done raises for a caller without the task grant; the tick
      // used to do nothing at all.
      setActionError(err instanceof Error ? err.message : "Could not mark that done.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSignOut() {
    await logout();
    router.replace("/auth/login");
  }

  if (status === "error") return <AccessError onRetry={() => window.location.reload()} />;
  if (status === "checking") return <PageLoader />;
  if (status === "denied") {
    router.replace("/");
    return <PageLoader />;
  }

  const groups = groupTasks(tasks);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <PortalHeader
        profile={profile}
        onSignOut={handleSignOut}
        title="My Tasks"
        subtitle="Everything RunFree owes, across every engagement"
        backHref="/"
        backLabel="Your projects"
      />

      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        {actionError && (
          <p
            role="alert"
            className="mb-6 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200"
          >
            {actionError}
          </p>
        )}
        {mySteps.length > 0 && (
          <section className="mb-8">
            <header className="mb-3 flex flex-wrap items-baseline gap-x-3">
              <h2 className="font-display text-lg font-bold tracking-tight text-runfree-ink">
                Assigned to you
              </h2>
              <span className="text-xs text-gray-500">
                Horizon Storyline action steps with your name on them.
              </span>
            </header>
            <AssignedSteps
              steps={mySteps}
              accessToken={token}
              tone="light"
              canUpdate
              showProject
              onChanged={() => myId && void loadSteps(myId)}
            />
          </section>
        )}

        {tasks.length === 0 && mySteps.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center">
            <p className="font-display text-lg font-semibold text-runfree-ink">Nothing owed</p>
            <p className="mt-2 text-sm text-gray-500">
              Every church is waiting on nothing. Tasks appear here when a session assigns
              something to RunFree.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map((g) => (
              <section key={g.key}>
                <header className="mb-3 flex flex-wrap items-baseline gap-x-3">
                  <h2
                    className={`font-display text-lg font-bold tracking-tight ${
                      g.key === "overdue" ? "text-runfree-magentaDeep" : "text-runfree-ink"
                    }`}
                  >
                    {g.label}
                  </h2>
                  <span className="text-xs text-gray-500">{g.hint}</span>
                </header>

                <ul className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
                  {g.tasks.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-start gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0"
                    >
                      <button
                        onClick={() => complete(t)}
                        disabled={busy === t.id}
                        aria-label={`Mark "${t.title}" done`}
                        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md ring-1 ring-gray-300 transition hover:ring-runfree-magenta disabled:opacity-40"
                      >
                        <span className="sr-only">Done</span>
                      </button>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug text-runfree-ink">
                          {t.title}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                          {t.project && (
                            <a
                              href={`/projects/${t.project.id}`}
                              className="font-semibold text-runfree-magentaDeep hover:underline"
                            >
                              {churchNameOf(t.project.name)}
                            </a>
                          )}
                          {t.due_on && (
                            <>
                              <span aria-hidden>·</span>
                              <span
                                className={
                                  g.key === "overdue" ? "font-semibold text-runfree-magentaDeep" : ""
                                }
                              >
                                {formatDue(t.due_on)}
                              </span>
                            </>
                          )}
                          {t.section && (
                            <>
                              <span aria-hidden>·</span>
                              <span>{t.section}</span>
                            </>
                          )}
                        </p>
                        {t.notes && (
                          <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-gray-500">
                            {t.notes}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>

      <PortalFooter />
    </div>
  );
}

/** "Christ Chapel - Pivvot Vision Framing" -> "Christ Chapel". */
function churchNameOf(name: string): string {
  return name.split(/\s+-\s+/)[0].trim() || name;
}
