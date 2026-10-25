import asyncio
import json
from types import SimpleNamespace

from app.brief import MODEL, BriefWriter
from app.models import AnalyzeRequest
from app.service import Analyzer
from tests.test_api import providers

RAW_REVIEW = "Private review wording that must never leave the backend. " * 5


class FakeMessages:
    def __init__(self, stop_reason="end_turn", text="Pay with a credit card.", error=None):
        self.stop_reason, self.text, self.error, self.calls = stop_reason, text, error, []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return SimpleNamespace(
            stop_reason=self.stop_reason,
            content=[
                SimpleNamespace(type="thinking", thinking="hidden"),
                SimpleNamespace(type="text", text=self.text),
            ],
        )


def analyze(messages=None, key=""):
    writer = BriefWriter(key, SimpleNamespace(messages=messages) if messages else None)
    engine = Analyzer(providers(), brief=writer)
    request = AnalyzeRequest(url="https://shop.example/a", reviews=[RAW_REVIEW])
    return asyncio.run(engine.analyze(request))


def test_no_key_uses_template():
    result = analyze()
    assert result.brief.generated is False
    assert result.brief.text.startswith(result.decision.headline)
    assert "safe" not in result.brief.text.lower()


def test_generated_brief_and_request_shape():
    messages = FakeMessages()
    result = analyze(messages)
    assert result.brief.model_dump() == {"text": "Pay with a credit card.", "generated": True}
    call = messages.calls[0]
    assert call["model"] == MODEL == "claude-opus-5-5"
    assert call["max_tokens"] == 1024 and call["output_config"] == {"effort": "low"}
    assert "thinking" not in call and "temperature" not in call
    sent = call["messages"][0]["content"]
    assert set(json.loads(sent)) >= {"findings", "coverage", "decision", "payment"}
    assert "Private review wording" not in sent + call["system"]


def test_exception_falls_back():
    result = analyze(FakeMessages(error=TimeoutError("network detail")))
    assert result.brief.generated is False and "network detail" not in result.brief.text


def test_refusal_and_truncation_fall_back():
    for reason in ("refusal", "max_tokens"):
        assert analyze(FakeMessages(stop_reason=reason)).brief.generated is False
    assert analyze(FakeMessages(text="  ")).brief.generated is False


def test_sdk_client_configuration():
    client = BriefWriter("test-key").client
    assert client.timeout == 8 and client.max_retries == 0
    assert BriefWriter("").client is None
