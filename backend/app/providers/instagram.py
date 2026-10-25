from difflib import SequenceMatcher
from urllib.parse import urlsplit

import httpx
from pydantic import BaseModel, Field, TypeAdapter

from ..models import AnalyzeRequest, Finding, SourceDiagnostic, SourceResult
from ..scoring import evidence_score
from .common import concern_for, missing, provider_failure, request_json


class Comment(BaseModel):
    text: str = Field(max_length=10000)
    timestamp: str | None = Field(default=None, max_length=50)


class FetchedComment(Comment):
    postUrl: str = Field(max_length=2048)


class Post(BaseModel):
    url: str
    ownerUsername: str
    latestComments: list[Comment] = Field(default_factory=list, max_length=200)
    commentsCount: int = Field(default=0, ge=-1)


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
                code="no-linked-account",
                action="No account is guessed. A storefront-linked public Instagram profile is needed for this check.",
            )
        if not self.key:
            return missing(
                "instagram",
                "Instagram research is not enabled: Apify has no API token.",
                code="missing-key",
                action="Configure APIFY_TOKEN on the backend and restart it.",
            )
        profile = request.instagramLinks[0]
        handle = urlsplit(profile).path.strip("/").lower()
        async with httpx.AsyncClient(timeout=28, follow_redirects=False, trust_env=False) as client:
            # POST starts a paid actor: never automatically retry it.
            data = await request_json(
                client,
                "POST",
                "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items",
                headers={"Authorization": f"Bearer {self.key}"},
                params={"timeout": 25, "maxItems": 5, "maxTotalChargeUsd": 0.25},
                json={
                    "directUrls": [profile],
                    "resultsType": "posts",
                    "resultsLimit": 5,
                    "onlyPostsNewerThan": "3 months",
                },
            )
        posts = TypeAdapter(list[Post]).validate_python(data)
        matched_posts = []
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
            matched_posts.append(post)

        # The posts endpoint can return counts with only a few embedded comments.
        # Read comments directly for at most two already-associated posts when needed.
        comments = [
            (post.url, comment)
            for post in matched_posts
            for comment in post.latestComments[:20]
            if comment.text.strip()
        ]
        extra_error = None
        targets = [post.url for post in matched_posts if post.commentsCount > 0][:2]
        if len(comments) < 5 and targets:
            try:
                async with httpx.AsyncClient(
                    timeout=16, follow_redirects=False, trust_env=False
                ) as client:
                    extra = await request_json(
                        client,
                        "POST",
                        "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items",
                        headers={"Authorization": f"Bearer {self.key}"},
                        params={"timeout": 12, "maxItems": 40, "maxTotalChargeUsd": 0.25},
                        json={
                            "directUrls": targets,
                            "resultsType": "comments",
                            "resultsLimit": 20,
                            "isNewestComments": True,
                        },
                    )
                allowed_posts = {urlsplit(url).path.rstrip("/") for url in targets}
                for comment in TypeAdapter(list[FetchedComment]).validate_python(extra)[:40]:
                    u = urlsplit(comment.postUrl)
                    if (
                        u.scheme == "https"
                        and u.hostname in {"instagram.com", "www.instagram.com"}
                        and u.path.rstrip("/") in allowed_posts
                        and comment.text.strip()
                    ):
                        pair = (comment.postUrl, comment)
                        if not any(
                            urlsplit(url).path.rstrip("/") == u.path.rstrip("/")
                            and item.text == comment.text
                            for url, item in comments
                        ):
                            comments.append(pair)
            except (httpx.HTTPError, ValueError) as error:
                extra_error = provider_failure("instagram", error)

        for post_url, comment in comments[:100]:
            texts.append(comment.text)
            concern = concern_for(comment.text)
            if concern and len(findings) < 25:
                findings.append(
                    Finding(
                        title="Public comment on a linked account",
                        excerpt=comment.text[:2000],
                        url=post_url,
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
            sampleSize=len(texts),
            verifiedCount=len(substantive),
            diagnostic=None
            if available
            else extra_error.diagnostic
            if extra_error
            else SourceDiagnostic(
                code="insufficient-sample",
                message=f"Read {len(texts)} accessible comments and found {len(substantive)} substantive buyer experiences.",
                action="Inspect the linked account yourself. Sparse or inaccessible comments remain unknown information.",
            ),
            limitations=[
                "Association is based on the storefront's own link and matching post author, not independent ownership verification.",
                "Only accessible comments from up to five recent posts are sampled, with a bounded direct-comment check on up to two posts if needed. Each actor run is capped at $0.25. Keyword matches may miss context; allegations are not established facts.",
                "Five comments and two substantive distinct experiences are needed; absence of complaints is not positive evidence.",
            ],
        )
