# Validation record — 2026-10-25

Run on Linux (Node 22.22, Python 3.13 via uv) after `uv sync` and `npm install`. Lockfiles are committed.

## Passed

| Check | Result |
| --- | --- |
| Backend pytest | **91 passed** |
| Ruff lint / format | Clean |
| Extension Vitest | **45 passed**: 21 extraction (review adapters, payment/policy/price signals, false-positive guards), 21 panel behavior, 3 recent-checks storage |
| `tsc --noEmit` (full WXT) | Passed |
| ESLint / Prettier | Clean |
| WXT build + manifest check | Passed: MV3 side panel, click-only extraction, http(s) page access plus one backend host, permissions limited to `sidePanel`, `activeTab`, `scripting`, `storage` |
| Backend server | Starts on `127.0.0.1:8000`; `/health` OK; all four demo scenarios return a decision, payment guidance and a brief |
| Browser preview | Rendered in headless Chromium at 400 px for all four scenarios; decision banner, how-to-pay card, evidence and recent checks lay out without overflow |

Backend tests use the HTTPX ASGI transport and fake clients, and never touch the network. Beyond the original coverage (API errors, timeouts, demo isolation, SSRF and redirect refusal, cache identity, citation verification), they now cover:

- the RDAP store provider: new domains, old domains, RDAP failure, and refusing non-HTTPS redirects
- payment ranking and the irreversible-method warning
- the verdict rules
- the brief falling back to the template when there's no key, when the client raises, and on non-`end_turn` stop reasons
- requests without `pageSignals`, which still work for older clients

Panel tests run in JSDOM against fixture JSON generated from the real backend demo output. They also check that an older backend response, with the new fields missing or `null`, still renders.

## Not yet verified

1. **Live providers.** Nothing has run with real Backboard, Apify, GPTZero, or Anthropic keys. RDAP has only been tested with mocked responses.
2. **Installed extension, end to end.** Not yet tested in real Chrome: toolbar → side panel → extraction → `/analyze`, plus tab switching mid-scan.
3. **Real storefronts.** Review and payment adapters have only been tested on synthetic fixtures.
4. **Accessibility audit.** Keyboard focus and live-region announcements are covered by tests, but there's been no screen-reader pass.
5. **Deployment.** There's no auth, rate limiting, or Apify spend cap. Keep the server on localhost.
