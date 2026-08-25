"use client";

import { useState } from "react";
import Image from "next/image";
import PdfThumbnail from "@/components/PdfThumbnail";
import type { BookFile, BookShelf as Shelf, BooksLibrary } from "@/lib/books";

/**
 * The books shelf — covers, the selected book, and its files.
 *
 * Extracted from the certification /books page so a Pivvot project can show
 * the same thing. Andrew: "add Will's Books to all the Pivvot projects ...
 * display the books just like they are displayed in the certification area."
 *
 * "Just like" is the whole reason this is a component rather than a second
 * copy of the markup. Two rendering paths for one thing is exactly how the
 * panel rail and the section strip drifted apart earlier in this project, and
 * how count badges survived being deleted from "the rail".
 *
 * What it deliberately does NOT own is fetching. The two callers reach
 * different endpoints — /api/books is gated on certification access,
 * /api/projects/{id}/books on project membership — so the data and the
 * byte-fetcher arrive as props and this stays presentational.
 */

// Static brand assets, not live-mirrored — book covers are design chrome,
// same reasoning as the Pivvot process icons: they don't change the way the
// underlying files do, so there's nothing to gain from fetching them live.
const COVERS: Record<string, string> = {
  "future church": "/brand/books/future-church.png",
  // .jpg rather than .png like the other five: the source is a 66KB Amazon
  // JPEG and re-encoding it to PNG would have quadrupled the file for no
  // visible gain. The table holds full paths, so the extension is free to
  // differ.
  "innovating discipleship": "/brand/books/innovating-discipleship.jpg",
  "church unique": "/brand/books/church-unique.png",
  "god dreams": "/brand/books/god-dreams.png",
  younique: "/brand/books/younique.png",
  calling: "/brand/books/calling.png",
};

function coverFor(name: string): string | null {
  return COVERS[name.toLowerCase().trim()] || null;
}

// Not part of the live-mirrored shelf — there's no Google Drive folder of
// chapters/resources for this one, just the book itself. Still sits on the
// shelf alongside the other four so it isn't a second-class citizen at the
// bottom of the page. Published by Will Mancini in May 2025, powered by the
// Younique framework — direct product link rather than a search URL since a
// confirmed one exists (amazonSearchUrl in lib/books.ts is for the mirrored
// books, which don't have one on hand).
const CALLING_ID = "calling";
const CALLING_BOOK = {
  id: CALLING_ID,
  name: "Calling",
  title: "Calling for the Best of Us",
  description:
    "An 8-week deployment system for activating the God-given design of every believer in your church, built on the Younique framework — from Will Mancini.",
  amazonUrl: "https://www.amazon.com/dp/B0F7Y76Y31",
};

function prettySize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BooksShelf({
  library,
  activeId,
  onSelect,
  onOpen,
  fetchBytes,
  onRefresh,
  refreshing = false,
}: {
  library: BooksLibrary;
  activeId: string;
  onSelect: (id: string) => void;
  /** Open a file in the caller's preview modal. */
  onOpen: (f: BookFile) => void;
  /** Authorised bytes for a file, for the first-page thumbnails. */
  fetchBytes: (id: string) => Promise<ArrayBuffer | null>;
  /** Omitted by callers with no business re-reading Drive. */
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  /**
   * Covers that 404'd. A title can reach the shelf before its artwork has
   * been saved, and a broken image icon reads as a fault where the name tile
   * reads as deliberate.
   */
  const [coverFailed, setCoverFailed] = useState<Set<string>>(new Set());

  const active: Shelf | null =
    [...library.books, ...library.standalone].find((b) => b.id === activeId) || null;

  return (
    <>
      {/* Shelf. Deliberately smaller than it was: at the old size the covers
          plus a centred refresh button filled an entire laptop screen, so a
          framer had to scroll before seeing a single chapter. It scrolls
          sideways on phones rather than wrapping to two ragged rows. */}
      <div className="-mx-4 mb-6 flex items-start gap-5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:justify-center sm:gap-8 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
        {/* Innovating Discipleship sits after Calling, where Andrew asked
            for it. It comes from library.standalone rather than
            library.books because it is one PDF rather than a folder of
            chapters — see STANDALONE_BOOKS in lib/books.ts. */}
        {[...library.books, CALLING_BOOK, ...library.standalone].map((b) => {
          const cover = coverFailed.has(b.id) ? null : coverFor(b.name);
          const isActive = b.id === activeId;
          return (
            <button
              key={b.id}
              onClick={() => onSelect(b.id)}
              aria-pressed={isActive}
              title={b.name}
              className="group flex w-16 shrink-0 flex-col items-center rounded-xl outline-none ring-runfree-magenta/60 focus-visible:ring-2 focus-visible:ring-offset-2 sm:w-24"
            >
              {/* Square corners and no ring: these are printed books, and a
                  rounded outline floating around a hard-cornered cover read
                  as a mismatched frame. Selection is carried by the lift and
                  the gradient rule beneath instead. */}
              <span
                className={`relative aspect-[2/3] w-16 shrink-0 transition duration-300 ease-out sm:w-24 ${
                  isActive
                    ? "-translate-y-1 scale-105 drop-shadow-lg"
                    : "opacity-70 group-hover:-translate-y-1 group-hover:scale-105 group-hover:opacity-100"
                }`}
              >
                {cover ? (
                  <Image
                    src={cover}
                    alt={`${b.name} cover`}
                    fill
                    sizes="(min-width: 640px) 96px, 64px"
                    className="object-contain"
                    onError={() =>
                      setCoverFailed((prev) => new Set(prev).add(b.id))
                    }
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-runfree-indigo p-2 text-center text-[10px] font-semibold text-runfree-navy">
                    {b.name}
                  </span>
                )}
              </span>

              <span
                aria-hidden
                className={`mt-2.5 h-[3px] w-full rounded-full transition-all duration-300 ${
                  isActive
                    ? "bg-runfree-grad opacity-100"
                    : "bg-transparent opacity-0"
                }`}
              />
            </button>
          );
        })}
      </div>

      {activeId === CALLING_ID && (
        <div className="animate-rise overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="h-1 bg-runfree-grad" />
          <div className="flex flex-col items-center gap-2 p-8 text-center sm:p-10">
            <Image
              src="/brand/books/calling.png"
              alt=""
              width={480}
              height={720}
              className="mb-2 h-24 w-auto rounded shadow-sm"
            />
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-runfree-magentaDeep">
              Also by Will Mancini
            </p>
            <h2 className="font-display text-2xl font-bold text-runfree-ink">
              {CALLING_BOOK.title}
            </h2>
            <p className="mx-auto mt-1 max-w-xl text-sm leading-relaxed text-gray-600">
              {CALLING_BOOK.description}
            </p>
            <a
              href={CALLING_BOOK.amazonUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-runfree-magentaDeep ring-1 ring-runfree-magenta/30 transition hover:bg-runfree-pink/40"
            >
              Buy on Amazon
              <ExternalIcon />
            </a>
          </div>
        </div>
      )}

      {active && (
        <div key={active.id} className="animate-rise space-y-8">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl font-extrabold text-runfree-ink">
              {active.name}
            </h2>
            <a
              href={active.amazonUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-runfree-magentaDeep ring-1 ring-runfree-magenta/30 transition hover:bg-runfree-pink/40"
            >
              Buy on Amazon
              <ExternalIcon />
            </a>
            {/* A maintenance control, so it sits with the other row actions
                rather than centred on its own under the shelf. Hidden entirely
                for callers that pass no handler — a church on a project has no
                business re-reading Drive, and a dead button is worse than
                none. */}
            {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 ring-1 ring-gray-200 transition hover:text-runfree-magentaDeep hover:ring-runfree-magenta/40 disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            )}
          </div>

          {/* Featured: visual summary + full book */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <VisualSummaryCard
              file={active.visualSummary}
              onOpen={onOpen}
              fetchBytes={fetchBytes}
            />
            <FeaturedCard
              label="Full Book"
              file={active.fullBook}
              emptyText="No full book file yet"
              onOpen={onOpen}
            />
          </div>

          {/* Chapters */}
          <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
            <div className="h-1 bg-runfree-grad" />
            <header className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
              <h2 className="font-display text-lg font-bold text-runfree-ink">
                Chapters
              </h2>
              <span className="rounded-full bg-runfree-indigo px-2.5 py-0.5 text-xs font-semibold text-runfree-navy">
                {active.chapters.length}
              </span>
            </header>

            {active.chapters.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-500">
                No chapters listed yet.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {active.chapters.map((f) => (
                  <li key={f.id}>
                    <button
                      onClick={() => onOpen(f)}
                      className="group flex w-full items-center gap-4 px-5 py-3 text-left transition hover:bg-runfree-pink/40"
                    >
                      <span
                        className={`w-10 shrink-0 font-display text-sm font-bold tabular-nums ${
                          f.num ? "text-runfree-magentaDeep" : "text-transparent"
                        }`}
                      >
                        {f.num || "—"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-runfree-ink">
                        {f.label}
                      </span>
                      <span className="hidden shrink-0 text-xs text-gray-500 sm:inline">
                        {prettySize(f.sizeBytes)}
                      </span>
                      <span className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-runfree-magentaDeep opacity-0 ring-1 ring-runfree-magenta/30 transition group-hover:opacity-100">
                        Preview
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Other: workbooks, bullet-books, anything that isn't a chapter */}
          {active.other.length > 0 && (
            <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
              <header className="border-b border-gray-100 px-5 py-4">
                <h2 className="font-display text-lg font-bold text-runfree-ink">
                  More from {active.name}
                </h2>
              </header>
              <ul className="divide-y divide-gray-100">
                {active.other.map((f) => (
                  <li key={f.id}>
                    <button
                      onClick={() => onOpen(f)}
                      className="group flex w-full items-center gap-4 px-5 py-3 text-left transition hover:bg-runfree-pink/40"
                    >
                      <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-runfree-ink">
                        {f.title}
                      </span>
                      <span className="hidden shrink-0 text-xs text-gray-500 sm:inline">
                        {prettySize(f.sizeBytes)}
                      </span>
                      <span className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-runfree-magentaDeep opacity-0 ring-1 ring-runfree-magenta/30 transition group-hover:opacity-100">
                        Preview
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function FeaturedCard({
  label,
  file,
  emptyText,
  onOpen,
}: {
  label: string;
  file: BookFile | null;
  emptyText: string;
  onOpen: (f: BookFile) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
      <div className="h-1 bg-runfree-grad" />
      <div className="p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-runfree-magentaDeep">
          {label}
        </p>
        {file ? (
          <>
            <h3 className="mt-1 font-display text-base font-bold text-runfree-ink">
              {file.title}
            </h3>
            <button
              onClick={() => onOpen(file)}
              className="mt-4 rounded-lg bg-runfree-grad px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Open
            </button>
          </>
        ) : (
          <p className="mt-2 text-sm text-gray-500">{emptyText}</p>
        )}
      </div>
    </div>
  );
}

/**
 * The visual summary is, well, visual — it deserves more than a text row.
 * The underlying files are PDFs (no page-image to thumbnail without adding
 * a rendering pipeline), so instead of a literal page preview this gives it
 * its own bold, infographic-styled tile so it reads as "the visual one" at
 * a glance rather than looking like just another download link.
 */
function VisualSummaryCard({
  file,
  onOpen,
  fetchBytes,
}: {
  file: BookFile | null;
  onOpen: (f: BookFile) => void;
  fetchBytes: (id: string) => Promise<ArrayBuffer | null>;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
      {file ? (
        // Laid out side by side rather than stacked. A full-width page preview
        // above the text pushed the chapter list off the bottom of the screen,
        // so the summary was showing at the cost of the thing most framers
        // came for. The page stays legible at this size, and clicking through
        // opens it full size.
        <button
          onClick={() => onOpen(file)}
          className="group flex w-full items-center gap-4 p-4 text-left outline-none ring-runfree-magenta/60 focus-visible:ring-2 focus-visible:ring-inset"
        >
          <span className="relative flex aspect-[16/10] w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-runfree-indigo ring-1 ring-black/5 sm:w-40">
            <PdfThumbnail
              fileId={file.id}
              fetchBytes={fetchBytes}
              width={320}
              sizeBytes={file.sizeBytes}
              className="h-full w-full object-contain"
              fallback={
                <span className="relative flex h-full w-full items-center justify-center overflow-hidden bg-runfree-grad">
                  <InfographicIcon />
                </span>
              }
            />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-runfree-magentaDeep">
              Visual Summary
            </span>
            <span className="mt-1 block font-display text-base font-bold leading-snug text-runfree-ink">
              {file.title}
            </span>
            <span className="mt-3 inline-block rounded-lg bg-runfree-grad px-4 py-1.5 text-sm font-semibold text-white transition group-hover:opacity-90">
              Open
            </span>
          </span>
        </button>
      ) : (
        <div className="p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-runfree-magentaDeep">
            Visual Summary
          </p>
          <p className="mt-2 text-sm text-gray-500">No visual summary yet</p>
        </div>
      )}
    </div>
  );
}

function InfographicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="relative h-10 w-10 text-white"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="18" rx="1.5" fill="currentColor" fillOpacity="0.9" />
      <rect x="12" y="9" width="7" height="12" rx="1.5" fill="currentColor" fillOpacity="0.65" />
      <circle cx="18.5" cy="4.5" r="2.5" fill="currentColor" fillOpacity="0.9" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        d="M7 4h9v9M16 4L4 16"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
