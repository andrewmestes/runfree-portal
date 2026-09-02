import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { VISION_FRAME, framePrompt, type FrameVoice, type VisionFrameElement } from "@/lib/vision-frame";

/**
 * The Vision Frame as a one-page PDF.
 *
 * Andrew, on the Vision Frame Progress sheet: "it would be kind of cool if
 * they could just click to download, and anything that's currently there
 * would come out in a one-page PDF, similar to examples that I've shown you."
 *
 * The examples (EDDS, WoundLocal, Vanguard) are portrait one-pagers: a
 * header band, the Mission across the top, Values and Measures side by
 * side, the Strategy with its picture, the Vision at the foot. This draws
 * that, in the brand's own faces (Montserrat for the headline, Poppins for
 * everything else), and only what is written — an empty side of the frame
 * is left out rather than printed as a blank box.
 *
 * pdf-lib rather than a headless browser: it runs inside a Vercel function
 * with no Chrome, and the layout is simple enough to place by hand. The
 * body size steps down until everything fits one page; a church that wrote
 * a page of values still gets one sheet.
 */

const C = {
  navy: rgb(0x1f / 255, 0x37 / 255, 0x8c / 255),
  navyDeep: rgb(0x13 / 255, 0x1d / 255, 0x45 / 255),
  magenta: rgb(0xe4 / 255, 0x3d / 255, 0x96 / 255),
  magentaDeep: rgb(0xc2 / 255, 0x1f / 255, 0x73 / 255),
  orange: rgb(0xf1 / 255, 0x5a / 255, 0x25 / 255),
  pink: rgb(0xfc / 255, 0xe9 / 255, 0xf1 / 255),
  indigo: rgb(0xe9 / 255, 0xed / 255, 0xf9 / 255),
  ink: rgb(0x13 / 255, 0x1d / 255, 0x45 / 255),
  gray: rgb(0x6b / 255, 0x72 / 255, 0x80 / 255),
  white: rgb(1, 1, 1),
};

export type FrameInput = {
  church: string;
  engagement: string | null;
  voice: FrameVoice;
  elements: VisionFrameElement[];
  text: Partial<Record<VisionFrameElement, string | null>>;
  sketch: { bytes: Uint8Array; mime: string } | null;
  logo: Uint8Array | null;
};

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;

/** Rich text (cleanRichText's subset) to lines. Bullets keep their dot. */
function plainText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/\r/g, "")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|h[1-6]|li|ul|ol)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l, i, arr) => l !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .trim();
}

function wrap(font: PDFFont, size: number, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (para === "") {
      out.push("");
      continue;
    }
    const words = para.split(" ");
    let line = "";
    for (const w of words) {
      const probe = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(probe, size) <= maxWidth || !line) line = probe;
      else {
        out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

type Fonts = { display: PDFFont; bold: PDFFont; semi: PDFFont; body: PDFFont };

async function loadFonts(doc: PDFDocument): Promise<Fonts> {
  const dir = path.join(process.cwd(), "src", "lib", "pdf", "fonts");
  const read = (name: string) => readFile(path.join(dir, name));
  const [display, bold, semi, body] = await Promise.all([
    read("Montserrat-ExtraBold.ttf"),
    read("Poppins-Bold.ttf"),
    read("Poppins-SemiBold.ttf"),
    read("Poppins-Regular.ttf"),
  ]);
  return {
    display: await doc.embedFont(display, { subset: true }),
    bold: await doc.embedFont(bold, { subset: true }),
    semi: await doc.embedFont(semi, { subset: true }),
    body: await doc.embedFont(body, { subset: true }),
  };
}

/** Tallest the Strategy sketch may be; the fit loop lowers it. */
let IMAGE_MAX = 150;

type Block = {
  key: VisionFrameElement;
  label: string;
  question: string | null;
  lines: string[];
  bodySize: number;
  pill: ReturnType<typeof rgb>;
  band: ReturnType<typeof rgb> | null;
  bandText: ReturnType<typeof rgb>;
  centered: boolean;
  span: "full" | "half";
  image?: PDFImage | null;
};

function pillFor(key: VisionFrameElement) {
  switch (key) {
    case "mission":
      return { pill: C.magenta, band: C.pink, text: C.ink, centered: true };
    case "values":
      return { pill: C.orange, band: null, text: C.ink, centered: false };
    case "measures":
      return { pill: C.navy, band: C.indigo, text: C.ink, centered: false };
    case "strategy":
      return { pill: C.magentaDeep, band: null, text: C.ink, centered: false };
    case "vision_proper":
      return { pill: C.pink, band: C.navyDeep, text: C.white, centered: true };
    default:
      return { pill: C.gray, band: null, text: C.ink, centered: false };
  }
}

/** Height of one block at the given body size, for the fit loop. */
function blockHeight(b: Block, width: number, fonts: Fonts): number {
  const lineH = b.bodySize * 1.38;
  const textW = width - 28 - (b.image ? width * 0.42 : 0);
  const lines = wrap(fonts.body, b.bodySize, b.lines.join("\n"), textW);
  let h = 12 + 18 + 8 + lines.length * lineH + 12; // pad, pill, gap, text, pad
  if (b.image) {
    const boxW = width * 0.4;
    const scale = Math.min(boxW / b.image.width, IMAGE_MAX / b.image.height);
    h = Math.max(h, 12 + 18 + 8 + b.image.height * scale + 12);
  }
  return h;
}

function drawBlock(page: PDFPage, b: Block, x: number, yTop: number, width: number, fonts: Fonts): number {
  const h = blockHeight(b, width, fonts);
  const lineH = b.bodySize * 1.38;
  if (b.band) {
    page.drawRectangle({ x, y: yTop - h, width, height: h, color: b.band, borderWidth: 0 });
  } else {
    page.drawRectangle({
      x,
      y: yTop - h,
      width,
      height: h,
      borderColor: C.indigo,
      borderWidth: 1,
      color: C.white,
    });
  }
  // The pill.
  const label = b.label.toUpperCase();
  const pillFont = fonts.bold;
  const pillSize = 8.5;
  const pillW = pillFont.widthOfTextAtSize(label, pillSize) + 18;
  const pillX = b.centered ? x + width / 2 - pillW / 2 : x + 14;
  const pillY = yTop - 12 - 18;
  page.drawRectangle({ x: pillX, y: pillY, width: pillW, height: 18, color: b.pill, borderWidth: 0 });
  const pillTextColor = b.key === "vision_proper" ? C.magentaDeep : C.white;
  page.drawText(label, { x: pillX + 9, y: pillY + 5.5, size: pillSize, font: pillFont, color: pillTextColor });
  if (b.question && !b.centered) {
    page.drawText(b.question.toUpperCase(), {
      x: pillX + pillW + 8,
      y: pillY + 5.5,
      size: 7.5,
      font: fonts.semi,
      color: b.key === "vision_proper" ? C.white : C.gray,
    });
  }
  // The text.
  const textW = width - 28 - (b.image ? width * 0.42 : 0);
  const lines = wrap(fonts.body, b.bodySize, b.lines.join("\n"), textW);
  let y = pillY - 8 - b.bodySize;
  for (const line of lines) {
    const w = fonts.body.widthOfTextAtSize(line, b.bodySize);
    const lx = b.centered ? x + width / 2 - w / 2 : x + 14;
    page.drawText(line, { x: lx, y, size: b.bodySize, font: fonts.body, color: b.bandText });
    y -= lineH;
  }
  if (b.image) {
    const boxW = width * 0.4;
    const scale = Math.min(boxW / b.image.width, IMAGE_MAX / b.image.height);
    const iw = b.image.width * scale;
    const ih = b.image.height * scale;
    page.drawImage(b.image, { x: x + width - 14 - iw, y: yTop - 12 - ih, width: iw, height: ih });
  }
  return h;
}

export async function renderVisionFramePdf(input: FrameInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${input.church} — Vision Frame`);
  doc.setAuthor("RunFree");
  const fonts = await loadFonts(doc);
  const page = doc.addPage([PAGE_W, PAGE_H]);

  // Header band.
  const headerH = 92;
  page.drawRectangle({ x: 0, y: PAGE_H - headerH, width: PAGE_W, height: headerH, color: C.navyDeep });
  page.drawRectangle({ x: 0, y: PAGE_H - headerH - 3, width: PAGE_W, height: 3, color: C.magenta });
  page.drawText("VISION FRAME", { x: MARGIN, y: PAGE_H - 34, size: 8.5, font: fonts.bold, color: C.magenta });
  let titleSize = 24;
  while (fonts.display.widthOfTextAtSize(input.church, titleSize) > PAGE_W - MARGIN * 2 - 140 && titleSize > 14) titleSize -= 1;
  page.drawText(input.church, { x: MARGIN, y: PAGE_H - 62, size: titleSize, font: fonts.display, color: C.white });
  if (input.engagement) {
    page.drawText(input.engagement, { x: MARGIN, y: PAGE_H - 78, size: 8.5, font: fonts.body, color: rgb(0.78, 0.8, 0.9) });
  }
  if (input.logo) {
    try {
      const logo = await doc.embedPng(input.logo);
      const lh = 26;
      const lw = (logo.width / logo.height) * lh;
      page.drawImage(logo, { x: PAGE_W - MARGIN - lw, y: PAGE_H - 34 - lh + 6, width: lw, height: lh });
    } catch {
      /* the header is fine without it */
    }
  }

  // The blocks, in frame order, only what is written.
  let sketch: PDFImage | null = null;
  if (input.sketch) {
    try {
      sketch = /png/i.test(input.sketch.mime)
        ? await doc.embedPng(input.sketch.bytes)
        : await doc.embedJpg(input.sketch.bytes);
    } catch {
      sketch = null;
    }
  }
  const order: VisionFrameElement[] = ["mission", "values", "measures", "strategy", "vision_proper", "problem_statement", "kingdom_concept"];
  const blocks: Block[] = [];
  for (const key of order) {
    if (!input.elements.includes(key)) continue;
    const text = plainText(input.text[key]);
    const isStrategy = key === "strategy";
    if (!text && !(isStrategy && sketch)) continue;
    const el = VISION_FRAME.find((e) => e.key === key)!;
    const look = pillFor(key);
    blocks.push({
      key,
      label: key === "vision_proper" ? "Vision" : el.label,
      question: el.question ? el.question.replace(/^The /, "The ") : null,
      lines: text ? text.split("\n") : [""],
      bodySize: 11,
      pill: look.pill,
      band: look.band,
      bandText: look.text,
      centered: look.centered,
      span:
        key === "values" || key === "measures" || key === "problem_statement" || key === "kingdom_concept"
          ? "half"
          : "full",
      image: isStrategy ? sketch : null,
    });
  }

  const contentTop = PAGE_H - headerH - 3 - 22;
  const contentBottom = 48;
  const width = PAGE_W - MARGIN * 2;
  const gap = 10;

  // Fit: step the body size down until the column fits the page, and if it
  // still will not, give the sketch less room and try again.
  let bodySize = 11;
  IMAGE_MAX = 150;
  const totalHeight = () => {
    let h = 0;
    let i = 0;
    while (i < blocks.length) {
      const b = blocks[i];
      const next = blocks[i + 1];
      if (b.span === "half" && next?.span === "half") {
        h += Math.max(blockHeight(b, (width - gap) / 2, fonts), blockHeight(next, (width - gap) / 2, fonts)) + gap;
        i += 2;
      } else {
        h += blockHeight(b, width, fonts) + gap;
        i += 1;
      }
    }
    return h;
  };
  const available = contentTop - contentBottom;
  for (const imageMax of [150, 120, 96, 72]) {
    IMAGE_MAX = imageMax;
    bodySize = 11;
    for (const b of blocks) b.bodySize = bodySize;
    while (bodySize > 8 && totalHeight() > available) {
      bodySize -= 0.5;
      for (const b of blocks) b.bodySize = bodySize;
    }
    if (totalHeight() <= available) break;
  }

  // Draw.
  let y = contentTop;
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    const next = blocks[i + 1];
    if (b.span === "half" && next?.span === "half") {
      const halfW = (width - gap) / 2;
      const hA = drawBlock(page, b, MARGIN, y, halfW, fonts);
      const hB = drawBlock(page, next, MARGIN + halfW + gap, y, halfW, fonts);
      y -= Math.max(hA, hB) + gap;
      i += 2;
    } else {
      const h = drawBlock(page, b, MARGIN, y, width, fonts);
      y -= h + gap;
      i += 1;
    }
  }

  if (blocks.length === 0) {
    page.drawText("Nothing written on the frame yet.", { x: MARGIN, y: contentTop - 20, size: 11, font: fonts.body, color: C.gray });
  }

  // Footer.
  const stamp = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  page.drawText(`${input.church} · Vision Frame · ${stamp}`, { x: MARGIN, y: 24, size: 7.5, font: fonts.body, color: C.gray });
  const tail = "Facilitated by RunFree · runfree.co";
  page.drawText(tail, { x: PAGE_W - MARGIN - fonts.semi.widthOfTextAtSize(tail, 7.5), y: 24, size: 7.5, font: fonts.semi, color: C.magentaDeep });

  return doc.save();
}

/** The prompt shown when a side is empty in the portal — unused here, kept for parity. */
export { framePrompt };
