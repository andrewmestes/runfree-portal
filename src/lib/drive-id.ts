/**
 * Drive link parsing. Kept separate from drive.ts so client components can
 * import it without pulling in googleapis (which is server-only).
 */
export function extractDriveId(input: string): string | null {
  const trimmed = input.trim();

  // Already a bare ID
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;

  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/, // /file/d/{id}/view
    /\/document\/d\/([a-zA-Z0-9_-]+)/, // Docs
    /\/presentation\/d\/([a-zA-Z0-9_-]+)/, // Slides
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/, // Sheets
    /[?&]id=([a-zA-Z0-9_-]+)/, // ?id={id}
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/** Best-guess file type label from the Drive link shape. */
export function guessFileType(input: string): string {
  if (/\/document\/d\//.test(input)) return "doc";
  if (/\/presentation\/d\//.test(input)) return "slides";
  if (/\/spreadsheets\/d\//.test(input)) return "sheet";
  return "file";
}
