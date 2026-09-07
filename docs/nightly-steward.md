# The nightly steward

Andrew, 6 Sept 2026: "setup a useful loop for me for the portal" — a check that
runs every night while the Claude Code session is open, writes a morning
report, and fixes only what is clearly broken, on a branch, never on `main`.

This file is the prompt the job runs. It lives in the repo so it is
versioned and so the job can be re-armed after a restart with:

```
/loop 24h  (paste the prompt below)
```

or by asking: "re-arm the nightly steward from docs/nightly-steward.md".

Reports land in `~/Desktop/ChatGPT:Claude Data/RunFree Portal Nightly/`,
one Markdown file per night, outside the repo so they never show up as
uncommitted changes.

## Limits worth knowing

- A `/loop` job lives inside one Claude Code session. It fires only while
  that session is open, the app is running, and the Mac is awake — and it
  expires after seven days, so it needs re-arming weekly.
- It reads and tests freely. It writes to production only through a
  branch and a Vercel preview URL for Andrew to approve in the morning.
- It never runs a migration, never deletes or edits rows in a real
  project, never touches the CVF tables, never pushes to `main`.

## The prompt

Nightly steward for the RunFree Client Portal. You are running unattended;
nobody will answer a question until morning.

Repo: `/Users/Revive_Worship/Desktop/ChatGPT:Claude Data/runfree-client-portal`.
Read `CLAUDE.md` first if it is not already in context. Never `npm run …` —
call `./node_modules/.bin/…` directly. Never `next build` while `next dev`
runs. Supabase project ref `txaesavbpbtyqhzhcabm` (match by ref, not name).
The only real projects are Athena Christian Church
(`8820b0e9-a849-448c-a1b1-913f24fa8efd`), Christ Chapel, and Andrew's
"test coaching". Keep the whole run under about twenty minutes of work.

Do, in order:

1. **Health.** `curl -s -o /dev/null -w '%{http_code}' https://portal.runfree.co/`
   must be 200. `/opt/homebrew/bin/vercel ls runfree-portal` — the newest
   production deployment must be Ready. Supabase `get_advisors` for
   security and performance, and `query_logs` for the api, postgres and
   auth services — note errors from the last 24 hours only, and only what
   is new against the previous report.
2. **Security.** Run
   `./node_modules/.bin/tsx --env-file=.env.local tests/rls.test.ts`.
   Every check must pass. It creates and deletes its own users; confirm
   afterwards with SQL that no `rls-test-%` users remain.
3. **Data hygiene, read-only SQL.** Flag, never delete: projects other than
   the three above; `auth.users` whose email matches `scratch`,
   `mobile-audit`, `rls-test` or `panel-shot`. Then, for the real
   projects: sessions in the next seven days, `project_tasks` past due and
   not done, initiatives with no check-in for fourteen or more days
   (`initiative_updates`, else `last_review_on`, else `start_date`),
   midground measures with no reading in thirty days, and
   `project_highlights` rows with a null `thumb_path` and no cached art.
4. **Experience.** Start the dev server in the background
   (`./node_modules/.bin/next dev -p 3001`, log to
   `/tmp/next-dev-3001.log`), wait for `http://localhost:3001/` to answer,
   then run `scripts/mobile-audit.ts` against Athena and `scripts/sweep.ts`.
   Read what they report: spills, console errors, broken images. Stop the
   dev server when done (`pkill -f "next dev -p 3001"`).
5. **Repo.** On `main`, `git status` must be clean and `git log origin/main
   -1` must be the deployed commit. If not, report it; do not commit
   someone else's work.
6. **Report.** Write
   `~/Desktop/ChatGPT:Claude Data/RunFree Portal Nightly/YYYY-MM-DD.md`
   (today's date). First line: `# Nightly — <date> — GREEN | AMBER | RED`.
   Then one line per check, what changed since the most recent earlier
   report (read it), and **Suggested improvements** — at most three,
   concrete, each with why it matters and a rough size (an hour, a
   morning, a day). Then say the same in chat in under ten lines.
7. **Fixes, only when a check is RED with an obvious, contained cause** — a
   failing test, a 500, a broken image or link, a copy error. Create
   `nightly/YYYY-MM-DD` from `main`, fix, typecheck with
   `./node_modules/.bin/tsc --noEmit -p tsconfig.json`, commit, push the
   branch, and put its Vercel preview URL in the report. Then
   `git checkout main`. Never push to `main`. Never write a migration.
   Never delete or modify rows in a real project. Never touch
   `certified_framers`, `resources`, `resource_access_logs`,
   `ghl_sync_log` or `training_videos`. If a fix would take more than
   about thirty minutes or needs a decision, describe it in the report
   instead of doing it.
8. If the headline is RED, send one PushNotification under 200 characters
   saying what is red. Otherwise send nothing.

Stop when the report is written. Do not schedule anything else.
