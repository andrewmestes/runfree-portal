"use client";

import { useState } from "react";
import { RAG_DOT, RAG_LABEL, updateStep, type RagStatus } from "@/lib/execution";
import type { MyStep } from "@/lib/my-steps";
import { isDateish, prettyDate } from "./execution/ui";

/**
 * The action steps assigned to you, wherever you happen to be looking.
 *
 * Andrew: "the Action Steps that are assigned to people, could possibly live
 * in their 'dashboard' as tasks to complete or update, possibly syncing in
 * some way to the team's overall view of the Horizon Storyline."
 *
 * There is no sync, because there is no copy — this renders the same
 * `initiative_steps` rows the Horizon Storyline board renders. Moving a light
 * here moves it on the board. Mirroring these into `project_tasks` would have
 * recreated the exact problem migrations 040/041 existed to end: "currently
 * there's three different places where they're looking for next steps."
 *
 * Two tones because it appears on the navy What's Important Now card and on
 * the white /my-work page. One component, two palettes — the alternative is
 * how `PanelRail` and `PanelStrip` drifted.
 */
export default function AssignedSteps({
  steps,
  accessToken,
  tone,
  canUpdate,
  showProject = false,
  onChanged,
  onOpen,
}: {
  steps: MyStep[];
  accessToken: string | null;
  tone: "navy" | "light";
  /** may_manage_tasks — the same grant that lets you tick a task. */
  canUpdate: boolean;
  showProject?: boolean;
  onChanged: () => void;
  /** Jump to the initiative on the board. Omitted where there is nowhere to go. */
  onOpen?: (s: MyStep) => void;
}) {
  /**
   * Steps ticked green during this visit.
   *
   * The list excludes green rows, so the moment a light went green the row
   * vanished under the thumb that moved it — no confirmation, no way back
   * from a mis-tap. These stay in place, struck through, with an Undo, until
   * the page is next loaded.
   */
  const [justDone, setJustDone] = useState<MyStep[]>([]);
  const navy = tone === "navy";
  const rows = [
    ...steps,
    ...justDone.filter((d) => !steps.some((s) => s.id === d.id)),
  ];
  if (rows.length === 0) return null;

  return (
    <ul className="space-y-1.5">
      {rows.map((s) => {
        const done = s.status === "green";
        const overdue = !done && isDateish(s.by_when) && (s.by_when as string) <= todayIso();
        return (
          <li
            key={s.id}
            className={`flex items-start gap-3 rounded-xl px-3 py-2.5 ${
              navy ? "bg-white/10" : "bg-white ring-1 ring-gray-200"
            } ${done ? "opacity-70" : ""}`}
          >
            <StepLight
              value={s.status}
              navy={navy}
              disabled={done || !canUpdate || !accessToken}
              onChange={async (v) => {
                if (!accessToken) return;
                if (v === "green") setJustDone((prev) => [...prev, { ...s, status: "green" }]);
                await updateStep(accessToken, s.id, { status: v });
                onChanged();
              }}
            />
            <div className="min-w-0 flex-1">
              {onOpen && !done ? (
                <button
                  onClick={() => onOpen(s)}
                  className={`block w-full text-left text-sm font-medium hover:underline ${
                    navy ? "text-white" : "text-runfree-ink"
                  }`}
                >
                  {s.description}
                </button>
              ) : (
                <span
                  className={`block text-sm font-medium ${navy ? "text-white" : "text-runfree-ink"} ${
                    done ? "line-through" : ""
                  }`}
                >
                  {s.description}
                </span>
              )}
              <p
                className={`mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] ${
                  navy ? "text-white/70" : "text-gray-500"
                }`}
              >
                {done && accessToken && (
                  <button
                    onClick={async () => {
                      await updateStep(accessToken, s.id, { status: "amber" });
                      setJustDone((prev) => prev.filter((d) => d.id !== s.id));
                      onChanged();
                    }}
                    className={`font-semibold underline-offset-2 hover:underline ${
                      navy ? "text-runfree-pink" : "text-runfree-magentaDeep"
                    }`}
                  >
                    Done — undo
                  </button>
                )}
                {showProject && s.project && <span>{s.project.name}</span>}
                {s.initiative && <span>{s.initiative.name}</span>}
                {s.by_when && (
                  <span className={overdue ? (navy ? "text-rose-300" : "text-rose-600") : ""}>
                    {isDateish(s.by_when) ? `by ${prettyDate(s.by_when)}` : s.by_when}
                  </span>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The traffic light, compact.
 *
 * Not the three-circle `RagPicker` from the board: in a list of things you
 * owe, three circles per row is a wall of dots. Here it is one dot that
 * advances red → amber → green, with the current state named in its title —
 * the board is where you see all three at once and choose deliberately.
 */
function StepLight({
  value,
  navy,
  disabled,
  onChange,
}: {
  value: RagStatus;
  navy: boolean;
  disabled: boolean;
  onChange: (v: RagStatus) => void;
}) {
  const next: Record<RagStatus, RagStatus> = { red: "amber", amber: "green", green: "red" };
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? RAG_LABEL[value] : `${RAG_LABEL[value]} — tap for ${RAG_LABEL[next[value]].toLowerCase()}`}
      aria-label={RAG_LABEL[value]}
      onClick={() => onChange(next[value])}
      className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full transition ${
        disabled ? "cursor-default" : navy ? "hover:bg-white/15" : "hover:bg-gray-100"
      }`}
    >
      <span
        className={`h-3.5 w-3.5 rounded-full ring-1 ${RAG_DOT[value]} ${
          navy ? "ring-white/30" : "ring-black/10"
        }`}
      />
    </button>
  );
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
