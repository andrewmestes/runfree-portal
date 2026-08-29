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
