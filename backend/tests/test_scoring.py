import pytest

from app.models import SourceResult
from app.scoring import score


def source(name, value=None):
    return SourceResult(
        source=name, status="available" if value is not None else "unavailable", score=value
    )


def test_zero_coverage():
    assert score([source("reddit"), source("instagram"), source("reviews")]) == (None, 0)


def test_renormalization():
    assert score([source("reddit", 80), source("instagram"), source("reviews", 20)]) == (70, 60)


def test_original_weight_coverage():
    assert score([source("reddit", 40)]) == (40, 50)


@pytest.mark.parametrize("signal", [0, 20, 80, 100])
def test_ai_signal_alone_never_high(signal):
    risk, coverage = score([source("reviews", signal)])
    assert risk <= 20 and coverage == 10


def test_custom_weights():
    assert score([source("reddit", 60)], {"reddit": 1, "instagram": 1, "reviews": 1}) == (60, 33)


def test_status_consistency():
    with pytest.raises(ValueError):
        SourceResult(source="reviews", status="unavailable", score=0)
