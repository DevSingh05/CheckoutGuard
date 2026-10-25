from datetime import timedelta

from app.models import Finding, PageSignals, SourceResult, now
from app.payments import guidance
from app.scoring import decide, narrative


def store(days=None, score=0, findings=()):
    checked = now()
    facts = list(findings)
    if days is not None:
        facts.append(
            Finding(
                title=f"Domain registered {days} days ago",
                excerpt="Registration record.",
                kind="verified-fact",
                concern="domain-age",
                verification="verified",
                date=(checked - timedelta(days=days)).date().isoformat(),
            )
        )
    return SourceResult(
        source="store", status="available", score=score, findings=facts, checkedAt=checked
    )


def run(risk, coverage, sources=(), methods=None):
    signals = PageSignals(paymentMethods=methods) if methods is not None else None
    return decide(risk, coverage, list(sources), guidance(methods), signals)


def test_proceed_when_few_concerns():
    result = run(10, 100, [store(days=2000)], ["credit-card", "paypal"])
    assert result.verdict == "proceed"
    assert "credit card" in result.headline and "safe" not in result.headline.lower()
    assert "Domain registered 2000 days ago" in result.reasons


def test_pause_for_high_risk():
    assert run(60, 100).verdict == "pause"


def test_pause_for_new_domain_even_with_low_risk():
    result = run(5, 100, [store(days=0, score=45)], ["credit-card", "paypal"])
    assert result.verdict == "pause"
    assert result.headline == "Pause before paying; if you buy, use a credit card or PayPal"
    assert result.reasons[0] == "Domain registered 0 days ago"


def test_pause_when_only_unprotected_methods():
    result = run(5, 100, methods=["zelle", "crypto"])
    assert result.verdict == "pause" and "no protected way" in result.headline


def test_protect_for_limited_evidence_or_moderate_risk():
    limited = run(None, 0)
    assert limited.verdict == "protect"
    assert limited.headline == "Pay only with a credit card or PayPal"
    assert "Limited evidence (0% source coverage)" in limited.reasons
    assert run(30, 100).verdict == "protect"


def test_protect_for_any_store_concern():
    concern = Finding(
        title="No return policy found",
        excerpt="None found.",
        kind="observed-pattern",
        concern="policy",
        verification="verified",
    )
    result = run(5, 100, [store(score=10, findings=[concern])], ["apple-pay", "klarna"])
    assert result.verdict == "protect"
    assert result.headline == "Pay only with Apple Pay"
    assert result.reasons[0] == "No return policy found"


def test_complaint_reasons_are_grounded():
    reddit = SourceResult(
        source="reddit",
        status="available",
        score=50,
        findings=[
            Finding(
                title="Report",
                excerpt="It never arrived.",
                kind="customer-allegation",
                concern="non-delivery",
            )
        ],
    )
    result = run(50, 100, [reddit])
    assert result.reasons == [
        "Buyer reports of orders that never arrived",
        "Risk index 50/100 with 100% source coverage",
    ]


def test_narrative_names_payment_method():
    assert "PayPal" in narrative(10, 100, "paypal")[1][1]
    assert "No listed payment method" in narrative(10, 100, None)[1][1]
