import socket
from unittest.mock import patch

import pytest

from app.models import AnalyzeRequest
from app.providers.security import _fetch, reddit_url, supports


@pytest.mark.parametrize(
    "url",
    [
        "http://www.reddit.com/r/shop/comments/abc",
        "https://reddit.com.evil.com/r/x/comments/abc",
        "https://reddit.com@127.0.0.1/r/a/comments/abc",
        "https://reddit.com/r/x/comments/abc?redirect=localhost",
        "https://reddit.com/user/person",
    ],
)
def test_reject_non_discussions(url):
    assert not reddit_url(url)


def test_domain_and_quote_required_together():
    quote = "My order never arrived and I have been waiting for six weeks."
    assert supports("shop.example " + quote, "shop.example", quote)
    assert not supports("other-shop.example " + quote, "shop.example", quote)
    assert not supports("shop.example no such quote", "shop.example", quote)
    assert not supports("evilshop.example " + quote, "shop.example", quote)


def test_private_dns_rejected_before_connect():
    with (
        patch(
            "socket.getaddrinfo",
            return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))],
        ),
        patch("socket.create_connection") as connect,
    ):
        with pytest.raises(ValueError, match="Non-public"):
            _fetch("https://www.reddit.com/r/shopping/comments/abc/title/")
        connect.assert_not_called()


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "http://localhost",
        "http://10.0.0.1/a",
        "https://shop.local/a",
        "https://user:secret@shop.example",
        "https://shop.example:444/",
    ],
)
def test_request_url_validation(url):
    with pytest.raises(ValueError):
        AnalyzeRequest(url=url)


def test_parameters_removed():
    assert (
        AnalyzeRequest(url="https://shop.example/a?token=secret#private").url
        == "https://shop.example/a"
    )


def test_redirect_is_not_followed():
    from unittest.mock import MagicMock

    raw = MagicMock()
    connection = MagicMock()
    connection.getresponse.return_value.status = 302
    with (
        patch(
            "socket.getaddrinfo",
            return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("151.101.1.140", 443))],
        ),
        patch("socket.create_connection", return_value=raw) as connect,
        patch("http.client.HTTPSConnection", return_value=connection),
        patch("ssl.create_default_context") as tls,
    ):
        with pytest.raises(ValueError, match="unavailable"):
            _fetch("https://www.reddit.com/r/shopping/comments/abc/test/")
        connect.assert_called_once_with(("151.101.1.140", 443), timeout=6)
        tls.return_value.wrap_socket.assert_called_once_with(raw, server_hostname="www.reddit.com")
        assert connection.request.call_count == 1


def test_www_alias_can_support_the_exact_merchant():
    quote = "My order never arrived after six weeks of waiting and repeated support requests."
    assert supports("https://www.shop.example " + quote, "shop.example", quote)
    assert supports("www.shop.example " + quote, "www.shop.example", quote)
    assert not supports("www.evilshop.example " + quote, "shop.example", quote)


def test_rdap_destination_with_private_dns_is_blocked():
    from app.providers.security import pinned_get

    with (
        patch(
            "socket.getaddrinfo",
            return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.2", 443))],
        ),
        patch("socket.create_connection") as connect,
    ):
        with pytest.raises(ValueError, match="Non-public"):
            pinned_get("https://registry.example/domain/shop.example", "application/rdap+json")
        connect.assert_not_called()


def test_merchant_link_host_survives_html_text_extraction():
    from app.providers.security import PublicText

    parser = PublicText()
    quote = "My order never arrived after six weeks and support has not replied."
    parser.feed(
        '<p>I bought from <a href="https://www.shop.example/products/bag?private=token">this website</a>. '
        + quote
        + "</p><script>Hidden private text</script>"
    )
    body = " ".join(parser.parts)
    assert supports(body, "shop.example", quote)
    assert "private" not in body and "token" not in body
