"use client";

import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import PdfPageViewer from "./PdfPageViewer";

/**
 * Should this device get canvas-rendered pages instead of the native viewer?
 *
 * Not a width question. iOS refuses to scroll a PDF inside an <iframe> and
 * lays it out at the document's own page width regardless of the frame — and
 * an iPad does that at 1024px just as a phone does at 375px, so testing the
 * breakpoint would leave every iPad broken. The test is the engine.
 *
 * iPadOS reports itself as "Macintosh", so the touch-point count is what
 * separates an iPad from a Mac. A narrow screen also qualifies regardless of
 * engine, because a full-page PDF in a 375px frame is unreadable anywhere.
 */
function useCanvasPdf(): boolean {
  const [canvas, setCanvas] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const iOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    const mq = window.matchMedia("(max-width: 767px)");
    const decide = () => setCanvas(iOS || mq.matches);
    decide();
    mq.addEventListener("change", decide);
    return () => mq.removeEventListener("change", decide);
  }, []);

  return canvas;
}

export type PreviewFile = {
  id: string;
  title: string;
  num: string | null;
  label: string;
  sizeBytes: number | null;
};

/**
 * In-portal PDF preview.
 *
 * The bytes come from the same gated endpoint as a download, turned into a
 * blob URL — so the file is still never publicly reachable, and previewing
 * doesn't send anyone out to Drive and lose their place.
 */
export default function FilePreview({
  file,
  fetchUrl,
  onClose,
}: {
  file: PreviewFile;
  /** Returns an authorised blob URL for the file, or null on failure. */
  fetchUrl: (id: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const wantsCanvas = useCanvasPdf();
  /** Set when pdf.js cannot parse the document, so we hand back to the
   *  browser's own viewer rather than showing nothing. */
  const [canvasFailed, setCanvasFailed] = useState(false);
  const canvasPdf = wantsCanvas && !canvasFailed;

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;

    fetchUrl(file.id).then((u) => {
      if (cancelled) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      if (!u) {
        setFailed(true);
        return;
      }
      url = u;
      setBlobUrl(u);
    });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file.id, fetchUrl]);

  useFocusTrap(dialogRef, onClose);

  return (
    <div
      className="animate-fade fixed inset-0 z-50 flex items-center justify-center bg-runfree-ink/80 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
        tabIndex={-1}
        className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1.5 shrink-0 bg-runfree-grad" />

        <header className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-3 py-2.5 sm:gap-3 sm:px-5 sm:py-3">
          <div className="min-w-0 flex-1">
            <h2
              id="preview-title"
              className="truncate font-display text-sm font-bold text-runfree-ink sm:text-base"
            >
              {file.num && (
                <span className="mr-2 text-runfree-magentaDeep">{file.num}</span>
              )}
              {file.label}
            </h2>
          </div>

          <a
            href={blobUrl || undefined}
            download={`${file.title}.pdf`}
            className={`shrink-0 rounded-lg bg-runfree-grad px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 sm:px-4 sm:text-sm ${
              blobUrl ? "" : "pointer-events-none opacity-40"
            }`}
          >
            Download
          </a>

          <button
            onClick={onClose}
            aria-label="Close preview"
            className="shrink-0 rounded-lg px-2 py-2 text-xs font-medium text-gray-500 transition hover:text-runfree-magentaDeep sm:px-3 sm:text-sm"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 bg-gray-100">
          {failed ? (
            <div className="flex h-full items-center justify-center p-8 text-center">
              <p className="text-sm text-gray-600">
                Couldn&rsquo;t load that file. Try closing and opening it again.
              </p>
            </div>
          ) : blobUrl ? (
            canvasPdf ? (
              // On failure this flips to the iframe below rather than to an
              // error: a zoomed-in PDF showing page one is worth more than a
              // message saying the file could not be opened, which would also
              // be untrue — the bytes downloaded fine, only the render failed.
              <PdfPageViewer blobUrl={blobUrl} onFail={() => setCanvasFailed(true)} />
            ) : (
              <iframe
                src={`${blobUrl}#toolbar=0&navpanes=0&statusbar=0`}
                title={file.title}
                className="h-full w-full border-0"
              />
            )
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
    </div>
  );
}
