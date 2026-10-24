import re

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .models import AnalyzeRequest, AnalyzeResponse
from .providers.instagram import InstagramProvider
from .providers.reddit import RedditProvider
from .providers.reviews import ReviewProvider
from .service import Analyzer
from .settings import Settings

settings = Settings.from_env()
app = FastAPI(title="CheckoutGuard", version="0.1.0")
origins = [v.strip() for v in settings.cors_origins.split(",") if v.strip()]
if re.fullmatch(r"[a-p]{32}", settings.extension_id):
    origins.append(f"chrome-extension://{settings.extension_id}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
    allow_credentials=False,
)
analyzer = Analyzer(
    {
        "reddit": RedditProvider(settings.backboard_api_key),
        "instagram": InstagramProvider(settings.apify_token),
        "reviews": ReviewProvider(settings.gptzero_api_key),
    },
    timeout=settings.provider_timeout,
    ttl=settings.cache_ttl,
)


@app.middleware("http")
async def bound_body(request: Request, call_next):
    if request.method == "POST":
        total = 0
        chunks = []
        async for chunk in request.stream():
            total += len(chunk)
            if total > 100_000:
                return JSONResponse({"detail": "Payload too large"}, status_code=413)
            chunks.append(chunk)
        request._body = b"".join(chunks)
    return await call_next(request)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "CheckoutGuard"}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest):
    return await analyzer.analyze(request)
