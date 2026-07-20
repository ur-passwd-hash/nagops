# Security posture — nagops.com

Correlating the May 2026 TanStack npm compromise (the incident that prompted this) to the controls on this site: what the attack used, what's implemented here, what still needs doing.

## The TanStack attack, in one line

On May 11, 2026, a `pull_request_target` workflow ran fork-controlled code, which poisoned a build cache shared with the release path; the release runner restored it, the payload lifted a short-lived OIDC credential from runner memory, and npm trusted publishing shipped 84 malicious versions across 42 TanStack packages in about six minutes. Two attack surfaces: the **developer/build machine** (install-time execution) and the **shipped bundle** (malicious runtime code reaching visitors).

## Technique → control map

| Attack technique | Implemented on nagops | Status |
|---|---|---|
| Malicious code shipped to visitors via compromised dep | CSP `default-src 'none'`, `script-src 'self' + Insights`; no third-party script origins can execute | **Implemented** (in `public/_headers`, ships on next deploy) |
| Exfiltration from the visitor's browser | CSP `connect-src` limited to self + Insights; no arbitrary outbound | **Implemented** |
| Clickjacking / framing | `X-Frame-Options: DENY`, `frame-ancestors 'none'` | **Implemented** |
| MIME confusion | `X-Content-Type-Options: nosniff` | **Implemented (already live)** |
| Downgrade / SSL-strip | `Strict-Transport-Security` 1yr + includeSubDomains | **Implemented** |
| No responsible-disclosure path | `.well-known/security.txt` (real file, replaces the fake-200 the SPA served) | **Implemented** |
| Install-time execution via lifecycle scripts | pnpm 11: scripts dead by default, `approve-builds` allowlist is empty (Vite 8 ships prebuilt binaries) | **Implemented** |
| Malicious fresh release in the tree | `minimumReleaseAge: 4320` (3-day quarantine), `trustPolicy: no-downgrade`, `blockExoticSubdeps: true` in `pnpm-workspace.yaml`; pnpm lockfile committed | **Implemented** |
| Third-party origin leaking visitor data | Google Fonts (IP → Google) allowlisted, not removed | **GAP — self-host fonts** |
| Compromised push → auto-deploy to production | No branch protection, no required review on `main` | **GAP — deferred (own post)** |

## Implemented (ships on next deploy)

All header controls above, staged in `public/_headers`, plus the real `security.txt`. These defend the **visitor**. The live site currently sends none of them.

## Needed (in priority order)

1. **Self-host the two Google Fonts.** Removes the only third-party data leak to visitors and tightens the CSP to drop `fonts.googleapis.com` / `fonts.gstatic.com`.
2. **Pin the toolchain.** Exact versions for Node and the build in CI; no floating `^` on build-critical tooling.
3. **DNSSEC + no-mail anti-spoofing** (`v=spf1 -all`, DMARC `p=reject`) — dashboard, one-time.
4. **Branch protection / required review on `main`.** Deferred deliberately — it's the subject of a planned post, and the current failure mode (a bad push auto-deploys) is worth writing about, not just fixing silently.

## Boundary note

The header controls protect **visitors**. The dependency review protects the **build machine** — which is where install-time payloads actually execute. They are different targets and both matter; a site that hardens one and ignores the other has a security page that protects nobody.
