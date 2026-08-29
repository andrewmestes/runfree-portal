"use client";

import { useState } from "react";
import ResourceCard from "./ResourceCard";
import type { Highlight } from "@/lib/highlights";

/**
 * What matters right now, as pictures.
 *
 * Andrew: "I want it to be a visual overview of what is important right now as
 * they are moving forward in the process between sessions."
 *
 * This sits beside What's Important Now, and the split is deliberate. That
 * card answers *what do I owe* — things with a date and a tick-box, living in
 * `project_tasks`. This answers *what do I read and watch*, and carries no
 * done state at all, for the same reason the reading shelf lost its
 * checkboxes: nobody is marking a church's homework.
 *
 * The grid uses sized tracks rather than a fixed column count. With
 * `sm:grid-cols-3` the cards grew with the container, so three highlights on a
 * wide dashboard rendered as three enormous posters — Andrew: "the size of the
 * cards are a little obnoxious." Sized tracks keep a card a thumbnail at every
 * width: two across on a phone, as many as fit on a desktop.
 */
export default function HighlightShelf({
  highlights,
  canManage,
  fileUrls,
  thumbs,
  onOpen,
  onAdd,
  onRemove,
}: {
  highlights: Highlight[];
  /**
   * Admin on this project, or the owner — NOT merely an editor.
   *
   * Andrew: "I want to make sure that only project managers can see
   * 'highlight resources.'" An editor can be a non-staff client leading their
   * own process, and a church assigning itself homework is not what this is.
   * Migration 050 enforces the same rule in RLS, so this is presentation, not
   * protection.
   */
  canManage: boolean;
  /** Signed URLs for our own storage paths. */
  fileUrls: Record<string, string>;
  /** Loom stills, keyed by video URL. */
  thumbs: Record<string, string>;
  onOpen: (h: Highlight) => void;
  onAdd: () => void;
  onRemove: (h: Highlight) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  // Nothing highlighted and no right to highlight anything: the section would
  // be a heading over an empty box, so it does not render at all. An editor
  // still sees it, because the empty state is how they learn it exists.
  if (highlights.length === 0 && !canManage) return null;

  return (
    <section className="mt-8">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-runfree-magentaDeep">
            Between sessions
          </p>
          <h3 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-runfree-ink">
            Read &amp; Watch This
          </h3>
        </div>
        {canManage && (
          <button
            onClick={onAdd}
            className="shrink-0 rounded-xl bg-runfree-grad px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
          >
            Highlight resources
          </button>
        )}
      </header>

      {highlights.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 px-6 py-8 text-center text-sm text-gray-500">
          Nothing highlighted yet. Pick the handful of things this team should
          read or watch before you next meet — a chapter, a teaching, a deck.
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] items-start gap-x-4 gap-y-6">
          {highlights.map((h) => {
            const art =
              (h.thumb_path ? fileUrls[h.thumb_path] : undefined) ??
              h.thumb_url ??
              (h.external_url ? thumbs[h.external_url] : undefined);

            return (
              <ResourceCard
                key={h.id}
                title={h.title}
                note={h.note}
                media={h.media_kind}
                art={art}
                // A stored file or a book opens in the portal's own viewer;
                // anything else is somewhere else and says so by opening a tab.
                onOpen={
                  h.file_path || h.source_kind === "book" || h.source_kind === "handout"
                    ? () => onOpen(h)
                    : undefined
                }
                href={h.external_url}
                actions={
                  canManage ? (
                    <button
                      disabled={busy === h.id}
                      onClick={async () => {
                        setBusy(h.id);
                        try {
                          await onRemove(h);
                        } finally {
                          setBusy(null);
                        }
                      }}
                      className="text-[11px] font-semibold text-gray-400 transition hover:text-runfree-magentaDeep disabled:opacity-50"
                    >
                      {busy === h.id ? "Removing…" : "Remove"}
                    </button>
                  ) : undefined
                }
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
