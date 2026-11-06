"""Thin LLM abstraction so the agent is provider-agnostic and testable with a scripted fake."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Protocol

from app.core.config import get_settings

log = logging.getLogger("visitly.llm")


@dataclass
class ToolCall:
    id: str
    name: str
    input: dict


@dataclass
class LLMResult:
    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)

    @property
    def content(self) -> list[dict]:
        blocks: list[dict] = []
        if self.text:
            blocks.append({"type": "text", "text": self.text})
        blocks += [{"type": "tool_use", "id": t.id, "name": t.name, "input": t.input} for t in self.tool_calls]
        return blocks


class LLM(Protocol):
    def complete(self, system: str, messages: list[dict], tools: list[dict] | None = None) -> LLMResult: ...


class AnthropicLLM:
    def __init__(self, api_key: str, model: str):
        import anthropic
        self.client = anthropic.Anthropic(api_key=api_key, timeout=25.0, max_retries=1)
        self.model = model

    def complete(self, system, messages, tools=None) -> LLMResult:
        kwargs = {"model": self.model, "max_tokens": 800, "system": system, "messages": messages}
        if tools:
            kwargs["tools"] = tools
        resp = self.client.messages.create(**kwargs)
        out = LLMResult()
        for b in resp.content:
            if b.type == "text":
                out.text += b.text
            elif b.type == "tool_use":
                out.tool_calls.append(ToolCall(b.id, b.name, dict(b.input)))
        return out


def get_llm() -> LLM | None:
    """Returns None when no API key is configured; the agent then degrades to human handoff."""
    s = get_settings()
    if not s.ai_api_key:
        return None
    return AnthropicLLM(s.ai_api_key, s.ai_model or "claude-sonnet-5-5")
