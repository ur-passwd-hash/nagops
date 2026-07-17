# nagops.com

Source-of-record for [nagops.com](https://nagops.com), the IS IT DONE YET page.

## State (2026-07-17)

- The live site is a Vite build deployed to Cloudflare Pages. **Its source is not in this repo yet** — drop the Vite project in at the root (package.json, src/, etc.).
- `public/` already holds the hardening files. Vite copies `public/` into `dist/` verbatim, so they ship automatically once the source lands here:
  - `_headers` — CSP, HSTS, frame/permissions/nosniff policies. Live site currently has none of these.
  - `.well-known/security.txt` — real file; the live SPA catch-all currently fakes a 200 for this path.

## Live bundle review (2026-07-17, fetched from nagops.com)

Reviewed the deployed 67 KB JS bundle and index.html directly. Findings, all low-risk:

- **No dangerous sinks:** zero `eval`, `new Function`, `document.write`, `outerHTML`, `atob`, WebSocket, or XHR. The single `innerHTML` write is a static string literal with no interpolation and no variable — not an injection sink. No user-input surface (no inputs, prompts, contenteditable, clipboard).
- **One `fetch`:** framework-internal, no external host appears anywhere in the bundle. `mousemove` handlers ×2 = the "move your mouse" gag, not tracking.
- **Two external origins, both in the HTML head:** Google Fonts (`fonts.googleapis.com` + `fonts.gstatic.com`). This is the one real finding — a privacy leak (visitor IP to Google) and a third-party dependency. The staged CSP allowlists them so nothing breaks on deploy; **self-hosting the fonts is the follow-up** to reach zero-third-party, and is good material for the securing-nagops post.
- Third parties total: Google Fonts + the Cloudflare Insights beacon. Both allowlisted in `_headers`; both removable (self-host fonts; toggle off Web Analytics) if going zero-third-party.

## When the source lands

```bash
npm ci
npm run build
ls dist/_headers dist/.well-known/security.txt
```

Deploy the same way the site deploys today. Verify live:

```bash
curl -sI https://nagops.com | grep -iE "strict-transport|content-security"
curl -s https://nagops.com/.well-known/security.txt
```

## Beacon decision

The CSP allowlists Cloudflare Insights. To go zero-third-party: toggle off Web Analytics on the Pages project, then remove both `cloudflareinsights` entries from `public/_headers`.

## Domain layer (dashboard, one-time)

- DNSSEC: DNS → Settings → Enable.
- No-mail anti-spoofing: TXT `@` `"v=spf1 -all"`, TXT `_dmarc` `"v=DMARC1; p=reject; adkim=s; aspf=s"`. Remove if the domain ever sends mail.
