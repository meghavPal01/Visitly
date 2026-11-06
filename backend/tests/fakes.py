from app.services.llm import LLMResult, ToolCall


class ScriptedLLM:
    """Returns pre-scripted results in order. An Exception instance in the script is raised."""

    def __init__(self, script):
        self.script, self.calls = list(script), []

    def complete(self, system, messages, tools=None):
        self.calls.append({"system": system, "messages": [dict(m) for m in messages], "tools": tools})
        item = self.script.pop(0) if self.script else LLMResult(text="(script exhausted)")
        if isinstance(item, Exception):
            raise item
        return item


def say(text):
    return LLMResult(text=text)


def call(name, **inp):
    return LLMResult(tool_calls=[ToolCall(id=f"t_{name}", name=name, input=inp)])


class ExplodingLLM:
    def complete(self, *a, **k):
        raise AssertionError("LLM must not be called on this path")
