"""Unvalidated product heuristics, not a statistical fraud model."""

from datetime import date

from .models import Decision, Finding, PageSignals, PaymentGuidance, SourceResult
from .payments import amount_at_stake, named, unprotected_only

WEIGHTS = {"reddit": 0.4, "instagram": 0.3, "store": 0.2, "reviews": 0.1}
COMPLAINT_POINTS = 25
COMPLAINT_CAP = 85
REPETITION_POINTS = 5
REVIEW_CAP = 20
STORE_CAP = 85


def score(sources: list[SourceResult], weights: dict[str, float] | None = None):
    weights = weights or WEIGHTS
    if set(weights) != set(WEIGHTS) or any(v <= 0 for v in weights.values()):
        raise ValueError("Four positive source weights required")
    available = {s.source: s for s in sources if s.status == "available"}
    coverage = sum(weights[k] for k in available) / sum(weights.values())
    if not available:
        return None, 0
    # The AI-text source is capped before renormalization, including when it is the only source.
    risk = sum(
        min(s.score or 0, REVIEW_CAP if k == "reviews" else 100) * weights[k]
        for k, s in available.items()
    ) / sum(weights[k] for k in available)
    return round(risk), round(coverage * 100)


def narrative(
    risk: int | None, coverage: int, recommended: str | None = None
) -> tuple[str, list[str]]:
    steps = [
        "Check the return policy and a working contact method before paying.",
        f"Pay with {named(recommended)} for the strongest buyer protection, and keep your order records."
        if recommended
        else "No listed payment method offers strong protection; avoid irreversible payments and keep your order records.",
    ]
    if coverage < 60:
        return (
            "Limited evidence. There is not enough source coverage to draw a strong conclusion. "
            "A low index here does not establish that this store is trustworthy.",
            ["Pause and look for independent, recent buyer experiences.", *steps],
        )
    if risk is not None and risk >= 60:
        return (
            "Several concerning signals deserve a closer look before you buy. Customer reports "
            "are allegations, even when their source text is verified.",
            ["Consider delaying this purchase until the complaints are resolved.", *steps],
        )
    return (
        "The available evidence shows fewer concerning signals. Read the supporting experiences "
        "and limitations: this is not a guarantee of safety.",
        steps,
    )


def evidence_score(findings: list[Finding]) -> float:
    verified = [f for f in findings if f.verification == "verified"]
    complaints = {
        f.excerpt.casefold()
        for f in verified
        if f.concern in {"non-delivery", "refund", "counterfeit"}
    }
    return min(COMPLAINT_CAP, len(complaints) * COMPLAINT_POINTS) + (
        REPETITION_POINTS if any(f.concern == "repetition" for f in verified) else 0
    )


def store_score(age_days: int | None, signals: PageSignals | None) -> float:
    points = 0
    if age_days is not None:
        points += 45 if age_days < 30 else 30 if age_days < 180 else 15 if age_days < 365 else 0
    if signals:
        contact = (signals.hasContactPage, signals.hasEmail, signals.hasPhone)
        amount = amount_at_stake(signals)
        points += 10 if signals.hasReturnPolicy is False else 0
        points += 10 if all(v is False for v in contact) else 0
        points += 15 if amount and (amount.discountPercent or 0) >= 70 else 0
        points += 30 if unprotected_only(signals.paymentMethods) else 0
    return min(STORE_CAP, points)


COMPLAINTS = {
    "non-delivery": "Buyer reports of orders that never arrived",
    "refund": "Buyer reports of refund problems",
    "counterfeit": "Buyer reports of counterfeit items",
}


def registration_age(store: SourceResult | None) -> int | None:
    fact = next(
        (
            f
            for f in (store.findings if store else [])
            if f.kind == "verified-fact" and f.concern == "domain-age" and f.date
        ),
        None,
    )
    return (store.checkedAt.date() - date.fromisoformat(fact.date)).days if fact else None


def decide(
    risk: int | None,
    coverage: int,
    sources: list[SourceResult],
    payment: PaymentGuidance,
    signals: PageSignals | None,
) -> Decision:
    available = [s for s in sources if s.status == "available"]
    store = next((s for s in available if s.source == "store"), None)
    age = registration_age(store)
    new = age is not None and age < 30
    limited, index = coverage < 60, risk or 0
    if index >= 60 or (signals and unprotected_only(signals.paymentMethods)) or new:
        verdict = "pause"
    elif limited or index >= 30 or (store and store.score):
        verdict = "protect"
    else:
        verdict = "proceed"

    reasons = [
        f.title
        for f in (store.findings if store else [])
        if f.concern in {"policy", "pricing", "payment"}
        or (f.concern == "domain-age" and (verdict == "proceed" or (age or 0) < 365))
    ]
    reported = {f.concern for s in available if s.source != "store" for f in s.findings}
    reasons += [text for concern, text in COMPLAINTS.items() if concern in reported]
    if limited:
        reasons.append(f"Limited evidence ({coverage}% source coverage)")
    elif risk is not None:
        reasons.append(f"Risk index {risk}/100 with {coverage}% source coverage")

    rec = payment.recommended
    tier = next((o.protection for o in payment.options if o.method == rec), None)
    pay = " or ".join([named(o.method) for o in payment.options if o.protection == tier][:2])
    headline = {
        "pause": f"Pause before paying; if you buy, use {pay}",
        "protect": f"Pay only with {pay}",
        "proceed": f"Fewer concerns found; pay with {pay} for protection",
    }[verdict]
    if not rec:
        headline = {
            "pause": "Pause: no protected way to pay is listed",
            "protect": "Be careful: no protected way to pay is listed",
            "proceed": "Fewer concerns found, but no protected way to pay is listed",
        }[verdict]
    return Decision(verdict=verdict, headline=headline, reasons=reasons[:5])
