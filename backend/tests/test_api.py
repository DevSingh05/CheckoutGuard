import asyncio
from unittest.mock import AsyncMock

import httpx
import pytest

from app import main
from app.models import AnalyzeRequest, SourceResult
from app.service import Analyzer


def providers():
    return {
        name: type(
            "Provider",
            (),
            {
                "check": AsyncMock(
                    return_value=SourceResult(
                        source=name, status="available", score=70 if name != "reviews" else 10
                    )
                )
            },
        )()
        for name in ("reddit", "instagram", "store", "reviews")
    }


def call(payload):
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=main.app), base_url="http://test"
        ) as client:
            return await client.post("/analyze", json=payload)

    return asyncio.run(run())


@pytest.fixture
def engine(monkeypatch):
    p = providers()
    engine = Analyzer(p, timeout=0.02)
    monkeypatch.setattr(main, "analyzer", engine)
    return engine


def test_success(engine):
    response = call({"url": "https://shop.example/products/bag"})
    assert response.status_code == 200
    assert response.json()["coverage"] == 100
    assert response.json()["overallRisk"] == 64


def test_malformed_response_partial_success(engine):
    engine.providers["reddit"].check.return_value = {"status": "invented"}
    result = call({"url": "https://shop.example/a"}).json()
    assert result["coverage"] == 60
    assert not result["limitedEvidence"]
    assert result["sources"][0]["status"] == "error"


def test_individual_timeout(engine):
    async def slow(*args):
        await asyncio.sleep(0.1)

    engine.providers["instagram"].check.side_effect = slow
    result = call({"url": "https://shop.example/a"}).json()
    assert result["coverage"] == 70
    assert result["sources"][1]["status"] == "error"


def test_all_fail(engine):
    for p in engine.providers.values():
        p.check.side_effect = RuntimeError("private provider error")
    result = call({"url": "https://shop.example/a"}).json()
    assert result["overallRisk"] is None
    assert result["coverage"] == 0
    assert "private provider" not in str(result)


def test_product_cache_isolation(engine):
    async def run():
        a = AnalyzeRequest(url="https://shop.example/a", reviews=["first sample"])
        b = AnalyzeRequest(url="https://shop.example/b", reviews=["different sample"])
        await engine.analyze(a)
        result = await engine.analyze(b)
        assert result.sources[0].cached
        assert not result.sources[3].cached
        result = await engine.analyze(b)
        assert result.sources[3].cached
        assert engine.providers["reviews"].check.await_count == 2
        assert engine.providers["reddit"].check.await_count == 1

    asyncio.run(run())


def test_changed_reviews_same_product_isolate(engine):
    async def run():
        await engine.analyze(AnalyzeRequest(url="https://shop.example/a", reviews=["one"]))
        result = await engine.analyze(AnalyzeRequest(url="https://shop.example/a", reviews=["two"]))
        assert not result.sources[3].cached

    asyncio.run(run())


def test_force_refresh(engine):
    call({"url": "https://shop.example/a"})
    response = call({"url": "https://shop.example/a", "refresh": True})
    assert not any(s["cached"] for s in response.json()["sources"])


@pytest.mark.parametrize("scenario", ["warning", "positive", "limited", "outage"])
def test_demo_without_providers(engine, scenario):
    result = call({"url": "https://ignored.example", "demo": scenario}).json()
    assert result["demo"] and result["domain"].endswith(".example")
    assert all(p.check.await_count == 0 for p in engine.providers.values())
    if scenario in {"limited", "outage"}:
        assert result["limitedEvidence"]


def test_private_url_rejected(engine):
    assert call({"url": "http://127.0.0.1/admin"}).status_code == 422


def test_payload_limit(engine):
    assert call({"url": "https://shop.example", "reviews": ["a" * 100001]}).status_code == 413


def test_page_signals_isolate_store_cache(engine):
    async def run():
        url = "https://shop.example/a"
        await engine.analyze(AnalyzeRequest(url=url))
        signals = {"paymentMethods": ["paypal"]}
        result = await engine.analyze(AnalyzeRequest(url=url, pageSignals=signals))
        assert result.sources[0].cached and not result.sources[2].cached
        assert engine.providers["store"].check.await_count == 2

    asyncio.run(run())
