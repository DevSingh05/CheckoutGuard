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
    def __init__(self, key: str):
        self.key = key

    async def check(self, request: AnalyzeRequest, domain: str) -> SourceResult:
        # Original wording only; whitespace trimming and exact deduplication are the only transforms.
        reviews = list(dict.fromkeys(t.strip() for t in request.reviews if t.strip()))
        document = "\n\n".join(reviews)
        if len(document) < 250:
            return missing(
                "reviews",
                "At least 250 characters of accessible review text are required by our conservative sampling policy.",
                "insufficient-data",
            )
        if not self.key:
            return missing("reviews", "GPTZero is not configured.")
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
