"""Dashboard + analytics computed from real saved interview data (PostgreSQL)."""
from collections import Counter, defaultdict
from datetime import timedelta
from statistics import mean

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AnswerEvaluation, InterviewAnswer, InterviewQuestion, InterviewSession, User, UserProgress
from app.services.progress_service import local_day, local_today

CRITERIA_LABELS = {
    "technical_accuracy": "Technical accuracy",
    "relevance": "Relevance",
    "conceptual_understanding": "Conceptual understanding",
    "completeness": "Answer completeness",
    "communication_clarity": "Communication clarity",
    "grammar": "Grammar",
    "vocabulary": "Vocabulary",
    "confidence_indicators": "Confident phrasing",
    "structure": "Answer structure",
}


def _completed_sessions(db: Session, user: User) -> list[InterviewSession]:
    return list(
        db.execute(
            select(InterviewSession)
            .where(InterviewSession.user_id == user.id, InterviewSession.status == "completed")
            .order_by(InterviewSession.ended_at)
        ).scalars()
    )


def _eval_rows(db: Session, user: User):
    return db.execute(
        select(AnswerEvaluation, InterviewQuestion.topic, InterviewQuestion.session_id)
        .join(InterviewAnswer, InterviewAnswer.id == AnswerEvaluation.answer_id)
        .join(InterviewQuestion, InterviewQuestion.id == InterviewAnswer.question_id)
        .join(InterviewSession, InterviewSession.id == InterviewQuestion.session_id)
        .where(InterviewSession.user_id == user.id, InterviewSession.status == "completed")
    ).all()


def _topic_stats(rows) -> list[dict]:
    by: dict[str, list[int]] = defaultdict(list)
    for ev, qtopic, _ in rows:
        by[ev.topic or qtopic or "General"].append(ev.overall_score)
    return sorted(
        ({"topic": t, "avg": int(round(mean(v))), "count": len(v)} for t, v in by.items()), key=lambda x: x["avg"]
    )


def _criteria_stats(rows) -> list[dict]:
    if not rows:
        return []
    out = [
        {"key": k, "label": lbl, "avg": int(round(mean(getattr(ev, k) for ev, _, _ in rows)))}
        for k, lbl in CRITERIA_LABELS.items()
    ]
    return sorted(out, key=lambda x: x["avg"])


def _avg(vals) -> int | None:
    vals = [v for v in vals if v is not None]
    return int(round(mean(vals))) if vals else None


def _streak(days: set, today) -> int:
    d = today if today in days else today - timedelta(days=1)
    n = 0
    while d in days:
        n += 1
        d -= timedelta(days=1)
    return n


def dashboard(db: Session, user: User) -> dict:
    sessions = _completed_sessions(db, user)
    rows = _eval_rows(db, user)
    tz = user.profile.timezone
    today = local_today(tz)
    progress = {
        p.day: p for p in db.execute(select(UserProgress).where(UserProgress.user_id == user.id)).scalars()
    }
    today_row = progress.get(today)
    topics = _topic_stats(rows)
    criteria = _criteria_stats(rows)

    recommended = [
        {"type": "topic", "name": t["topic"], "score": t["avg"], "hint": "Practise this topic again with a focused interview."}
        for t in topics[:3]
        if t["avg"] < 75
    ] + [
        {"type": "skill", "name": c["label"], "score": c["avg"], "hint": "Weakest scoring criterion across your answers."}
        for c in criteria[:2]
        if c["avg"] < 75
    ]

    return {
        "total_interviews": len(sessions),
        "avg_score": _avg(s.overall_score for s in sessions),
        "technical_score": _avg(s.technical_score for s in sessions),
        "communication_score": _avg(s.communication_score for s in sessions),
        "fluency_score": _avg(s.fluency_score for s in sessions),
        "trend": [
            {"date": local_day(s.ended_at, tz).isoformat(), "score": s.overall_score,
             "technical": s.technical_score, "communication": s.communication_score}
            for s in sessions[-12:]
        ],
        "recent": [
            {"id": str(s.id), "job_role": s.job_role, "category": s.category, "topic": s.topic,
             "overall_score": s.overall_score, "ended_at": s.ended_at.isoformat(), "difficulty": s.difficulty,
             "ai_mode": s.ai_mode}
            for s in reversed(sessions[-5:])
        ],
        "recommended": recommended,
        "daily_goal": user.profile.daily_goal,
        "completed_today": today_row.interviews_completed if today_row else 0,
        "streak_days": _streak({d for d, p in progress.items() if p.interviews_completed > 0}, today),
    }


def analytics(db: Session, user: User) -> dict:
    sessions = _completed_sessions(db, user)
    rows = _eval_rows(db, user)
    tz = user.profile.timezone
    today = local_today(tz)

    series = [
        {
            "session_id": str(s.id),
            "date": local_day(s.ended_at, tz).isoformat(),
            "label": f"{s.job_role}",
            "overall": s.overall_score,
            "technical": s.technical_score,
            "communication": s.communication_score,
            "fluency": s.fluency_score,
        }
        for s in sessions
    ]

    improvement = None
    if len(sessions) >= 2:
        k = max(1, min(3, len(sessions) // 2))
        first = mean(s.overall_score for s in sessions[:k])
        last = mean(s.overall_score for s in sessions[-k:])
        improvement = {
            "first_avg": int(round(first)),
            "latest_avg": int(round(last)),
            "change_points": int(round(last - first)),
            "change_percent": round((last - first) / first * 100, 1) if first else None,
            "window": k,
        }

    progress = {
        p.day: p for p in db.execute(select(UserProgress).where(UserProgress.user_id == user.id)).scalars()
    }
    activity = []
    for i in range(13, -1, -1):
        d = today - timedelta(days=i)
        p = progress.get(d)
        activity.append({
            "date": d.isoformat(),
            "interviews": p.interviews_completed if p else 0,
            "questions": p.questions_answered if p else 0,
            "minutes": p.minutes_practiced if p else 0,
        })

    concept_counter: Counter = Counter()
    concept_topic: dict[str, str] = {}
    fillers: Counter = Counter()
    verdicts: Counter = Counter()
    for ev, qtopic, _ in rows:
        verdicts[ev.verdict] += 1
        fillers.update(ev.filler_words or {})
        if ev.verdict != "correct":
            for c in ev.missed_concepts or []:
                key = c.strip().lower()
                if key:
                    concept_counter[key] += 1
                    concept_topic.setdefault(key, ev.topic or qtopic or "General")
    repeated = [
        {"concept": c, "count": n, "topic": concept_topic[c]}
        for c, n in concept_counter.most_common(10)
        if n >= 2
    ]

    topics = _topic_stats(rows)
    criteria = _criteria_stats(rows)
    return {
        "total_interviews": len(sessions),
        "total_answers": len(rows),
        "series": series,
        "improvement": improvement,
        "topic_performance": list(reversed(topics)),
        "criteria_performance": list(reversed(criteria)),
        "weekly_activity": activity,
        "repeated_mistakes": repeated,
        "top_fillers": [{"word": w, "count": c} for w, c in fillers.most_common(6)],
        "verdicts": dict(verdicts),
        "strongest": list(reversed(topics))[:3],
        "weakest": topics[:3],
        "strongest_skills": list(reversed(criteria))[:3],
        "weakest_skills": criteria[:3],
    }


def learning(db: Session, user: User) -> dict:
    """Study recommendations aggregated across interviews, including saved AI improvement plans."""
    from app.models import InterviewReport

    sessions = list(
        db.execute(
            select(InterviewSession)
            .where(InterviewSession.user_id == user.id, InterviewSession.status == "completed")
            .order_by(InterviewSession.ended_at.desc())
            .limit(5)
        ).scalars()
    )
    reports = {
        r.session_id: r
        for r in db.execute(
            select(InterviewReport).where(InterviewReport.session_id.in_([s.id for s in sessions]))
        ).scalars()
    } if sessions else {}
    plans = []
    for s in sessions:
        r = reports.get(s.id)
        if r:
            plans.append({
                "session_id": str(s.id), "job_role": s.job_role, "date": s.ended_at.isoformat(),
                "ai_mode": r.ai_mode, "plan_source": r.plan_source, "plan": r.data.get("plan", {}),
                "concepts_to_revise": r.data.get("aggregates", {}).get("concepts_to_revise", []),
            })
    rows = _eval_rows(db, user)
    return {
        "weak_topics": _topic_stats(rows)[:5],
        "weak_skills": _criteria_stats(rows)[:3],
        "plans": plans,
    }
