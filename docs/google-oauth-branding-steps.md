# Google sign-in branding — the steps (updated 25 Sept 2026)

**Status:** the page is live at https://runfree.co/portal/ (25 Sept). It meets
every home-page rule in Google's current docs (checked 25 Sept). What's left
is below: two small WordPress touches, then the Google Cloud form.

Why August failed (from that day's record): the first check ran against
portal.runfree.co while it showed "Loading…" under the old name, and the
next three against /auth/login, which is a sign-in page (Google rejects a
home page that is only a login page) and still carried a global noindex.

## Before you verify (WordPress, ~10 minutes, recommended)

1. On the runfree.co/portal page, under "Access is by invitation only…", add:
   "If you sign in with Google, the portal receives only your name, email
   address and profile picture, and uses them only to sign you in, match you
   to your invitation and show your name to your project team. It cannot read
   your Gmail, Drive, Calendar or contacts. See our Privacy Policy." (link
   "Privacy Policy" to https://portal.runfree.co/privacy)
2. Yoast, this page: SEO title exactly `RunFree Portal` (delete the separator
   and site-name variables); meta description "RunFree Portal is the private
   online workspace for churches and leaders working with RunFree Co: session
   recordings, notes, handouts, deliverables and tasks, by invitation only."
3. Clear the site cache and check the page in a private window.

## Google Cloud (signed in as authuser=1)

`https://console.cloud.google.com/auth/branding?project=runfree-portal&authuser=1`

- App name: RunFree Portal
- Application home page: `https://runfree.co/portal/` — WITH the slash (without
  it, the URL redirects)
- Privacy policy: `https://portal.runfree.co/privacy` — no slash; it must match
  the link on the page
- Terms of service: `https://portal.runfree.co/terms`
- Authorized domains: exactly `txaesavbpbtyqhzhcabm.supabase.co` and
  `runfree.co`. If a row says `portal.runfree.co`, change it to `runfree.co`.
  Don't add bare `supabase.co`, don't delete the Supabase host (it is the
  sign-in redirect).
- Leave the logo, Audience (External, In production) and Data Access (no
  scopes) as they are. Save.

Then: View issues → "I have fixed the issues" → Proceed (or "Verify
branding"). It is automated and usually takes minutes. On "Ready to
publish", click **Publish branding** within 7 days, then test in a private
window: Google should say "to continue to RunFree Portal".

If the SAME two findings come back, don't re-run it in a loop: choose "I
believe the issues found are incorrect. Request additional review" (a person
reviews in ~2–3 business days) with: "The home page https://runfree.co/portal/
is headed 'RunFree Portal', exactly matching the app name, describes the
app's purpose and how it uses Google sign-in data, and links to the privacy
policy https://portal.runfree.co/privacy and terms. runfree.co is verified in
Search Console. txaesavbpbtyqhzhcabm.supabase.co is the OAuth callback of our
authentication provider, Supabase Auth, and cannot be owned by us. The app
requests only openid, email and profile."

---

## The original steps (20 Sept), kept for reference

Goal: the Google sign-in screen says **"to continue to RunFree Portal"**
instead of "to continue to txaesavbpbtyqhzhcabm.supabase.co".

Why it fails today: Google verifies the app against the **top-level domain**
in Authorized domains — `runfree.co`, your WordPress site — and finds no page
there that mentions "RunFree Portal". Nothing on portal.runfree.co can fix
that, and Google refuses `portal.runfree.co` as an authorized domain.

## Part 1 — WordPress (runfree.co), about 10 minutes

1. Log in to WordPress → **Pages → Add New**.
2. Title: **RunFree Portal** (exactly that — Google compares it to the app name).
3. Slug/permalink: **portal** → the page lives at `https://runfree.co/portal`.
4. Paste the copy below. Add the RunFree logo if the theme makes it easy.
5. Make sure the page is **not** set to noindex (Yoast/Rank Math: "Allow
   search engines to show this page" = Yes). Publish.
6. Open `https://runfree.co/portal` in a private window and confirm it loads.

### Copy

> **RunFree Portal**
>
> The RunFree Portal is the private online workspace for churches and leaders
> working with RunFree Co. It is where a church's vision-framing engagement
> lives between sessions: the preparation checklist, session recordings and
> notes, the handouts and teaching videos for each tool, the team's
> deliverables — mission, values, strategy, measures and the Horizon
> Storyline — and the tasks the team has committed to. Certified Vision
> Framers also use it for their certification resources.
>
> Access is by invitation only. Sign in with the email address your RunFree
> coach invited, or with a Google account that uses that same address.
>
> **Sign in:** https://portal.runfree.co
> **Privacy Policy:** https://portal.runfree.co/privacy
> **Terms of Service:** https://portal.runfree.co/terms
>
> Questions: andrew@runfree.co

## Part 2 — Google Cloud, about 5 minutes

Sign in as the account that owns the project — it is under **authuser=1**,
not your primary Google login. Open:

`https://console.cloud.google.com/auth/branding?project=runfree-portal&authuser=1`

1. **App name:** RunFree Portal.
2. **Application home page:** `https://runfree.co/portal`
3. **Privacy policy:** `https://portal.runfree.co/privacy`
   **Terms of service:** `https://portal.runfree.co/terms`
4. **Authorized domains:** `runfree.co` and `supabase.co`. If a second row
   still says `portal.runfree.co` from the August attempt, change it back to
   `runfree.co` or delete it — Google rejects it and the form won't save.
5. **Save.** Then go to **Verification Center** (left menu) → **Submit for
   verification** (or "Prepare for verification"). Answer the questionnaire:
   the app uses only the basic sign-in scopes (email, profile, openid); no
   sensitive scopes.
6. Google emails a decision, usually within a few days. Nothing to change in
   the portal or Supabase — the redirect and the code are already right.

## What I can do vs. what needs you

- I can write the WordPress page for you if you give me a WP login, and I can
  fill the Google form on your screen once you're signed in as authuser=1.
- Only you can be signed in to those two accounts.
