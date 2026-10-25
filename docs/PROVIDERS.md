# Official references consulted

Consulted during implementation on 2026-10-24. Live account behavior has not been verified.

- [Chrome sidePanel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel): side-panel permission and action-click behavior.
- [WXT entrypoints](https://wxt.dev/guide/essentials/entrypoints): sidepanel HTML and background/content entrypoints.
- [WXT scripting](https://wxt.dev/guide/essentials/scripting): programmatic content-script injection.
- [WXT runtime content registration](https://wxt.dev/api/reference/wxt/interfaces/basecontentscriptentrypointoptions): runtime matches can become host permissions. The build hook sets final host permissions to http(s) pages plus the backend origin; there are no declared content scripts.
- [Tailwind 3 / Vite](https://v3.tailwindcss.com/docs/guides/vite): PostCSS configuration and CSS directives.
- [Backboard web search](https://docs.backboard.io/sdk/web-search): per-message `web_search="Auto"` and `response.content`.
- [Backboard Python SDK](https://pypi.org/project/backboard-sdk/): `send_message` introduced in 1.5.14 and async client context-manager support. Dependency minimum is 1.5.14.
- [Apify Instagram Scraper](https://apify.com/apify/instagram-scraper): `directUrls`, `resultsType: "posts"`, `resultsLimit`, `onlyPostsNewerThan`, and returned post `ownerUsername`, `url`, `latestComments`, comment `text`/`timestamp`.
- [Apify synchronous run + dataset endpoint](https://docs.apify.com/api/v2/actor-run-sync-get-dataset-items-post): POST route, run timeout, max items. Credentials are carried in Authorization headers.
- [RDAP (RFC 9083)](https://www.rfc-editor.org/rfc/rfc9083) and the [rdap.org bootstrap redirector](https://about.rdap.org/): `events[].eventAction == "registration"` and `eventDate`.
- [Claude Messages API](https://platform.claude.com/docs/en/api/messages): official `anthropic` Python SDK, `AsyncAnthropic`, `output_config.effort`, `stop_reason`.
- [CFPB: credit card disputes](https://www.consumerfinance.gov/ask-cfpb/) and the Fair Credit Billing Act: basis for the credit-card protection note (general information, not legal advice).
- [GPTZero API reference](https://docs.gptzero.me/api-reference/): `/v2/predict/text`, `x-api-key`, `document`, `documents[].completely_generated_prob`, and length/language considerations.

The adapters parse only the documented fields they need and ignore unrelated metadata. These references establish implementation contracts, not proof of provider uptime or model validity. Backboard-produced candidate JSON is CheckoutGuard's own requested schema, not an invented native Backboard response schema.

## October 25 reliability update

- [Backboard message contract](https://docs.backboard.io/concepts/messages): web search is `Auto`; JSON mode is ignored with web search. CheckoutGuard accepts one valid fenced JSON object and validates its schema; it never repairs malformed evidence.
- [Official Instagram Scraper comments output](https://apify.com/apify/instagram-scraper): documented `postUrl`, `text`, `timestamp`, direct post inputs, `resultsType=comments`, and `isNewestComments`. A second bounded run uses only post URLs whose authors matched the storefront-linked account.
- [Apify synchronous-run parameters](https://docs.apify.com/api/v2/actor-run-sync-get-dataset-items-post): `maxTotalChargeUsd` caps each run at $0.25; paid actor starts are not retried.
- [CFPB: card billing-error disputes](https://www.consumerfinance.gov/ask-cfpb/how-do-i-dispute-a-charge-on-my-credit-card-bill-en-61/): written-notice timing and issuer instructions; no universal recovery guarantee.
- [PayPal purchase-protection terms](https://www.paypal.com/us/legalhub/paypal/buyer-protection): eligibility and issue-specific deadlines. Wallet and app labels do not establish transaction eligibility by themselves.

Default review analysis is now local and key-free. The optional GPTZero adapter is disabled unless REVIEW_ANALYSIS_MODE=gptzero is explicitly configured. No AI-authorship or fake-review claim is made for the local wording check.
