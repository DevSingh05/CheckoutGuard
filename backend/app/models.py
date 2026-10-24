import ipaddress
import re
from datetime import UTC, datetime
from typing import Annotated, Literal
from urllib.parse import urlsplit, urlunsplit

from pydantic import BaseModel, Field, field_validator, model_validator

Source = Literal["reddit", "instagram", "reviews"]
Status = Literal["available", "insufficient-data", "unavailable", "error"]


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
        "non-delivery", "refund", "counterfeit", "repetition", "ai-text", "positive", "context"
    ]
    verification: Literal["verified", "unverified", "fictional"] = "unverified"
    date: str | None = Field(default=None, max_length=50)

    @field_validator("url")
    @classmethod
    def validate_link(cls, value: str | None):
        return public_url(value) if value else None


class SourceResult(BaseModel):
    source: Source
    status: Status
    score: float | None = Field(default=None, ge=0, le=100)
    findings: list[Finding] = Field(default_factory=list, max_length=30)
    limitations: list[str] = Field(default_factory=list, max_length=20)
    checkedAt: datetime = Field(default_factory=now)
    cached: bool = False
    expiresAt: datetime | None = None

    @model_validator(mode="after")
    def consistent_score(self):
        if (self.status == "available") != (self.score is not None):
            raise ValueError("Only available sources must have a score")
        return self


class AnalyzeResponse(BaseModel):
    domain: str
    productTitle: str
    overallRisk: int | None
    coverage: int
    limitedEvidence: bool
    summary: str
    nextSteps: list[str]
    sources: list[SourceResult]
    scannedAt: datetime = Field(default_factory=now)
    demo: bool = False
