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
send yourself a test invite from a project. The bodies keep the shell of the
original CVF template (table layout, Poppins, the pink-to-orange bar and
button, the "button not working?" fallback) so nothing looks different to
people who have seen the old one — only the words changed.

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
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f9;margin:0;padding:32px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(31,55,140,0.08);">

        <tr>
          <td bgcolor="#E43D96" style="height:6px;line-height:6px;font-size:0;background:linear-gradient(90deg,#E43D96,#F15A25);">&nbsp;</td>
        </tr>

        <tr>
          <td style="padding:40px 40px 32px 40px;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

            <p style="margin:0 0 8px 0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#C21F73;">
              RunFree
            </p>

            {{ if .Data.invited_to }}
            <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.25;font-weight:800;color:#2B2A55;">
              You've been added to {{ .Data.invited_to }}
            </h1>

            <p style="margin:0 0 24px 0;font-size:15px;line-height:1.65;color:#4b5563;">
              Your team's sessions, key dates, handouts, videos and deliverables
              all live in one place &mdash; your RunFree portal.
            </p>
            {{ else }}
            <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.25;font-weight:800;color:#2B2A55;">
              Your portal access is ready
            </h1>

            <p style="margin:0 0 24px 0;font-size:15px;line-height:1.65;color:#4b5563;">
              You've been given access to the RunFree portal &mdash; your handouts,
              training videos and Will's books, all in one place.
            </p>
            {{ end }}

            <p style="margin:0 0 24px 0;font-size:15px;line-height:1.65;color:#4b5563;">
              Use the button below to set your password and sign in. You can also
              sign in with Google using this same email address.
            </p>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
              <tr>
                <td bgcolor="#E43D96" style="border-radius:8px;background:linear-gradient(90deg,#E43D96,#F15A25);">
                  <a href="{{ .ConfirmationURL }}"
                     style="display:inline-block;padding:14px 32px;font-family:'Poppins',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                    Set up my account
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 24px 0;font-size:13px;line-height:1.6;color:#6b7280;">
              Button not working? Paste this into your browser:<br>
              <a href="{{ .ConfirmationURL }}" style="color:#C21F73;word-break:break-all;">{{ .ConfirmationURL }}</a>
            </p>

            <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px 0;">

            <p style="margin:0;font-size:13px;line-height:1.6;color:#9ca3af;">
              Not expecting this? You can ignore it and nothing will happen. If you
              think it reached you by mistake, reply and let us know.
            </p>

          </td>
        </tr>

        <tr>
          <td style="padding:0 40px 32px 40px;font-family:'Poppins',Helvetica,Arial,sans-serif;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;">
              RunFree &middot; portal.runfree.co
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
```

## 2. Reset password  (also what a re-sent invitation becomes once an account is confirmed)

```
Subject: Your sign-in link for the RunFree Portal
```

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f9;margin:0;padding:32px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(31,55,140,0.08);">

        <tr>
          <td bgcolor="#E43D96" style="height:6px;line-height:6px;font-size:0;background:linear-gradient(90deg,#E43D96,#F15A25);">&nbsp;</td>
        </tr>

        <tr>
          <td style="padding:40px 40px 32px 40px;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

            <p style="margin:0 0 8px 0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#C21F73;">
              RunFree
            </p>

            <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.25;font-weight:800;color:#2B2A55;">
              Set (or reset) your password
            </h1>

            <p style="margin:0 0 24px 0;font-size:15px;line-height:1.65;color:#4b5563;">
              Use the button below to choose a password for
              <strong style="color:#2B2A55;">{{ .Email }}</strong> and sign in to
              your RunFree portal.
            </p>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
              <tr>
                <td bgcolor="#E43D96" style="border-radius:8px;background:linear-gradient(90deg,#E43D96,#F15A25);">
                  <a href="{{ .ConfirmationURL }}"
                     style="display:inline-block;padding:14px 32px;font-family:'Poppins',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                    Choose a password
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 24px 0;font-size:13px;line-height:1.6;color:#6b7280;">
              Button not working? Paste this into your browser:<br>
              <a href="{{ .ConfirmationURL }}" style="color:#C21F73;word-break:break-all;">{{ .ConfirmationURL }}</a>
            </p>

            <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px 0;">

            <p style="margin:0;font-size:13px;line-height:1.6;color:#9ca3af;">
              Not expecting this? You can ignore it and nothing will happen. If you
              think it reached you by mistake, reply and let us know.
            </p>

          </td>
        </tr>

        <tr>
          <td style="padding:0 40px 32px 40px;font-family:'Poppins',Helvetica,Arial,sans-serif;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;">
              RunFree &middot; portal.runfree.co
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
```

## 3. Magic link  (only if you ever turn magic links on — keep it consistent)

```
Subject: Your sign-in link for the RunFree Portal
```

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f9;margin:0;padding:32px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(31,55,140,0.08);">

        <tr>
          <td bgcolor="#E43D96" style="height:6px;line-height:6px;font-size:0;background:linear-gradient(90deg,#E43D96,#F15A25);">&nbsp;</td>
        </tr>

        <tr>
          <td style="padding:40px 40px 32px 40px;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

            <p style="margin:0 0 8px 0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#C21F73;">
              RunFree
            </p>

            <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.25;font-weight:800;color:#2B2A55;">
              Sign in to the RunFree Portal
            </h1>

            <p style="margin:0 0 24px 0;font-size:15px;line-height:1.65;color:#4b5563;">
              Use the button below to sign in as
              <strong style="color:#2B2A55;">{{ .Email }}</strong>. No password needed.
            </p>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
              <tr>
                <td bgcolor="#E43D96" style="border-radius:8px;background:linear-gradient(90deg,#E43D96,#F15A25);">
                  <a href="{{ .ConfirmationURL }}"
                     style="display:inline-block;padding:14px 32px;font-family:'Poppins',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                    Sign me in
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 24px 0;font-size:13px;line-height:1.6;color:#6b7280;">
              Button not working? Paste this into your browser:<br>
              <a href="{{ .ConfirmationURL }}" style="color:#C21F73;word-break:break-all;">{{ .ConfirmationURL }}</a>
            </p>

            <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px 0;">

            <p style="margin:0;font-size:13px;line-height:1.6;color:#9ca3af;">
              Not expecting this? You can ignore it and nothing will happen. If you
              think it reached you by mistake, reply and let us know.
            </p>

          </td>
        </tr>

        <tr>
          <td style="padding:0 40px 32px 40px;font-family:'Poppins',Helvetica,Arial,sans-serif;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;">
              RunFree &middot; portal.runfree.co
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
```

---

### Why not send our own email from the code instead?
It would need a mail provider (Resend, Postmark) with a verified domain, a
template renderer, and a place to store delivery state — none of which exist
here today. The dashboard change takes five minutes and fixes every path at
once (invite, resend, corrected email, reset). If the CVF portal ever needs
different wording, that is the moment to split the projects or move to
`generateLink()` + a provider.
