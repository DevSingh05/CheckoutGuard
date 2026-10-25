"""Invented, deterministic evidence. Never mixed into live scans."""

from datetime import UTC, datetime, timedelta

from .models import Finding, PageSignals, SourceResult
from .providers.store import assess

FIXTURE_DATE = datetime(2026, 10, 24, 12, tzinfo=UTC)
MERCHANTS = {
    "warning": "lunar-outlet.example",
    "positive": "cedar-trail.example",
    "limited": "little-orbit.example",
    "outage": "lunar-outlet.example",
}
FICTIONAL = "All merchants, quotations, scores and source links in this demo are fictional. Links use reserved .example domains."
REGISTERED = {
    "warning": FIXTURE_DATE - timedelta(days=23),
    "positive": datetime(2020, 9, 14, tzinfo=UTC),
    "outage": FIXTURE_DATE - timedelta(days=744),
}
SIGNALS = {
    "warning": PageSignals(
        paymentMethods=["credit-card", "zelle", "crypto"],
        hasReturnPolicy=False,
        hasContactPage=True,
        hasEmail=False,
        hasPhone=False,
        price=35.99,
        compareAtPrice=129.0,
        currency="USD",
    ),
    "positive": PageSignals(
        paymentMethods=["credit-card", "paypal", "shop-pay", "apple-pay"],
        hasReturnPolicy=True,
        hasContactPage=True,
        hasEmail=True,
        hasPhone=True,
        price=89.0,
        currency="USD",
    ),
    "outage": PageSignals(
        paymentMethods=["credit-card", "paypal", "debit-card"],
        hasReturnPolicy=True,
        hasContactPage=True,
        hasEmail=True,
        price=49.0,
        currency="USD",
    ),
}


def demo_signals(scenario: str) -> PageSignals | None:
    return SIGNALS.get(scenario)


def demo_store(scenario: str) -> SourceResult:
    base = f"https://{MERCHANTS[scenario]}/fictional-evidence/store"
    return assess(
        MERCHANTS[scenario],
        REGISTERED[scenario],
        SIGNALS[scenario],
        checked=FIXTURE_DATE,
        page_url=f"{base}/page",
        rdap_url=f"{base}/registration",
        verification="fictional",
        limitations=[FICTIONAL],
    )


def demo_sources(scenario: str):
    sources = []
    for source in ("reddit", "instagram", "store", "reviews"):
        if source == "store" and scenario != "limited":
            sources.append(demo_store(scenario))
            continue
        if scenario == "limited" or (scenario == "outage" and source not in {"reddit", "store"}):
            sources.append(
                SourceResult(
                    source=source,
                    status="error" if scenario == "outage" else "insufficient-data",
                    checkedAt=FIXTURE_DATE,
                    limitations=[
                        "Fictional provider outage."
                        if scenario == "outage"
                        else "Fictional merchant: not enough substantive evidence."
                    ],
                )
            )
            continue
        warning = scenario in {"warning", "outage"}
        entries = {
            "reddit": [
                (
                    "Order never arrived",
                    "I ordered the Lunar Pack six weeks ago. It never arrived, and support stopped replying.",
                    "non-delivery",
                ),
                (
                    "Refund still unresolved",
                    "My return was accepted, but I am still waiting for my refund after a month.",
                    "refund",
                ),
            ]
            if warning
            else [
                (
                    "Delivery experience",
                    "My Cedar Trail pack order arrived on time. The stitching and size matched the listing.",
                    "positive",
                ),
                (
                    "Return experience",
                    "I returned the wrong size; my refund was processed within five days.",
                    "positive",
                ),
            ],
            "instagram": [
                (
                    "Customers report delivery problems",
                    "Still waiting for my order from last month. Please answer my support email.",
                    "non-delivery",
                ),
                (
                    "Repetitive comment wording",
                    "Several sampled comments repeat the same promotional sentence. This alone is not proof of bots.",
                    "repetition",
                ),
            ]
            if warning
            else [
                (
                    "Substantive purchase experience",
                    "My order arrived and the replacement strap you sent fits perfectly. Thanks for following up.",
                    "positive",
                )
            ],
            "reviews": [
                (
                    "Similar review wording",
                    "Fictional local pattern: several reviews share very similar wording. This is not proof of manipulation.",
                    "repetition",
                )
            ]
            if warning
            else [
                (
                    "Review wording sample inspected",
                    "Fictional local wording check: no near-duplicate pair found. Unique wording does not establish that reviews are genuine.",
                    "context",
                )
            ],
        }[source]
        findings = [
            Finding(
                title=t,
                excerpt=e,
                concern=c,
                verification="fictional",
                kind="observed-pattern"
                if c in {"ai-text", "repetition", "context"}
                else "positive-experience"
                if c == "positive"
                else "customer-allegation",
                date="2026-10-20",
                url=f"https://{MERCHANTS[scenario]}/fictional-evidence/{source}/{i}",
            )
            for i, (t, e, c) in enumerate(entries)
        ]
        sources.append(
            SourceResult(
                source=source,
                status="available",
                checkedAt=FIXTURE_DATE,
                score=(
                    {"reddit": 85, "instagram": 75, "reviews": 18}
                    if warning
                    else {"reddit": 5, "instagram": 8, "reviews": 2}
                )[source],
                findings=findings,
                limitations=[FICTIONAL],
            )
        )
    return sources
