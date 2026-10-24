"""Allowlisted citation fetch with DNS validation and IP pinning (no redirects)."""

import asyncio
import http.client
import ipaddress
import re
import socket
import ssl
from html.parser import HTMLParser
from urllib.parse import urlsplit

REDDIT = re.compile(
    r"https://(?:www\.|old\.)?reddit\.com/r/[A-Za-z0-9_]+/comments/[a-z0-9]+(?:/[^?#]*)?/?$"
)


def reddit_url(url: str) -> bool:
    return bool(REDDIT.fullmatch(url))


def _fetch(url: str) -> str:
    if not reddit_url(url):
        raise ValueError("Not an allowlisted Reddit discussion")
    u = urlsplit(url)
    addresses = socket.getaddrinfo(u.hostname, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError("Non-public DNS destination")
    # Connect to the validated address, not a second DNS lookup. TLS still verifies the hostname.
    raw = socket.create_connection((addresses[0][4][0], 443), timeout=6)
    connection = http.client.HTTPSConnection(u.hostname, timeout=6)
    try:
        connection.sock = ssl.create_default_context().wrap_socket(raw, server_hostname=u.hostname)
        connection.request(
            "GET", u.path, headers={"User-Agent": "CheckoutGuard/0.1 evidence verification"}
        )
        response = connection.getresponse()
        if response.status != 200:  # Redirects, login pages and blocked requests are not evidence.
            raise ValueError("Citation unavailable")
        if "text/html" not in (response.getheader("Content-Type") or ""):
            raise ValueError("Unexpected content type")
        body = response.read(750001)
        if len(body) > 750000:
            raise ValueError("Citation exceeds size bound")
        parser = PublicText()
        parser.feed(body.decode("utf-8", errors="replace"))
        return " ".join(parser.parts)
    finally:
        connection.close()
        raw.close()


async def citation_text(url: str) -> str:
    return await asyncio.to_thread(_fetch, url)


def supports(text: str, domain: str, excerpt: str) -> bool:
    normalized = " ".join(text.casefold().split())
    quote = " ".join(excerpt.casefold().split())
    # Require a substantial exact quote and exact merchant domain nearby.
    index = normalized.find(quote)
    if index < 0 or len(quote) < 35:
        return False
    context = normalized[max(0, index - 300) : index + len(quote) + 300]
    return bool(re.search(r"(?<![\w.-])" + re.escape(domain) + r"(?![\w.-])", context))


class PublicText(HTMLParser):
    """Exclude executable/style content from citation matching."""

    def __init__(self):
        super().__init__()
        self.parts = []
        self.suppressed = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.suppressed += 1

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self.suppressed = max(0, self.suppressed - 1)

    def handle_data(self, data):
        if not self.suppressed:
            self.parts.append(data)
