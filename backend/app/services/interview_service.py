"""Interview lifecycle orchestration: create, answer, next question, pause/resume, finish."""
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.ai.client import AIError
from app.core.config import settings
from app.models import (
    AnswerEvaluation,
    InterviewAnswer,
    InterviewQuestion,
    InterviewSession,
    User,
)
from app.schemas.interview import AnswerSubmit, InterviewConfig
from app.services import evaluation_service, progress_service, question_service, report_service


def _now() -> datetime:
    return datetime.now(timezone.utc)


def ai_unavailable(exc: AIError) -> HTTPException:
    return HTTPException(status.HTTP_502_BAD_GATEWAY, detail=f"AI service error: {exc}")


def get_owned_session(db: Session, user: User, session_id: uuid.UUID) -> InterviewSession:
    stmt = (
        select(InterviewSession)
        .where(InterviewSession.id == session_id, InterviewSession.user_id == user.id)
        .options(
            selectinload(InterviewSession.questions)
            .selectinload(InterviewQuestion.answer)
            .selectinload(InterviewAnswer.evaluation),
            selectinload(InterviewSession.report),
        )
    )
    s = db.execute(stmt).scalar_one_or_none()
    if s is None:  # 404 (not 403) so other users' session ids are not revealed
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Interview not found")
    return s


def elapsed_seconds(s: InterviewSession) -> int:
    if s.duration_seconds is not None and s.ended_at:
        return s.duration_seconds
    now = _now()
    end = s.paused_at or now
    return max(0, int((end - s.started_at).total_seconds()) - s.paused_seconds)


def _add_question(db: Session, s: InterviewSession, data: dict) -> InterviewQuestion:
    q = InterviewQuestion(
        session_id=s.id,
        order_index=len(s.questions),
        text=data["question"],
        lead_in=(data.get("acknowledgement") or None),
        kind=data.get("kind", "main"),
        topic=data.get("topic"),
    )
    db.add(q)
    s.questions.append(q)
    return q


def create_session(db: Session, user: User, cfg: InterviewConfig) -> InterviewSession:
    config = cfg.model_dump()
    # Call the AI first so a provider failure leaves nothing half-created in the database.
    try:
        opening = question_service.generate_opening(config, user.full_name)
    except AIError as exc:
        raise ai_unavailable(exc)

    s = InterviewSession(
        user_id=user.id,
        **config,
        ai_mode="demo" if settings.demo_mode else "live",
        greeting=opening["greeting"],
        introduction=opening["introduction"],
    )
    db.add(s)
    db.flush()
    s.questions = []
    _add_question(db, s, {"question": opening["question"], "kind": "main", "topic": opening.get("topic")})
    db.commit()
    return get_owned_session(db, user, s.id)


def _require_active(s: InterviewSession) -> None:
    if s.status != "in_progress":
        raise HTTPException(status.HTTP_409_CONFLICT, "This interview has already ended")


def submit_answer(db: Session, user: User, s: InterviewSession, payload: AnswerSubmit) -> dict:
    _require_active(s)
    q = next((x for x in s.questions if x.id == payload.question_id), None)
    if q is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found in this interview")

    metrics = payload.speech_metrics.model_dump() if payload.speech_metrics else None
    if payload.input_method == "typed":
        metrics = None

    # 1) Save the answer immediately so it is never lost even if the AI call fails (retry re-uses it).
    ans = q.answer
    if ans is None:
        ans = InterviewAnswer(question_id=q.id, text=payload.text, input_method=payload.input_method)
        db.add(ans)
        q.answer = ans
    elif ans.evaluation is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This question was already answered")
    ans.text = payload.text
    ans.input_method = payload.input_method
    if metrics:
        ans.recording_seconds = metrics["recording_seconds"]
        ans.speaking_seconds = metrics["speaking_seconds"]
        ans.pause_count = metrics["pause_count"]
        ans.long_pause_count = metrics["long_pause_count"]
        ans.longest_pause_seconds = metrics["longest_pause_seconds"]
    db.commit()

    # 2) Evaluate
    try:
        result = evaluation_service.evaluate_answer(s, q.text, payload.text, payload.input_method, metrics)
    except AIError as exc:
        raise ai_unavailable(exc)
    ans.word_count = result.pop("_word_count")
    if not result.get("topic"):
        result["topic"] = q.topic
    ev = AnswerEvaluation(answer_id=ans.id, **result)
    db.add(ev)
    ans.evaluation = ev
    db.commit()

    answered = sum(1 for x in s.questions if x.answer and x.answer.evaluation)
    time_up = elapsed_seconds(s) >= s.duration_minutes * 60
    return {
        "evaluation": ev,
        "answered_count": answered,
        "target_count": s.num_questions,
        "limit_reached": answered >= s.num_questions or time_up,
    }


def next_question(db: Session, user: User, s: InterviewSession) -> dict:
    _require_active(s)
    pending = next((q for q in s.questions if q.answer is None or q.answer.evaluation is None), None)
    if pending:  # idempotent: the client may retry after a network failure
        return {"done": False, "question": pending}
    answered = len(s.questions)
    if answered >= s.num_questions:
        return {"done": True, "question": None}
    try:
        data = question_service.generate_next(s, user.full_name)
    except AIError as exc:
        raise ai_unavailable(exc)
    q = _add_question(db, s, data)
    db.commit()
    return {"done": False, "question": q}


def pause(db: Session, s: InterviewSession) -> None:
    _require_active(s)
    if s.paused_at is None:
        s.paused_at = _now()
        db.commit()


def resume(db: Session, s: InterviewSession) -> None:
    _require_active(s)
    if s.paused_at is not None:
        s.paused_seconds += int((_now() - s.paused_at).total_seconds())
        s.paused_at = None
        db.commit()


def finish(db: Session, user: User, s: InterviewSession, ended_early: bool) -> bool:
    """Finish the session. Returns True when a report exists. Idempotent."""
    if s.status == "completed":
        return s.report is not None
    if s.status == "abandoned":
        return False
    if s.paused_at is not None:
        s.paused_seconds += int((_now() - s.paused_at).total_seconds())
        s.paused_at = None
    s.ended_at = _now()
    s.duration_seconds = max(0, int((s.ended_at - s.started_at).total_seconds()) - s.paused_seconds)
    s.ended_early = ended_early

    answered = [q for q in s.questions if q.answer and q.answer.evaluation]
    if not answered:
        s.status = "abandoned"
        db.commit()
        return False

    s.status = "completed"
    report_service.generate_report(db, s)
    progress_service.record_completion(db, user, s)
    db.commit()
    return True


def regenerate_report(db: Session, s: InterviewSession) -> None:
    if s.status != "completed":
        raise HTTPException(status.HTTP_409_CONFLICT, "Interview is not completed")
    report_service.generate_report(db, s)
    db.commit()
