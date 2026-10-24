import asyncio
import json

import httpx

from ..models import SourceResult


def missing(source, message, status="unavailable"):
    return SourceResult(source=source, status=status, limitations=[message])


async def request_json(client: httpx.AsyncClient, method: str, url: str, *, retry=False, **kwargs):
    for attempt in range(2 if retry else 1):
        try:
            async with client.stream(method, url, **kwargs) as response:
                response.raise_for_status()
                chunks = []
                size = 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > 2_000_000:
                        raise ValueError("Provider response too large")
                    chunks.append(chunk)
                return json.loads(b"".join(chunks))
        except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError) as exc:
            transient = not isinstance(exc, httpx.HTTPStatusError) or exc.response.status_code in {
                429,
                502,
                503,
                504,
            }
            if not transient or not retry or attempt:
                raise
            await asyncio.sleep(0.3)


# Deliberately narrow: ambiguous comments do not become scored accusations.
PATTERNS = {
    "non-delivery": (
        "never arrived",
        "never received",
        "not delivered",
        "still waiting for my order",
    ),
    "refund": ("refund refused", "no refund", "refused my refund", "still waiting for my refund"),
    "counterfeit": ("counterfeit", "received a fake"),
    "positive": ("arrived on time", "received my refund", "refund was processed", "order arrived"),
}


def concern_for(text: str) -> str | None:
    lower = text.lower()
    return next(
        (key for key, phrases in PATTERNS.items() if any(p in lower for p in phrases)), None
    )
