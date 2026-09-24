/**
 * The "01" / "1.2" prefix of a Drive filename, split out so it can be styled
 * separately. Kept apart from drive.ts so /open (a client page) splits a
 * name exactly as the server listing does; the two copies of this regex had
 * already drifted apart once.
 *
 * The separator goes with the number, not the label. Files are named two
 * ways in these folders — "01 Welcome.pdf" and "01 - Funnel Fusion
 * Handouts.pdf" — and keeping the dash left the second rendering as
 * "- Funnel Fusion Handouts" once the number was pulled out to its own
 * element.
 *
 * Not every leading number is a file number. "03 April, 2023 - Hope-Baptist
 * …" (a Video Clips film) is a date, and it opened as "April, 2023 - Hope-
 * Baptist" under a tool number 03. "7 Laws Bullet Book" is a title that
 * starts with a number, and it previewed as "7" + "Laws Bullet Book". Files
 * here are numbered 01, 1.2 or "1 - …", so a bare single digit before a word
 * stays in the title, and so does a number followed by a month. The
 * (?!\.?\d) guard stops the match backing off to the "0" of "03" or the
 * "9.1" of "9.11.26".
 */
const MONTH =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\b";
const LEADING_NUMBER = new RegExp(
  `^\\s*(\\d+(?:\\.\\d+)?)(?!\\.?\\d)(?!\\s*[-–—]?\\s*${MONTH})\\s*([-–—]?)\\s*(.*)$`,
  "i"
);

export function splitLeadingNumber(title: string): { num: string | null; rest: string } {
  const m = title.match(LEADING_NUMBER);
  if (!m || !m[3]) return { num: null, rest: title };
  const [, num, dash, rest] = m;
  if (!(num.includes(".") || num.length > 1 || dash)) return { num: null, rest: title };
  return { num, rest };
}
