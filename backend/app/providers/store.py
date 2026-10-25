"""Keyless storefront checks: RDAP domain registration date plus extension page signals."""

import asyncio
import ipaddress
import json
from datetime import UTC, datetime
from urllib.parse import urljoin, urlsplit

import httpx
from pydantic import BaseModel, Field

from ..models import AnalyzeRequest, Finding, PageSignals, SourceResult, now, public_url
from ..payments import amount_at_stake, unprotected_only
from ..scoring import store_score
from .common import request_json
from .security import pinned_get

RDAP = "https://rdap.org/domain/"
# Deliberately small: a full public suffix list is not needed to strip shop subdomains.
TWO_LEVEL = {
    f"{a}.{b}"
    for b, labels in {
        "uk": ("co", "org", "me", "ltd", "plc", "ac", "gov"),
        "au": ("com", "net", "org", "id"),
        "nz": ("co", "net", "org"),
        "jp": ("co", "ne", "or"),
        "in": ("co", "net", "org", "firm"),
        "za": ("co", "org"),
        "br": ("com", "net"),
        "mx": ("com",),
        "sg": ("com",),
        "hk": ("com",),
        "tr": ("com",),
        "cn": ("com",),
        "tw": ("com",),
        "kr": ("co",),
        "il": ("co",),
    }.items()
    for a in labels
}
LIMITATIONS = [
    "Domain age and page signals are weak, indirect indicators: new legitimate stores exist, and old domains can change hands.",
    "Page signals come from this page only and may miss policies or contact details elsewhere on the site.",
]


class Event(BaseModel):
    eventAction: str = Field(max_length=200)
    eventDate: datetime | None = None


class Domain(BaseModel):
    events: list[Event] = Field(default_factory=list, max_length=200)


def registrable(host: str) -> str:
    labels = host.lower().strip(".").split(".")
    return ".".join(labels[-3:] if ".".join(labels[-2:]) in TWO_LEVEL else labels[-2:])


def rdap_redirect(base: str, location: str) -> str:
    url = urljoin(base, location)
    if urlsplit(url).scheme != "https":
        raise ValueError("RDAP redirects must stay on HTTPS")
    return public_url(url)  # Every real connection also validates and pins DNS.


def age_text(days: int) -> str:
    value, unit = (
        (days, "day")
        if days < 60
        else (days // 30, "month")
        if days < 730
        else (days // 365, "year")
    )
    return f"{value} {unit}{'' if value == 1 else 's'}"


def assess(
    domain: str,
    registered: datetime | None,
    signals: PageSignals | None,
    *,
    checked: datetime,
    page_url: str | None,
    rdap_url: str | None = None,
    verification: str = "verified",
    limitations: list[str] | None = None,
) -> SourceResult:
    findings = []
    age = None

    def add(title, excerpt, concern, kind="observed-pattern", url=page_url, date=None):
        findings.append(
            Finding(
                title=title,
                excerpt=excerpt,
                concern=concern,
                kind=kind,
                verification=verification,
                url=url,
                date=date,
            )
        )

    if registered is not None:
        age = max(0, (checked - registered).days)
        add(
            f"Domain registered {age_text(age)} ago",
            f"Public registration records (RDAP) list {domain} as registered on {registered:%Y-%m-%d}.",
            "domain-age",
            "verified-fact",
            rdap_url,
            registered.date().isoformat(),
        )
    if signals:
        if signals.hasReturnPolicy is True:
            add(
                "Return policy link found",
                "A return or refund policy link was visible on this page. The policy's terms have not been independently verified.",
                "context",
            )
        if any(v is True for v in (signals.hasContactPage, signals.hasEmail, signals.hasPhone)):
            add(
                "Contact information found",
                "This page exposes a contact link or public contact method. This does not establish that the store will respond.",
                "context",
            )
        amount = amount_at_stake(signals)
        if signals.hasReturnPolicy is False:
            add(
                "No return policy found",
                "No return or refund policy link was found on this page.",
                "policy",
            )
        if all(v is False for v in (signals.hasContactPage, signals.hasEmail, signals.hasPhone)):
            add(
                "No contact details found",
                "No contact page, email address or phone number was found on this page.",
                "policy",
            )
        if amount and (amount.discountPercent or 0) >= 70:
            add(
                f"Price is {amount.discountPercent}% below the listed original",
                "Very large discounts are a common lure on short-lived storefronts; they are not proof of fraud.",
                "pricing",
            )
        if unprotected_only(signals.paymentMethods):
            add(
                "Only irreversible payment methods listed",
                "Every payment method found on this page offers little or no buyer protection.",
                "payment",
            )
    observed = signals is not None and (
        bool(signals.paymentMethods)
        or signals.price is not None
        or any(
            v is not None
            for v in (
                signals.hasReturnPolicy,
                signals.hasContactPage,
                signals.hasEmail,
                signals.hasPhone,
            )
        )
    )
    available = registered is not None or observed
    return SourceResult(
        source="store",
        status="available" if available else "insufficient-data",
        score=store_score(age, signals) if available else None,
        findings=findings,
        limitations=(limitations or []) + LIMITATIONS,
        checkedAt=checked,
    )


class StoreProvider:
    def __init__(self, transport: httpx.AsyncBaseTransport | None = None, timeout: float = 5):
        self.transport, self.timeout = transport, timeout

    async def registered(self, domain: str) -> datetime | None:
        url = RDAP + domain
        if self.transport is None:
            # Registry redirects are arbitrary hostnames: validate all DNS answers and
            # pin the destination at every hop rather than trusting lexical URL checks.
            for _ in range(3):
                status, kind, location, body = await asyncio.to_thread(
                    pinned_get, url, "application/rdap+json"
                )
                if status in {301, 302, 303, 307, 308}:
                    url = rdap_redirect(url, location or "")
                    continue
                if status != 200 or "json" not in kind:
                    raise ValueError("Registration record unavailable")
                data = json.loads(body)
                break
            else:
                raise ValueError("Too many RDAP redirects")
            return registration_date(data)
        async with httpx.AsyncClient(
            transport=self.transport, timeout=self.timeout, follow_redirects=False, trust_env=False
        ) as client:
            # rdap.org redirects to the authoritative registry; follow at most two hops manually.
            for _ in range(3):
                try:
                    data = await request_json(
                        client, "GET", url, headers={"Accept": "application/rdap+json"}
                    )
                    break
                except httpx.HTTPStatusError as exc:
                    if not exc.response.is_redirect:
                        raise
                    url = rdap_redirect(url, exc.response.headers.get("location", ""))
            else:
                raise ValueError("Too many RDAP redirects")
        return registration_date(data)

    async def check(self, request: AnalyzeRequest, domain: str) -> SourceResult:
        name, registered, limitations = domain, None, []
        try:
            ipaddress.ip_address(domain)
            limitations.append("Domain registration is not checked for IP-address hosts.")
        except ValueError:
            name = registrable(domain)
            try:
                registered = await self.registered(name)
                if registered is None:
                    limitations.append("Registration records did not include a registration date.")
            except (httpx.HTTPError, ValueError, OSError):
                # Do not log RDAP URLs or responses.
                limitations.append("Domain registration records could not be retrieved.")
        return assess(
            name,
            registered,
            request.pageSignals,
            checked=now(),
            page_url=request.url,
            rdap_url=RDAP + name,
            limitations=limitations,
        )


def registration_date(data: object) -> datetime | None:
    date = next(
        (
            e.eventDate
            for e in Domain.model_validate(data).events
            if e.eventAction == "registration" and e.eventDate
        ),
        None,
    )
    return date.replace(tzinfo=UTC) if date and date.tzinfo is None else date
