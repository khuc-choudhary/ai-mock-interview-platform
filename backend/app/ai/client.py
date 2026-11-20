"""Thin OpenAI-compatible chat-completions client that returns parsed JSON."""
import json
import logging
import re
import time

import httpx

from app.core.config import settings

log = logging.getLogger("ai.client")


class AIError(Exception):
    """Raised when the AI provider cannot produce a usable response."""


_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)
_MAX_BUDGET = 16000


def parse_json_text(text: str) -> dict:
    text = _FENCE.sub("", text.strip())
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise AIError("AI response was not valid JSON")
        try:
            data = json.loads(text[start : end + 1])
        except json.JSONDecodeError as exc:
            raise AIError("AI response was not valid JSON") from exc
    if not isinstance(data, dict):
        raise AIError("AI response JSON must be an object")
    return data


def chat_json(system: str, user: str, *, temperature: float = 0.4, max_tokens: int = 1800, attempts: int = 3) -> dict:
    """Call the LLM and return the parsed JSON object.

    `max_tokens` is the size of the visible answer; extra headroom (llm_reasoning_budget) is added so reasoning models
    cannot exhaust the budget while thinking. If the provider reports finish_reason=length the call is retried with a
    doubled budget.
    """
    if settings.demo_mode:
        raise AIError("No LLM API key configured")

    url = settings.llm_base_url.rstrip("/") + "/chat/completions"
    headers = {"Authorization": f"Bearer {settings.llm_api_key}", "Content-Type": "application/json"}
    budget = max_tokens + settings.llm_reasoning_budget

    last: Exception | None = None
    for attempt in range(attempts):
        body: dict = {
            "model": settings.llm_model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": temperature,
            "max_tokens": min(budget, _MAX_BUDGET),
        }
        if settings.llm_json_mode:
            body["response_format"] = {"type": "json_object"}
        if settings.llm_reasoning_effort:
            body["reasoning_effort"] = settings.llm_reasoning_effort
        try:
            r = httpx.post(url, json=body, headers=headers, timeout=settings.llm_timeout_seconds)
            if r.status_code in (401, 403):
                raise AIError("The AI provider rejected the API key (check LLM_API_KEY).")
            if r.status_code == 429 or r.status_code >= 500:
                raise httpx.HTTPStatusError("retryable", request=r.request, response=r)
            if r.status_code >= 400:
                log.error("LLM error %s: %s", r.status_code, r.text[:300])
                raise AIError(f"AI provider error ({r.status_code}).")
            choice = r.json()["choices"][0]
            content = (choice.get("message") or {}).get("content") or ""
            if choice.get("finish_reason") == "length" or not content.strip():
                budget *= 2  # answer was cut off (or only reasoning was produced): retry with more room
                raise AIError("AI response was truncated")
            return parse_json_text(content)
        except AIError as exc:
            last = exc
            if "rejected the API key" in str(exc) or "provider error" in str(exc):
                break
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
            last = exc
            log.warning("LLM call failed (attempt %s): %s", attempt + 1, exc)
        time.sleep(0.6 * (attempt + 1))
    if isinstance(last, AIError) and "truncated" not in str(last):
        raise AIError(str(last))
    raise AIError("The AI service is temporarily unavailable. Please try again.")
