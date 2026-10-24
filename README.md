# CheckoutGuard

**A little clarity before checkout.**

CheckoutGuard is a Chrome side panel for the moment right before you buy from a store you've never heard of. Click **Check this store** and it pulls together what real buyers have said about the merchant on Reddit and Instagram, runs the store's own reviews through an AI-text check, and gives you a plain-language read on the evidence: what it says, what's missing, and what to do next.

It won't tell you a store is "safe." It tells you what the public evidence looks like and how much of it there is.

Built at HackPSU Fall '26 for the **FNB: Trust, Decisions & Financial Confidence** and **Nittany AI** challenges ([how it fits](docs/TRACKS.md)).

## Quick start

You need Node 22+, Python 3.11+, [uv](https://docs.astral.sh/uv/), and Chrome.

```sh
make install     # uv sync, creates backend/.env, npm install
make backend     # API on http://127.0.0.1:8000  (leave running)
make extension   # builds extension/.output/chrome-mv3
```

Load it in Chrome:

1. Go to `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick `extension/.output/chrome-mv3`.
3. Pin CheckoutGuard, open a product page, click the toolbar icon, then **Check this store**.

Clicking the icon gives the extension temporary access to that one tab. Switch tabs and you'll need to click it again.

**No API keys?** Pick **Try a fictional demo** in the panel. The demo uses invented merchants and is labeled fictional everywhere. The backend still has to be running.

### Browser preview (no extension)

```sh
make preview     # open http://localhost:5173/preview.html
```

Same React UI, same `/analyze` endpoint, but it can't read tabs, so it opens in demo mode. Use `localhost`, not `127.0.0.1`, or CORS will block the API calls.

## API keys

Put these in `backend/.env` and restart the backend. Every key is optional. A missing key makes that source show as unavailable; it never switches on demo mode.

| Variable | What it powers | Where to get it |
| --- | --- | --- |
| `BACKBOARD_API_KEY` | Reddit research (50% of the score) | [backboard.io](https://backboard.io) |
| `APIFY_TOKEN` | Instagram comment scan (40%). Actor runs are billed. | [Apify console](https://console.apify.com/settings/integrations) |
| `GPTZERO_API_KEY` | AI-text check on store reviews (10%) | [GPTZero API docs](https://docs.gptzero.me/api-reference/) |

Other settings:

| Variable | Default | Notes |
| --- | --- | --- |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173` | Exact origins, comma separated |
| `EXTENSION_ID` | empty | The 32-char ID from `chrome://extensions`, for exact-origin CORS |
| `PROVIDER_TIMEOUT` | `45` | Seconds per source (1–50) |
| `CACHE_TTL` | `900` | Seconds (1–3600) |

The extension reads `WXT_API_URL` from `extension/.env` at build time (default `http://localhost:8000`). Rebuild after changing it. Keys never go in the extension.

## How it works

```text
product page ──click──▶ extractor (content script)
                          │  title, review text, linked Instagram profile
                          ▼
                     side panel ──POST /analyze──▶ FastAPI backend
                                                     ├─ Backboard → Reddit threads → excerpt verified against the live page
                                                     ├─ Apify     → recent Instagram comments on the linked profile
                                                     └─ GPTZero   → AI-text signal on the store's own reviews
                                                     ▼
                                              deterministic scoring → risk index, coverage, next steps
```

- **Extraction** runs only when you click. It has adapters for Judge.me, Loox, Yotpo, and structured generic reviews; it waits up to 1.8 s for widgets that load late, then dedupes and trims. Review text goes to GPTZero exactly as written. Checkout and account pages are refused, and query strings are stripped from URLs.
- **Providers** run concurrently, each with its own deadline. One failing source doesn't take down the others, and results are cached in memory for 15 minutes. **Force refresh** skips the cache.
- **Scoring** is plain code in `backend/app/scoring.py`. No model decides the number.

## Reading the score

The **risk index (0–100)** is a heuristic, not a probability that the store is a scam. Nobody has validated it against real outcomes yet.

- Weights: Reddit 50%, Instagram 40%, review text 10%. The weights of the sources that respond get rescaled to add up to 100%.
- **Coverage** is the share of the total weight that actually returned usable data. Under 60% shows a **Limited evidence** banner, even if the score is low. With no sources at all, the score is `—` and coverage is 0%.
- Each distinct verified complaint adds 25 points, up to 85. Repetitive Instagram comments can add 5.
- GPTZero can contribute at most 20 points, so it can never produce a high-risk result alone. AI-written reviews aren't proof of fraud.
- A Reddit source counts only if two separate threads have supporting text that was found on the page. Instagram needs at least five readable comments and two real experiences. Citations that weren't verified are still shown, but they don't count toward the score.

"Source text checked" means the quoted wording exists at that URL. It doesn't mean the claim is true.

## Integration notes

- **Backboard** runs a web search (`web_search="Auto"`) and must return schema-valid JSON. Only Reddit URLs are kept. Each excerpt is fetched separately and checked for the quoted text and the merchant's domain, with SSRF protection, IP pinning, and no redirects followed. Backboard may keep the research conversation under its own policy.
- **Apify** runs `apify/instagram-scraper` on the first Instagram profile the store links to: up to five posts from the last three months, reading `latestComments`. It's never retried automatically, so you don't get billed for a duplicate run. Each run has a 35 s deadline.
- **GPTZero** calls `/v2/predict/text` with at most one retry for transient errors. It needs at least 250 characters of review text (our own threshold).

API references are in [docs/PROVIDERS.md](docs/PROVIDERS.md); security design is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## API

```sh
curl http://localhost:8000/health
curl -X POST http://localhost:8000/analyze -H 'Content-Type: application/json' \
  -d '{"url":"https://lunar-outlet.example/products/travel-pack","demo":"warning"}'
```

Demo scenarios: `warning`, `positive`, `limited`, `partial`. Leave out `demo` for a live scan:

```json
{
  "url": "https://merchant.example/products/bag",
  "productTitle": "Everyday travel pack",
  "instagramLinks": ["https://www.instagram.com/merchant/"],
  "reviews": ["Original review wording."],
  "extractionLimitations": [],
  "refresh": false
}
```

Limits: 100 KB per request, 20 reviews, 2,000 characters per review, 12,000 characters in total. Swagger is at `/docs`.

## Development

```sh
make test      # pytest + ruff, then vitest, tsc, eslint, prettier, WXT build
make format
```

Status as of 2026-10-24: 49 backend tests and 17 frontend tests pass, and typecheck, lint, format, and the WXT build are clean. Details are in [docs/VALIDATION.md](docs/VALIDATION.md).

```text
backend/app/
  main.py, settings.py      HTTP boundary, env config
  models.py                 Pydantic contracts, URL validation
  service.py, cache.py      async orchestration, TTL cache
  scoring.py, demo.py       pure scoring, fictional fixtures
  providers/                Backboard/Reddit, Apify/Instagram, GPTZero, citation security
extension/
  entrypoints/              background worker, extractor content script, React side panel
  lib/                      DOM adapters, Chrome boundary, Zod contracts
  tests/                    DOM fixtures, panel behavior tests
docs/                       architecture, providers, validation, track fit
```

## Demo script (2 minutes)

1. **0:00–0:20.** Open the side panel next to a product page. "An unfamiliar store can look polished. CheckoutGuard helps you pause before you pay."
2. **0:20–0:55.** **Try a fictional demo → Warning signals.** Say out loud that the store is fictional. Show the risk index of 74 and 100% coverage, open the Reddit evidence, and walk through the next steps.
3. **0:55–1:15.** **Positive experiences.** Real delivery and return stories bring the index down. A lower score means fewer concerns, not a guarantee.
4. **1:15–1:40.** **Limited evidence** shows a dash and 0% coverage. **Partial outage** shows Reddit still useful while coverage stays limited.
5. **1:40–2:00.** AI helps with the research, code computes the score, and the shopper makes the call.

## Known gaps

- Live provider calls with real keys haven't been tested yet.
- The extension hasn't been tested end to end in Chrome, and there's been no visual or accessibility pass.
- Review adapters are tested on synthetic fixtures, not live stores. Cross-origin widgets like some Loox iframes can't be read.
- The backend has no auth or rate limiting. Keep it on localhost.
- Not built yet: Trustpilot, more review widgets, finding Instagram accounts the store doesn't link, and AI-image detection.
