# Security posture — nagops.com

Correlating the March 2026 axios npm compromise (the incident that prompted this) to the controls on this site: what the attack used, what's implemented here, what still needs doing.

## The axios attack, in one line

A hijacked maintainer account published two poisoned `axios` versions that added `plain-crypto-js` (a typosquat, never imported), whose **postinstall script** dropped a cross-platform RAT on any machine that ran `npm install`. Live ~3 hours. Two attack surfaces: the **developer's build machine** (where the RAT ran) and, in the general case, the **shipped bundle** (where malicious runtime code would reach visitors).

## Technique → control map

| Attack technique | Implemented on nagops | Status |
|---|---|---|
| Malicious code shipped to visitors via compromised dep | CSP `default-src 'none'`, `script-src 'self' + Insights`; no third-party script origins can execute | **Implemented** (in `public/_headers`, ships on next deploy) |
| Exfiltration from the visitor's browser | CSP `connect-src` limited to self + Insights; no arbitrary outbound | **Implemented** |
| Clickjacking / framing | `X-Frame-Options: DENY`, `frame-ancestors 'none'` | **Implemented** |
| MIME confusion | `X-Content-Type-Options: nosniff` | **Implemented (already live)** |
| Downgrade / SSL-strip | `Strict-Transport-Security` 1yr + includeSubDomains | **Implemented** |
| No responsible-disclosure path | `.well-known/security.txt` (real file, replaces the fake-200 the SPA served) | **Implemented** |
| Install-time RAT via postinstall (the actual axios vector) | Depends on the Vite dependency tree — **not yet reviewed** | **GAP — needs source** |
| Typosquat / phantom dependency in the tree | Lockfile + `npm ci` + dependency review | **GAP — needs source** |
| Third-party origin leaking visitor data | Google Fonts (IP → Google) allowlisted, not removed | **GAP — self-host fonts** |
| Compromised push → auto-deploy to production | No branch protection, no required review on `main` | **GAP — deferred (own post)** |

## Implemented (ships on next deploy)

All header controls above, staged in `public/_headers`, plus the real `security.txt`. These defend the **visitor**. The live site currently sends none of them.

## Needed (in priority order)

1. **Locate and review the Vite dependency tree.** This is the direct axios parallel and the biggest gap. `npm ci` (never `npm install` in CI), commit the lockfile, and audit install scripts: `npm query ":attr(scripts,[postinstall])"` to list every package that runs code at install time. A phantom dep like `plain-crypto-js` shows up here.
2. **Self-host the two Google Fonts.** Removes the only third-party data leak to visitors and tightens the CSP to drop `fonts.googleapis.com` / `fonts.gstatic.com`.
3. **Pin the toolchain.** Exact versions for Node and the build in CI; no floating `^` on build-critical tooling.
4. **DNSSEC + no-mail anti-spoofing** (`v=spf1 -all`, DMARC `p=reject`) — dashboard, one-time.
5. **Branch protection / required review on `main`.** Deferred deliberately — it's the subject of a planned post, and the current failure mode (a bad push auto-deploys) is worth writing about, not just fixing silently.

## Boundary note

The header controls protect **visitors**. The dependency review protects the **build machine** — which is where the axios RAT actually executed. They are different targets and both matter; a site that hardens one and ignores the other has a security page that protects nobody.
