import pytest

from app.models import SourceResult
from app.scoring import score


def source(name, value=None):
    return SourceResult(
        source=name, status="available" if value is not None else "unavailable", score=value
    )


def test_zero_coverage():
    assert score([source(s) for s in ("reddit", "instagram", "store", "reviews")]) == (None, 0)


def test_renormalization():
    assert score([source("reddit", 80), source("instagram"), source("reviews", 20)]) == (68, 50)


def test_original_weight_coverage():
    assert score([source("reddit", 40)]) == (40, 40)


@pytest.mark.parametrize("signal", [0, 20, 80, 100])
def test_ai_signal_alone_never_high(signal):
    risk, coverage = score([source("reviews", signal)])
    assert risk <= 20 and coverage == 10


def test_custom_weights():
    weights = {"reddit": 1, "instagram": 1, "store": 1, "reviews": 1}
    assert score([source("reddit", 60)], weights) == (60, 25)
    with pytest.raises(ValueError):
        score([source("reddit", 60)], {"reddit": 1, "instagram": 1, "reviews": 1})


def test_status_consistency():
    with pytest.raises(ValueError):
        SourceResult(source="reviews", status="unavailable", score=0)


def test_store_score_rules():
    from app.models import PageSignals
    from app.scoring import store_score

    assert store_score(None, None) == 0
    assert [store_score(d, None) for d in (5, 100, 300, 400)] == [45, 30, 15, 0]
    bad = PageSignals(
        paymentMethods=["zelle", "crypto"],
        hasReturnPolicy=False,
        hasContactPage=False,
        hasEmail=False,
        hasPhone=False,
        price=10,
        compareAtPrice=100,
    )
    assert store_score(None, bad) == 65
    assert store_score(5, bad) == 85  # capped
    # Unknown (null) signals are not treated as missing.
    assert store_score(None, PageSignals(hasContactPage=False, paymentMethods=["paypal"])) == 0
