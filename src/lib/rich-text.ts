/**
 * Formatted notes, stored as a small subset of HTML.
 *
 * Andrew: "add basic text edit functionality (title/subtitle/body text, bold,
 * italics, underline, bullets or number lists, etc. — nothing crazy, just
 * basic stuff)."
 *
 * The notes were Markdown before, rendered by a hand-written subset renderer,
 * and the placeholder literally said "## Headings, — bullets and **bold** are
 * formatted." That is a syntax to learn, which is the opposite of what he
 * asked for. Markdown also has no underline, so the ask could not be met
 * without leaving it.
 *
 * **Everything here is allowlist-rebuild, never sanitise-in-place.** A regex
 * that strips `<script>` is a losing game; this parses the input and emits a
 * fresh tree containing only tags it recognises, so anything unrecognised
 * cannot survive by being cleverly written. Same function guards both save and
 * render, so a row written before this — or edited directly in the database —
 * is treated with the same suspicion as fresh input.
 */

/** Tags a note may contain. Everything else is unwrapped to its text. */
const ALLOWED = new Set([
  "p", "br", "strong", "em", "u", "s",
  "ul", "ol", "li", "h2", "h3", "blockquote", "a",
]);

/** Tags browsers still emit that mean the same as one we allow. */
const ALIASES: Record<string, string> = {
  b: "strong",
  i: "em",
  strike: "s",
  del: "s",
  div: "p",
  h1: "h2",
  h4: "h3",
  h5: "h3",
  h6: "h3",
};

function safeHref(raw: string | null): string | null {
  if (!raw) return null;
  const url = raw.trim();
  // Anything that is not plainly http(s) or mailto is dropped rather than
  // repaired — `javascript:`, `data:`, and their whitespace-padded variants
  // all fail this the same way.
  if (!/^(https?:\/\/|mailto:)/i.test(url)) return null;
  return url;
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Rebuild `html` from the allowlist. Returns HTML safe to inject.
 *
 * Server-side there is no DOMParser, and this never runs there with real
 * content — the project page fetches after auth, so notes only exist on the
 * client. The guard is there so a future server render degrades to plain text
 * rather than throwing.
 */
export function cleanRichText(html: string): string {
  if (!html) return "";
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return escapeText(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  }

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");

  const walk = (node: Node): string => {
    if (node.nodeType === 3) return escapeText(node.nodeValue ?? "");
    if (node.nodeType !== 1) return "";

    const el = node as Element;
    const raw = el.tagName.toLowerCase();
    const tag = ALIASES[raw] ?? raw;
    const inner = Array.from(el.childNodes).map(walk).join("");

    if (tag === "br") return "<br>";
    if (!ALLOWED.has(tag)) return inner; // unwrap: keep the words, drop the tag

    if (tag === "a") {
      const href = safeHref(el.getAttribute("href"));
      if (!href) return inner;
      return `<a href="${escapeText(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
    }
    // No attributes survive. Styles, ids, event handlers and classes are all
    // dropped, which is also what keeps pasted Word/Google Docs markup from
    // dragging its own typography into the page.
    return `<${tag}>${inner}</${tag}>`;
  };

  return Array.from(doc.body.childNodes).map(walk).join("").trim();
}

/** True when a stored note is HTML rather than the older Markdown/plain text. */
export function isRichText(value: string | null | undefined): boolean {
  if (!value) return false;
  return /<(p|br|ul|ol|li|h2|h3|strong|em|u|s|a|blockquote)\b/i.test(value);
}

/** Is there anything here once the tags come off? */
export function richTextIsEmpty(value: string | null | undefined): boolean {
  if (!value) return true;
  return value.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length === 0;
}
