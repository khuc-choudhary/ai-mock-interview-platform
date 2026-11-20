"""AI question generation: opening (greeting + first question) and context-aware follow-up / next questions."""
import re

from pydantic import BaseModel, field_validator

from app.ai import demo, prompts
from app.ai.client import AIError, chat_json
from app.core.config import settings
from app.models import InterviewQuestion, InterviewSession


class Opening(BaseModel):
    greeting: str
    introduction: str
    question: str
    topic: str | None = None

    @field_validator("greeting", "introduction", "question")
    @classmethod
    def _nonempty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("empty")
        return v.strip()


class NextQ(BaseModel):
    acknowledgement: str | None = None
    question: str
    kind: str = "main"
    topic: str | None = None

    @field_validator("question")
    @classmethod
    def _nonempty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("empty")
        return v.strip()

    @field_validator("kind")
    @classmethod
    def _kind(cls, v: str) -> str:
        return v if v in ("main", "followup") else "main"


def session_config(s: InterviewSession) -> dict:
    return {
        "category": s.category,
        "topic": s.topic,
        "job_role": s.job_role,
        "experience_level": s.experience_level,
        "difficulty": s.difficulty,
        "duration_minutes": s.duration_minutes,
        "num_questions": s.num_questions,
        "language": s.language,
    }


def _system(config: dict) -> str:
    return prompts.INTERVIEWER_SYSTEM.format(
        name=settings.interviewer_name,
        language_rule=prompts.LANGUAGE_RULES[config["language"]],
        category_guide=prompts.category_guide(config),
        experience=prompts.EXPERIENCE_LABEL[config["experience_level"]],
        difficulty=config["difficulty"],
        num_questions=config["num_questions"],
    )


def _norm_tokens(s: str) -> set[str]:
    return set(re.sub(r"[^\w\s]", "", s.lower()).split())


def is_duplicate(question: str, asked: list[str]) -> bool:
    a = _norm_tokens(question)
    if not a:
        return False
    for prev in asked:
        b = _norm_tokens(prev)
        if b and len(a & b) / len(a | b) >= 0.75:
            return True
    return False


def generate_opening(config: dict, candidate: str) -> dict:
    if settings.demo_mode:
        return Opening(**demo.opening(config, candidate, settings.interviewer_name)).model_dump()
    user = prompts.OPENING_USER.format(
        candidate=candidate, name=settings.interviewer_name, duration=config["duration_minutes"]
    )
    try:
        return Opening(**chat_json(_system(config), user, temperature=0.7, max_tokens=700)).model_dump()
    except ValueError as exc:  # pydantic validation
        raise AIError("The AI returned an incomplete opening. Please try again.") from exc


def _history_text(questions: list[InterviewQuestion]) -> str:
    lines: list[str] = []
    for q in questions:
        a = q.answer
        ev = a.evaluation if a else None
        ans = (a.text[:500] + "…") if a and len(a.text) > 500 else (a.text if a else "(not answered)")
        meta = f" [verdict: {ev.verdict}, score: {ev.overall_score}]" if ev else ""
        lines.append(f"Q{q.order_index + 1} ({q.kind}, {q.topic or 'n/a'}): {q.text}\n   Answer: {ans}{meta}")
    return "\n".join(lines) if lines else "(none)"


def generate_next(session: InterviewSession, candidate: str) -> dict:
    """Returns {acknowledgement, question, kind, topic}. Retries once if the AI repeats an earlier question."""
    config = session_config(session)
    questions = list(session.questions)
    asked = [q.text for q in questions]

    if settings.demo_mode:
        return NextQ(**demo.next_question(config, asked)).model_dump()

    answered = [q for q in questions if q.answer]
    remaining = max(1, session.num_questions - len(answered))
    extra = ""
    if config["category"] == "mixed":
        extra = "\nFor this mixed interview, choose the question type (technical / HR / communication) to keep the target balance."
    if remaining == 1:
        extra += "\nThis is the LAST question: make it a strong closing question."

    for attempt in range(2):
        user = prompts.NEXT_QUESTION_USER.format(
            candidate=candidate,
            asked_count=len(answered),
            num_questions=session.num_questions,
            remaining=remaining,
            history=_history_text(answered),
            asked_list=" | ".join(asked) or "(none)",
            extra=extra + ("\nYour previous attempt repeated an earlier question. Ask something DIFFERENT." if attempt else ""),
        )
        try:
            nq = NextQ(**chat_json(_system(config), user, temperature=0.75, max_tokens=500)).model_dump()
        except ValueError as exc:
            raise AIError("The AI returned an incomplete question. Please try again.") from exc
        if not is_duplicate(nq["question"], asked):
            return nq
    return nq  # still a duplicate after retry: accept rather than fail the interview
