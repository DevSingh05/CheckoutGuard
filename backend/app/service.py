import asyncio
import hashlib
import json
from typing import Protocol
from urllib.parse import urlsplit

from .cache import TTLCache
from .demo import MERCHANTS, demo_sources
from .models import AnalyzeRequest, AnalyzeResponse, Source, SourceResult
from .providers.common import missing
from .scoring import narrative, score


class Provider(Protocol):
    async def check(self, request: AnalyzeRequest, domain: str) -> SourceResult: ...


class Analyzer:
    def __init__(self, providers: dict[Source, Provider], timeout: float = 45, ttl: int = 900):
        self.providers = providers
        self.timeout = timeout
        self.cache = TTLCache(ttl)
        self.semaphore = asyncio.Semaphore(6)

    def cache_key(self, source, request, domain):
        identity = [source, domain]
        if source == "instagram":
            identity.append(request.instagramLinks)
        if source == "reviews":
            identity.extend([request.url, request.reviews])
        return hashlib.sha256(json.dumps(identity, ensure_ascii=False).encode()).hexdigest()

    async def run_source(self, source, request, domain):
        key = self.cache_key(source, request, domain)
        cached = self.cache.get(key)
        if cached and not request.refresh:
            return cached
        try:
            async with asyncio.timeout(self.timeout):
                async with self.semaphore:
                    raw = await self.providers[source].check(request, domain)
                    result = SourceResult.model_validate(raw)
                    if result.source != source:
                        raise ValueError("Wrong provider identity")
        except TimeoutError:
            return missing(source, "This check timed out. Retry to check again.", "error")
        except Exception:
            # Do not log provider responses, raw reviews, URLs, or credential-bearing exceptions.
            return missing(
                source, "This provider could not return a valid result. Retry later.", "error"
            )
        self.cache.put(key, result)
        return result

    async def analyze(self, request: AnalyzeRequest):
        domain = urlsplit(request.url).hostname.lower().removeprefix("www.")
        if request.demo:
            domain = MERCHANTS[request.demo]
            sources = demo_sources(request.demo)
        else:
            sources = await asyncio.gather(
                *(self.run_source(s, request, domain) for s in self.providers)
            )
        for source in sources:
            if source.source == "reviews":
                source.limitations = (source.limitations + request.extractionLimitations)[:20]
        risk, coverage = score(sources)
        summary, steps = narrative(risk, coverage)
        return AnalyzeResponse(
            domain=domain,
            productTitle="Everyday travel pack" if request.demo else request.productTitle,
            overallRisk=risk,
            coverage=coverage,
            limitedEvidence=coverage < 60,
            summary=summary,
            nextSteps=steps,
            sources=sources,
            demo=bool(request.demo),
        )
