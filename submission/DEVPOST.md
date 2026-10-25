# CheckoutGuard — Devpost copy

Status: prepared draft text. No Devpost project has been published or submitted by this session. Review the live-integration status and fill the team/demo fields in CHECKLIST.md before submitting.

## Project name
CheckoutGuard

## Elevator pitch
A pause before you pay: store evidence, honest uncertainty, and practical purchase guidance beside your shopping page.

## Inspiration
An unfamiliar online store can look polished while leaving a shopper with unanswered questions. Reviews are scattered, social comments may be inaccessible, and the decision to pay still has to be made. CheckoutGuard brings the available evidence into that moment and makes missing information visible.

The goal is financial confidence grounded in understanding: what was checked, what the evidence supports, what remains unknown, and what a shopper can do next.

## What it does
CheckoutGuard is a Chrome side panel. On an explicit “Check this store” click, it reads the public product title, accessible review text, storefront-linked Instagram profiles, payment badges, policy/contact links, and displayed price. It avoids cookies, account fields, payment fields, and unrelated browsing history.

The backend combines independent checks: public domain registration and storefront observations, Reddit research through Backboard, accessible Instagram comments through Apify, and a key-free local review-wording check. It returns linked findings, a deterministic 0–100 heuristic risk index, evidence coverage, and practical next steps. Higher risk means more concerning evidence; the number is not a scam probability.

Coverage is displayed separately. When sources are sparse or fail, the panel prominently says “Limited evidence” and explains why. A low score never guarantees that a store is safe. Customer allegations remain allegations even when their quoted wording is verified. AI-written text is not treated as proof of a fake review.

The financial decision layer puts the listed purchase amount and payment considerations beside the evidence. If payment methods were not identified, it labels its guidance as general instead of pretending those checkout choices were observed.

Four clearly fictional demo scenarios show warning signals, positive experiences, insufficient evidence, and a partial provider outage. They need no provider credentials; the local backend still needs to be running.

## How we built it
The extension uses WXT, React, TypeScript, Tailwind CSS, and Chrome Manifest V3. FastAPI and Pydantic define a typed backend contract. Provider checks run concurrently with individual time budgets, bounded concurrency, and schema validation. A pure scoring module owns the index and source-availability weighting; an LLM never assigns the final number.

Backboard performs public Reddit research. Candidate discussions are checked separately for matching supporting text and merchant identity. The parser handles valid plain or fenced JSON without repairing broken output. Up to three citations are checked concurrently so one search does not exhaust the scan budget.

The Apify adapter reads only storefront-linked profiles and matching post authors. If embedded comments are sparse, it can inspect comments on up to two already-associated posts, with capped runs and no automatic replay of paid actor requests. The default review check compares original extracted texts for near-duplicate wording using local code. It does not infer AI authorship or authenticity. A paid GPTZero adapter remains an explicit opt-in, disabled by default. An optional Anthropic adapter can summarize the finished evidence; a deterministic template remains available when it is not configured.

Credentials stay on the backend. Public citation and registration fetching rejects private destinations, validates DNS, pins connections, verifies TLS hostnames, and bounds redirects and response size. Merchant research and product-specific review analysis use different cache identities.

## Challenges we ran into
A research result is not useful just because a URL resolves. Store identity, accessible supporting text, and the distinction between a buyer allegation and an established fact all matter. Reddit links may be blocked, Instagram comments can be sparse, and rendered review widgets can live in inaccessible frames.

The implementation also had to distinguish product uncertainty from operational failures. The updated panel exposes missing keys, account rejection, rate limits, network failures, timeouts, and insufficient samples separately. It preserves useful partial results and suppresses responses from an old tab. Returning focus to the same panel or updating a background tab no longer clears the current result.

## Accomplishments that we're proud of
- A complete extension-to-backend result contract with expandable, linked evidence and explicit limitations.
- Deterministic scoring with tests for missing sources, coverage, weak AI-text signals, and partial failure.
- Review extraction adapters tested on Judge.me, Loox, Yotpo, and conservative structured-review fixtures.
- Product-specific cache isolation and strict separation of fictional fixtures from live research.
- Practical purchase and payment guidance that distinguishes observed checkout choices from general information.
- A repeatable diagnostic command and a key-free four-scenario demo for judging.

## What we learned
Missing evidence should remain missing evidence. A confident-looking number cannot substitute for source quality, and a source failure should not become an accusation against a merchant. Explicit uncertainty and concrete next steps make the result more useful than an unexplained verdict.

## What's next for CheckoutGuard
The next work is successful credentialed smoke testing across real storefronts, broader widget compatibility, and evaluation against labeled evidence cases. The heuristic weights and severity rules need validation before making accuracy claims. Production deployment would also need authentication, rate limiting, and operational monitoring.

## Current implementation status — review before publishing
The app, provider adapters, fictional scenarios, and automated checks are implemented. In the current execution environment, a live domain check retrieved public registration data, while Reddit research was refused by Backboard due to its LLM-credit requirements. The default local review check needs no API key; GPTZero is disabled. Successful live-provider behavior and the newly rebuilt installed extension still need a smoke test on an unrestricted machine. Do not turn this paragraph into a claim of successful live verification unless that test has actually passed.

## Built with
Python; TypeScript; React; WXT; Tailwind CSS; FastAPI; Pydantic; Chrome Manifest V3; Backboard; Apify. Local Python code handles review wording. GPTZero and Anthropic are optional adapters and are not required for the default review flow.

## Links
- Source: https://github.com/DevSingh05/CheckoutGuard
- Local extension package: see artifacts/ after packaging; upload or host the reviewed artifact if a public download is required.
- Demo video: add the actual publicly viewable recording URL. No video URL has been invented.

## Credits and originality
Concept reference reviewed for this update: [Sham / hack-the-north-2026](https://github.com/venniseho/hack-the-north-2026). Only its README was reviewed during this update; its implementation was not imported. CheckoutGuard's implementation, fixture scenarios, decision/payment layer, diagnostics, and tests live in this repository. Cite the project's frameworks and provider APIs listed in docs/PROVIDERS.md. Confirm the team's own build-time, location, contributor, and tool-use disclosures against the event rules before final submission.
