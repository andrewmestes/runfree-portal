"use client";

import { useEffect, useState } from "react";
import ResourceCard from "./ResourceCard";
import PdfThumbnail from "./PdfThumbnail";
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
  onReorder,
  fetchPdfBytes,
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
  /** Persist a new order (ids, first to last). Drag, or the arrows. */
  onReorder?: (ids: string[]) => Promise<void>;
  /**
   * Authorised bytes for a PDF highlight, so its first page can be drawn as
   * the card's art when nothing else is. A Drive handout comes through
   * /handouts/file; a stored file through its signed URL.
   */
  fetchPdfBytes?: (h: Highlight) => Promise<ArrayBuffer | null>;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  // Local order so a drag lands instantly; the server's order wins whenever
  // the list itself changes (an add, a remove, a reload).
  const [order, setOrder] = useState<Highlight[]>(highlights);
  const ids = highlights.map((h) => h.id).join("|");
  useEffect(() => {
    setOrder(highlights);
  }, [ids, highlights]);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragTo, setDragTo] = useState<number | null>(null);
  const canSort = canManage && !!onReorder && order.length > 1;

  async function move(from: number, to: number) {
    if (from === to || to < 0 || to >= order.length) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrder(next);
    try {
      await onReorder?.(next.map((h) => h.id));
    } catch {
      setOrder(highlights);
    }
  }

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
          {order.map((h, index) => {
            const art =
              (h.thumb_path ? fileUrls[h.thumb_path] : undefined) ??
              h.thumb_url ??
              (h.external_url ? thumbs[h.external_url] : undefined);
            // A PDF with no cover draws its own first page. The cache key is
            // the file, not the highlight, so the same handout on two
            // projects renders once.
            const pdfKey = h.source_kind === "handout" ? h.source_id : h.file_path;
            const artNode =
              !art && h.media_kind === "pdf" && fetchPdfBytes && pdfKey ? (
                <PdfThumbnail
                  fileId={pdfKey}
                  fetchBytes={() => fetchPdfBytes(h)}
                  width={220}
                  sizeBytes={h.file_size}
                  className="h-full w-full object-contain"
                  fallback={
                    <span className="grid h-full w-full place-items-center text-runfree-navy/25">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10" aria-hidden="true">
                        <path d="M14 3v5h5" />
                        <path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z" />
                      </svg>
                    </span>
                  }
                />
              ) : undefined;
            const isDragging = dragFrom === index;
            const isTarget = dragTo === index && dragFrom !== null && dragFrom !== index;

            return (
              <ResourceCard
                key={h.id}
                title={h.title}
                note={h.note}
                media={h.media_kind}
                art={art}
                artNode={artNode}
                liProps={
                  canSort
                    ? {
                        draggable: true,
                        onDragStart: () => setDragFrom(index),
                        onDragEnter: () => dragFrom !== null && setDragTo(index),
                        onDragOver: (e) => dragFrom !== null && e.preventDefault(),
                        onDrop: (e) => {
                          if (dragFrom !== null && dragTo !== null) {
                            e.preventDefault();
                            void move(dragFrom, dragTo);
                          }
                          setDragFrom(null);
                          setDragTo(null);
                        },
                        onDragEnd: () => {
                          setDragFrom(null);
                          setDragTo(null);
                        },
                        className: `rounded-xl transition ${isDragging ? "opacity-40" : ""} ${
                          isTarget ? "ring-2 ring-runfree-magenta ring-offset-2" : ""
                        } cursor-grab active:cursor-grabbing`,
                      }
                    : undefined
                }
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
                    <span className="flex items-center gap-2">
                      {canSort && (
                        <>
                          <button
                            aria-label={`Move ${h.title} earlier`}
                            disabled={index === 0}
                            onClick={() => void move(index, index - 1)}
                            className="grid h-6 w-6 place-items-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-runfree-magentaDeep disabled:opacity-30"
                          >
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                              <path d="M12.5 4.5 7 10l5.5 5.5" />
                            </svg>
                          </button>
                          <button
                            aria-label={`Move ${h.title} later`}
                            disabled={index === order.length - 1}
                            onClick={() => void move(index, index + 1)}
                            className="grid h-6 w-6 place-items-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-runfree-magentaDeep disabled:opacity-30"
                          >
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                              <path d="M7.5 4.5 13 10l-5.5 5.5" />
                            </svg>
                          </button>
                        </>
                      )}
                      <button
                        disabled={busy === h.id}
                        aria-label={`Remove ${h.title}`}
                        onClick={async () => {
                          setBusy(h.id);
                          try {
                            await onRemove(h);
                          } finally {
                            setBusy(null);
                          }
                        }}
                        className="text-[11px] font-semibold text-gray-500 transition hover:text-runfree-magentaDeep disabled:opacity-50"
                      >
                        {busy === h.id ? "Removing…" : "Remove"}
                      </button>
                    </span>
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
