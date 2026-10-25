# Run the current fix

From a normal terminal with project-write and network access:

```sh
cd /Users/devsingh/Developer/hackpsu
make install
make backend
```

Leave that terminal running. The rebuilt unpacked extension is in `extension/.output/chrome-mv3`.

1. Open chrome://extensions, find CheckoutGuard, and press Reload. If necessary, Load unpacked using that directory.
2. Close and reopen its side panel. Reload the public product page. Do not scan checkout/account/payment pages.
3. Open Service connection & setup, click Check service setup, and confirm backend v0.2.0.
4. Scroll to a review widget so public reviews render. Click Check this store.
5. Inspect the exact per-source diagnostic if coverage is limited. Use force refresh after fixing configuration instead of reusing cached results.

Run safe diagnostics from the backend directory:

```sh
cd /Users/devsingh/Developer/hackpsu/backend
uv run python ../scripts/doctor.py
uv run python ../scripts/doctor.py --demo
uv run python ../scripts/doctor.py --live https://ACTUAL-MERCHANT-DOMAIN
```

Replace the last URL with the actual public merchant. `--live` makes one real check; it does not read Chrome and therefore has no reviews or linked account unless supplied with `--request path/to/analyze-input.json`. That JSON follows the normal /analyze contract. Actor requests may spend credit; there are at most two capped Instagram runs in a check. Keys and raw review text are never printed by the diagnostic.

Common outcomes:

| Diagnostic | Meaning / next action |
| --- | --- |
| billing | Backboard cannot fund LLM research with its current balance. Free checks remain available; enabling LLM credit is an account-owner decision. |
| missing-key | Configure that backend key locally and restart. The source is not evidence about the merchant. |
| authentication | Provider rejected the key, credits or account access. Review its console. |
| rate-limit | Wait and inspect provider usage/balance. |
| network | Backend cannot connect to the source. Check outbound access. |
| timeout | Source exceeded its individual budget; inspect other source results and retry later. |
| invalid-response | Unsupported provider data. Keep the response out of scoring and update/debug the adapter. |
| unverified-citations | Discussion links were found, but supporting merchant-matched text could not be checked. Read the links yourself. |
| insufficient-sample | Too little substantive accessible text; missing complaints are not affirmative evidence of legitimacy. |
| short-text | Load more complete rendered reviews; no review wording is fabricated or expanded. |
| no-linked-account | The page exposed no supported public profile link; no association is guessed. |

After host access was enabled, the backend was restarted and all four fictional scenarios passed through the listening HTTP API. A real Nike-domain check retrieved public registration data; Backboard returned a billing refusal for LLM research. The current adapter reports `unavailable / billing` clearly. Local review analysis remains key-free. Successful Reddit research, Instagram actor results and the installed-extension reload still need verification.
