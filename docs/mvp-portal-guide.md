# CredVault MVP Portal — Run & Phone-Test Guide

> The three MVP apps, served by one stateless server (step1-degree/src/portal/server.ts).
> Prerequisites: devnet running, runtime batch + premint done (packages exist).

## Start

```bash
cd apps/credvault/step1-degree
npm run portal        # → http://localhost:4050
```

| App | URL | Role |
|---|---|---|
| Verifier portal | /verify.html | paste link/JSON/file → VERIFIED page (L2 option) |
| Holder PWA | /holder.html | import package → pick disclosure → QR share |
| Issuer console | /issuer.html | CSV upload → batch anchor → package links, revoke |

## Phone test (Android, same WiFi)

1. Laptop: hostname -I → note the 192.168.x.x address (ours: **192.168.4.113**)
2. Phone browser → http://192.168.4.113:4050/holder.html
3. Laptop (issuer console): open /issuer.html → Students → copy a package link
   (e.g. http://192.168.4.113:4050/api/packages/STU-001.json)
4. Phone: paste that link into "Add a credential package" → Import
5. Phone: Share → uncheck a course or two (subset!) → Create share QR
6. Laptop: open the QR link (or point a second device camera at it) → verifier
   portal shows VERIFIED with "N courses SEALED"

### PWA install notes
- Over plain LAN HTTP, the app works in-browser; Chrome's **Install** prompt
  needs HTTPS (or localhost). Camera QR-scanning also needs HTTPS.
- For a real install test: put the portal behind HTTPS (e.g. Caddy on the AWS
  instance with a domain) — noted in MVP.md cuts.
- The share-link QR flow works without any of that: the QR just encodes a URL.

## Console CSV format

```csv
studentId,fullName,degree,gpa,courseCode,courseTitle,credits,grade
STU-101,Maya Patel,B.S. Computer Science,391,CS101,Intro to Computer Science,3,A
```
One row per course; rows group by studentId; GPA ×100. A sample lives at
data/sample-cohort.csv. Batch runs as a background job (~60-90s; the console
shows live logs).

## Troubleshooting the portal UI

| Symptom | Likely cause / fix |
|---|---|
| A button does NOTHING (no log, no error) | A JS error killed the page's script block — open browser devtools console. (We ship `npx tsx src/test-ui.ts`, a Playwright test that drives the console end-to-end.) |
| Page looks stale / fixes missing | Browser cache — hard-refresh with Ctrl+Shift+R (or Cmd+Shift+R). |
| JSON blob `{"type":"Buffer"…}` instead of a page | Old server bug (fixed) — pull the new tarball and restart the portal. |
| Copy button silent | Was a secure-context issue (LAN HTTP) — fixed with a fallback; also see the hard-refresh note. |

## Architecture notes
- The presentation drop (/api/presentations) is a 15-min TTL cache used ONLY
  for QR handoff — bundles are processed and discarded; no credential store.
- Issuer batch/revoke spawn the runtime CLI as a subprocess (isolation +
  streamed logs), so the portal never dies with a job.
- The verifier UI and HTTP service share verify-core.ts — one implementation.

## Demo flow that never fails

1. Console: upload data/sample-cohort.csv → Run batch → wait for ✅
2. Phone holder app: import Maya's package via her link
3. Phone: share → subset (drop a course) → QR
4. Laptop verifier: open the QR link → VERIFIED, "1 course SEALED"
5. Console: revoke Tom Becker → re-verify his presentation → ✗ REVOKED