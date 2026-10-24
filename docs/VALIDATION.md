# Validation record — 2026-10-24

Run on macOS (Node 24.20, Python via uv) with a clean `uv sync` / `npm install`. Lockfiles are committed.

## Passed

| Check | Result |
| --- | --- |
| Backend pytest | **49 passed** |
| Ruff lint / format | Clean, 18 files |
| DOM extraction tests | **10 passed**: Judge.me, Loox, Yotpo, generic fixtures, plus boundary cases |
| Side-panel behavior tests | **7 passed**: four demo scenarios, backend down, stale-response suppression, malformed response |
| `tsc --noEmit` (full WXT) | Passed |
| ESLint / Prettier | Clean |
| WXT build + manifest check | Passed: MV3 side panel, explicit-click extraction, one backend host (~250 KB total) |
| Backend server | Starts on `127.0.0.1:8000`; `/health` OK; `/analyze` demo returns risk 74 / coverage 100 |
| Live mode, no keys | `/analyze` returns cleanly: Reddit `unavailable`, Instagram/reviews `insufficient-data` |
| Browser preview | Vite serves `preview.html` on `localhost:5173`; CORS preflight from that origin passes |

Backend tests use the HTTPX ASGI transport. They cover API success, invalid provider data, per-source timeouts, all-provider failure, demo isolation, private-URL and oversized-request rejection, TTL and capacity, product isolation within one merchant, forced refresh, missing keys, preservation of original text, retries and body limits, excluding unverified Reddit citations, distinct discussion identity, rejecting DNS lookups that resolve to private addresses, TLS hostname/IP pinning, and refusing redirects.

UI tests run in JSDOM with mocked transport. The mocks return JSON from the real backend demo implementation. They don't test real browser layout, activeTab behavior, or live integrations.

## Not yet verified

1. **Live providers.** Nothing has run with real Backboard, Apify, or GPTZero keys. Quotas, error shapes, and schema drift are still unchecked.
2. **Installed extension, end to end.** Not yet tested: toolbar → side panel → extraction → `/analyze` in real Chrome, retry, switching tabs mid-scan, unsupported pages, and force refresh.
3. **Visual and accessibility QA.** Not yet tested: 380 px and 420 px widths, keyboard focus, long titles, contrast, and screen-reader announcements.
4. **Real storefronts.** The adapters have only been tested on synthetic fixtures.
5. **Deployment.** There's no auth, rate limiting, or Apify spend cap. Keep the server on localhost.
