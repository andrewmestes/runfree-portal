/**
 * Small CSV reader for the framer import.
 *
 * Deliberately hand-rolled rather than pulling a parser in: the input is a
 * two-column contact list exported from a spreadsheet or a CRM, and the only
 * genuinely awkward cases are quoted fields containing commas and the BOM
 * Excel writes at the start of a UTF-8 file. Both are handled below.
 */

export type CsvRow = { name: string; email: string };

export type ParsedCsv = {
  rows: CsvRow[];
  /** Header names as found, for showing the admin what was detected. */
  detected: { name: string | null; email: string | null };
  /** Lines that had no usable email, reported rather than dropped silently. */
  skipped: number;
};

/** Splits one line, honouring "quoted, fields" and escaped "" quotes. */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') inQuotes = true;
    else if (ch === "," || ch === "\t") {
      out.push(field);
      field = "";
    } else field += ch;
  }

  out.push(field);
  return out.map((f) => f.trim());
}

const EMAIL_HEADERS = ["email", "email address", "e-mail", "emailaddress"];
const NAME_HEADERS = ["name", "full name", "fullname", "contact", "contact name"];
const FIRST_HEADERS = ["first name", "firstname", "first"];
const LAST_HEADERS = ["last name", "lastname", "last"];

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export function parseCsv(input: string): ParsedCsv {
  // Excel prefixes UTF-8 exports with a BOM, which otherwise corrupts the
  // first header and stops it matching "email".
  const text = input.replace(/^﻿/, "").trim();
  if (!text) return { rows: [], detected: { name: null, email: null }, skipped: 0 };

  const lines = text
    .split(/\r\n|\n|\r/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { rows: [], detected: { name: null, email: null }, skipped: 0 };
  }

  const first = splitLine(lines[0]);
  const lowered = first.map((h) => h.toLowerCase());

  // A header row is only a header if it doesn't itself contain an address —
  // plenty of people paste a bare list with no headers at all.
  const hasHeader = !first.some(looksLikeEmail);

  let emailIdx = -1;
  let nameIdx = -1;
  let firstIdx = -1;
  let lastIdx = -1;

  if (hasHeader) {
    lowered.forEach((h, i) => {
      if (emailIdx < 0 && EMAIL_HEADERS.includes(h)) emailIdx = i;
      if (nameIdx < 0 && NAME_HEADERS.includes(h)) nameIdx = i;
      if (firstIdx < 0 && FIRST_HEADERS.includes(h)) firstIdx = i;
      if (lastIdx < 0 && LAST_HEADERS.includes(h)) lastIdx = i;
    });
  }

  const body = hasHeader ? lines.slice(1) : lines;
  const rows: CsvRow[] = [];
  let skipped = 0;

  for (const line of body) {
    const cells = splitLine(line);

    /**
     * The header-indicated column is only trusted when what's in it actually
     * looks like an address. Spreadsheets routinely end with a totals or
     * notes row — "total:,5" would otherwise import a framer whose email is
     * "5". Anything with no address-shaped cell at all is skipped and
     * reported rather than guessed at.
     */
    const fromHeader = emailIdx >= 0 ? cells[emailIdx] || "" : "";
    const email = looksLikeEmail(fromHeader)
      ? fromHeader
      : cells.find((c) => looksLikeEmail(c)) || "";

    if (!email) {
      skipped += 1;
      continue;
    }

    let name = nameIdx >= 0 ? cells[nameIdx] || "" : "";
    if (!name && (firstIdx >= 0 || lastIdx >= 0)) {
      name = [cells[firstIdx] || "", cells[lastIdx] || ""]
        .filter(Boolean)
        .join(" ")
        .trim();
    }
    if (!name) {
      // Any other non-email cell is a better guess at a name than nothing.
      name = cells.find((c) => c && !looksLikeEmail(c)) || "";
    }

    rows.push({ name, email });
  }

  return {
    rows,
    detected: {
      email: emailIdx >= 0 ? first[emailIdx] : null,
      name:
        nameIdx >= 0
          ? first[nameIdx]
          : firstIdx >= 0 || lastIdx >= 0
            ? [first[firstIdx], first[lastIdx]].filter(Boolean).join(" + ")
            : null,
    },
    skipped,
  };
}
