# Google sign-in branding — the steps (20 Sept 2026)

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
