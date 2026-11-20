from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import InterviewSession, User, UserProgress


def local_today(tz_name: str) -> date:
    try:
        return datetime.now(ZoneInfo(tz_name)).date()
    except Exception:
        return datetime.now(timezone.utc).date()


def local_day(dt: datetime, tz_name: str) -> date:
    try:
        return dt.astimezone(ZoneInfo(tz_name)).date()
    except Exception:
        return dt.astimezone(timezone.utc).date()


def record_completion(db: Session, user: User, s: InterviewSession) -> None:
    day = local_day(s.ended_at or datetime.now(timezone.utc), user.profile.timezone)
    row = db.execute(
        select(UserProgress).where(UserProgress.user_id == user.id, UserProgress.day == day)
    ).scalar_one_or_none()
    if row is None:
        row = UserProgress(
            user_id=user.id, day=day, interviews_completed=0, questions_answered=0, minutes_practiced=0, score_total=0
        )
        db.add(row)
    answered = sum(1 for q in s.questions if q.answer and q.answer.evaluation)
    row.interviews_completed += 1
    row.questions_answered += answered
    row.minutes_practiced += int(round((s.duration_seconds or 0) / 60))
    row.score_total += s.overall_score or 0
