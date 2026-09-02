"use client";

import { useEffect, useRef, useState } from "react";
import { cleanRichText, isRichText } from "@/lib/rich-text";

/**
 * A small formatting toolbar over a contenteditable.
 *
 * Andrew: "I want this to be as easy as possible for the least techy person on
 * our team to be able to simply edit the title and notes." So: buttons, not
 * syntax. Bold, italic, underline, two heading levels, bulleted and numbered
 * lists, and a way back to plain text.
 *
 * `document.execCommand` is formally deprecated and has no replacement that is
 * anywhere near as simple. Every browser still implements it, and the whole
 * surface here is six commands on a small box — a real editor library would be
 * several hundred kilobytes to do less. If it ever does break, the content is
 * plain HTML in a column and survives whatever replaces this.
 */
const BUTTONS: { cmd: string; arg?: string; label: string; title: string; className?: string }[] = [
  { cmd: "bold", label: "B", title: "Bold", className: "font-bold" },
  { cmd: "italic", label: "I", title: "Italic", className: "italic font-serif" },
  { cmd: "underline", label: "U", title: "Underline", className: "underline" },
  { cmd: "formatBlock", arg: "h2", label: "Title", title: "Heading" },
  { cmd: "formatBlock", arg: "h3", label: "Subtitle", title: "Subheading" },
  // formatBlock does not toggle and Clear only strips inline formatting, so
  // without this a line made a Title stayed a Title forever.
  { cmd: "formatBlock", arg: "p", label: "Text", title: "Plain text" },
  { cmd: "insertUnorderedList", label: "• List", title: "Bulleted list" },
  { cmd: "insertOrderedList", label: "1. List", title: "Numbered list" },
];

export default function RichText({
  value,
  onChange,
  placeholder,
  minHeight = "8rem",
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(true);

  /**
   * Seed the box once per mount, not on every render.
   *
   * A contenteditable whose innerHTML is driven by state loses the caret on
   * each keystroke — the browser rebuilds the nodes and the selection has
   * nowhere to sit, so typing runs backwards. The DOM owns the text while the
   * field has focus; React only hears about it through onChange.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const initial = isRichText(value)
      ? value
      : value
        ? `<p>${value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>")}</p>`
        : "";
    el.innerHTML = initial;
    setEmpty(el.textContent?.trim().length === 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emit() {
    const el = ref.current;
    if (!el) return;
    setEmpty(el.textContent?.trim().length === 0);
    onChange(cleanRichText(el.innerHTML));
  }

  function run(cmd: string, arg?: string) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // formatBlock wants a tag name, and Safari historically wanted it in
    // angle brackets. Passing them is harmless in the browsers that don't.
    document.execCommand(cmd, false, arg ? `<${arg}>` : undefined);
    emit();
  }

  return (
    <div className="rounded-xl border border-gray-300 transition focus-within:border-runfree-magenta focus-within:ring-1 focus-within:ring-runfree-magenta">
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 px-2 py-1.5">
        {BUTTONS.map((b) => (
          <button
            key={b.label}
            type="button"
            title={b.title}
            // Keep the selection: a button that takes focus collapses the
            // caret before the command can act on it.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(b.cmd, b.arg)}
            className={`rounded-md px-2 py-1 text-xs text-gray-600 transition hover:bg-runfree-indigo/50 hover:text-runfree-ink ${b.className ?? ""}`}
          >
            {b.label}
          </button>
        ))}
        <span className="ml-auto" />
        <button
          type="button"
          title="Remove formatting"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run("removeFormat")}
          className="rounded-md px-2 py-1 text-xs text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
        >
          Clear
        </button>
      </div>

      <div className="relative">
        {empty && placeholder && (
          <p className="pointer-events-none absolute left-3.5 top-3 text-sm text-gray-400">
            {placeholder}
          </p>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder ?? "Notes"}
          onInput={emit}
          onBlur={emit}
          // Paste as plain text. Pasting from Word or Google Docs otherwise
          // carries a wall of inline styles that the allowlist strips anyway —
          // stripping it here means what you see pasted is what is kept.
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
          }}
          style={{ minHeight }}
          className="rich-text w-full px-3.5 py-3 text-sm leading-relaxed text-runfree-ink outline-none"
        />
      </div>
    </div>
  );
}

/**
 * Read-only render of a stored note.
 *
 * Runs the same allowlist as the editor rather than trusting what is in the
 * column — a note could predate this, or have been written straight into the
 * database.
 */
export function RichTextView({ html, className = "" }: { html: string; className?: string }) {
  const clean = cleanRichText(html);
  if (!clean) return null;
  return (
    <div
      className={`rich-text text-sm leading-relaxed text-gray-600 ${className}`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
