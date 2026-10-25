"""Deterministic buyer-protection guidance. General consumer information, not legal advice."""

from .models import AmountAtStake, PageSignals, PaymentGuidance, PaymentMethod, PaymentOption

WALLET = "Protection comes from the card behind it: strong when backed by a credit card."
INSTALLMENTS = "{} has a dispute process, but you may still owe installments while it reviews."
TABLE: dict[PaymentMethod, tuple[str, str, str]] = {
    "credit-card": (
        "Credit card",
        "strong",
        "Chargeback rights under the Fair Credit Billing Act; dispute within 60 days of the statement.",
    ),
    "paypal": (
        "PayPal",
        "strong",
        "Purchase Protection when you pay as goods and services, not friends and family.",
    ),
    "apple-pay": ("Apple Pay", "strong", WALLET),
    "google-pay": ("Google Pay", "strong", WALLET),
    "shop-pay": ("Shop Pay", "strong", WALLET),
    "amazon-pay": ("Amazon Pay", "strong", "A-to-z Guarantee, plus the card behind it."),
    "debit-card": (
        "Debit card",
        "moderate",
        "Visa and Mastercard zero-liability and chargeback rules apply, but the money leaves your account first.",
    ),
    "klarna": ("Klarna", "moderate", INSTALLMENTS.format("Klarna")),
    "afterpay": ("Afterpay", "moderate", INSTALLMENTS.format("Afterpay")),
    "affirm": ("Affirm", "moderate", INSTALLMENTS.format("Affirm")),
    "bank-transfer": (
        "Bank transfer",
        "limited",
        "Hard to reverse; banks can help only in limited cases.",
    ),
    "crypto": ("Cryptocurrency", "none", "Irreversible. Legitimate stores rarely require it."),
    "zelle": ("Zelle", "none", "Meant for people you know; purchases are generally not protected."),
    "wire-transfer": ("Wire transfer", "none", "Irreversible once sent."),
    "gift-card": ("Gift card", "none", "Irreversible and a common scam payment demand."),
    "cash-app": ("Cash App", "none", "Payments to strangers are generally not protected."),
    "venmo": ("Venmo", "none", "Friends and family payments are not protected."),
    "western-union": ("Western Union", "none", "Irreversible money transfer."),
}
RANK = {"strong": 0, "moderate": 1, "limited": 2, "none": 3}
GENERIC: list[PaymentMethod] = [
    "credit-card",
    "paypal",
    "debit-card",
    "bank-transfer",
    "wire-transfer",
    "gift-card",
    "crypto",
]
ORDER = list(TABLE)


def tier(method: PaymentMethod) -> str:
    return TABLE[method][1]


def named(method: PaymentMethod) -> str:
    """Label for use inside a sentence."""
    return {"credit-card": "a credit card", "debit-card": "a debit card"}.get(
        method, TABLE[method][0]
    )


def unprotected_only(methods: list[PaymentMethod]) -> bool:
    return bool(methods) and all(tier(m) == "none" for m in methods)


def dispute_steps(method: PaymentMethod | None) -> list[str]:
    label = TABLE[method][0] if method else ""
    specific = {
        "credit-card": "If it never arrives, ask your card issuer for a chargeback within 60 days of the statement date.",
        "debit-card": "If it never arrives, ask your bank for a card chargeback as soon as possible; the money is already out of your account.",
        "paypal": "If it never arrives, open a dispute in the PayPal Resolution Center within 180 days and escalate it to a claim if needed.",
        "amazon-pay": "If it never arrives, file an A-to-z Guarantee claim with Amazon, or dispute the charge with your card issuer.",
    }
    if method in {"apple-pay", "google-pay", "shop-pay"}:
        step = f"If it never arrives, dispute the charge with the card issuer behind {label}."
    elif method in {"klarna", "afterpay", "affirm"}:
        step = f"If it never arrives, report it in the {label} app so it can pause payments while it investigates."
    elif method in specific:
        step = specific[method]
    else:
        step = "If you already paid, contact your bank or payment app immediately; recovery is unlikely, but fast reports help."
    return [
        "Save the order confirmation, a screenshot of the product page and every message with the store.",
        "Contact the store in writing and give it a short deadline to ship or refund.",
        step,
        "Report the store to your consumer protection agency, such as the FTC at reportfraud.ftc.gov in the US.",
    ]


def guidance(methods: list[PaymentMethod] | None = None) -> PaymentGuidance:
    offered = list(dict.fromkeys(methods or []))
    ranked = sorted(offered or GENERIC, key=lambda m: (RANK[tier(m)], ORDER.index(m)))
    best = ranked[0]
    recommended = best if tier(best) in {"strong", "moderate"} else None
    avoid = [m for m in offered if tier(m) == "none"]
    if offered and recommended is None:
        warning = "This store only lists payment methods with little or no buyer protection."
    elif avoid:
        warning = (
            f"Avoid {' and '.join(TABLE[m][0] for m in avoid)}: these payments cannot be reversed."
        )
    else:
        warning = None
    return PaymentGuidance(
        options=[
            PaymentOption(method=m, label=TABLE[m][0], protection=tier(m), note=TABLE[m][2])
            for m in ranked
        ],
        recommended=recommended,
        warning=warning,
        disputeSteps=dispute_steps(recommended),
    )


def amount_at_stake(signals: PageSignals | None) -> AmountAtStake | None:
    if signals is None or signals.price is None:
        return None
    was = signals.compareAtPrice
    discount = round((1 - signals.price / was) * 100) if was and was > signals.price else None
    return AmountAtStake(
        price=signals.price,
        compareAtPrice=was,
        currency=signals.currency,
        discountPercent=discount,
    )
