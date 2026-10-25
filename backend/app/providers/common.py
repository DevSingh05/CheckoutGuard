import asyncio
import json

import httpx

from ..models import SourceDiagnostic, SourceResult


def missing(source, message, status="unavailable", *, code=None, action=None):
    diagnostic = (
        SourceDiagnostic(code=code, message=message, action=action or "Retry this check later.")
        if code
        else None
    )
    return SourceResult(source=source, status=status, limitations=[message], diagnostic=diagnostic)


def provider_failure(source, error: Exception):
    """Return useful categories without exposing exception bodies, URLs or credentials."""
    status_code = getattr(getattr(error, "response", None), "status_code", None)
    # Backboard SDK errors expose status_code on the exception itself.
    status_code = status_code or getattr(error, "status_code", None)
    known_sdk_error = type(error).__module__.startswith("backboard.")
    sdk_message = error.args[0] if known_sdk_error and error.args else None
    if status_code in {401, 402, 403}:
        return missing(
            source,
            "The provider rejected its configured credentials or account access.",
            "unavailable",
            code="authentication",
            action="Check this provider's API key, account permissions and credits in the backend setup.",
        )
    if status_code == 429:
        return missing(
            source,
            "The provider's rate or usage limit was reached.",
            "unavailable",
            code="rate-limit",
            action="Wait before retrying and check the provider's usage balance.",
        )
    if (
        isinstance(error, (TimeoutError, httpx.TimeoutException))
        or sdk_message == "Request timed out"
    ):
        return missing(
            source,
            "This source did not finish within its time budget.",
            "error",
            code="timeout",
            action="Retry the scan; other source results are still usable.",
        )
    if (
        isinstance(error, (httpx.NetworkError, ConnectionError, OSError))
        or sdk_message == "Connection error"
    ):
        return missing(
            source,
            "The backend could not connect to this provider.",
            "error",
            code="network",
            action="Check the backend's internet access, then retry.",
        )
    if isinstance(error, (ValueError, TypeError, json.JSONDecodeError)):
        return missing(
            source,
            "The provider returned an unsupported or incomplete response.",
            "error",
            code="invalid-response",
            action="Retry and check that the backend is up to date.",
        )
    return missing(
        source,
        "This provider could not complete its check.",
        "error",
        code="provider-error",
        action="Retry later and check the provider's account status.",
    )


def structured_object(content: str | None) -> dict:
    """Accept plain JSON or one fenced JSON block; never repair or execute model output."""
    if not isinstance(content, str) or len(content) > 40000:
        raise ValueError("Missing or oversized research response")
    value = content.strip()
    if "```" in value:
        import re

        blocks = re.findall(r"```(?:json)?\s*([\s\S]*?)```", value, flags=re.IGNORECASE)
        if len(blocks) != 1:
            raise ValueError("Expected exactly one JSON block")
        value = blocks[0].strip()
    result = json.loads(value)
    if not isinstance(result, dict):
        raise ValueError("Expected a JSON object")
    return result


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
