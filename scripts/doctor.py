"""Safe setup and live-source diagnostics; never prints keys or raw customer text."""

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.main import analyzer, settings
from app.models import AnalyzeRequest


def report(result):
    return {
        "domain": result.domain,
        "demo": result.demo,
        "riskIndex": result.overallRisk,
        "coverage": result.coverage,
        "limitedEvidence": result.limitedEvidence,
        "sources": [
            {
                "source": s.source,
                "status": s.status,
                "score": s.score,
                "itemsInspected": s.sampleSize,
                "supportingItems": s.verifiedCount,
                "findingCount": len(s.findings),
                "diagnostic": s.diagnostic.model_dump() if s.diagnostic else None,
            }
            for s in result.sources
        ],
    }


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--demo",
        action="store_true",
        help="Check four fictional scenarios without providers",
    )
    mode.add_argument(
        "--live",
        metavar="PUBLIC_URL",
        help="Make one real check; linked-profile actor calls can spend credit",
    )
    parser.add_argument(
        "--request",
        type=Path,
        help="Optional bounded /analyze JSON input for a live check",
    )
    args = parser.parse_args()
    if args.request and not args.live:
        parser.error("--request requires --live")
    configured = {
        "reddit": bool(settings.backboard_api_key),
        "instagram": bool(settings.apify_token),
        "reviews": settings.review_analysis_mode == "local"
        or bool(settings.gptzero_api_key),
        "store": True,
    }
    print(
        json.dumps(
            {
                "configurationPresent": configured,
                "reviewMode": settings.review_analysis_mode,
                "note": "Presence is not a connectivity or credential-validity test.",
            },
            indent=2,
        )
    )
    if args.demo:
        for scenario in ("warning", "positive", "limited", "outage"):
            result = await analyzer.analyze(
                AnalyzeRequest(url="https://fixture.example", demo=scenario)
            )
            print(json.dumps({"scenario": scenario, **report(result)}, indent=2))
    elif args.live:
        data = {}
        if args.request:
            if args.request.stat().st_size > 100000:
                parser.error("Request file exceeds 100 KB")
            data = json.loads(args.request.read_text())
        data.update(url=args.live, demo=None, refresh=True)
        result = await analyzer.analyze(AnalyzeRequest.model_validate(data))
        print(json.dumps(report(result), indent=2))
        return 0 if any(s.status == "available" for s in result.sources) else 2
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
