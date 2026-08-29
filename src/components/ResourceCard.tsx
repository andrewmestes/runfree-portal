"use client";

import type { ReactNode } from "react";

/**
 * One resource, as a card with a picture.
 *
 * Used by both the Reading & Pre-Work shelf and the dashboard's highlights,
 * because they are the same idea in two places and Andrew asked for the same
 * look in both: "I want the visual look on the dashboard to be nice with
 * either video thumbnails, thumbnails of the book titles, the first page of
 * another PDF, or the image of the handout."
 *
 * A second copy of this markup would have drifted inside a week — that is what
 * happened to `PanelRail` and `PanelStrip`, and why removing the count badges
 * from one silently left them on the other.
 */
export type ResourceMedia = "video" | "pdf" | "image" | "link" | "book";

export type ResourceCardProps = {
  title: string;
  note?: string | null;
  media: ResourceMedia;
  /** A resolved image URL: a signed cover, a Loom still, a brand asset. */
  art?: string | null;
  /** External destination, when the resource lives somewhere else. */
  href?: string | null;
  /** In-portal open, when we hold the bytes ourselves. Wins over `href`. */
  onOpen?: () => void;
  /** Rendered under the title — an Edit link, a Remove button. */
  actions?: ReactNode;
};

export default function ResourceCard({
  title,
  note,
  media,
  art,
  href,
  onOpen,
  actions,
}: ResourceCardProps) {
  const isVideo = media === "video";

  const media_ = (
    /* One shape for every card on a shelf: 2:3.

       This went through both wrong answers first. At 3:4 a book jacket floated
       with a lavender gutter down each side, and because the gutter's width
       depends on the source's exact ratio, two covers of the SAME book (the
       Future Church excerpts measure 0.646 and 0.647) sat fractionally
       differently and read as a bug. Giving videos their own 16:9 box fixed
       the jackets but broke the shelf: a row of tall books and short videos
       put every title at a different height, which looks like a mistake even
       though each card is individually correct.

       So: 2:3 throughout. A jacket fills it exactly. A 16:9 still letterboxes
       — but on a dark ground with a play button, which is what a video poster
       looks like anyway, so it reads as deliberate rather than as a picture
       that failed to fit. Every title in a row lands on the same line. */
    <span
      className={`relative block aspect-[2/3] overflow-hidden rounded-xl ring-1 transition ${
        isVideo
          ? "bg-runfree-navyDeep ring-runfree-navy/20 group-hover:ring-runfree-magenta/50"
          : "bg-runfree-indigo/40 ring-gray-200/80 group-hover:ring-runfree-magenta/40"
      }`}
    >
      {art ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={art}
          alt=""
          loading="lazy"
          className="h-full w-full object-contain"
        />
      ) : (
        <span
          className={`grid h-full w-full place-items-center ${
            isVideo ? "text-white/30" : "text-runfree-navy/25"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-10 w-10"
            aria-hidden="true"
          >
            {isVideo ? (
              <>
                <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
                <path d="M10.5 9.5v5l4-2.5z" />
              </>
            ) : media === "link" ? (
              <>
                <path d="M13.5 10.5 21 3" />
                <path d="M15 3h6v6" />
                <path d="M20 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5" />
              </>
            ) : (
              <>
                <path d="M14 3v5h5" />
                <path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z" />
              </>
            )}
          </svg>
        </span>
      )}

      {isVideo && art && (
        <span
          aria-hidden
          className="absolute inset-0 grid place-items-center transition group-hover:bg-runfree-ink/20"
        >
          <span className="grid h-11 w-11 place-items-center rounded-full bg-white/90 text-runfree-magentaDeep shadow-md">
            <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-5 w-5">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          </span>
        </span>
      )}
    </span>
  );

  const label = (
    <>
      <span className="mt-2.5 block text-sm font-semibold leading-snug text-runfree-ink">
        {title}
      </span>
      {note && (
        <span className="mt-1 line-clamp-3 block text-xs leading-relaxed text-gray-500">
          {note}
        </span>
      )}
    </>
  );

  return (
    <li className="min-w-0">
      {onOpen ? (
        <button onClick={onOpen} className="group block w-full text-left outline-none">
          {media_}
          {label}
        </button>
      ) : href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="group block outline-none">
          {media_}
          {label}
        </a>
      ) : (
        <span className="group block">
          {media_}
          {label}
        </span>
      )}
      {actions && <span className="mt-1.5 flex items-center gap-3">{actions}</span>}
    </li>
  );
}
