import asyncio
from unittest.mock import AsyncMock, patch

import httpx

from app.cache import TTLCache
from app.models import AnalyzeRequest, SourceResult
from app.providers.instagram import InstagramProvider, repetitive
from app.providers.reddit import RedditProvider
from app.providers.reviews import ReviewProvider


def test_missing_keys_are_not_fake_results():
    request = AnalyzeRequest(
        url="https://shop.example/a",
        reviews=["Original review. " * 30],
        instagramLinks=["https://www.instagram.com/shop/"],
    )
    for provider in [ReviewProvider(""), InstagramProvider(""), RedditProvider("")]:
        result = asyncio.run(provider.check(request, "shop.example"))
        assert result.status == "unavailable" and result.score is None and not result.findings


def test_original_review_text_sent_unchanged():
    text = "  My  bag arrived.\n" + "I like the pockets. " * 20
    request = AnalyzeRequest(url="https://shop.example/a", reviews=[text, text])
    with patch(
        "app.providers.reviews.request_json",
        new_callable=AsyncMock,
        return_value={"documents": [{"completely_generated_prob": 0.9}]},
    ) as post:
        result = asyncio.run(ReviewProvider("test").check(request, "shop.example"))
        assert post.call_args.kwargs["json"]["document"] == text.strip()
        assert result.score == 18


def test_unsupported_text():
    result = asyncio.run(
        ReviewProvider("test").check(
            AnalyzeRequest(url="https://shop.example", reviews=["short"]), "shop.example"
        )
    )
    assert result.status == "insufficient-data"


def test_unsupported_provider_length_or_language():
    error = httpx.HTTPStatusError(
        "unsupported",
        request=httpx.Request("POST", "https://api.gptzero.me"),
        response=httpx.Response(400),
    )
    with patch("app.providers.reviews.request_json", new_callable=AsyncMock, side_effect=error):
        result = asyncio.run(
            ReviewProvider("key").check(
                AnalyzeRequest(url="https://shop.example", reviews=["a" * 300]), "shop.example"
            )
        )
        assert result.status == "insufficient-data"


def test_repetition_is_conservative():
    assert repetitive(["Lovely travel bag, great quality!", "Lovely travel bag, great quality!!"])
    assert not repetitive(["Great", "Great"])


def test_cache_capacity_and_expiry():
    cache = TTLCache(ttl=10, capacity=1)
    value = SourceResult(source="reddit", status="available", score=20)
    cache.put("a", value)
    cache.put("b", value)
    assert cache.get("a") is None and cache.get("b").cached
    with patch("app.cache.monotonic", return_value=float("inf")):
        assert cache.get("b") is None


def test_instagram_no_comments_not_positive_evidence():
    request = AnalyzeRequest(
        url="https://shop.example", instagramLinks=["https://www.instagram.com/shop/"]
    )
    with patch(
        "app.providers.instagram.request_json",
        new_callable=AsyncMock,
        return_value=[
            {
                "url": "https://www.instagram.com/p/abc/",
                "ownerUsername": "shop",
                "latestComments": [],
            }
        ],
    ):
        result = asyncio.run(InstagramProvider("key").check(request, "shop.example"))
        assert result.status == "insufficient-data" and result.score is None


def test_transient_retry_is_bounded():
    from app.providers.common import request_json

    attempts = []

    def respond(request):
        attempts.append(request)
        return httpx.Response(503 if len(attempts) == 1 else 200, json={"ok": True})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            return await request_json(client, "POST", "https://api.gptzero.me/test", retry=True)

    assert asyncio.run(run()) == {"ok": True}
    assert len(attempts) == 2


def test_actor_start_not_retried():
    import pytest

    from app.providers.common import request_json

    attempts = []

    def respond(request):
        attempts.append(request)
        return httpx.Response(503)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            await request_json(client, "POST", "https://api.apify.com/test")

    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(run())
    assert len(attempts) == 1


def test_provider_body_bounded():
    import pytest

    from app.providers.common import request_json

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(lambda _: httpx.Response(200, content=b"x" * 2_000_001))
        ) as client:
            await request_json(client, "GET", "https://api.gptzero.me/test")

    with pytest.raises(ValueError, match="too large"):
        asyncio.run(run())


def test_unverified_reddit_candidates_excluded():
    import json
    import sys
    from types import SimpleNamespace

    candidate = {
        "findings": [
            {
                "url": "https://www.reddit.com/r/shopping/comments/abc/test/",
                "excerpt": "shop.example: my order never arrived after six weeks of waiting.",
            }
        ]
    }
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.send_message.return_value = SimpleNamespace(content=json.dumps(candidate))
    with (
        patch.dict(sys.modules, {"backboard": SimpleNamespace(BackboardClient=lambda **_: client)}),
        patch(
            "app.providers.reddit.citation_text",
            new_callable=AsyncMock,
            return_value="Unrelated content",
        ),
    ):
        result = asyncio.run(
            RedditProvider("key").check(AnalyzeRequest(url="https://shop.example"), "shop.example")
        )
    assert result.status == "insufficient-data"
    assert result.score is None
    assert result.findings[0].verification == "unverified"


def test_same_reddit_discussion_cannot_count_twice():
    import json
    import sys
    from types import SimpleNamespace

    quote = "shop.example: my order never arrived after six weeks of waiting."
    candidate = {
        "findings": [
            {"url": f"https://{host}reddit.com/r/shopping/comments/abc/test/", "excerpt": quote}
            for host in ["www.", "old."]
        ]
    }
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.send_message.return_value = SimpleNamespace(content=json.dumps(candidate))
    with (
        patch.dict(sys.modules, {"backboard": SimpleNamespace(BackboardClient=lambda **_: client)}),
        patch("app.providers.reddit.citation_text", new_callable=AsyncMock, return_value=quote),
    ):
        result = asyncio.run(
            RedditProvider("key").check(AnalyzeRequest(url="https://shop.example"), "shop.example")
        )
    assert result.status == "insufficient-data"
