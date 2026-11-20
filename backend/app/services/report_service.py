"""Final interview report: deterministic aggregates computed from saved evaluations + an AI-written improvement plan."""
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from statistics import mean

from sqlalchemy.orm import Session

from app.ai import demo, prompts
from app.ai.client import AIError, chat_json
from app.core.config import settings
from app.models import InterviewQuestion, InterviewReport, InterviewSession
from app.services import communication
from app.services.question_service import session_config


def status_label(score: int) -> str:
    if score >= 80:
        return "Excellent"
    if score >= 65:
        return "Good"
    if score >= 45:
        return "Needs Improvement"
    return "Needs Significant Practice"


def _avg(vals: list[float]) -> float | None:
    vals = [v for v in vals if v is not None]
    return mean(vals) if vals else None


def _r(v: float | None) -> int | None:
    return None if v is None else int(round(v))


def evaluated_questions(session: InterviewSession) -> list[InterviewQuestion]:
    return [q for q in session.questions if q.answer and q.answer.evaluation]


def compute_aggregates(session: InterviewSession) -> dict:
    qs = evaluated_questions(session)
    evs = [q.answer.evaluation for q in qs]
    answers = [q.answer for q in qs]
    n = len(evs)
    if n == 0:
        raise ValueError("No evaluated answers")

    overall = int(round(mean(e.overall_score for e in evs)))
    technical = _r(mean((e.technical_accuracy + e.conceptual_understanding) / 2 for e in evs))
    comm_lang = mean((e.communication_clarity + e.grammar + e.vocabulary + e.structure) / 4 for e in evs)
    fluency = _r(_avg([e.fluency_score for e in evs]))
    communication_score = _r(comm_lang if fluency is None else 0.8 * comm_lang + 0.2 * fluency)

    verdicts = Counter(e.verdict for e in evs)
    by_topic: dict[str, list[int]] = defaultdict(list)
    for q in qs:
        by_topic[q.answer.evaluation.topic or q.topic or "General"].append(q.answer.evaluation.overall_score)
    topic_stats = sorted(
        ({"topic": t, "avg": int(round(mean(v))), "count": len(v)} for t, v in by_topic.items()),
        key=lambda x: x["avg"],
    )
    strong = [t for t in reversed(topic_stats) if t["avg"] >= 70]
    weak = [t for t in topic_stats if t["avg"] < 60]

    concept_counter: Counter[str] = Counter()
    for e in evs:
        if e.verdict != "correct":
            concept_counter.update(c.strip() for c in e.missed_concepts if c.strip())
    concepts = [{"concept": c, "count": k} for c, k in concept_counter.most_common(10)]

    fillers: Counter[str] = Counter()
    for e in evs:
        fillers.update(e.filler_words or {})
    wpms = [e.words_per_minute for e in evs if e.words_per_minute]
    avg_wpm = round(mean(wpms), 1) if wpms else None
    voice = [a for a in answers if a.input_method == "voice"]
    comm = {
        "fluency": fluency,
        "grammar": _r(mean(e.grammar for e in evs)),
        "vocabulary": _r(mean(e.vocabulary for e in evs)),
        "clarity": _r(mean(e.communication_clarity for e in evs)),
        "structure": _r(mean(e.structure for e in evs)),
        "confidence_language": _r(mean(e.confidence_indicators for e in evs)),
        "avg_wpm": avg_wpm,
        "pace": communication.pace_label(avg_wpm),
        "filler_count": sum(fillers.values()),
        "top_fillers": dict(fillers.most_common(5)),
        "long_pauses": sum((a.long_pause_count or 0) for a in voice),
        "voice_answers": len(voice),
        "typed_answers": n - len(voice),
    }
    comm["tips"] = communication.communication_suggestions(comm)

    criteria = {
        k: _r(mean(getattr(e, k) for e in evs))
        for k in (
            "technical_accuracy", "relevance", "conceptual_understanding", "completeness",
            "communication_clarity", "grammar", "vocabulary", "confidence_indicators", "structure",
        )
    }
    return {
        "overall_score": overall,
        "status": status_label(overall),
        "answered": n,
        "planned": session.num_questions,
        "verdict_counts": {
            "correct": verdicts.get("correct", 0),
            "partially_correct": verdicts.get("partially_correct", 0),
            "incorrect": verdicts.get("incorrect", 0),
            "irrelevant": verdicts.get("irrelevant", 0),
            "unclear": verdicts.get("unclear", 0),
        },
        "technical_score": technical,
        "communication_score": communication_score,
        "fluency_score": fluency,
        "criteria": criteria,
        "topic_stats": topic_stats,
        "strong_topics": strong,
        "weak_topics": weak,
        "concepts_to_revise": concepts,
        "communication": comm,
    }


def _rule_based_plan(agg: dict, source: str) -> dict:
    weak = agg["weak_topics"] or agg["topic_stats"][:2]
    return {
        "summary": f"You scored {agg['overall_score']}/100 ({agg['status']}) across {agg['answered']} answered questions.",
        "topics_to_study": [
            {"topic": t["topic"], "reason": f"Averaged {t['avg']}/100 in this interview.",
             "how_to_study": "Revisit the fundamentals, then practise explaining the concept aloud with an example."}
            for t in weak[:4]
        ],
        "communication_exercises": agg["communication"]["tips"]
        or ["Answer one question aloud daily using: answer, explanation, example."],
        "recommended_practice": ["Repeat this interview type at the same difficulty and aim to beat today's score."],
        "next_goals": [f"Reach {min(100, agg['overall_score'] + 10)}/100 in your next interview."],
        "_source": source,
    }


def generate_plan(session: InterviewSession, agg: dict) -> tuple[dict, str]:
    if settings.demo_mode:
        return demo.plan(agg), "demo"
    config = session_config(session)
    brief = {k: agg[k] for k in (
        "overall_score", "answered", "verdict_counts", "technical_score", "communication_score",
        "criteria", "topic_stats", "concepts_to_revise")}
    brief["communication"] = {k: v for k, v in agg["communication"].items() if k != "tips"}
    system = prompts.PLAN_SYSTEM.format(language_rule=prompts.LANGUAGE_RULES[config["language"]])
    user = prompts.PLAN_USER.format(
        category_guide=prompts.category_guide(config),
        experience=prompts.EXPERIENCE_LABEL[config["experience_level"]],
        difficulty=config["difficulty"],
        aggregates=json.dumps(brief, indent=1),
    )
    try:
        plan = chat_json(system, user, temperature=0.4, max_tokens=1400)
        for key in ("topics_to_study", "communication_exercises", "recommended_practice", "next_goals"):
            if not isinstance(plan.get(key), list):
                raise AIError("invalid plan")
        plan.setdefault("summary", "")
        return plan, "ai"
    except AIError:
        return _rule_based_plan(agg, "rule_based"), "rule_based"


def generate_report(db: Session, session: InterviewSession) -> InterviewReport:
    agg = compute_aggregates(session)
    plan, source = generate_plan(session, agg)
    plan.pop("_source", None)
    data = {"aggregates": agg, "plan": plan}
    report = session.report
    if report is None:
        report = InterviewReport(session_id=session.id)
        db.add(report)
    report.overall_score = agg["overall_score"]
    report.status_label = agg["status"]
    report.data = data
    report.plan_source = source
    report.ai_mode = session.ai_mode
    report.generated_at = datetime.now(timezone.utc)
    session.overall_score = agg["overall_score"]
    session.technical_score = agg["technical_score"]
    session.communication_score = agg["communication_score"]
    session.fluency_score = agg["fluency_score"]
    db.flush()
    return report


def question_analysis(session: InterviewSession) -> list[dict]:
    out = []
    for q in evaluated_questions(session):
        a, e = q.answer, q.answer.evaluation
        out.append({
            "order": q.order_index + 1,
            "question": q.text,
            "kind": q.kind,
            "topic": e.topic or q.topic,
            "answer": a.text,
            "input_method": a.input_method,
            "verdict": e.verdict,
            "score": e.overall_score,
            "feedback": e.feedback,
            "mistakes": e.mistakes,
            "suggestions": e.suggestions,
            "improved_answer": e.improved_answer,
            "model_answer": e.model_answer,
            "simple_explanation": e.simple_explanation,
            "scores": {k: getattr(e, k) for k in (
                "technical_accuracy", "relevance", "conceptual_understanding", "completeness",
                "communication_clarity", "grammar", "vocabulary", "confidence_indicators", "structure")},
            "fluency_score": e.fluency_score,
            "words_per_minute": e.words_per_minute,
            "filler_count": e.filler_count,
        })
    return out


def full_report(session: InterviewSession) -> dict:
    r = session.report
    return {
        "session": {
            "id": str(session.id),
            "category": session.category,
            "topic": session.topic,
            "job_role": session.job_role,
            "experience_level": session.experience_level,
            "difficulty": session.difficulty,
            "language": session.language,
            "duration_seconds": session.duration_seconds,
            "started_at": session.started_at.isoformat(),
            "ended_at": session.ended_at.isoformat() if session.ended_at else None,
            "ended_early": session.ended_early,
        },
        "ai_mode": r.ai_mode,
        "plan_source": r.plan_source,
        "generated_at": r.generated_at.isoformat(),
        "demo_notice": demo.DEMO_DISCLAIMER if r.ai_mode == "demo" else None,
        **r.data,
        "questions": question_analysis(session),
    }
