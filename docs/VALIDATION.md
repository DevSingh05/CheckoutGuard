# Validation record — 2026-10-24

## Passed

| Check | Result |
| --- | --- |
| Backend pytest | **49 passed** |
| DOM extraction tests | **10 passed**, Judge.me / Loox / Yotpo / structured generic fixtures and boundary cases |
| React side-panel behavior tests | **7 passed**, four demo scenarios, downtime, stale response suppression, malformed response |
| TypeScript, UI scope | `tsc --project tsconfig.ui.json` passed |
| ESLint | No findings |
| Prettier | All matched extension files formatted |
| Ruff lint | All checks passed |
| Ruff format | 18 files formatted |
| Vite production browser preview | Built successfully; approximately 215 KB JS / 14 KB CSS before gzip |

Backend tests use HTTPX ASGI transport, not a listening HTTP server. API success, invalid provider data, individual timeout, all-provider failure, demo isolation, private URL rejection, oversized request rejection, TTL/capacity, same-merchant product isolation, changed samples, forced refresh, missing keys, original text preservation, unsupported text, repetition, bounded retries/body size, unverified Reddit exclusion, distinct discussion identity, DNS private-address rejection, TLS hostname/IP pinning, and redirect refusal are exercised.

UI tests use JSDOM and mocked transport with JSON produced by the actual backend demo implementation. They are not evidence of real browser layout, activeTab permission behavior, or live integrations. Fixture timestamps are fixed for deterministic tests; real scan timestamps use current UTC time.

## Environment restrictions and unpassed checks

- `uv` and `npm` could not reach package registries: DNS resolution was denied/unavailable.
- WXT was not present in local dependency caches. `npm run build` failed with `wxt: command not found`. Full TypeScript checking also cannot resolve WXT imports. The production **preview** build is not a WXT build and is not a loadable extension.
- Backend startup reached application startup but binding `127.0.0.1:8000` was denied (`operation not permitted`).
- Chromium launch was denied by macOS sandbox process permissions. The browser-control tool also reported Chrome unavailable. No visual screenshot verification or installed-extension E2E test was completed.
- No provider credentials were used; no paid actor or live provider call was made.
- `git init` failed because creating `.git` was not permitted. There are no commits, fabricated commit IDs, or co-author trailers.

## Local-tool workaround

Tests were run using existing, read-only installed dependency artifacts, without copying code from other projects. The tested UI runtime was React/ReactDOM 18.3.1, TypeScript 5.9.3, Zod 3.25.76, Tailwind 3.4.19, Vite 6.4.4. The available test runner was Vitest 5.0.3 with JSDOM; installed ESLint was 10.12.0. The normal project ranges also support earlier lint/test tool majors; those resolved installations have not been tested here. Python used cached wheels, including FastAPI 0.142.4, Pydantic 2.13.5, HTTPX 0.28.1, and Ruff 0.16.10.

Temporary dependency symlinks used for validation are archived outside the project at `/tmp/checkoutguard-validation-20261024/node_modules`. Standard installation starts with a clean dependency directory. No source files were removed.

## Required next validation on an unrestricted machine

1. Run `uv sync` and `npm install`; retain the generated lockfiles and commit them after reviewing the resolution.
2. Run `make test` including full WXT typecheck/build and the generated-manifest assertion.
3. Load `extension/.output/chrome-mv3` in Chrome. Test the actual toolbar → side panel → extraction → `/analyze` flow, retry, new-tab changes, navigation during a scan, unsupported pages, backend downtime, and force-refresh.
4. Visually inspect 380px and 420px widths, keyboard focus, long product titles and excerpts, contrast, all demo states, and screen-reader announcements.
5. Add credentials locally; test each provider with a known public merchant. Inspect actual quota/error/schema behavior and Reddit accessibility. A source remaining unverified is an acceptable result, not permission to fabricate evidence.
6. Confirm actor spending limits, real DOM compatibility, production authentication/rate limits and exact CORS/origin settings before public deployment.
