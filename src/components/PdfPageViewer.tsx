"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A PDF drawn page-by-page into canvases, stacked in a scrolling column.
 *
 * This exists because of iOS. Andrew, on a phone: "the pop up opens like on
 * desktop, but the page is zoomed in significantly ... i was unable to scroll
 * to see the additional pages in a pdf."
 *
 * Both symptoms are one long-standing WebKit behaviour: an <iframe> holding a
 * PDF is not a scrollable viewer on iOS. Safari lays the document out at its
 * own natural page width and ignores the frame's size — hence the zoom — and
 * it does not propagate scrolling inside the frame, so page two onwards is
 * simply unreachable. The `#navpanes=0` hint in the iframe URL is a
 * Chrome/Acrobat parameter; iOS ignores it too.
 *
 * Rendering ourselves fixes both properly rather than working around either:
 * each page is rasterised to exactly the container's width, and the pages are
 * ordinary elements in an ordinary scrolling div.
 *
 * Pages render lazily, on approach. PdfThumbnail already learned the hard way
 * that decoding is the expensive part — "the 168-page Facilitator's Guide
 * fetches in a few seconds but takes far longer than anyone will wait to
 * decode" — so rendering all of them up front would hang the phone on exactly
 * the document most worth reading on one.
 */
type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => {
      width: number;
      height: number;
      // pdfjs-dist 6 has only the point form; convertToViewportRectangle is gone.
      convertToViewportPoint: (x: number, y: number) => number[];
    };
    render: (o: Record<string, unknown>) => { promise: Promise<void> };
    getAnnotations: (o?: { intent?: string }) => Promise<
      { subtype?: string; rect: number[]; url?: string; dest?: string | unknown[] | null }[]
    >;
    cleanup: () => boolean;
  }>;
  getDestination: (id: string) => Promise<unknown[] | null>;
  getPageIndex: (ref: unknown) => Promise<number>;
};

/** A link box over a drawn page, in percent of the page so it stays aligned
 *  when a rotation rescales the image. `url` leaves the document; `dest` is a
 *  jump to another page of it. */
type PageLink = {
  left: number;
  top: number;
  w: number;
  h: number;
  url?: string;
  dest?: string | unknown[];
};

/** Retina, but capped: a 3x canvas of an A4 page is a lot of pixels to hold. */
const MAX_DPR = 2;

/** Height/width of US Letter portrait: the placeholder shape when the
 *  document's own could not be read. */
const LETTER_RATIO = 11 / 8.5;

/**
 * pdf.js has hung in production in this app before — PdfThumbnail carries the
 * scar: "pdf.js can sit forever without resolving or rejecting ... these
 * previews never appear while the same code renders them locally." A preview
 * that never arrives is worse than a zoomed-in one, so give up and let the
 * caller fall back to the native viewer, which at least shows page one.
 */
const PARSE_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("pdf parse timed out")), ms)
    ),
  ]);
}

export default function PdfPageViewer({
  blobUrl,
  onFail,
}: {
  blobUrl: string;
  /** Called if the document cannot be parsed, so the caller can fall back. */
  onFail?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [width, setWidth] = useState(0);
  /**
   * Page one's height/width, which every undrawn page borrows as its
   * placeholder shape. A guessed shape lurches the reader once jumpTo lands
   * past pages that have not drawn: scrolling back up draws each one, and
   * the guide's pages are all 4:3 landscape, so every Letter-shaped
   * placeholder above shrank by 186px on a phone (418px on an iPad) and
   * dragged the page being read down with it. Scroll anchoring cannot hold
   * it, because the shrinking page is itself the anchor, and iOS Safari has
   * no scroll anchoring at all.
   */
  const [docRatio, setDocRatio] = useState(LETTER_RATIO);
  // FilePreview passes a fresh arrow on every render. As an effect dependency
  // that re-parsed the whole document each time the page behind re-rendered —
  // and now that cleanup destroys the document, it would pull it out from
  // under the pages still on screen.
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;

  useEffect(() => {
    let cancelled = false;
    /**
     * Every getDocument without a shared worker port starts its own Web
     * Worker, and only destroy() ends it. Never calling it left one worker,
     * and every page it had decoded, alive per preview opened — on the phones
     * this viewer exists for, until iOS's canvas budget ran out and pages
     * silently stayed placeholders. Destroying on cleanup also stops a parse
     * still running when the preview is closed.
     */
    let task: { destroy: () => Promise<void> } | null = null;

    (async () => {
      // The caller already holds an authorised blob; read it back as bytes
      // rather than changing its contract or fetching the file twice.
      const bytes = new Uint8Array(await (await fetch(blobUrl)).arrayBuffer());
      if (cancelled) return;

      // The legacy build: the modern one calls brand-new functions (Map.getOrInsertComputed,
      // Promise.withResolvers, Uint8Array.fromBase64) with no fallback, so on any Safari
      // short of the very latest it could not start and the guide never appeared (a
      // framer on an iPhone, 25 Sept 2026). The legacy build carries polyfills for them.
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      if (cancelled) return;
      pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.legacy.min.mjs";
      const loading = pdfjs.getDocument({ data: bytes });
      task = loading;
      const loaded = (await withTimeout(
        loading.promise,
        PARSE_TIMEOUT_MS
      )) as unknown as PdfDoc;
      if (cancelled) return;
      // Only the page's size, not a render, so this is one worker round trip.
      // Its own guard: a document whose first page will not report its size
      // still reads, with Letter placeholders as before.
      let ratio = LETTER_RATIO;
      try {
        const first = await withTimeout(loaded.getPage(1), PARSE_TIMEOUT_MS);
        const v = first.getViewport({ scale: 1 });
        if (v.width > 0 && v.height > 0) ratio = v.height / v.width;
      } catch {
        // Keep Letter.
      }
      if (cancelled) return;
      setDocRatio(ratio);
      setDoc(loaded);
    })().catch(() => {
      if (!cancelled) onFailRef.current?.();
    });

    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [blobUrl]);

  // Measure once the column exists. Rotating the phone rescales the bitmaps
  // via CSS rather than re-rendering them — slightly softer, and far cheaper
  // than re-rasterising every visible page on every orientation change.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]);

  /**
   * A jump inside the document — the guide's contents page and its
   * cross-references (456 of them across 171 pages). Without this, reaching
   * Module 6 on a phone meant scrolling past 147 pages. The target's
   * placeholder already reserves its height, so the jump lands on the right
   * page before that page has drawn.
   */
  const jumpTo = async (dest: string | unknown[]) => {
    if (!doc) return;
    const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(explicit)) return;
    const idx =
      typeof explicit[0] === "number" ? explicit[0] : await doc.getPageIndex(explicit[0]);
    goToPage(idx + 1);
  };

  /**
   * Which page is on screen, and a box to go to any page. Andrew picked
   * "page numbers and a go-to-page box in the guide viewer" as the next
   * thing to build: in a room, "turn to page 88" meant scrolling a phone
   * past 87 pages. The page counted as current is the one crossing a line a
   * third of the way down the viewport — what a reader thinks of as "the
   * page I'm on" when two are half visible — and at the very end of the
   * document, the last page.
   */
  const [current, setCurrent] = useState(1);
  const [draft, setDraft] = useState("1");
  const [editing, setEditing] = useState(false);
  /** Set once the box is typed in, so leaving it commits only a real entry. */
  const typedRef = useRef(false);
  /**
   * The page a jump asked for, and the scroll position it landed on. Near the
   * end a page cannot always reach the top: on a phone, 171 lands with 171
   * and 172 both in full view, where the end rule alone read 172 and Next
   * from 170 skipped 171. Until the reader moves, the counter says the page
   * they asked for.
   */
  const jumpedRef = useRef<{ page: number; top: number } | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !doc) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const line = host.scrollTop + host.clientHeight / 3;
        const items = host.querySelectorAll<HTMLElement>("li[data-page]");
        let page = 1;
        for (const li of items) {
          if (li.offsetTop <= line) page = Number(li.dataset.page) + 1;
          else break;
        }
        // At the end of the document nothing further can reach the line, so the
        // last page or two never counted ("Page 1 of 2" with page 2 in full view).
        // Only when the document actually scrolls: one that fits on screen starts at 1.
        if (
          items.length > 0 &&
          host.scrollHeight > host.clientHeight + 2 &&
          host.scrollTop + host.clientHeight >= host.scrollHeight - 2
        ) {
          page = items.length;
        }
        const jumped = jumpedRef.current;
        if (jumped && Math.abs(host.scrollTop - jumped.top) <= 2) page = jumped.page;
        else jumpedRef.current = null;
        setCurrent(page);
      });
    };
    onScroll();
    host.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      host.removeEventListener("scroll", onScroll);
    };
  }, [doc, width]);
  useEffect(() => {
    if (!editing) setDraft(String(current));
  }, [current, editing]);

  const goToPage = (n: number) => {
    if (!doc) return;
    const page = Math.min(Math.max(1, Math.round(n)), doc.numPages);
    const host = hostRef.current;
    host?.querySelector(`[data-page="${page - 1}"]`)?.scrollIntoView({ block: "start" });
    // An instant scrollIntoView has already moved scrollTop, so this is
    // where the jump landed.
    if (host) jumpedRef.current = { page, top: host.scrollTop };
    setCurrent(page);
  };

  return (
    <div className="flex h-full flex-col bg-gray-100">
      {doc && doc.numPages > 1 && (
        <div className="flex shrink-0 items-center justify-center gap-2 border-b border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600">
          <button
            type="button"
            onClick={() => goToPage(current - 1)}
            disabled={current <= 1}
            aria-label="Previous page"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-runfree-ink transition hover:bg-gray-100 disabled:opacity-30"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12.5 4.5L7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              // Leaving the box is what commits it (see onBlur), so Return and
              // Go just leave it.
              (document.activeElement as HTMLElement | null)?.blur();
            }}
            className="flex items-center gap-1.5"
          >
            <label htmlFor="pdf-page" className="sr-only">Go to page</label>
            <span aria-hidden="true">Page</span>
            <input
              id="pdf-page"
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="go"
              value={draft}
              onFocus={(e) => {
                typedRef.current = false;
                setEditing(true);
                e.currentTarget.select();
              }}
              // iPhone's number pad has no Go or Return key, and its Done
              // button only blurs, so leaving the box after typing is what
              // commits it: "88" then Done used to snap back to the page
              // already showing. Only a typed entry commits — focusing,
              // scrolling the pages and leaving must not jump back to the
              // number the box showed on focus.
              onBlur={() => {
                const n = Number(draft);
                if (typedRef.current && draft !== "" && n > 0) goToPage(n);
                typedRef.current = false;
                setEditing(false);
              }}
              onChange={(e) => {
                typedRef.current = true;
                setDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 4));
              }}
              className="h-9 w-14 rounded-md border border-gray-300 text-center text-base text-runfree-ink outline-none focus:border-runfree-magenta focus:ring-2 focus:ring-runfree-magenta/25"
            />
            <span>of {doc.numPages}</span>
          </form>
          <button
            type="button"
            onClick={() => goToPage(current + 1)}
            disabled={current >= doc.numPages}
            aria-label="Next page"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-runfree-ink transition hover:bg-gray-100 disabled:opacity-30"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M7.5 4.5L13 10l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      )}
    {/* `relative` makes this scroller the pages' offsetParent, so li.offsetTop
        and scrollTop share one origin. Without it offsetTop was measured from
        FilePreview's fixed overlay, 140-148px higher, and on a landscape phone
        the one-third line sat above the view: the counter ran a page behind
        and Next stuck. */}
    <div ref={hostRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
      {doc && width > 0 ? (
        <ul className="mx-auto flex max-w-3xl flex-col gap-3">
          {Array.from({ length: doc.numPages }, (_, i) => (
            <li key={i} data-page={i}>
              <PdfPage
                doc={doc}
                index={i}
                width={width - 24}
                page={i + 1}
                total={doc.numPages}
                initialRatio={docRatio}
                onJump={(dest) => {
                  // A link that will not resolve just does nothing.
                  jumpTo(dest).catch(() => {});
                }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-3 h-1.5 w-24 overflow-hidden rounded-full">
              <div className="brand-loader h-full w-full" />
            </div>
            <p className="text-sm text-gray-500">Loading preview…</p>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

function PdfPage({
  doc,
  index,
  width,
  page,
  total,
  initialRatio,
  onJump,
}: {
  doc: PdfDoc;
  index: number;
  width: number;
  page: number;
  total: number;
  /** Page one's shape, until this page reports its own. */
  initialRatio: number;
  onJump: (dest: string | unknown[]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  /**
   * The page is a flat picture, so its links have to be put back on top of
   * it. Without them every handout and video icon in the Digital
   * Facilitator's Guide was dead on a phone or tablet — the 208 links to
   * /open/… that Help promises work "from the front of a room".
   */
  const [links, setLinks] = useState<PageLink[]>([]);
  /** Height/width. Page one's until this page reports its own, so the
   *  placeholder reserves the right space and the reader does not lurch as
   *  pages above them arrive. The per-page read stays for documents that mix
   *  page sizes. */
  const [ratio, setRatio] = useState(initialRatio);

  useEffect(() => {
    const el = ref.current;
    if (!el || src || width <= 0) return;

    let cancelled = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();

        (async () => {
          const p = await doc.getPage(index + 1);
          if (cancelled) return;

          const base = p.getViewport({ scale: 1 });
          setRatio(base.height / base.width);

          const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
          const viewport = p.getViewport({ scale: (width * dpr) / base.width });

          const canvas = document.createElement("canvas");
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            canvas.width = 0;
            canvas.height = 0;
            return;
          }

          await p.render({ canvas, canvasContext: ctx, viewport }).promise;
          // The picture is all that is kept. iOS caps the canvas memory a tab
          // may hold, and a detached canvas still counts against it until it
          // is zeroed; once the cap is hit getContext returns null and pages
          // silently stay placeholders. So release the bitmap, and pdf.js's
          // decoded page data, as soon as the JPEG exists.
          const url = canvas.toDataURL("image/jpeg", 0.85);
          canvas.width = 0;
          canvas.height = 0;

          // Separately guarded: a malformed annotation must not blank a page
          // that has already drawn.
          const found: PageLink[] = [];
          try {
            for (const a of await p.getAnnotations({ intent: "display" })) {
              if (a.subtype !== "Link" || (!a.url && !a.dest) || a.rect?.length !== 4) continue;
              const [x1, y1] = base.convertToViewportPoint(a.rect[0], a.rect[1]);
              const [x2, y2] = base.convertToViewportPoint(a.rect[2], a.rect[3]);
              found.push({
                left: (Math.min(x1, x2) / base.width) * 100,
                top: (Math.min(y1, y2) / base.height) * 100,
                w: (Math.abs(x2 - x1) / base.width) * 100,
                h: (Math.abs(y2 - y1) / base.height) * 100,
                url: a.url,
                dest: a.dest ?? undefined,
              });
            }
          } catch {
            // No links on this page, rather than no page.
          }
          p.cleanup();

          if (cancelled) return;
          setLinks(found);
          setSrc(url);
        })().catch(() => {
          // One page failing is not the document failing; it keeps its
          // placeholder and the rest still read.
        });
      },
      // Start a screen early so scrolling lands on a drawn page, not a blank.
      { rootMargin: "800px 0px" }
    );

    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [doc, index, width, src]);

  return (
    <div
      ref={ref}
      className="relative overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-200"
      style={{ aspectRatio: src ? undefined : `1 / ${ratio}` }}
    >
      {src ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`Page ${page} of ${total}`} className="block h-auto w-full" />
          {links.map((l, i) => {
            const style = {
              position: "absolute" as const,
              left: `${l.left}%`,
              top: `${l.top}%`,
              width: `${l.w}%`,
              height: `${l.h}%`,
            };
            const cls = "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-runfree-magentaDeep";
            return l.url ? (
              <a
                key={i}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open link"
                className={cls}
                style={style}
              />
            ) : (
              <button
                key={i}
                type="button"
                aria-label="Go to section"
                className={cls}
                style={style}
                onClick={() => l.dest && onJump(l.dest)}
              />
            );
          })}
        </>
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <span className="text-xs font-medium text-gray-400">
            Page {page} of {total}
          </span>
        </div>
      )}
    </div>
  );
}
