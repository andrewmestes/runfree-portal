"use client";

import { useMemo, useRef, useState } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import {
  CATALOGUE_GROUPS,
  groupOf,
  type CatalogueEntry,
  type CatalogueGroup,
} from "@/lib/highlights";

/**
 * Pick from everything this project has.
 *
 * Andrew: "it would show up as a searchable pop-up or modal... I could filter
 * by PDFs, Will's books, and videos... I could search right there, find all of
 * the elements that I want, do a multi-select to assign all of them."
 *
 * The filters are one more than he asked for. Videos, books and files were his
 * three; the catalogue also holds 15 *exercises* — the Expectations Exercise,
 * Coffee Questions, Shark Tank — which are the most natural thing to hand a
 * team between sessions, and every past session recording, because "rewatch
 * the August 24 session" is a real assignment.
 */
export default function ResourcePicker({
  catalogue,
  alreadyKeys,
  booksLoading,
  onCancel,
  onAdd,
}: {
  catalogue: CatalogueEntry[];
  /** Keys already on the shelf — shown, but not selectable twice. */
  alreadyKeys: Set<string>;
  /** Will's Books is a live Drive read and arrives after the rest. */
  booksLoading: boolean;
  onCancel: () => void;
  onAdd: (entries: CatalogueEntry[]) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<CatalogueGroup | "all">("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, onCancel);

  const counts = useMemo(() => {
    const m = new Map<CatalogueGroup, number>();
    for (const e of catalogue) m.set(groupOf(e), (m.get(groupOf(e)) ?? 0) + 1);
    return m;
  }, [catalogue]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return catalogue.filter((e) => {
      if (group !== "all" && groupOf(e) !== group) return false;
      if (!needle) return true;
      return (
        e.title.toLowerCase().includes(needle) ||
        (e.context ?? "").toLowerCase().includes(needle)
      );
    });
  }, [catalogue, q, group]);

  function toggle(key: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await onAdd(catalogue.filter((e) => picked.has(e.key)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="animate-fade fixed inset-0 z-50 flex items-end justify-center bg-runfree-ink/80 p-0 sm:items-center sm:p-6"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="picker-title"
        tabIndex={-1}
        className="flex h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl outline-none sm:h-[80vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1.5 shrink-0 bg-runfree-grad" />

        <header className="shrink-0 border-b border-gray-100 px-4 py-3.5 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <h2
              id="picker-title"
              className="font-display text-lg font-extrabold tracking-tight text-runfree-ink"
            >
              Highlight resources
            </h2>
            <button
              onClick={onCancel}
              className="shrink-0 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-500 transition hover:text-runfree-magentaDeep"
            >
              Close
            </button>
          </div>

          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search everything on this project…"
            className="mt-3 w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
          />

          {/* Wraps rather than scrolls — six labels do not fit 375px, and a
              filter you cannot see is a filter you will not use. */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {([{ key: "all" as const, label: "Everything" }, ...CATALOGUE_GROUPS])
              // A filter that can only ever show nothing is worse than no
              // filter: it reads as "this project has no books" when the real
              // answer is usually "they have not arrived from Drive yet".
              .filter((g) => g.key === "all" || (counts.get(g.key) ?? 0) > 0 || (g.key === "books" && booksLoading))
              .map((g) => {
              const n = g.key === "all" ? catalogue.length : (counts.get(g.key) ?? 0);
              const on = group === g.key;
              const pending = g.key === "books" && booksLoading;
              return (
                <button
                  key={g.key}
                  onClick={() => setGroup(g.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    on
                      ? "bg-runfree-grad text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:text-runfree-ink"
                  }`}
                >
                  {g.label}
                  <span className={`ml-1.5 tabular-nums ${on ? "text-white/80" : "text-gray-400"}`}>
                    {pending ? "…" : n}
                  </span>
                </button>
              );
            })}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
          {group === "books" && booksLoading && (
            <p className="py-6 text-center text-sm text-gray-500">
              Fetching Will&rsquo;s Books&hellip;
            </p>
          )}

          {shown.length === 0 && !(group === "books" && booksLoading) ? (
            <p className="py-10 text-center text-sm text-gray-500">
              {q ? `Nothing matching “${q}”.` : "Nothing here to highlight."}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {shown.map((e) => {
                const already = alreadyKeys.has(e.key);
                const on = picked.has(e.key);
                return (
                  <li key={e.key}>
                    <button
                      disabled={already}
                      onClick={() => toggle(e.key)}
                      className={`flex w-full items-start gap-3 py-3 text-left transition ${
                        already ? "cursor-default opacity-45" : "hover:bg-runfree-indigo/20"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition ${
                          on
                            ? "border-runfree-magenta bg-runfree-magenta text-white"
                            : "border-gray-300 bg-white"
                        }`}
                      >
                        {(on || already) && (
                          <svg viewBox="0 0 20 20" fill="currentColor" className={`h-3.5 w-3.5 ${already && !on ? "text-gray-400" : ""}`}>
                            <path
                              fillRule="evenodd"
                              d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold leading-snug text-runfree-ink">
                          {e.title}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-gray-500">
                          {already ? "Already highlighted" : e.context}
                        </span>
                      </span>

                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                        {e.media_kind}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 sm:px-6">
          <span className="text-xs font-medium text-gray-500 tabular-nums">
            {picked.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="rounded-xl px-3.5 py-2.5 text-sm font-medium text-gray-600 transition hover:text-runfree-ink"
            >
              Cancel
            </button>
            <button
              disabled={picked.size === 0 || saving}
              onClick={save}
              className="rounded-xl bg-runfree-grad px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-40"
            >
              {saving ? "Adding…" : `Add ${picked.size || ""}`.trim()}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
