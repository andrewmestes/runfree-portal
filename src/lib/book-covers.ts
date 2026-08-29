/**
 * Book cover art, by book name.
 *
 * Static brand assets, not live-mirrored — book covers are design chrome, the
 * same reasoning as the Pivvot process icons: they don't change the way the
 * underlying files do, so there's nothing to gain from fetching them live.
 *
 * Lives here rather than inside BooksShelf because the highlight shelf needs
 * the same picture for the same book, and two copies of this table would have
 * drifted the first time a cover was added.
 */
const COVERS: Record<string, string> = {
  "future church": "/brand/books/future-church.png",
  // .jpg rather than .png like the other five: the source is a 66KB Amazon
  // JPEG and re-encoding it to PNG would have quadrupled the file for no
  // visible gain. The table holds full paths, so the extension is free to
  // differ.
  "innovating discipleship": "/brand/books/innovating-discipleship.jpg",
  "church unique": "/brand/books/church-unique.png",
  "god dreams": "/brand/books/god-dreams.png",
  younique: "/brand/books/younique.png",
  calling: "/brand/books/calling.png",
};

export function coverFor(name: string): string | null {
  return COVERS[name.toLowerCase().trim()] || null;
}

/**
 * Covers for documents that live inside another book's Drive folder without
 * being that book.
 *
 * The 7 Laws Bullet Book sits in the Future Church folder, so anything that
 * hands out the *shelf's* jacket put the red Future Church cover on it.
 * Andrew: "the 7 laws bullet book on this image and the last one I sent are
 * different... the pink version is the correct one for that PDF."
 *
 * Matched loosely on the title because the same document is filed under
 * slightly different names in different places — "The 7 Laws Bullet Book" on
 * the reading shelf, "7 Laws Bullet Book by Mancini" in Drive.
 */
const FILE_COVERS: { match: RegExp; src: string }[] = [
  { match: /7\s*laws\s*bullet\s*book/i, src: "/brand/books/seven-laws-bullet-book.png" },
];

export function coverForFile(title: string): string | null {
  return FILE_COVERS.find((c) => c.match.test(title))?.src ?? null;
}
