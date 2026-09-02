import { createUserClient } from "./supabase";
import type { ProjectDetail } from "./projects";
import type { BooksLibrary, BookShelf } from "./books";
import { coverFor, coverForFile } from "./book-covers";
import { moduleLabel, moduleOrder, stripModuleNumber } from "./modules";

export type HighlightSource =
  | "template_resource"
  /** A sheet from the module's Drive handout folder. Served by /handouts/file. */
  | "handout"
  | "book"
  | "deliverable"
  | "prep_item"
  | "session"
  | "upload";

/** How a card draws itself — separate from where the thing came from. */
export type HighlightMedia = "video" | "pdf" | "image" | "link" | "book";

export type Highlight = {
  id: string;
  project_id: string;
  source_kind: HighlightSource;
  source_id: string | null;
  title: string;
  media_kind: HighlightMedia;
  note: string | null;
  external_url: string | null;
  file_path: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
  thumb_path: string | null;
  thumb_url: string | null;
  position: number;
  created_at: string;
};

/**
 * One assignable thing, from wherever it lives.
 *
 * The picker searches across four tables and a Drive folder, and none of them
 * share a shape. This is the shape they are flattened into — and it is also
 * very nearly the row that gets written, which is the point: what the picker
 * shows you is what the card will draw.
 */
export type CatalogueEntry = {
  /** Stable within a project: `${source_kind}:${source_id}`. */
  key: string;
  source_kind: HighlightSource;
  source_id: string | null;
  title: string;
  media_kind: HighlightMedia;
  /** Where it sits, for the second line in the picker: "Mod #1 FUNNEL FUSION". */
  context: string | null;
  external_url: string | null;
  file_path: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
  thumb_path: string | null;
  thumb_url: string | null;
};

/** The picker's filter tabs. `all` is not a group, it is the absence of one. */
export type CatalogueGroup = "videos" | "handouts" | "books" | "files" | "sessions";

export const CATALOGUE_GROUPS: { key: CatalogueGroup; label: string }[] = [
  { key: "videos", label: "Videos" },
  { key: "handouts", label: "Exercises & handouts" },
  { key: "books", label: "Books" },
  { key: "files", label: "This church’s files" },
  { key: "sessions", label: "Sessions" },
];

export function groupOf(e: CatalogueEntry): CatalogueGroup {
  if (e.source_kind === "session") return "sessions";
  if (e.source_kind === "book") return "books";
  if (e.media_kind === "video") return "videos";
  if (e.source_kind === "handout" || e.source_kind === "template_resource") return "handouts";
  return "files";
}

/**
 * Everything on this project that can be highlighted.
 *
 * Built from data the page already has rather than from a new endpoint —
 * the project detail is loaded before the picker can be opened, and the books
 * library is the one live Drive read, passed in only once that panel or the
 * picker has asked for it.
 */
/** Just enough of the page's handout library to build catalogue entries. */
type HandoutRef = { id: string; title: string; sizeBytes: number | null };
export type HandoutSource = {
  byModule: Record<string, { combined: HandoutRef | null; sheets: HandoutRef[] }>;
  extras: { id: string; name: string; files: HandoutRef[] }[];
  notebooks: HandoutRef[];
} | null;

export function buildCatalogue(
  detail: ProjectDetail,
  books: BooksLibrary | null,
  handouts?: HandoutSource
): CatalogueEntry[] {
  const out: CatalogueEntry[] = [];

  for (const r of detail.resources) {
    // An exercise or handout with no link and no file is a label, not a
    // resource — highlighting one would put a card on the dashboard that
    // does nothing when tapped.
    if (!r.external_url) continue;
    out.push({
      key: `template_resource:${r.id}`,
      source_kind: "template_resource",
      source_id: r.id,
      title: r.title,
      media_kind: r.kind === "video" ? "video" : "link",
      context: r.section,
      external_url: r.external_url,
      file_path: null,
      file_name: null,
      file_mime: null,
      file_size: null,
      thumb_path: null,
      thumb_url: null,
    });
  }

  for (const d of detail.deliverables) {
    if (!d.file_path && !d.image_path) continue;
    out.push({
      key: `deliverable:${d.id}`,
      source_kind: "deliverable",
      source_id: d.id,
      title: d.title ?? d.file_name ?? "Untitled",
      media_kind: d.file_path ? "pdf" : "image",
      context: d.section,
      external_url: null,
      file_path: d.file_path ?? d.image_path,
      file_name: d.file_name,
      file_mime: d.file_mime,
      file_size: d.file_size,
      thumb_path: d.image_path,
      thumb_url: null,
    });
  }

  for (const p of detail.prepItems) {
    if (!p.file_path && !p.external_url) continue;
    out.push({
      key: `prep_item:${p.id}`,
      source_kind: "prep_item",
      source_id: p.id,
      title: p.title,
      media_kind: p.file_path ? "pdf" : "link",
      context: "Before you begin",
      external_url: p.external_url,
      file_path: p.file_path,
      file_name: p.file_name,
      file_mime: p.file_mime,
      file_size: p.file_size,
      thumb_path: p.thumb_path,
      thumb_url: null,
    });
  }

  for (const s of detail.sessions) {
    if (!s.recording_url) continue;
    out.push({
      key: `session:${s.id}`,
      source_kind: "session",
      source_id: s.id,
      title: s.title,
      media_kind: "video",
      context: s.held_on,
      external_url: s.recording_url,
      file_path: null,
      file_name: null,
      file_mime: null,
      file_size: null,
      thumb_path: null,
      thumb_url: null,
    });
  }

  if (books) {
    // Every shelf the books page knows about, flattened. A chapter is as
    // assignable as a whole book — Andrew: "If I want them to read a certain
    // chapter of Will's books, we could highlight it there."
    const shelves: BookShelf[] = [...books.books, ...(books.standalone ?? [])];
    for (const shelf of shelves) {
      const cover = coverFor(shelf.name);
      // The whole book, the visual summary, every chapter and every workbook.
      // A chapter is as assignable as a book — Andrew: "If I want them to read
      // a certain chapter of Will's books, we could highlight it there."
      // The jacket represents THE BOOK, so only the things that ARE the book
      // may wear it: the full text, the visual summary, a chapter. `other` is
      // workbooks and bullet books — separate publications that happen to live
      // in the same Drive folder — and giving them the shelf cover put the
      // Future Church jacket on the 7 Laws Bullet Book. Andrew: "the pink
      // version is the correct one for that PDF."
      const isTheBook = [shelf.fullBook, shelf.visualSummary, ...shelf.chapters]
        .filter((f): f is NonNullable<typeof f> => !!f);
      const files = [...isTheBook, ...shelf.other];
      const wearsJacket = new Set(isTheBook.map((f) => f.id));
      for (const f of files) {
        out.push({
          key: `book:${f.id}`,
          source_kind: "book",
          source_id: f.id,
          // The parsed label, not the raw filename. `title` is what the Drive
          // file is called ("Ch15_Measures"); `label`/`num` are what
          // parseChapterNumLabel made of it, and what the books shelf shows.
          // Caching the raw name here put "Ch15_Measures" on a church's
          // dashboard.
          title: f.num ? `Chapter ${f.num} — ${f.label}` : f.label || f.title,
          media_kind: "book",
          context: shelf.name,
          external_url: null,
          file_path: null,
          file_name: f.name,
          file_mime: f.mimeType,
          file_size: f.sizeBytes,
          thumb_path: null,
          // The shelf jacket if this file IS the book; otherwise its own
          // cover if we have one, and a glyph if we do not.
          thumb_url: wearsJacket.has(f.id) ? cover : coverForFile(f.title),
        });
      }
    }
  }

  if (handouts) {
    // Every sheet, the per-module combined PDF, the notebooks and anything in
    // an extras folder. Deduped by Drive id: the same sheet legitimately
    // appears under a module and inside a notebook.
    const seen = new Set<string>();
    const push = (f: HandoutRef, context: string) => {
      if (seen.has(f.id)) return;
      seen.add(f.id);
      out.push({
        key: `handout:${f.id}`,
        source_kind: "handout",
        source_id: f.id,
        title: f.title,
        media_kind: "pdf",
        context,
        external_url: null,
        file_path: null,
        file_name: f.title,
        file_mime: "application/pdf",
        file_size: f.sizeBytes,
        thumb_path: null,
        thumb_url: null,
      });
    };
    // byModule is keyed by module NUMBER ("1", "2"), so using the key as the
    // second line on a picker row printed a bare "1" under every Funnel Fusion
    // sheet. Recover the readable name from the sections we already have.
    const moduleNames = new Map<string, string>();
    for (const r of detail.resources) {
      const order = moduleOrder(r.section);
      if (order != null && !moduleNames.has(String(order))) {
        moduleNames.set(String(order), stripModuleNumber(moduleLabel(r.section)));
      }
    }
    for (const [section, group] of Object.entries(handouts.byModule)) {
      const label = moduleNames.get(section) ?? `Module ${section}`;
      if (group.combined) push(group.combined, label);
      for (const f of group.sheets) push(f, label);
    }
    for (const g of handouts.extras) for (const f of g.files) push(f, g.name);
    for (const f of handouts.notebooks) push(f, "Handouts");
  }

  return out;
}

export async function listHighlights(
  accessToken: string,
  projectId: string
): Promise<Highlight[]> {
  const { data, error } = await createUserClient(accessToken)
    .from("project_highlights")
    .select("*")
    .eq("project_id", projectId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Highlight[];
}

/**
 * Add several at once — the picker is multi-select, so one round trip.
 *
 * Anything already highlighted is skipped rather than erroring: the unique
 * index would reject the whole insert otherwise, losing the new ones because
 * of an old one the coach could not see they had already picked.
 */
export async function addHighlights(
  accessToken: string,
  projectId: string,
  entries: CatalogueEntry[],
  startAt: number
): Promise<void> {
  if (entries.length === 0) return;
  const client = createUserClient(accessToken);
  const rows = entries.map((e, i) => ({
    project_id: projectId,
    source_kind: e.source_kind,
    source_id: e.source_id,
    title: e.title,
    media_kind: e.media_kind,
    external_url: e.external_url,
    file_path: e.file_path,
    file_name: e.file_name,
    file_mime: e.file_mime,
    file_size: e.file_size,
    thumb_path: e.thumb_path,
    thumb_url: e.thumb_url,
    position: startAt + i,
  }));
  const { error } = await client
    .from("project_highlights")
    .upsert(rows, { onConflict: "project_id,source_kind,source_id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function updateHighlight(
  accessToken: string,
  id: string,
  patch: { title?: string; note?: string | null; position?: number }
): Promise<void> {
  const { error } = await createUserClient(accessToken)
    .from("project_highlights")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteHighlight(accessToken: string, id: string): Promise<void> {
  const { error } = await createUserClient(accessToken)
    .from("project_highlights")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
