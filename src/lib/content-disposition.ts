/**
 * A Content-Disposition value that survives any Drive filename.
 *
 * Headers only take Latin-1: `new Response(…, { headers })` throws on a
 * ’ (8217) or – (8211), and the route's catch turns that into a 500 — the
 * viewer's "That didn't open" for a file that is perfectly fine. Nothing in
 * Drive has one today, but a single rename ("Digital Facilitator’s Guide",
 * typed on a Mac) would take the guide down, and keynotes.ts already expects
 * en dashes in Keynote names.
 *
 * So the quoted `filename` is a plain-ASCII stand-in, and the real name
 * rides in `filename*` (RFC 6266), which browsers prefer for a download and
 * /open reads for the viewer's title.
 */
export function contentDisposition(kind: "inline" | "attachment", name: string): string {
  // A lone surrogate makes encodeURIComponent throw ("URI malformed"): the
  // same 500 this helper exists to prevent. It stands in as U+FFFD instead.
  const clean =
    name
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "\ufffd")
      .trim() || "file";
  // NFKD runs first. It folds a fullwidth ＂ or ＼ (and the small ﹨) into a
  // plain " or \, so run after the strip it put those straight back into
  // the quoted string: "report＂.pdf" gave filename="report".pdf", and a
  // trailing ﹨ escaped the closing quote.
  const ascii = clean
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u201a\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033"\\]/g, "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(clean).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
