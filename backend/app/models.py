import ipaddress
import re
from datetime import UTC, datetime
from typing import Annotated, Literal
from urllib.parse import urlsplit, urlunsplit

from pydantic import BaseModel, Field, field_validator, model_validator

Source = Literal["reddit", "instagram", "store", "reviews"]
Status = Literal["available", "insufficient-data", "unavailable", "error"]
PaymentMethod = Literal[
    "credit-card",
    "debit-card",
    "paypal",
    "apple-pay",
    "google-pay",
    "shop-pay",
    "amazon-pay",
    "klarna",
    "afterpay",
    "affirm",
    "crypto",
    "zelle",
    "wire-transfer",
    "bank-transfer",
    "gift-card",
    "cash-app",
    "venmo",
    "western-union",
]
Protection = Literal["strong", "moderate", "limited", "none"]
Money = Annotated[float, Field(ge=0, le=1_000_000)]


def now() -> datetime:
    return datetime.now(UTC)


def public_url(value: str) -> str:
    u = urlsplit(value)
    host = u.hostname or ""
    if (
        u.scheme not in {"http", "https"}
        or u.username
        or u.password
        or u.port not in {None, 80, 443}
    ):
        raise ValueError("A public HTTP(S) URL is required")
    if not host or "." not in host or host.endswith((".local", ".localhost", ".internal")):
        raise ValueError("Local hosts are unsupported")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address is not None and not address.is_global:
        raise ValueError("Private addresses are unsupported")
    if not re.fullmatch(r"[a-zA-Z0-9.-]+", host) and address is None:
        raise ValueError("Invalid hostname")
    return urlunsplit((u.scheme, u.netloc.lower(), u.path, "", ""))


class PageSignals(BaseModel):
    """Storefront observations made by the extension on the current page only."""

    paymentMethods: list[PaymentMethod] = Field(default_factory=list, max_length=16)
    hasReturnPolicy: bool | None = None
    hasContactPage: bool | None = None
    hasEmail: bool | None = None
    hasPhone: bool | None = None
    price: Money | None = None
    compareAtPrice: Money | None = None
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")

    @field_validator("paymentMethods")
    @classmethod
    def dedupe(cls, values: list[str]) -> list[str]:
        return list(dict.fromkeys(values))


class AnalyzeRequest(BaseModel):
    url: str = Field(max_length=2048)
    productTitle: str = Field(default="", max_length=300)
    instagramLinks: list[Annotated[str, Field(max_length=300)]] = Field(
        default_factory=list, max_length=3
    )
    reviews: list[Annotated[str, Field(max_length=2000)]] = Field(
        default_factory=list, max_length=20
    )
    extractionLimitations: list[Annotated[str, Field(max_length=300)]] = Field(
        default_factory=list, max_length=8
    )
    pageSignals: PageSignals | None = None
    demo: Literal["warning", "positive", "limited", "outage"] | None = None
    refresh: bool = False

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        return public_url(value)

    @field_validator("instagramLinks")
    @classmethod
    def validate_instagram(cls, values: list[str]) -> list[str]:
        for v in values:
            if not re.fullmatch(r"https://(?:www\.)?instagram\.com/[A-Za-z0-9_.]{1,30}/?", v):
                raise ValueError("Only direct Instagram profile links are accepted")
            if urlsplit(v).path.strip("/") in {
                "p",
                "reel",
                "reels",
                "explore",
                "accounts",
                "stories",
            }:
                raise ValueError("Not an Instagram profile")
        return values

    @model_validator(mode="after")
    def bound_text(self):
        if sum(map(len, self.reviews)) > 12000:
            raise ValueError("Review payload exceeds 12000 characters")
        return self


class Finding(BaseModel):
    title: str = Field(max_length=160)
    excerpt: str = Field(max_length=2000)
    url: str | None = Field(default=None, max_length=2048)
    kind: Literal["customer-allegation", "observed-pattern", "verified-fact", "positive-experience"]
    concern: Literal[
        "non-delivery",
        "refund",
        "counterfeit",
        "repetition",
        "ai-text",
        "positive",
        "context",
        "domain-age",
        "policy",
        "payment",
        "pricing",
    ]
    verification: Literal["verified", "unverified", "fictional"] = "unverified"
    date: str | None = Field(default=None, max_length=50)

    @field_validator("url")
    @classmethod
    def validate_link(cls, value: str | None):
        return public_url(value) if value else None


class SourceDiagnostic(BaseModel):
    code: Literal[
        "missing-key",
        "authentication",
        "rate-limit",
        "network",
        "timeout",
        "provider-error",
        "invalid-response",
        "no-linked-account",
        "short-text",
        "insufficient-sample",
        "unverified-citations",
        "no-results",
    ]
    message: str = Field(max_length=300)
    action: str = Field(max_length=300)


class SourceResult(BaseModel):
    source: Source
    status: Status
    score: float | None = Field(default=None, ge=0, le=100)
    findings: list[Finding] = Field(default_factory=list, max_length=30)
    limitations: list[str] = Field(default_factory=list, max_length=20)
    checkedAt: datetime = Field(default_factory=now)
    cached: bool = False
    expiresAt: datetime | None = None
    diagnostic: SourceDiagnostic | None = None
    sampleSize: int | None = Field(default=None, ge=0, le=10000)
    verifiedCount: int | None = Field(default=None, ge=0, le=10000)

    @model_validator(mode="after")
    def consistent_score(self):
        if (self.status == "available") != (self.score is not None):
            raise ValueError("Only available sources must have a score")
        return self


class Decision(BaseModel):
    verdict: Literal["proceed", "protect", "pause"]
    headline: str = Field(max_length=120)
    reasons: list[str] = Field(default_factory=list, max_length=5)


class PaymentOption(BaseModel):
    method: PaymentMethod
    label: str
    protection: Protection
    note: str


class PaymentGuidance(BaseModel):
    options: list[PaymentOption]
    recommended: PaymentMethod | None
    warning: str | None = None
    disputeSteps: list[str] = Field(max_length=5)
    observed: bool = False


class AmountAtStake(BaseModel):
    price: float
    compareAtPrice: float | None = None
    currency: str | None = None
    discountPercent: int | None = None


class Brief(BaseModel):
    text: str = Field(max_length=1200)
    generated: bool


class AnalyzeResponse(BaseModel):
    domain: str
    productTitle: str
    overallRisk: int | None
    coverage: int
    limitedEvidence: bool
    summary: str
    nextSteps: list[str]
    sources: list[SourceResult]
    decision: Decision
    payment: PaymentGuidance
    amountAtStake: AmountAtStake | None = None
    brief: Brief | None = None
    scannedAt: datetime = Field(default_factory=now)
    demo: bool = False
