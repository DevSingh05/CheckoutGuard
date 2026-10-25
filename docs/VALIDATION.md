# Validation record — CheckoutGuard v0.2.0, 2026-10-25

## Passed in this session

| Check | Result |
| --- | --- |
| Backend pytest | **107 passed** |
| Backend Ruff lint and format | Clean |
| Frontend Vitest | **51 passed**: 22 extraction, 26 panel behavior, 3 recent-check storage |
| Full extension TypeScript check | Passed |
| ESLint | Passed |
| Prettier | Passed |
| WXT production build | Passed; MV3 output approximately 286 KB |
| Manifest assertion | Passed; side panel, click-triggered extraction, expected permissions/hosts |
| Package/lock version consistency | Both projects and lock roots agree at 0.2.0 |
| Four-scenario diagnostic | Completed without external provider calls |
| Cover graphic | Visually inspected; labeled fictional UI illustration |

The Python tests use ASGI transport and mocked provider responses. Browser behavior tests use JSDOM, with isolated real JSDOM Storage to avoid Node 26's optional localStorage getter replacing the browser storage API.

New regressions cover plain/fenced Backboard JSON, bounded parallel citation verification, www merchant links, merchant identity retained in HTML anchors, non-public registry DNS/redirect rejection, provider-safe error categories, direct comments limited to already-associated Instagram posts, actor spend caps, default local reviews making no paid-detector request, weak repeated-wording signals, unsupported URL encoding, panel refocus, tracking-parameter identity, irrelevant tab updates, service setup, and unknown payment-method labeling. Existing scoring, sparse-data, cache isolation, extraction and partial-failure tests remain in place.

## What is still not established

- A real diagnostic for nike.com was attempted. The provider connection failed at this execution environment's network boundary. It was not a successful merchant analysis.
- Successful live Backboard/Apify/RDAP behavior remains unverified here. Configured keys do not establish valid credits, access, or connectivity.
- The default review mode is now **local and key-free**. GPTZero is disabled by default and is not a release requirement. The optional paid path has mocked tests only.
- Native Chrome inspection could not start: the computer-use service reported a native-pipe startup failure on two attempts. The newly rebuilt installed extension and its latest layout have not received a fresh real-browser end-to-end/visual pass.
- The user has not yet supplied the failing merchant URL, a Devpost draft URL, team roster, or public demo recording URL. No submission has been performed.
- No accuracy evaluation, calibration study, or user study has been performed. Scores/weights remain product assumptions.

## Apply and verify on the host

Follow `submission/RUN_AND_VERIFY.md`: restart backend v0.2.0, reload the unpacked extension and product tab, inspect Service connection & setup, and run a real scan on the actual demo merchant. A genuine sparse-evidence result should remain limited. The revised UI exposes why sources did not contribute instead of treating failure as merchant evidence.

The prior validation record and generated builds/media are preserved under `archive/2026-10-25-before-submission/`; none were deleted.

## Host verification after network/filesystem access was enabled

- Backend restarted on 127.0.0.1:8000; /health reports v0.2.0 and reviewMode=local.
- All four fictional scenarios passed through the actual listening HTTP API: warning 72/100 coverage 100%; positive 5/100 coverage 100%; limited null/0%; outage 57/100 coverage 60%.
- A live nike.com request retrieved a public domain-registration result. Backboard returned a provider billing refusal for LLM research. The adapter now reports unavailable/billing rather than a JSON-parsing failure; a regression test covers that response.
- Successful Backboard research and Instagram actor results remain unverified. No subscription or payment was made.
- The Git fixes were pushed to main, and remote HEAD was checked.
- Chrome reload remains unverified because the native computer-control helper fails to start its pipe. Resetting the control session did not restore it.
