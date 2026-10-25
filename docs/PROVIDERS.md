# Official references consulted

Consulted during implementation on 2026-10-24. Live account behavior has not been verified.

- [Chrome sidePanel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel): side-panel permission and action-click behavior.
- [WXT entrypoints](https://wxt.dev/guide/essentials/entrypoints): sidepanel HTML and background/content entrypoints.
- [WXT scripting](https://wxt.dev/guide/essentials/scripting): programmatic content-script injection.
- [WXT runtime content registration](https://wxt.dev/api/reference/wxt/interfaces/basecontentscriptentrypointoptions): runtime matches can become host permissions. The build hook restricts final permissions to the backend origin; scans use activeTab.
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
