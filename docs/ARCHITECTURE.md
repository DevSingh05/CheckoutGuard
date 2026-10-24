# Architecture and trust boundaries

```mermaid
flowchart TD
    A[Explicit scan in Chrome side panel] --> B[Injected rendered DOM extraction]
    B --> C[POST /analyze: bounded Pydantic input]
    C --> D{Explicit demo selected?}
    D -->|Yes| E[Fictional deterministic fixtures]
    D -->|No| F[Independent source tasks and TTL cache]
    F --> G[Backboard Reddit research + citation verification]
    F --> H[Apify linked Instagram profile posts/comments]
    F --> I[GPTZero original review text]
    G --> J[Validated source results]
    H --> J
    I --> J
    E --> K[Pure deterministic risk and coverage]
    J --> K
    K --> L[Zod validation, evidence cards, next steps]
```

The LLM does not assign the risk score. Candidate quotes are untrusted data, validated and checked before deterministic scoring. No provider instructions are executed. Frontend uses React text escaping and HTTP(S)-validated links, never raw HTML.

The extension reads only on explicit scan. No cookies, forms, account information, payment fields, or browsing-history APIs are accessed. The tab query is restricted to the active tab in the current window. It uses activeTab, scripting, and sidePanel permissions, plus a single backend-origin host permission. Its content script is injected programmatically. URL query strings and fragments are removed before transmission. Typical checkout/cart/account/login/payment routes are refused. This is a route heuristic, not a universal proof that every possible URL is public; users should scan public storefront pages only.

A source task has a deadline including queue wait. At most six provider tasks run concurrently in each process. Errors do not cancel siblings. Client cancellation suppresses stale UI results; it does not promise to cancel an already-started paid actor run. Apify gets its own 35-second run timeout. GPTZero retries once only on transient network/rate-limit/gateway errors. Backboard and actor-start requests are not automatically replayed.

Citation fetching is restricted to HTTPS Reddit discussion paths. No user-selected merchant pages are backend-fetched. Every DNS answer is checked for a globally routable address; connection is pinned to a validated address with the original hostname used for TLS verification. Redirects are refused, never followed. Content type, response size, and socket timeouts are bounded. HTML script/style content is excluded. Verification requires a substantial exact quotation and an exact domain near it. This can produce false negatives, especially when Reddit blocks unauthenticated readers; such text stays unverified and does not count toward source availability. Exact quote presence does not verify the truth of allegations.

Provider API origins are fixed constants, HTTP proxy inheritance is disabled for HTTPX, and redirects are disabled. Instagram returned URLs and owner handles are checked against the directly linked profile. Merchant association is based on a storefront link, not a verified legal-entity identity.

Cache keys use SHA-256 of source + merchant host, with profile links added for Instagram and URL + complete review sample added for GPTZero. This prevents different products or changed samples sharing review analysis. Keys never store raw review text. Cached results contain excerpts where necessary; they are memory-only, bounded to 256 entries and a maximum one-hour TTL. Error/unavailable sources are not cached. Research domains are exact host identities with only `www.` stripped; unrelated subdomains are not automatically combined. Demo fixtures bypass cache entirely.

The supplied API is a local development service. Production requires an authenticated gateway, rate limits, worker limits, HTTPS, egress restrictions, and exact origin configuration. CORS does not protect an API from non-browser clients. Configure gateway body limits and timeouts too. Use `--no-access-log`; the app does not log payloads or provider exceptions. Do not add raw provider-response logging during debugging.
