from difflib import SequenceMatcher

import httpx
from pydantic import BaseModel, Field

from ..models import AnalyzeRequest, Finding, SourceResult
from ..scoring import REVIEW_CAP
from .common import missing, request_json


class Document(BaseModel):
    completely_generated_prob: float = Field(ge=0, le=1)


class Prediction(BaseModel):
    documents: list[Document] = Field(min_length=1, max_length=1)


class ReviewProvider:
    def __init__(self, key: str = "", *, mode: str = "local"):
        self.key = key
        self.mode = mode

    async def check(self, request: AnalyzeRequest, domain: str) -> SourceResult:
        # Original wording only; whitespace trimming and exact deduplication are the only transforms.
        reviews = list(dict.fromkeys(t.strip() for t in request.reviews if t.strip()))
        document = "\n\n".join(reviews)
        if self.mode == "local":
            return local_patterns(request, reviews)
        if self.mode != "gptzero":
            raise ValueError("Unsupported review analysis mode")
        if len(document) < 250:
            return missing(
                "reviews",
                "At least 250 characters of accessible review text are required by our conservative sampling policy.",
                "insufficient-data",
                code="short-text",
                action="Scroll to the review widget to load more complete reviews, then check again.",
            )
        if not self.key:
            return missing(
                "reviews",
                "AI-text analysis is not enabled: GPTZero has no API key.",
                code="missing-key",
                action="Configure GPTZERO_API_KEY on the backend and restart it.",
            )
        async with httpx.AsyncClient(timeout=20, follow_redirects=False, trust_env=False) as client:
            try:
                data = await request_json(
                    client,
                    "POST",
                    "https://api.gptzero.me/v2/predict/text",
                    retry=True,
                    headers={"x-api-key": self.key},
                    json={"document": document},
                )
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code in {400, 422}:
                    return missing(
                        "reviews",
                        "Provider could not analyze this text length or language.",
                        "insufficient-data",
                    )
                raise
        prediction = Prediction.model_validate(data)
        signal = prediction.documents[0].completely_generated_prob
        return SourceResult(
            source="reviews",
            status="available",
            score=signal * REVIEW_CAP,
            sampleSize=len(reviews),
            findings=[
                Finding(
                    title="Uncertain AI-text signal",
                    excerpt=f"GPTZero returned an AI-text signal of {signal:.0%} for the combined review sample. This is not a fake-review verdict or a scam probability.",
                    url=request.url,
                    kind="observed-pattern",
                    concern="ai-text",
                    verification="verified",
                )
            ],
            limitations=[
                "AI-written text can be legitimate; human-written text can be fraudulent. Short reviews, mixed authors and language variation can reduce reliability.",
                "This source is capped at 20/100 before weighting and cannot create a high-risk result on its own.",
            ],
        )


def local_patterns(request: AnalyzeRequest, reviews: list[str]) -> SourceResult:
    """Key-free wording checks. No inference about AI authorship or truthfulness."""
    substantial = [text for text in reviews if len(text) >= 40]
    if len(substantial) < 3 or sum(map(len, substantial)) < 250:
        return missing(
            "reviews",
            "The local wording check needs at least three complete reviews and 250 characters.",
            "insufficient-data",
            code="short-text",
            action="Load more public reviews and retry. No paid API or AI-text detector is needed.",
        )
    compared = [" ".join(text.casefold().split()) for text in substantial]
    similar = set()
    for i, left in enumerate(compared):
        for j in range(i + 1, len(compared)):
            if SequenceMatcher(None, left, compared[j]).ratio() >= 0.92:
                similar.update((i, j))
    repeated = bool(similar)
    return SourceResult(
        source="reviews",
        status="available",
        score=min(REVIEW_CAP, 20 * len(similar) / len(compared)),
        sampleSize=len(substantial),
        findings=[
            Finding(
                title="Similar review wording" if repeated else "Review wording sample inspected",
                excerpt=(
                    f"{len(similar)} of {len(substantial)} distinct sampled reviews have at least 92% wording similarity. "
                    "Shared phrases can be legitimate; this is a weak pattern, not proof of manipulation."
                    if repeated
                    else f"Compared {len(substantial)} distinct review texts locally. No near-duplicate pair was found in this sample. This does not establish that the reviews are genuine."
                ),
                url=request.url,
                kind="observed-pattern",
                concern="repetition" if repeated else "context",
                verification="verified",
            )
        ],
        limitations=[
            "Local, key-free wording analysis only. It does not detect AI-written text or determine whether a review is truthful.",
            "Only accessible rendered reviews are sampled. Legitimate writers can share wording, and misleading reviews can be unique.",
            "This weak source is capped at 20/100 before weighting and cannot cause a high-risk verdict by itself.",
        ],
    )
