from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.ai.demo import DEMO_DISCLAIMER
from app.core.config import settings
from app.core.deps import get_current_user
from app.core.rate_limit import ai_rate_limit
from app.database.session import get_db
from app.models import User
from app.schemas.common import COMMUNICATION_TOPICS, HR_TOPICS, TECHNICAL_TOPICS
from app.schemas.interview import MetaResponse
from app.services import analytics_service
from app.speech import whisper

router = APIRouter()

MAX_AUDIO_BYTES = 10 * 1024 * 1024
ALLOWED_AUDIO = ("audio/", "video/webm", "application/octet-stream")


@router.get("/meta", response_model=MetaResponse, tags=["meta"])
def meta():
    """Public configuration the UI needs (never contains secrets)."""
    return MetaResponse(
        ai_mode="demo" if settings.demo_mode else "live",
        llm_model=None if settings.demo_mode else settings.llm_model,
        whisper_available=settings.whisper_available,
        interviewer_name=settings.interviewer_name,
        technical_topics=TECHNICAL_TOPICS,
        hr_topics=HR_TOPICS,
        communication_topics=COMMUNICATION_TOPICS,
        demo_notice=DEMO_DISCLAIMER if settings.demo_mode else None,
    )


@router.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}


@router.get("/dashboard", tags=["analytics"])
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return analytics_service.dashboard(db, user)


@router.get("/analytics", tags=["analytics"])
def analytics(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return analytics_service.analytics(db, user)


@router.get("/learning", tags=["analytics"])
def learning(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return analytics_service.learning(db, user)


@router.post("/speech/transcribe", tags=["speech"], dependencies=[Depends(ai_rate_limit)])
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Form("English"),
    user: User = Depends(get_current_user),
):
    if not settings.whisper_available:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Server-side speech-to-text is not configured")
    if language not in ("English", "Hindi", "Hinglish"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unsupported language")
    ctype = (audio.content_type or "application/octet-stream").split(";")[0]
    if not ctype.startswith(ALLOWED_AUDIO):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Unsupported audio type")
    data = await audio.read(MAX_AUDIO_BYTES + 1)
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Audio too large (max 10 MB)")
    if len(data) < 500:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Recording is too short")
    import anyio

    try:
        text = await anyio.to_thread.run_sync(
            whisper.transcribe, data, audio.filename or "answer.webm", ctype, language
        )
    except whisper.TranscriptionError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc))
    return {"text": text, "provider": "whisper"}
