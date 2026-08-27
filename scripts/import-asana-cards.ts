/**
 * Build the two example cards Andrew named, from the real Asana tasks.
 *
 *   Expectations Exercise  — the prose already in the portal (section_notes,
 *                            converted to a card by 043) plus the chart photo
 *                            from Asana.
 *   Leadership Team Survey — the screenshot as the card's face, the PDF behind
 *                            it, which is exactly how he described it:
 *                            "a card with a screen shot of the image I created
 *                            for that, and when they click on the card it
 *                            opens ... to show the PDF they can download."
 *
 * Deduped by title within the module, so re-running is safe.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/import-asana-cards.ts       # dry run
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/import-asana-cards.ts --go
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const PROJECT = "bd6ab369-52b3-4f0b-be71-8e0351a40fe3";
const BUCKET = "deliverable-images";
const SECTION = "Mod #1 FUNNEL FUSION";
const GO = process.argv.includes("--go");

type Asset = { url: string; name: string; kind: "image" | "doc" };

const EXPECTATIONS_CHART: Asset = {
  name: "Screenshot 2026-06-25 at 10.58.44 AM.png",
  kind: "image",
  url: "https://asanausercontent.com/us1/assets/1203651762071635/1216037913037393/625e17fa0c6beaa7ad0f6860a2cccceb?e=1787810344&v=0&t=2WQesJfH96MQmAQljWLVpKZ4TUA30ipUHXdL8i-EqGU",
};

const SURVEY_SHOT: Asset = {
  name: "Screenshot 2026-06-23 at 7.10.32 AM.png",
  kind: "image",
  url: "https://asanausercontent.com/us1/assets/1203651762071635/1215960128323256/ac83ac704543170494d768207346f4f1?e=1787810491&v=0&t=NhyRKpXz8IYpokcg-VBNzUR0AmcyRxOhSbsc-4x5Cnc",
};

const SURVEY_PDF: Asset = {
  name: "Christ Chapel - Leadership Team Survey.pdf",
  kind: "doc",
  url: "https://asanausercontent.com/us1/assets/1203651762071635/1215960128323254/930d214d960ff7d968f2b5377528b386?e=1787810491&v=0&t=BnVM_mA6F-UOFdLMU2rLJ22I--7fZMj9P9Lgdegwgyo",
};

async function upload(a: Asset): Promise<{ path: string; size: number } | null> {
  const res = await fetch(a.url);
  if (!res.ok) {
    console.log(`   FAIL download ${a.name}: ${res.status}`);
    return null;
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const ext = a.name.split(".").pop()!.toLowerCase();
  const path = `${PROJECT}/${a.kind === "doc" ? "doc-" : ""}${randomUUID()}.${ext}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: a.kind === "doc" ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`,
    upsert: false,
  });
  if (error) {
    console.log(`   FAIL upload ${a.name}: ${error.message}`);
    return null;
  }
  return { path, size: bytes.byteLength };
}

async function main() {
  console.log(GO ? "WRITING\n" : "DRY RUN — nothing will be written\n");

  const { data: existing } = await admin
    .from("deliverables")
    .select("id,title,section,body,image_path,file_path")
    .eq("project_id", PROJECT)
    .eq("section", SECTION);

  const byTitle = new Map((existing ?? []).map((d) => [(d as { title: string }).title, d]));

  // 1. The converted section note becomes the Expectations Exercise card,
  //    and gains the chart it was always describing.
  const converted = byTitle.get("Notes from this module") as
    | { id: string; image_path: string | null }
    | undefined;

  if (!converted) {
    console.log("skip   Expectations Exercise — no converted note found (043 may not have run)");
  } else if (converted.image_path) {
    console.log("skip   Expectations Exercise — already has an image");
  } else if (!GO) {
    console.log(`would  rename the converted note to "Expectations Exercise" and attach its chart`);
  } else {
    const up = await upload(EXPECTATIONS_CHART);
    if (up) {
      const { error } = await admin
        .from("deliverables")
        .update({ title: "Expectations Exercise", image_path: up.path })
        .eq("id", converted.id);
      console.log(
        error ? `FAIL   Expectations Exercise: ${error.message}`
              : `ok     Expectations Exercise — prose + chart (${Math.round(up.size / 1024)} KB)`
      );
    }
  }

  // 2. Leadership Team Survey — screenshot on the face, PDF behind it.
  const survey = byTitle.get("Leadership Team Survey") as
    | { id: string; image_path: string | null; file_path: string | null }
    | undefined;

  if (survey && survey.image_path && survey.file_path) {
    console.log("skip   Leadership Team Survey — already complete");
  } else if (survey) {
    // Created on a previous run before its Asana URLs expired mid-import, so
    // it exists with prose and nothing else. Fill in what is missing rather
    // than leaving a card that promises a PDF it does not have.
    if (!GO) {
      console.log("would  attach the missing screenshot and PDF to Leadership Team Survey");
    } else {
      const img = survey.image_path ? null : await upload(SURVEY_SHOT);
      const pdf = survey.file_path ? null : await upload(SURVEY_PDF);
      const patch: Record<string, unknown> = {};
      if (img) patch.image_path = img.path;
      if (pdf) {
        patch.file_path = pdf.path;
        patch.file_name = SURVEY_PDF.name;
        patch.file_mime = "application/pdf";
        patch.file_size = pdf.size;
      }
      if (Object.keys(patch).length === 0) {
        console.log("skip   Leadership Team Survey — nothing left to attach");
      } else {
        const { error } = await admin.from("deliverables").update(patch).eq("id", survey.id);
        console.log(
          error ? `FAIL   Leadership Team Survey: ${error.message}`
                : `ok     Leadership Team Survey — attached ${Object.keys(patch).join(", ")}`
        );
      }
    }
  } else if (!GO) {
    console.log("would  create Leadership Team Survey with its screenshot and PDF");
  } else {
    const img = await upload(SURVEY_SHOT);
    const pdf = await upload(SURVEY_PDF);
    const maxPos = Math.max(-1, ...(existing ?? []).map((d) => (d as { position?: number }).position ?? -1));
    const { error } = await admin.from("deliverables").insert({
      project_id: PROJECT,
      section: SECTION,
      kind: "session_image",
      title: "Leadership Team Survey",
      body:
        "The leadership team's own read on where the church is — gathered before we met, " +
        "and the baseline every later conversation in Funnel Fusion is measured against.\n\n" +
        "The full results are in the PDF below.",
      image_path: img?.path ?? null,
      file_path: pdf?.path ?? null,
      file_name: pdf ? SURVEY_PDF.name : null,
      file_mime: pdf ? "application/pdf" : null,
      file_size: pdf?.size ?? null,
      position: maxPos + 1,
    } as never);
    console.log(
      error ? `FAIL   Leadership Team Survey: ${error.message}`
            : `ok     Leadership Team Survey — screenshot + PDF`
    );
  }

  console.log("\\nNote: the Insights Discovery profiles are still NOT imported.");
  console.log("They are six named individuals' psychometric reports and need Andrew's");
  console.log("private-vs-shared decision first.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
