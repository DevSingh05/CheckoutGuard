from app.models import PageSignals
from app.payments import amount_at_stake, guidance, unprotected_only


def test_ranked_by_protection_and_limited_to_offered():
    result = guidance(["zelle", "debit-card", "crypto", "paypal", "credit-card"])
    assert [o.method for o in result.options] == [
        "credit-card",
        "paypal",
        "debit-card",
        "crypto",
        "zelle",
    ]
    assert [o.protection for o in result.options] == [
        "strong",
        "strong",
        "moderate",
        "none",
        "none",
    ]
    assert result.recommended == "credit-card"
    assert "Zelle and Cryptocurrency" in result.warning
    assert "chargeback" in result.disputeSteps[2]


def test_unprotected_only_has_no_recommendation():
    result = guidance(["gift-card", "crypto", "wire-transfer"])
    assert result.recommended is None
    assert result.warning.startswith("This store only lists")
    assert unprotected_only(["gift-card", "crypto"]) and not unprotected_only([])
    assert not unprotected_only(["crypto", "klarna"])


def test_bank_transfer_is_not_recommended():
    result = guidance(["bank-transfer"])
    assert result.recommended is None and result.options[0].protection == "limited"


def test_generic_list_when_page_lists_nothing():
    result = guidance([])
    assert result.recommended == "credit-card" and result.warning is None
    assert result.options[-1].protection == "none"


def test_dispute_steps_follow_recommendation():
    assert "Klarna app" in guidance(["klarna", "zelle"]).disputeSteps[2]
    assert "PayPal" in guidance(["paypal", "debit-card"]).disputeSteps[2]
    assert "Apple Pay" in guidance(["apple-pay"]).disputeSteps[2]
    assert 3 <= len(guidance(["venmo"]).disputeSteps) <= 5


def test_amount_at_stake():
    assert amount_at_stake(None) is None
    assert amount_at_stake(PageSignals(compareAtPrice=10)) is None
    amount = amount_at_stake(PageSignals(price=35.99, compareAtPrice=129, currency="USD"))
    assert amount.discountPercent == 72 and amount.currency == "USD"
    assert amount_at_stake(PageSignals(price=50, compareAtPrice=40)).discountPercent is None


def test_signals_deduped_and_bounded():
    import pytest

    assert PageSignals(paymentMethods=["paypal", "paypal"]).paymentMethods == ["paypal"]
    with pytest.raises(ValueError):
        PageSignals(paymentMethods=["bitcoin"])
    with pytest.raises(ValueError):
        PageSignals(currency="usd")
    with pytest.raises(ValueError):
        PageSignals(price=-1)


def test_unknown_payment_methods_are_explicitly_general():
    assert guidance([]).observed is False
    assert guidance(["credit-card"]).observed is True
