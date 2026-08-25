"use client";

import { useEffect, useRef, useState } from "react";

/**
 * First-page preview of a gated PDF.
 *
 * Rendering happens in the browser rather than on the server because the PDF
 * bytes are only reachable through an authenticated endpoint — the server
 * would have to re-fetch and re-authorise each file just to make a picture,
 * and pdf rendering in a serverless function needs a native canvas build.
 * The client already has permission and already has a canvas.
 *
 * The worker is served from /vendor rather than a CDN so the portal has no
 * third-party runtime dependency for something this visible.
 *
 * Results are cached in sessionStorage: a rendered page costs a multi-megabyte
 * download plus a decode, and framers move between these pages constantly.
 */

/** Bumped when the render output changes so stale entries are discarded. */
const CACHE_VERSION = "v1";
const CACHE_PREFIX = `pdfthumb:${CACHE_VERSION}:`;
const cacheKey = (id: string, width: number) => `${CACHE_PREFIX}${width}:${id}`;

/**
 * localStorage, not sessionStorage.
 *
 * Building one of these costs a multi-megabyte download of the whole PDF plus
 * a pdf.js decode, purely to draw a picture of page one — which is why Andrew
 * reports "the image of the visual summaries takes a while". In
 * sessionStorage that entire cost was paid again in every new tab and every
 * new visit. The render is a pure function of (file, width), so it is worth
 * keeping between visits.
 *
 * Reads fall back to sessionStorage so anything cached by the previous
 * version is still honoured rather than being re-rendered once for nothing.
 */
function readCache(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  } catch {
    // Private browsing, or storage disabled — just render it.
    return null;
  }
}

function writeCache(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Almost always the 5MB quota. Drop our own older entries and try once
    // more; if it still will not fit, the render simply is not persisted.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith("pdfthumb:") && k !== key) localStorage.removeItem(k);
      }
      localStorage.setItem(key, value);
    } catch {
      // Give up quietly: a missing cache entry costs time, not correctness.
    }
  }
}

/** In-flight renders, so two cards for the same file don't both fetch it. */
const inFlight = new Map<string, Promise<string | null>>();

/**
 * pdf.js can sit forever without resolving or rejecting — it currently does
 * exactly that in production, where these previews never appear while the
 * same code renders them locally. Whatever the cause, a card that shimmers
 * indefinitely is worse than one that shows its branded fallback, so give up
 * after a bounded wait and let the caller draw something finished-looking.
 */
const RENDER_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("pdf render timed out")), ms)
    ),
  ]);
}

async function renderFirstPage(
  fileId: string,
  fetchBytes: (id: string) => Promise<ArrayBuffer | null>,
  width: number
): Promise<string | null> {
  const key = cacheKey(fileId, width);

  const cached = readCache(key);
  if (cached) return cached;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const job = (async (): Promise<string | null> => {
    try {
      const bytes = await fetchBytes(fileId);
      if (!bytes) return null;

      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";

      const pdf = await withTimeout(
        pdfjs.getDocument({ data: bytes }).promise,
        RENDER_TIMEOUT_MS
      );
      const page = await pdf.getPage(1);

      const base = page.getViewport({ scale: 1 });
      // Render at 2x for crisp output on retina, then let CSS scale it down.
      const viewport = page.getViewport({ scale: (width * 2) / base.width });

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);

      writeCache(key, dataUrl);

      return dataUrl;
    } catch {
      // A preview is decoration. Failing to build one must never take the
      // card down with it; the caller shows its own fallback.
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, job);
  return job;
}

/**
 * Above this, previewing costs more than it's worth. Parsing is the expensive
 * part, not the download: the 168-page Facilitator's Guide fetches in a few
 * seconds but takes far longer than anyone will wait to decode, and the card
 * would sit shimmering the whole time. Files over the cap show their fallback
 * immediately instead of pretending something is coming.
 */
const DEFAULT_MAX_BYTES = 12 * 1024 * 1024;

export default function PdfThumbnail({
  fileId,
  fetchBytes,
  width = 240,
  sizeBytes = null,
  maxBytes = DEFAULT_MAX_BYTES,
  className = "",
  fallback = null,
}: {
  fileId: string;
  /** Authorised fetch for the raw PDF bytes. */
  fetchBytes: (id: string) => Promise<ArrayBuffer | null>;
  /** CSS pixel width to render for; height follows the page's aspect ratio. */
  width?: number;
  /** Known file size, so an oversized file is skipped before downloading it. */
  sizeBytes?: number | null;
  maxBytes?: number;
  className?: string;
  fallback?: React.ReactNode;
}) {
  const tooBig = sizeBytes !== null && sizeBytes > maxBytes;
  const [src, setSrc] = useState<string | null>(null);
  const [done, setDone] = useState(tooBig);
  const fetchRef = useRef(fetchBytes);
  fetchRef.current = fetchBytes;

  useEffect(() => {
    if (tooBig) {
      setSrc(null);
      setDone(true);
      return;
    }

    let cancelled = false;
    setSrc(null);
    setDone(false);

    renderFirstPage(fileId, (id) => fetchRef.current(id), width).then((url) => {
      if (cancelled) return;
      setSrc(url);
      setDone(true);
    });

    return () => {
      cancelled = true;
    };
  }, [fileId, width, tooBig]);

  if (src) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={src} alt="" className={className} />
    );
  }

  // Nothing rendered yet: show the fallback once we know it failed, and a
  // quiet shimmer while it's still working so the card doesn't flash.
  if (!done) {
    return (
      <span
        aria-hidden
        className={`block animate-pulse bg-black/5 ${className}`}
      />
    );
  }

  return <>{fallback}</>;
}
