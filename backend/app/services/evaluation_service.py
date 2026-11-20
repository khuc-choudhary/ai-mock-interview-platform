"""AI answer evaluation. The LLM scores the criteria; the backend enforces verdict-based caps so keyword-matching or
over-generous scores cannot inflate results, and computes the audio-based communication metrics itself."""
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.ai import demo, prompts
from app.ai.client import AIError, chat_json
from app.core.config import settings
from app.services import communication
from app.services.question_service import session_config

CRITERIA = [
    "technical_accuracy",
    "relevance",
    "conceptual_understanding",
    "completeness",
    "communication_clarity",
    "grammar",
    "vocabulary",
    "confidence_indicators",
    "structure",
]
WEIGHTS = {
    "technical_accuracy": 0.25,
    "relevance": 0.10,
    "conceptual_understanding": 0.15,
    "completeness": 0.15,
    "communication_clarity": 0.10,
    "grammar": 0.05,
    "vocabulary": 0.05,
    "confidence_indicators": 0.05,
    "structure": 0.10,
}
VERDICT_CAP = {"correct": 100, "partially_correct": 79, "incorrect": 40, "irrelevant": 15, "unclear": 20}
VERDICTS = set(VERDICT_CAP)


def _clamp(v: Any) -> int:
    try:
        return max(0, min(100, int(round(float(v)))))
    except (TypeError, ValueError):
        raise ValueError("score must be numeric")


class LLMEvaluation(BaseModel):
    verdict: str
    scores: dict[str, int]
    feedback: str = ""
    mistakes: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    missed_concepts: list[str] = Field(default_factory=list)
    improved_answer: str | None = None
    model_answer: str | None = None
    simple_explanation: str | None = None
    topic: str | None = None

    @field_validator("verdict")
    @classmethod
    def _verdict(cls, v: str) -> str:
        v = str(v).strip().lower().replace(" ", "_").replace("-", "_")
        if v not in VERDICTS:
            raise ValueError("invalid verdict")
        return v

    @field_validator("scores", mode="before")
    @classmethod
    def _scores(cls, v: Any) -> dict[str, int]:
        if not isinstance(v, dict):
            raise ValueError("scores must be an object")
        out = {k: _clamp(v[k]) for k in CRITERIA if k in v}
        missing = [k for k in CRITERIA if k not in out]
        if missing:
            raise ValueError(f"missing scores: {missing}")
        return out

    @field_validator("mistakes", "suggestions", "missed_concepts", mode="before")
    @classmethod
    def _list(cls, v: Any) -> list[str]:
        if v is None:
            return []
        if isinstance(v, str):
            return [v]
        return [str(x).strip() for x in v if str(x).strip()][:8]


def overall_from(scores: dict[str, int], verdict: str) -> int:
    raw = sum(scores[k] * w for k, w in WEIGHTS.items())
    return int(round(min(raw, VERDICT_CAP[verdict])))


def evaluate_answer(session, question_text: str, answer_text: str, input_method: str, speech_metrics: dict | None) -> dict:
    """Returns a dict of AnswerEvaluation column values."""
    config = session_config(session)
    comm = communication.analyze(answer_text, input_method, speech_metrics)

    if settings.demo_mode:
        raw = demo.evaluate(question_text, answer_text)
        ai_mode, model_name = "demo", "demo-heuristic"
    else:
        system = prompts.EVALUATOR_SYSTEM.format(language_rule=prompts.LANGUAGE_RULES[config["language"]])
        user = prompts.EVALUATOR_USER.format(
            category_guide=prompts.category_guide(config),
            experience=prompts.EXPERIENCE_LABEL[config["experience_level"]],
            difficulty=config["difficulty"],
            question=question_text,
            input_method="spoken, transcribed by speech recognition" if input_method == "voice" else "typed",
            answer=answer_text.replace('"""', "'''"),
        )
        data = chat_json(system, user, temperature=0.2, max_tokens=1600)
        try:
            LLMEvaluation(**data)
        except ValueError as exc:
            raise AIError("The AI returned an invalid evaluation. Please try again.") from exc
        raw, ai_mode, model_name = data, "live", settings.llm_model

    ev = LLMEvaluation(**raw)
    scores = dict(ev.scores)
    # Fluency is measured from audio when available; otherwise fall back to the language-structure score for display only
    overall = overall_from(scores, ev.verdict)
    return {
        "verdict": ev.verdict,
        **scores,
        "overall_score": overall,
        "fluency_score": comm["fluency_score"],
        "words_per_minute": comm["words_per_minute"],
        "filler_count": comm["filler_count"],
        "filler_words": comm["filler_words"],
        "feedback": ev.feedback or "No feedback was returned.",
        "mistakes": ev.mistakes,
        "suggestions": ev.suggestions,
        "missed_concepts": ev.missed_concepts,
        "improved_answer": ev.improved_answer,
        "model_answer": ev.model_answer,
        "simple_explanation": ev.simple_explanation,
        "topic": (ev.topic or None),
        "ai_mode": ai_mode,
        "model_name": model_name,
        "_word_count": comm["word_count"],
    }
