import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user
from app.core.rate_limit import ai_rate_limit
from app.database.session import get_db
from app.models import InterviewSession, User
from app.schemas.interview import (
    AnswerSubmit,
    FinishRequest,
    FinishResponse,
    HistoryPage,
    InterviewConfig,
    NextQuestionResponse,
    SessionDetail,
    SessionSummary,
    SubmitAnswerResponse,
)
from app.services import interview_service as svc
from app.services import pdf_service, report_service

router = APIRouter(prefix="/interviews", tags=["interviews"])


def _detail(s: InterviewSession) -> SessionDetail:
    base = SessionSummary.model_validate(s).model_dump()
    return SessionDetail(
        **base,
        greeting=s.greeting,
        introduction=s.introduction,
        is_paused=s.paused_at is not None,
        elapsed_seconds=svc.elapsed_seconds(s),
        interviewer_name=settings.interviewer_name,
        questions=s.questions,
    )


@router.post("", response_model=SessionDetail, status_code=201, dependencies=[Depends(ai_rate_limit)])
def create_interview(cfg: InterviewConfig, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _detail(svc.create_session(db, user, cfg))


@router.get("", response_model=HistoryPage)
def list_interviews(
    q: str | None = Query(default=None, max_length=100),
    category: str | None = Query(default=None, pattern="^(technical|hr|communication|mixed)$"),
    status_: str | None = Query(default=None, alias="status", pattern="^(in_progress|completed|abandoned)$"),
    min_score: int | None = Query(default=None, ge=0, le=100),
    max_score: int | None = Query(default=None, ge=0, le=100),
    days: int | None = Query(default=None, ge=1, le=3650),
    sort: str = Query(default="newest", pattern="^(newest|oldest|score_desc|score_asc)$"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conds = [InterviewSession.user_id == user.id]
    if q:
        like = f"%{q.strip()}%"
        conds.append(or_(InterviewSession.job_role.ilike(like), InterviewSession.topic.ilike(like)))
    if category:
        conds.append(InterviewSession.category == category)
    if status_:
        conds.append(InterviewSession.status == status_)
    if min_score is not None:
        conds.append(InterviewSession.overall_score >= min_score)
    if max_score is not None:
        conds.append(InterviewSession.overall_score <= max_score)
    if days:
        conds.append(InterviewSession.started_at >= datetime.now(timezone.utc) - timedelta(days=days))
    order = {
        "newest": InterviewSession.started_at.desc(),
        "oldest": InterviewSession.started_at.asc(),
        "score_desc": InterviewSession.overall_score.desc().nulls_last(),
        "score_asc": InterviewSession.overall_score.asc().nulls_last(),
    }[sort]
    total = db.execute(select(func.count()).select_from(InterviewSession).where(*conds)).scalar_one()
    items = db.execute(select(InterviewSession).where(*conds).order_by(order).limit(limit).offset(offset)).scalars().all()
    return HistoryPage(items=items, total=total)


@router.get("/{session_id}", response_model=SessionDetail)
def get_interview(session_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _detail(svc.get_owned_session(db, user, session_id))


@router.delete("/{session_id}", status_code=204)
def delete_interview(session_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = svc.get_owned_session(db, user, session_id)
    db.delete(s)
    db.commit()
    return Response(status_code=204)


@router.post("/{session_id}/answers", response_model=SubmitAnswerResponse, dependencies=[Depends(ai_rate_limit)])
def submit_answer(
    session_id: uuid.UUID, body: AnswerSubmit, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    s = svc.get_owned_session(db, user, session_id)
    return svc.submit_answer(db, user, s, body)


@router.post("/{session_id}/next", response_model=NextQuestionResponse, dependencies=[Depends(ai_rate_limit)])
def next_question(session_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = svc.get_owned_session(db, user, session_id)
    return svc.next_question(db, user, s)


@router.post("/{session_id}/pause", response_model=SessionDetail)
def pause(session_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = svc.get_owned_session(db, user, session_id)
    svc.pause(db, s)
    return _detail(s)


@router.post("/{session_id}/resume", response_model=SessionDetail)
def resume(session_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = svc.get_owned_session(db, user, session_id)
    svc.resume(db, s)
    return _detail(s)


@router.post("/{session_id}/finish", response_model=FinishResponse, dependencies=[Depends(ai_rate_limit)])
def finish(
    session_id: uuid.UUID,
    body: FinishRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    s = svc.get_owned_session(db, user, session_id)
    has_report = svc.finish(db, user, s, body.ended_early)
    return FinishResponse(status=s.status, report_available=has_report, session=s)


def _completed_report_session(db: Session, user: User, session_id: uuid.UUID) -> InterviewSession:
    s = svc.get_owned_session(db, user, session_id)
    if s.report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No report is available for this interview")
    return s


@router.get("/{session_id}/report")
def get_report(session_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return report_service.full_report(_completed_report_session(db, user, session_id))


@router.post("/{session_id}/report/regenerate", dependencies=[Depends(ai_rate_limit)])
def regenerate_report(session_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = svc.get_owned_session(db, user, session_id)
    svc.regenerate_report(db, s)
    return report_service.full_report(svc.get_owned_session(db, user, session_id))


@router.get("/{session_id}/report.pdf")
def report_pdf(session_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = _completed_report_session(db, user, session_id)
    pdf = pdf_service.build_pdf(report_service.full_report(s), user.full_name)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="interview-report-{str(s.id)[:8]}.pdf"'},
    )
