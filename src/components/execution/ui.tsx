"use client";

import { useEffect, useRef, useState } from "react";
import { RAG_DOT, RAG_LABEL, type RagStatus } from "@/lib/execution";

/**
 * The small pieces every part of Execution uses.
 *
 * Extracted when the panel passed a thousand lines and grew four detail
 * views. Kept in ONE file rather than one-per-component for the reason
 * `PanelRail`/`PanelStrip` is a cautionary tale in CLAUDE.md: two copies of a
 * traffic light drift, and then only one of them gets the bigger tap target.
 */

/** Local calendar date, not UTC — a US evening is already tomorrow in UTC. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function prettyDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** True when `by_when` holds a real date rather than a cadence like "Monthly". */
export function isDateish(v: string | null | undefined): boolean {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * The sheet's three radio circles.
 *
 * Not one button that cycles: the printed Action Step List shows all three
 * states with one filled, and a cycling control hides the two you are not on
 * — which matters when someone is reading the screen over a shoulder and
 * needs to see that green was a choice among three.
 *
 * The dot stays 16px; the thing you tap is 28. A 16px target is about a third
 * of what a thumb hits reliably, and this gets used standing up in a room.
 */
export function RagPicker({
  value,
  onChange,
  disabled,
}: {
  /** null = not yet judged; all three circles render empty. */
  value: RagStatus | null;
  onChange: (s: RagStatus) => void;
  disabled?: boolean;
}) {
  const options: RagStatus[] = ["red", "amber", "green"];
  // One tab stop for the group, arrows to move — the radio contract. Every
  // circle was its own tab stop and the arrows did nothing, which is three
  // presses per row for a keyboard user and a lie to a screen reader.
  const tabbable = value ?? options[0];
  return (
    <span className="inline-flex items-center" role="radiogroup" aria-label="Today's status">
      {options.map((s) => {
        const on = value === s;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={RAG_LABEL[s]}
            title={RAG_LABEL[s]}
            disabled={disabled}
            tabIndex={disabled ? -1 : s === tabbable ? 0 : -1}
            data-rag={s}
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) onChange(s);
            }}
            onKeyDown={(e) => {
              if (disabled) return;
              const i = options.indexOf(s);
              let next: RagStatus | null = null;
              if (e.key === "ArrowRight" || e.key === "ArrowDown") next = options[(i + 1) % options.length];
              if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = options[(i + options.length - 1) % options.length];
              if (e.key === "Home") next = options[0];
              if (e.key === "End") next = options[options.length - 1];
              if (!next) return;
              e.preventDefault();
              onChange(next);
              (e.currentTarget.parentElement?.querySelector(`[data-rag="${next}"]`) as HTMLElement | null)?.focus();
            }}
            className={`grid h-7 w-7 place-items-center rounded-full ${
              disabled ? "cursor-default" : "cursor-pointer"
            }`}
          >
            <span
              className={`h-4 w-4 rounded-full ring-1 transition ${
                on ? `${RAG_DOT[s]} ring-transparent` : "bg-gray-100 ring-gray-300"
              }`}
            />
          </button>
        );
      })}
    </span>
  );
}

/**
 * A text field that saves when you leave it, and only if it changed.
 *
 * Save-on-blur rather than debounced-as-you-type: this gets edited live in a
 * review meeting, where a half-typed value flushing to the database and then
 * being corrected produces two writes and a visible flicker on everyone
 * else's screen.
 */
export function Cell({
  value,
  onSave,
  placeholder,
  disabled,
  className = "",
  align = "left",
  display,
  required = false,
  wrap = false,
  ariaLabel,
}: {
  value: string | null;
  onSave: (next: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  align?: "left" | "right";
  /** How to render read-only. The editable field always shows the raw value. */
  display?: (v: string) => string;
  /**
   * Blank is not a value. The draft snaps back to what was there instead of
   * sitting empty over a row that never saved — a caller that declined the
   * save with `v && …` left the field looking cleared until the next reload.
   */
  required?: boolean;
  /** Read-only text wraps instead of truncating — a step description is a sentence. */
  wrap?: boolean;
  /** For inputs whose visible caption is not a <label> (column headings, MiniField). */
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(value ?? "");
  /**
   * Editing shows the raw string; resting shows `display`.
   *
   * Without this an editor stared at "2026-08-19" in the By column while a
   * viewer saw "Aug 19, 2026" — the raw form is what you have to edit, but it
   * is not what anyone wants to read for the other 99% of the time the field
   * is sitting there.
   */
  const [focused, setFocused] = useState(false);
  const discard = useRef(false);
  useEffect(() => setDraft(value ?? ""), [value]);

  if (disabled) {
    return (
      <span
        className={`block text-sm text-gray-600 ${wrap ? "whitespace-normal break-words" : "truncate"} ${align === "right" ? "text-right" : ""} ${className}`}
      >
        {value ? (display ? display(value) : value) : <span className="text-gray-300">—</span>}
      </span>
    );
  }

  return (
    <input
      value={!focused && display && draft ? display(draft) : draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (discard.current) {
          discard.current = false;
          return;
        }
        const next = draft.trim() === "" ? null : draft.trim();
        if (required && next === null) {
          setDraft(value ?? "");
          return;
        }
        if ((value ?? null) !== next) onSave(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          // Discard, then blur. setState is asynchronous but blur() fires
          // onBlur synchronously, so the old order — reset, then blur — ran
          // the save with the abandoned draft still in scope and committed
          // exactly the edit Escape was meant to throw away. The ref makes
          // the blur handler skip the save this once.
          discard.current = true;
          setDraft(value ?? "");
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={`w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-runfree-ink outline-none transition placeholder:text-gray-300 hover:border-gray-200 focus:border-runfree-magenta focus:bg-white ${
        align === "right" ? "text-right" : ""
      } ${className}`}
    />
  );
}

export function DateCell({
  value,
  onSave,
  disabled,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className="block px-1.5 py-1 text-sm text-gray-600">
        {value ? prettyDate(value) : <span className="text-gray-300">—</span>}
      </span>
    );
  }
  return (
    <input
      type="date"
      value={value ?? ""}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onSave(e.target.value || null)}
      className="w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-runfree-ink outline-none transition hover:border-gray-200 focus:border-runfree-magenta focus:bg-white"
    />
  );
}

export function BlockHeading({
  eyebrow,
  title,
  note,
}: {
  eyebrow: string;
  title: string;
  note?: string;
}) {
  return (
    <header className="mb-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-runfree-magentaDeep">
        {eyebrow}
      </p>
      <h3 className="mt-1 font-display text-xl font-extrabold tracking-tight text-runfree-ink">
        {title}
      </h3>
      {note && <p className="mt-1 text-sm leading-relaxed text-gray-500">{note}</p>}
    </header>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <span className="mt-0.5 block">{children}</span>
    </label>
  );
}

export function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </span>
  );
}

/** Small pill used for initiative type, template group, review cadence. */
export function Chip({
  children,
  tone = "quiet",
}: {
  children: React.ReactNode;
  tone?: "quiet" | "navy" | "accent";
}) {
  const tones = {
    quiet: "bg-gray-100 text-gray-600",
    navy: "bg-runfree-indigo text-runfree-navy",
    accent: "bg-runfree-pink text-runfree-magentaDeep",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Save / Cancel, and optionally Clear, under an open editor.
 *
 * One component because there are now six places that open a RichText box and
 * six hand-rolled button rows is how the spacing drifts.
 */
export function EditorActions({
  onSave,
  onCancel,
  onClear,
  busy,
}: {
  onSave: () => void;
  onCancel: () => void;
  onClear?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        disabled={busy}
        onClick={onSave}
        className="rounded-lg bg-runfree-grad px-3.5 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save"}
      </button>
      <button
        onClick={onCancel}
        className="px-2 py-2 text-xs text-gray-500 transition hover:text-runfree-ink"
      >
        Cancel
      </button>
      {onClear && (
        <button
          onClick={onClear}
          className="ml-auto text-xs font-semibold text-gray-400 transition hover:text-rose-600"
        >
          Clear
        </button>
      )}
    </div>
  );
}
