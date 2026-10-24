"""Invented, deterministic evidence. Never mixed into live scans."""

from datetime import UTC, datetime

from .models import Finding, SourceResult

FIXTURE_DATE = datetime(2026, 10, 24, 12, tzinfo=UTC)
MERCHANTS = {
    "warning": "lunar-outlet.example",
    "positive": "cedar-trail.example",
    "limited": "little-orbit.example",
    "outage": "lunar-outlet.example",
}


def demo_sources(scenario: str):
    sources = []
    for source in ("reddit", "instagram", "reviews"):
        if scenario == "limited" or (scenario == "outage" and source != "reddit"):
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
                    "Uncertain AI-text signal",
                    "Fictional AI-text signal: elevated. This cannot tell us whether a review is truthful.",
                    "ai-text",
                )
            ]
            if warning
            else [
                (
                    "Uncertain AI-text signal",
                    "Fictional AI-text signal: low. Human-written reviews can still be misleading.",
                    "ai-text",
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
                if c in {"ai-text", "repetition"}
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
                limitations=[
                    "All merchants, quotations, scores and source links in this demo are fictional. Links use reserved .example domains."
                ],
            )
        )
    return sources
