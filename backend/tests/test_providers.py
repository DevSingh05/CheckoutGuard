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
    for provider in [ReviewProvider("", mode="gptzero"), InstagramProvider(""), RedditProvider("")]:
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
        result = asyncio.run(ReviewProvider("test", mode="gptzero").check(request, "shop.example"))
        assert post.call_args.kwargs["json"]["document"] == text.strip()
        assert result.score == 18


def test_unsupported_text():
    result = asyncio.run(
        ReviewProvider("test", mode="gptzero").check(
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
            ReviewProvider("key", mode="gptzero").check(
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


def test_backboard_json_fence_is_accepted_without_repair():
    import pytest

    from app.providers.common import structured_object

    assert structured_object('```json\n{"findings": []}\n```') == {"findings": []}
    with pytest.raises(ValueError):
        structured_object('```json\n{"findings": [}\n```')
    with pytest.raises(ValueError):
        structured_object("```json\n{}\n```\n```json\n{}\n```")


def test_error_diagnostics_never_echo_credentials():
    from app.providers.common import provider_failure

    request = httpx.Request("POST", "https://provider.example/?token=private")
    for status, code in [
        (401, "authentication"),
        (403, "authentication"),
        (429, "rate-limit"),
        (503, "provider-error"),
    ]:
        error = httpx.HTTPStatusError(
            "private-key-and-review", request=request, response=httpx.Response(status)
        )
        result = provider_failure("reddit", error)
        assert result.diagnostic.code == code
        assert "private" not in result.model_dump_json()
        assert result.score is None


def test_instagram_fetches_comments_only_on_associated_posts():
    request = AnalyzeRequest(
        url="https://shop.example", instagramLinks=["https://www.instagram.com/shop/"]
    )
    posts = [
        {"url": "https://www.instagram.com/p/abc/", "ownerUsername": "shop", "commentsCount": 20}
    ]
    comments = [
        {"postUrl": "https://www.instagram.com/p/abc/", "text": t}
        for t in [
            "My order never arrived, please help.",
            "Still waiting for my refund after weeks.",
            "Nice photograph of your newest bag.",
            "Where can I order this color?",
            "Do you ship to Canada?",
        ]
    ]
    comments.append(
        {
            "postUrl": "https://www.instagram.com/p/unrelated/",
            "text": "Counterfeit items, never buy here.",
        }
    )
    with patch(
        "app.providers.instagram.request_json",
        new_callable=AsyncMock,
        side_effect=[posts, comments],
    ) as api:
        result = asyncio.run(InstagramProvider("key").check(request, "shop.example"))
    assert result.status == "available" and result.score == 50
    assert result.sampleSize == 5
    assert all("Counterfeit" not in f.excerpt for f in result.findings)
    assert api.await_count == 2
    assert api.call_args.kwargs["json"]["directUrls"] == ["https://www.instagram.com/p/abc/"]
    assert api.call_args.kwargs["params"]["maxTotalChargeUsd"] == 0.25


def test_instagram_sparse_comments_stay_unknown():
    request = AnalyzeRequest(
        url="https://shop.example", instagramLinks=["https://www.instagram.com/shop/"]
    )
    with patch("app.providers.instagram.request_json", new_callable=AsyncMock, return_value=[]):
        result = asyncio.run(InstagramProvider("key").check(request, "shop.example"))
    assert result.status == "insufficient-data" and result.score is None
    assert result.diagnostic.code == "insufficient-sample"


def test_reddit_citation_checks_share_a_bounded_time_budget():
    import json
    import sys
    from types import SimpleNamespace

    from app.service import Analyzer

    quote = "shop.example: my order never arrived after six weeks of waiting."
    content = {
        "findings": [
            {"url": f"https://www.reddit.com/r/shopping/comments/abc{i}/test/", "excerpt": quote}
            for i in range(6)
        ]
    }
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.send_message.return_value = SimpleNamespace(
        content="```json\n" + json.dumps(content) + "\n```"
    )

    async def page(_):
        await asyncio.sleep(0.04)
        return quote

    with (
        patch.dict(sys.modules, {"backboard": SimpleNamespace(BackboardClient=lambda **_: client)}),
        patch("app.providers.reddit.citation_text", side_effect=page),
    ):
        engine = Analyzer({"reddit": RedditProvider("key")}, timeout=0.18)
        result = asyncio.run(engine.analyze(AnalyzeRequest(url="https://shop.example")))
    assert result.sources[0].status == "available"
    assert result.sources[0].verifiedCount == 6


def test_local_review_check_needs_no_key_and_never_calls_detector():
    reviews = [
        "The bag arrived on Tuesday. The seams are neat, the straps fit, and the pockets hold my laptop well.",
        "I ordered a different colour and received the correct one. After a week of use the zipper still works smoothly.",
        "Delivery took about nine days. The size matched the listing and customer support answered my question about cleaning.",
    ]
    request = AnalyzeRequest(url="https://shop.example/product", reviews=reviews)
    with patch(
        "app.providers.reviews.request_json",
        side_effect=AssertionError("No paid detector should run"),
    ):
        result = asyncio.run(ReviewProvider("unused-key").check(request, "shop.example"))
    assert result.status == "available" and result.score == 0
    assert result.sampleSize == 3
    assert "does not detect AI-written" in result.limitations[0]
    assert all(f.concern != "ai-text" for f in result.findings)


def test_local_repeated_wording_stays_a_weak_signal():
    base = "I love this travel bag. The material feels wonderful and the pockets are exactly what I wanted for trips. "
    request = AnalyzeRequest(
        url="https://shop.example/product",
        reviews=[base + "Thanks!", base + "Thank you!", base + "Many thanks!"],
    )
    result = asyncio.run(ReviewProvider(mode="local").check(request, "shop.example"))
    assert result.status == "available" and 0 < result.score <= 20
    assert result.findings[0].concern == "repetition"


def test_backboard_failed_billing_response_is_not_a_json_parse_error():
    import sys
    from types import SimpleNamespace

    client = AsyncMock()
    client.__aenter__.return_value = client
    client.send_message.return_value = SimpleNamespace(
        status="FAILED",
        content="Free credit is reserved for Memory & RAG and cannot cover LLM chat.",
    )
    with patch.dict(
        sys.modules, {"backboard": SimpleNamespace(BackboardClient=lambda **_: client)}
    ):
        result = asyncio.run(
            RedditProvider("key").check(AnalyzeRequest(url="https://shop.example"), "shop.example")
        )
    assert result.status == "unavailable"
    assert result.diagnostic.code == "billing"
    assert result.score is None
    assert result.findings == []
