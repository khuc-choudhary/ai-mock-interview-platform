from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.common import (
    COMMUNICATION_TOPICS,
    HR_TOPICS,
    TECHNICAL_TOPICS,
    Category,
    Difficulty,
    Experience,
    Language,
    Verdict,
)


class InterviewConfig(BaseModel):
    category: Category
    topic: str | None = Field(default=None, max_length=80)
    job_role: str = Field(min_length=2, max_length=120)
    experience_level: Experience
    difficulty: Difficulty
    duration_minutes: Literal[10, 15, 30, 45]
    num_questions: int = Field(ge=1, le=30)
    language: Language = "English"

    @field_validator("job_role")
    @classmethod
    def _role(cls, v: str) -> str:
        return v.strip()

    @model_validator(mode="after")
    def _validate(self) -> "InterviewConfig":
        allowed = {
            "technical": TECHNICAL_TOPICS,
            "hr": HR_TOPICS,
            "communication": COMMUNICATION_TOPICS,
        }
        if self.category == "technical" and not self.topic:
            raise ValueError("Select a technical topic")
        if self.category in allowed and self.topic and self.topic not in allowed[self.category]:
            raise ValueError(f"Unknown topic '{self.topic}' for {self.category} interviews")
        if self.category == "mixed":
            self.topic = None
        if self.num_questions > self.duration_minutes:  # at least ~1 minute per question
            raise ValueError("Too many questions for the selected duration (max 1 question per minute)")
        return self


class QuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    order_index: int
    text: str
    lead_in: str | None
    kind: str
    topic: str | None


class SpeechMetricsIn(BaseModel):
    recording_seconds: float = Field(ge=0, le=3600)
    speaking_seconds: float = Field(ge=0, le=3600)
    pause_count: int = Field(ge=0, le=10000)
    long_pause_count: int = Field(ge=0, le=10000)
    longest_pause_seconds: float = Field(ge=0, le=3600)


class AnswerSubmit(BaseModel):
    question_id: UUID
    text: str = Field(max_length=6000)
    input_method: Literal["voice", "typed"] = "typed"
    speech_metrics: SpeechMetricsIn | None = None

    @field_validator("text")
    @classmethod
    def _non_empty(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Answer cannot be empty")
        return v


class EvaluationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    verdict: Verdict
    technical_accuracy: int
    relevance: int
    conceptual_understanding: int
    completeness: int
    communication_clarity: int
    grammar: int
    vocabulary: int
    confidence_indicators: int
    structure: int
    overall_score: int
    fluency_score: int | None
    words_per_minute: float | None
    filler_count: int
    filler_words: dict[str, int]
    feedback: str
    mistakes: list[str]
    suggestions: list[str]
    missed_concepts: list[str]
    improved_answer: str | None
    model_answer: str | None
    simple_explanation: str | None
    topic: str | None
    ai_mode: str


class AnswerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    text: str
    input_method: str
    word_count: int
    recording_seconds: float | None
    speaking_seconds: float | None
    pause_count: int | None
    long_pause_count: int | None
    longest_pause_seconds: float | None
    submitted_at: datetime
    evaluation: EvaluationOut | None


class QuestionWithAnswer(QuestionOut):
    answer: AnswerOut | None


class SessionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    category: str
    topic: str | None
    job_role: str
    experience_level: str
    difficulty: str
    duration_minutes: int
    num_questions: int
    language: str
    status: str
    ended_early: bool
    ai_mode: str
    started_at: datetime
    ended_at: datetime | None
    duration_seconds: int | None
    overall_score: int | None
    technical_score: int | None
    communication_score: int | None
    fluency_score: int | None


class SessionDetail(SessionSummary):
    greeting: str | None
    introduction: str | None
    is_paused: bool
    elapsed_seconds: int
    interviewer_name: str
    questions: list[QuestionWithAnswer]


class SubmitAnswerResponse(BaseModel):
    evaluation: EvaluationOut
    answered_count: int
    target_count: int
    limit_reached: bool  # all planned questions answered or time is up


class NextQuestionResponse(BaseModel):
    done: bool
    question: QuestionOut | None = None


class FinishRequest(BaseModel):
    ended_early: bool = False


class FinishResponse(BaseModel):
    status: str
    report_available: bool
    session: SessionSummary


class HistoryPage(BaseModel):
    items: list[SessionSummary]
    total: int


class MetaResponse(BaseModel):
    ai_mode: str
    llm_model: str | None
    whisper_available: bool
    interviewer_name: str
    technical_topics: list[str]
    hr_topics: list[str]
    communication_topics: list[str]
    demo_notice: str | None
    extra: dict[str, Any] = {}
