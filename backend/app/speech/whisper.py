"""Speech-to-text through any Whisper-compatible /audio/transcriptions endpoint (OpenAI, Groq, local servers...)."""
import httpx

from app.core.config import settings

LANG_CODES = {"English": "en", "Hindi": "hi", "Hinglish": "hi"}


class TranscriptionError(Exception):
    pass


def transcribe(audio: bytes, filename: str, content_type: str, language: str) -> str:
    key = settings.whisper_api_key or settings.llm_api_key
    if not key:
        raise TranscriptionError("Speech-to-text is not configured on the server.")
    base = (settings.whisper_base_url or settings.llm_base_url).rstrip("/")
    data = {"model": settings.whisper_model, "response_format": "json"}
    code = LANG_CODES.get(language)
    if code:
        data["language"] = code
    try:
        r = httpx.post(
            f"{base}/audio/transcriptions",
            headers={"Authorization": f"Bearer {key}"},
            data=data,
            files={"file": (filename, audio, content_type)},
            timeout=settings.llm_timeout_seconds,
        )
    except httpx.HTTPError as exc:
        raise TranscriptionError("Could not reach the speech-to-text service.") from exc
    if r.status_code >= 400:
        raise TranscriptionError(f"Speech-to-text service error ({r.status_code}).")
    try:
        return (r.json().get("text") or "").strip()
    except ValueError as exc:
        raise TranscriptionError("Invalid response from speech-to-text service.") from exc
