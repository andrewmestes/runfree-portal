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
 * simply unreachable. The `#toolbar=0&navpanes=0` hints in the iframe URL are
 * Chrome/Acrobat parameters; iOS ignores those too.
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
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: Record<string, unknown>) => { promise: Promise<void> };
  }>;
};

/** Retina, but capped: a 3x canvas of an A4 page is a lot of pixels to hold. */
const MAX_DPR = 2;

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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // The caller already holds an authorised blob; read it back as bytes
      // rather than changing its contract or fetching the file twice.
      const bytes = new Uint8Array(await (await fetch(blobUrl)).arrayBuffer());
      if (cancelled) return;

      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
      const loaded = (await withTimeout(
        pdfjs.getDocument({ data: bytes }).promise,
        PARSE_TIMEOUT_MS
      )) as unknown as PdfDoc;
      if (cancelled) return;
      setDoc(loaded);
    })().catch(() => {
      if (!cancelled) onFail?.();
    });

    return () => {
      cancelled = true;
    };
  }, [blobUrl, onFail]);

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

  return (
    <div ref={hostRef} className="h-full overflow-y-auto overscroll-contain bg-gray-100 px-3 py-3">
      {doc && width > 0 ? (
        <ul className="mx-auto flex max-w-3xl flex-col gap-3">
          {Array.from({ length: doc.numPages }, (_, i) => (
            <li key={i}>
              <PdfPage doc={doc} index={i} width={width - 24} page={i + 1} total={doc.numPages} />
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
  );
}

function PdfPage({
  doc,
  index,
  width,
  page,
  total,
}: {
  doc: PdfDoc;
  index: number;
  width: number;
  page: number;
  total: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  /** Height/width. US Letter until the real page reports otherwise, so the
   *  placeholder reserves close to the right space and the scrollbar does not
   *  lurch as pages arrive. */
  const [ratio, setRatio] = useState(11 / 8.5);

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
          if (!ctx) return;

          await p.render({ canvas, canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
          setSrc(canvas.toDataURL("image/jpeg", 0.85));
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
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`Page ${page} of ${total}`} className="block h-auto w-full" />
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
