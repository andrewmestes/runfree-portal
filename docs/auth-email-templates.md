# Auth email templates — what to paste into Supabase

The portal does not send its own mail. Invitations, sign-in links and password
resets all go out through Supabase Auth, using the ONE set of templates on the
`runfree-portal` project (`txaesavbpbtyqhzhcabm`). That project is shared with
the Certified Vision Framers portal, which is why a church elder added to a
Pivvot project received an email whose subject read **"Run Free Vision Framers
Portal"**. Nothing in this repo can change that wording — it lives in the
dashboard — so this file is the wording to paste.

**Where:** Supabase dashboard → Authentication → **Emails** → Templates.
Three templates matter. Paste the subject and the body for each, save, and
send yourself a test invite from a project.

Also check **Project Settings → Authentication → SMTP settings → Sender name**
(only present if custom SMTP is on). If it says anything with "Vision Framer"
in it, change it to `RunFree Portal`.

The code now passes two things into every invited account's metadata, which
the templates read:

- `{{ .Data.invited_to }}` — the project name, e.g. *Athena Christian Church -
  Pivvot Vision Framing*. Set when someone is added through a project. Empty
  for people added from the admin or certification pages, so the template
  falls back to generic wording.
- `{{ .Data.portal }}` — always `runfree`.

---

## 1. Invite user  (subject line first)

```
Subject: {{ if .Data.invited_to }}You've been added to {{ .Data.invited_to }}{{ else }}Welcome to the RunFree Portal{{ end }}
```

```html
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#141834;line-height:1.55">
  <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#7C81A0;margin:0 0 20px">RunFree Portal</p>

  {{ if .Data.invited_to }}
  <h1 style="font-size:22px;margin:0 0 12px">You've been added to<br>{{ .Data.invited_to }}</h1>
  <p style="margin:0 0 20px">Your team's sessions, key dates, handouts and deliverables all live in one place. Set a password and you're in.</p>
  {{ else }}
  <h1 style="font-size:22px;margin:0 0 12px">Welcome to the RunFree Portal</h1>
  <p style="margin:0 0 20px">Set a password and you're in.</p>
  {{ end }}

  <p style="margin:0 0 28px">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#1F378C;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Set my password &amp; sign in</a>
  </p>

  <p style="font-size:13px;color:#4A4F70;margin:0 0 8px">This link is for <strong>{{ .Email }}</strong> and works once. If it has expired, ask whoever added you to resend the invitation — it's one click on their end.</p>
  <p style="font-size:13px;color:#4A4F70;margin:0 0 24px">You can also sign in with Google using this same email address.</p>

  <p style="font-size:12px;color:#7C81A0;margin:0">RunFree · portal.runfree.co</p>
</div>
```

## 2. Reset password  (also what a re-sent invitation becomes once an account is confirmed)

```
Subject: Your sign-in link for the RunFree Portal
```

```html
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#141834;line-height:1.55">
  <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#7C81A0;margin:0 0 20px">RunFree Portal</p>
  <h1 style="font-size:22px;margin:0 0 12px">Set (or reset) your password</h1>
  <p style="margin:0 0 20px">Use the button below to choose a password for <strong>{{ .Email }}</strong>. If you didn't ask for this and weren't expecting an invitation, you can ignore it.</p>
  <p style="margin:0 0 28px">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#1F378C;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Choose a password</a>
  </p>
  <p style="font-size:12px;color:#7C81A0;margin:0">RunFree · portal.runfree.co</p>
</div>
```

## 3. Magic link  (only if you ever turn magic links on — keep it consistent)

```
Subject: Your sign-in link for the RunFree Portal
```

Same body as the reset template with the heading **Sign in to the RunFree Portal** and the button text **Sign me in**.

---

### Why not send our own email from the code instead?
It would need a mail provider (Resend, Postmark) with a verified domain, a
template renderer, and a place to store delivery state — none of which exist
here today. The dashboard change takes five minutes and fixes every path at
once (invite, resend, corrected email, reset). If the CVF portal ever needs
different wording, that is the moment to split the projects or move to
`generateLink()` + a provider.
