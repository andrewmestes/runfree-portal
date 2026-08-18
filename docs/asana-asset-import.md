# Importing Asana attachments

Christ Chapel's charts and finished PDFs were imported from Asana on
2026-08-18. Andrew: "within the tasks listed in the columns in Asana under
Funnel Fusion, Crowd Cloud, I uploaded images or screenshots... I'm wondering
if you can bring any PNGs or screenshots into the place where it says 'From
Our Sessions' directly from Asana, so I don't have to do that manually."

## How it works

Asana's `get_attachments` returns a **signed, time-limited** `download_url`
that needs no auth header — it can be fetched with plain curl. That expiry is
the catch: the URLs are good for roughly an hour, so listing and downloading
have to happen in the same sitting. A URL captured yesterday is a 403 today.

The import is three steps:

1. `get_attachments` per task (there is no bulk endpoint — the project-level
   call returns only project attachments, not its tasks').
2. Download, then upload to the `deliverable-images` bucket at
   `{project_id}/{uuid}.{ext}`, which is the convention the storage RLS
   policies read the project id from (007).
3. Insert `deliverables` rows: images get `image_path` and the Asana task
   name as the caption, so a chart says which exercise produced it; PDFs get
   `file_path`/`file_name`/`file_mime`/`file_size`.

Both land as `kind = 'session_image'` in the module's section, which is what
puts them under "From our sessions" on the module panel.

## What was imported

9 files across two modules — 6 screenshots of live chart work and 3 finished
PDFs (Christ Chapel June '26, the Kingdom Concept Summary, the Problem
Statement).

## Doing it for another project

Attachments are sparse: most tasks have none. Checking all ~90 tasks in a
project costs ~90 calls, so target the ones that plausibly hold artefacts —
`FLIPCHARTS`, anything prefixed `DELIVERABLE:`, and the named exercises
(`6-Word Challenge`, `KC: One Word Refinement`). That found everything in
Christ Chapel.
