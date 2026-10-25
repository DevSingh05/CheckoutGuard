import asyncio
from datetime import timedelta

import httpx
import pytest

from app.models import AnalyzeRequest, PageSignals, now
from app.providers.store import StoreProvider, age_text, rdap_redirect, registrable


def rdap(days_old=None, status=200):
    seen = []

    def respond(request):
        seen.append(str(request.url))
        if request.url.host == "rdap.org":
            return httpx.Response(
                302, headers={"Location": "https://rdap.registry.test/domain/shop.example"}
            )
        if days_old is None:
            return httpx.Response(status)
        date = (now() - timedelta(days=days_old)).strftime("%Y-%m-%dT%H:%M:%SZ")
        return httpx.Response(
            status,
            json={
                "events": [
                    {"eventAction": "last changed", "eventDate": "2026-01-01T00:00:00Z"},
                    {"eventAction": "registration", "eventDate": date},
                ]
            },
        )

    return StoreProvider(httpx.MockTransport(respond)), seen


def check(provider, signals=None, host="shop.example"):
    request = AnalyzeRequest(url=f"https://{host}/p", pageSignals=signals)
    return asyncio.run(provider.check(request, host))


def test_new_domain():
    provider, seen = rdap(days_old=23)
    result = check(provider)
    assert seen == [
        "https://rdap.org/domain/shop.example",
        "https://rdap.registry.test/domain/shop.example",
    ]
    assert result.status == "available" and result.score == 45
    finding = result.findings[0]
    assert finding.title == "Domain registered 23 days ago"
    assert (finding.kind, finding.concern, finding.verification) == (
        "verified-fact",
        "domain-age",
        "verified",
    )


def test_old_domain_with_good_signals():
    provider, _ = rdap(days_old=6 * 365 + 10)
    signals = PageSignals(paymentMethods=["credit-card"], hasReturnPolicy=True, hasEmail=True)
    result = check(provider, signals, host="www.shop.example")
    assert result.score == 0
    assert [f.title for f in result.findings] == ["Domain registered 6 years ago"]


def test_rdap_failure_keeps_page_signals():
    provider, _ = rdap(status=404)
    signals = PageSignals(
        paymentMethods=["gift-card", "crypto"],
        hasReturnPolicy=False,
        price=20,
        compareAtPrice=100,
    )
    result = check(provider, signals)
    assert result.status == "available" and result.score == 55
    assert {f.concern for f in result.findings} == {"policy", "pricing", "payment"}
    assert all(f.kind == "observed-pattern" for f in result.findings)
    assert "could not be retrieved" in result.limitations[0]


def test_rdap_failure_without_signals_is_insufficient():
    provider, _ = rdap(status=503)
    result = check(provider)
    assert result.status == "insufficient-data" and result.score is None


def test_redirect_to_non_https_rejected():
    seen = []

    def respond(request):
        seen.append(request.url.host)
        return httpx.Response(302, headers={"Location": "http://rdap.registry.test/domain/x"})

    result = check(StoreProvider(httpx.MockTransport(respond)))
    assert seen == ["rdap.org"]
    assert result.status == "insufficient-data"


@pytest.mark.parametrize(
    "location",
    ["http://rdap.test/x", "https://127.0.0.1/x", "https://user:pw@rdap.test/x", "ftp://rdap.test"],
)
def test_redirect_validation(location):
    with pytest.raises(ValueError):
        rdap_redirect("https://rdap.org/domain/a.example", location)


def test_redirect_loop_bounded():
    seen = []

    def respond(request):
        seen.append(request)
        return httpx.Response(302, headers={"Location": "https://rdap.org/domain/again.example"})

    result = check(StoreProvider(httpx.MockTransport(respond)))
    assert len(seen) == 3 and result.status == "insufficient-data"


def test_ip_host_skips_rdap():
    def respond(request):
        raise AssertionError("no request expected")

    result = check(StoreProvider(httpx.MockTransport(respond)), host="8.8.8.8")
    assert result.status == "insufficient-data"


@pytest.mark.parametrize(
    "host,expected",
    [
        ("shop.example", "shop.example"),
        ("checkout.eu.shop.example", "shop.example"),
        ("store.brand.co.uk", "brand.co.uk"),
        ("brand.com.au", "brand.com.au"),
        ("a.b.brand.com.au", "brand.com.au"),
    ],
)
def test_registrable(host, expected):
    assert registrable(host) == expected


def test_age_text():
    assert [age_text(d) for d in (1, 23, 200, 800)] == ["1 day", "23 days", "6 months", "2 years"]
