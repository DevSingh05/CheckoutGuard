# CheckoutGuard

**A little clarity before checkout.** A Chrome side panel that helps shoppers investigate an unfamiliar store using public buyer experiences and a deliberately limited AI-text signal.

Built for HackPSU's **FNB: Trust, Decisions & Financial Confidence** and **Nittany AI** challenges. CheckoutGuard turns scattered information into a readable purchase decision: what the evidence says, what remains unknown, and what to do next. It does not claim fraud-detection accuracy or guarantee any store is safe.

## Start here

Requirements: Node 22+, Python 3.11+, [uv](https://docs.astral.sh/uv/), and Chrome with side-panel support. Dependency installation needs internet access.

```sh
# Terminal 1, from the repository root
cd backend
uv sync
cp -n .env.example .env
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

```sh
# Terminal 2, from the repository root
cd extension
npm install
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `extension/.output/chrome-mv3`. Pin CheckoutGuard. Open a public product page and click its toolbar icon to grant temporary access to that tab. Then click **Check this store**. If you change to a different tab, click the toolbar icon again before scanning it.

For a key-free demo, choose **Try a fictional demo** in the panel. The backend is still required. Missing credentials in live mode produce unavailable sources; they never activate demo mode.

### Browser preview

```sh
cd extension
npm run preview:dev
# Open http://localhost:5173/preview.html
```

This uses the same React UI and `/analyze` endpoint, starts in explicitly labeled demo mode, and cannot read browser tabs. `npm run preview:build` produces `.output/preview` for a static preview server. This is distinct from the Chrome extension build.

## Current validation status

The implementation includes the extension entrypoints, UI, API, provider adapters, fixtures, and tests. In the restricted build environment:

- **49 backend tests passed**, including API, scoring, cache isolation, citation security, and provider failure handling. See [validation notes](docs/VALIDATION.md).
- **17 frontend tests passed:** four DOM adapters, payload/wording constraints, delayed widgets, all four result scenarios, backend downtime, malformed data, and stale-result suppression.
- UI TypeScript checks, ESLint, Prettier, Ruff checks/formatting, and the **Vite production preview build** were exercised.
- **Full WXT typecheck/build and installed-extension smoke testing remain unverified.** Registry DNS access was blocked and WXT was not cached. Local server binding and Chromium process launch were also blocked. There is no claim that browser visual QA or live provider calls passed.
- Git initialization was denied by workspace permissions, so no commits could be created. No author/co-author attribution was added.

Local cached dependencies were used for these checks; their versions are recorded in `docs/VALIDATION.md`. Normal `npm install` / `uv sync` and a lockfile-based CI run are still needed in an unrestricted environment. No fabricated lockfiles are included.

## Configuration

Backend variables live in `backend/.env`; all default to safe key-free operation.

| Variable | Purpose |
| --- | --- |
| `BACKBOARD_API_KEY` | Backboard web search for Reddit discussions |
| `APIFY_TOKEN` | Apify Instagram Scraper; actor runs may incur charges |
| `GPTZERO_API_KEY` | Original review-text analysis |
| `CORS_ORIGINS` | Comma-separated exact preview/web origins; defaults to localhost ports 3000 and 5173 |
| `EXTENSION_ID` | Optional 32-character unpacked/production Chrome extension ID for exact-origin CORS |
| `PROVIDER_TIMEOUT` | Per-source budget including concurrency wait; default 45 seconds, bounded to 1–50 |
| `CACHE_TTL` | In-memory source-cache TTL; default 900 seconds, bounded to 1–3600 |

`extension/.env` may set `WXT_API_URL` before building (default `http://localhost:8000`). Rebuild after changing it: both the fetch target and manifest host permission use this setting. Credentials never belong in the extension. The preview also honors `WXT_API_URL`.

For production use HTTPS, exact CORS origins, an authenticated/rate-limited gateway, request-body/time limits, and controlled egress. CORS is not authentication. The supplied server is intended to run locally on loopback; do not expose this unauthenticated provider-spending endpoint publicly. Avoid proxy access logs containing query strings. See [security and architecture](docs/ARCHITECTURE.md).

## What is implemented

- WXT + React + TypeScript + Tailwind, Chrome MV3 background and side-panel entrypoints.
- Explicit-click extraction; temporary `activeTab` access, no history or cookie permissions. URL query/fragment removal. Checkout/account routes are rejected.
- Separate Judge.me, Loox, Yotpo, and structured generic adapters, each tested against representative synthetic DOM fixtures. These support **accessible rendered DOM variants**, not every version or installation of those platforms. Cross-origin Loox frames and other inaccessible widgets are not readable.
- A 1.8-second MutationObserver wait, exact review deduplication, trimming only, whole-review omission at size limits. No review paraphrasing or LLM rewrite before GPTZero.
- Async concurrent checks, individual deadlines, six in-flight provider slots, partial success, safe error messages, missing-key support, bounded in-memory TTL cache, and per-source timestamps/cache badges.
- Deterministic risk/coverage calculation, plain-language explanation, expandable linked evidence, explicit allegation/pattern/fact categories, and practical next steps.
- Separate merchant-research and product/review-content cache keys. Force-refresh button bypasses cache; ordinary rescans can reuse research.
- Explicit fictional warning, positive, limited-evidence, and partial-outage scenarios. Fixtures never enter live caches.
- Cancellation/response-generation guards when tabs, scan mode, or scenarios change; retry and backend-down states.

## Evidence and scoring

The number is a **heuristic risk index (0–100)**, never the probability that a store is a scam. It is unvalidated and explainable, with provisional Reddit **50%**, Instagram **40%**, and review-text **10%** weights. Weights live in `backend/app/scoring.py`; `score()` accepts an alternative positive weight map.

Available sources are renormalized for risk. **Coverage uses their original weights** and measures source availability, not statistical confidence. Less than 60% coverage prominently displays **Limited evidence**, even with a low score. With no available sources, risk is `null` and coverage is `0`.

For merchant research, each distinct verified complaint excerpt contributes 25 points, capped at 85; Instagram repetition can add 5. Positive experiences are separately shown; an absence of complaints alone never makes a source available. Keyword rules are conservative but imperfect and do not establish truth. Reddit requires two distinct text-verified discussion IDs. Instagram requires at least five accessible comments and two distinct substantive experiences. Different discussion IDs do not guarantee independent authors.

GPTZero's document AI-text signal is multiplied by 20 and capped at 20 **before renormalization**. Even when this is the only source, it cannot create a high-risk verdict. AI-written text can be legitimate and human-written text can be fraudulent. Our local 250-character minimum is a sampling policy, not a claim about the provider's minimum input length.

“Source text checked” means the supporting wording was found, not that an allegation is true. Unverified Reddit citations are visible but excluded from scored evidence. Demo evidence is marked **fictional** throughout and uses reserved `.example` source URLs, which deliberately do not resolve to real accusations.

## Integrations and their limits

**Backboard:** uses `BackboardClient.send_message(..., web_search="Auto")`. Structured candidates are schema-validated; only Reddit discussion URLs are considered. A separate fetch checks the supporting excerpt and exact merchant domain nearby, and deterministic code assigns concern types. Blocked, redirected, missing, or unsupported content stays unverified. No inference that an accessible URL alone proves a claim. The response must be valid JSON; malformed output yields a source error. Backboard may retain the domain research conversation under its service policy.

**Apify:** runs the official `apify/instagram-scraper` actor with the first directly linked storefront profile, requests up to five posts from the last three months, and inspects returned `latestComments`. Matching post-owner handles are required. It does not discover unlinked accounts or claim access to all comments. Exact/near-duplicate comment wording (92% similarity, at least 20 characters) is only a weak engagement-pattern signal. The actor POST is not retried automatically to avoid duplicate paid runs; its own run deadline is 35 seconds.

**GPTZero:** submits original extracted wording joined with paragraph separators to `/v2/predict/text`. Handles insufficient samples, unsupported length/language responses, missing keys, rate limits, and malformed results. Up to one short retry is allowed for transient errors. It does not detect generated images or determine whether reviews are genuine.

All three adapters need **credentials and live smoke testing** before claiming production integration success. API documentation consulted is linked in [provider references](docs/PROVIDERS.md).

## API

```sh
curl http://localhost:8000/health
curl -X POST http://localhost:8000/analyze \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://lunar-outlet.example/products/travel-pack","demo":"warning"}'
```

A live request uses `demo: null` (or omits it):

```json
{
  "url": "https://merchant.example/products/bag",
  "productTitle": "Everyday travel pack",
  "instagramLinks": ["https://www.instagram.com/merchant/"],
  "reviews": ["Original rendered review wording goes here."],
  "extractionLimitations": [],
  "refresh": false
}
```

The response includes `domain`, `productTitle`, `overallRisk`, `coverage`, `limitedEvidence`, `summary`, `nextSteps`, `scannedAt`, `demo`, and `sources`. Every source contains `status`, `score`, `findings`, `limitations`, `checkedAt`, `cached`, and `expiresAt`. Swagger is available at `/docs`. Request bodies are capped at 100 KB; extracted reviews at 20 items, 2,000 characters per item, and 12,000 total characters. Cache is memory-only, max 256 entries per worker; it resets on restart.

## Tests and code standards

```sh
cd backend
uv run pytest -q
uv run ruff check .
uv run ruff format --check .

cd ../extension
npm run test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

`npm run typecheck:ui` validates the shared UI independently of WXT. Use `uv run ruff format .` and `npm run format` to format changes. Python uses Pydantic boundary models and a provider protocol; frontend validates backend responses with Zod. Keep deterministic scoring outside provider orchestration.

## Two-minute walkthrough

1. **0:00–0:20 — The moment that matters.** Open the side panel beside a product page. “An unfamiliar store can look polished. CheckoutGuard helps you pause before sharing money.” Show the domain, explicit scan button, and narrow data disclosure.
2. **0:20–0:55 — Evidence, not an accusation.** Select **Try a fictional demo → Warning signals**, then scan. Say explicitly that the merchant and evidence are fictional. Show the 74 risk index and separate 100% coverage. Expand Reddit evidence, explain allegations versus verified wording, and point to the recommended next steps.
3. **0:55–1:15 — Fair treatment.** Choose **Positive experiences** and scan. Show substantive delivery/return experiences and the lower index. “This is fewer concerning signals, never a safety guarantee.”
4. **1:15–1:40 — Honest uncertainty.** Choose **Limited evidence**, scan, and show the dash and 0% coverage. Switch to **Partial outage**: a surviving Reddit source still gives useful evidence while coverage remains limited.
5. **1:40–2:00 — Responsible AI.** Explain that AI assists research and text analysis; deterministic code owns scoring, weak AI signals cannot create a high-risk verdict, and the shopper owns the decision. This connects financial confidence to a practical everyday AI use case.

## Project layout

```text
backend/app/
  main.py, settings.py    HTTP boundary and environment
  models.py              Pydantic contracts and URL validation
  service.py, cache.py    Async orchestration and isolated TTL caching
  scoring.py, demo.py     Pure scoring and explicitly fictional fixtures
  providers/             Backboard, Apify, GPTZero, citation security
backend/tests/           API, scoring, cache, provider and SSRF tests
extension/entrypoints/   WXT background, injected extractor, React side panel
extension/lib/           DOM adapters, Chrome boundary, Zod contracts
extension/tests/         DOM fixtures and panel behavior tests
docs/                    Architecture, provider references, validation
```

## Incomplete / planned

Full WXT installation/build and actual Chrome loading must be completed outside the restricted environment. Live credentials, provider quotas/schema behavior, real storefront adapter compatibility, accessibility/visual browser QA, packaged-extension E2E tests, lockfiles, and deployment authentication/rate limiting remain to be verified or added. No accuracy evaluation or user study has been performed.

Trustpilot, broader review widgets, unlinked Instagram discovery, product-claim verification, and AI-image/post detection are stretch work and have no pretend operational controls in this version.
