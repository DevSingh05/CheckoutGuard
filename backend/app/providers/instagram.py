from difflib import SequenceMatcher
from urllib.parse import urlsplit

import httpx
from pydantic import BaseModel, Field, TypeAdapter

from ..models import AnalyzeRequest, Finding, SourceResult
from ..scoring import evidence_score
from .common import concern_for, missing, request_json


class Comment(BaseModel):
    text: str = Field(max_length=10000)
    timestamp: str | None = None


class Post(BaseModel):
    url: str
    ownerUsername: str
    latestComments: list[Comment] = Field(default_factory=list, max_length=200)


def repetitive(texts: list[str]) -> bool:
    values = [" ".join(t.casefold().split()) for t in texts if len(t.strip()) >= 20]
    return any(
        SequenceMatcher(None, a, b).ratio() >= 0.92
        for i, a in enumerate(values)
        for b in values[i + 1 :]
    )


class InstagramProvider:
    def __init__(self, key: str):
        self.key = key

    async def check(self, request: AnalyzeRequest, domain: str) -> SourceResult:
        if not request.instagramLinks:
            return missing(
                "instagram",
                "No direct Instagram profile link was extracted. Missing accounts are unknown information.",
                "insufficient-data",
            )
        if not self.key:
            return missing("instagram", "Apify is not configured.")
        profile = request.instagramLinks[0]
        handle = urlsplit(profile).path.strip("/").lower()
        async with httpx.AsyncClient(timeout=40, follow_redirects=False, trust_env=False) as client:
            # POST starts a paid actor: never automatically retry it.
            data = await request_json(
                client,
                "POST",
                "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items",
                headers={"Authorization": f"Bearer {self.key}"},
                params={"timeout": 35, "maxItems": 5},
                json={
                    "directUrls": [profile],
                    "resultsType": "posts",
                    "resultsLimit": 5,
                    "onlyPostsNewerThan": "3 months",
                },
            )
        posts = TypeAdapter(list[Post]).validate_python(data)
        findings, texts = [], []
        for post in posts[:5]:
            u = urlsplit(post.url)
            if (
                post.ownerUsername.lower() != handle
                or u.scheme != "https"
                or u.hostname not in {"instagram.com", "www.instagram.com"}
                or not u.path.startswith(("/p/", "/reel/"))
            ):
                continue
            for comment in post.latestComments[:20]:
                texts.append(comment.text)
                concern = concern_for(comment.text)
                if concern and len(findings) < 25:
                    findings.append(
                        Finding(
                            title="Public comment on a linked account",
                            excerpt=comment.text[:2000],
                            url=post.url,
                            date=comment.timestamp,
                            concern=concern,
                            kind="positive-experience"
                            if concern == "positive"
                            else "customer-allegation",
                            verification="verified",
                        )
                    )
        if repetitive(texts):
            findings.append(
                Finding(
                    title="Similar wording appears more than once",
                    excerpt="Two or more accessible comments share at least 92% text similarity. Repetition is a weak signal, not proof of bots.",
                    url=profile,
                    concern="repetition",
                    kind="observed-pattern",
                    verification="verified",
                )
            )
        substantive = {
            f.excerpt.casefold() for f in findings if f.concern not in {"repetition", "context"}
        }
        available = len(texts) >= 5 and len(substantive) >= 2
        return SourceResult(
            source="instagram",
            status="available" if available else "insufficient-data",
            score=evidence_score(findings) if available else None,
            findings=findings,
            limitations=[
                "Association is based on the storefront's own link and matching post author, not independent ownership verification.",
                "Only accessible comments from up to five recent posts are sampled. Keyword matches may miss context; allegations are not established facts.",
                "Five comments and two substantive distinct experiences are needed; absence of complaints is not positive evidence.",
            ],
        )
