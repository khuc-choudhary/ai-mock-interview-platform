import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    Index,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base


def _pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _score_check(*cols: str) -> list[CheckConstraint]:
    return [CheckConstraint(f"{c} >= 0 AND {c} <= 100", name=f"ck_eval_{c}") for c in cols]


class InterviewSession(Base):
    __tablename__ = "interview_sessions"
    __table_args__ = (
        CheckConstraint("status IN ('in_progress','completed','abandoned')", name="ck_session_status"),
        CheckConstraint("category IN ('technical','hr','communication','mixed')", name="ck_session_category"),
        CheckConstraint("num_questions >= 1 AND num_questions <= 30", name="ck_session_numq"),
        CheckConstraint("duration_minutes IN (10,15,30,45)", name="ck_session_duration"),
        Index("ix_sessions_user_started", "user_id", "started_at"),
    )

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(20))
    topic: Mapped[str | None] = mapped_column(String(80))
    job_role: Mapped[str] = mapped_column(String(120))
    experience_level: Mapped[str] = mapped_column(String(20))
    difficulty: Mapped[str] = mapped_column(String(10))
    duration_minutes: Mapped[int] = mapped_column(Integer)
    num_questions: Mapped[int] = mapped_column(Integer)
    language: Mapped[str] = mapped_column(String(20), default="English", server_default="English")

    status: Mapped[str] = mapped_column(String(20), default="in_progress", server_default="in_progress", index=True)
    ended_early: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    ai_mode: Mapped[str] = mapped_column(String(10), default="live", server_default="live")
    greeting: Mapped[str | None] = mapped_column(Text)
    introduction: Mapped[str | None] = mapped_column(Text)

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paused_seconds: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    duration_seconds: Mapped[int | None] = mapped_column(Integer)

    # Denormalised results (filled when the interview is finished) for fast history / analytics queries
    overall_score: Mapped[int | None] = mapped_column(Integer)
    technical_score: Mapped[int | None] = mapped_column(Integer)
    communication_score: Mapped[int | None] = mapped_column(Integer)
    fluency_score: Mapped[int | None] = mapped_column(Integer)

    questions: Mapped[list["InterviewQuestion"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="InterviewQuestion.order_index"
    )
    report: Mapped["InterviewReport | None"] = relationship(
        back_populates="session", uselist=False, cascade="all, delete-orphan"
    )


class InterviewQuestion(Base):
    __tablename__ = "interview_questions"
    __table_args__ = (
        UniqueConstraint("session_id", "order_index", name="uq_question_order"),
        CheckConstraint("kind IN ('main','followup')", name="ck_question_kind"),
    )

    id: Mapped[uuid.UUID] = _pk()
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview_sessions.id", ondelete="CASCADE"), index=True
    )
    order_index: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    lead_in: Mapped[str | None] = mapped_column(Text)  # short conversational acknowledgement spoken before the question
    kind: Mapped[str] = mapped_column(String(10), default="main", server_default="main")
    topic: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped[InterviewSession] = relationship(back_populates="questions")
    answer: Mapped["InterviewAnswer | None"] = relationship(
        back_populates="question", uselist=False, cascade="all, delete-orphan"
    )


class InterviewAnswer(Base):
    __tablename__ = "interview_answers"
    __table_args__ = (CheckConstraint("input_method IN ('voice','typed')", name="ck_answer_input"),)

    id: Mapped[uuid.UUID] = _pk()
    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview_questions.id", ondelete="CASCADE"), unique=True
    )
    text: Mapped[str] = mapped_column(Text)
    input_method: Mapped[str] = mapped_column(String(10), default="typed")
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    # Audio-derived measurements (voice answers only; NULL for typed answers)
    recording_seconds: Mapped[float | None] = mapped_column(Float)
    speaking_seconds: Mapped[float | None] = mapped_column(Float)
    pause_count: Mapped[int | None] = mapped_column(Integer)
    long_pause_count: Mapped[int | None] = mapped_column(Integer)
    longest_pause_seconds: Mapped[float | None] = mapped_column(Float)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    question: Mapped[InterviewQuestion] = relationship(back_populates="answer")
    evaluation: Mapped["AnswerEvaluation | None"] = relationship(
        back_populates="answer", uselist=False, cascade="all, delete-orphan"
    )


class AnswerEvaluation(Base):
    __tablename__ = "answer_evaluations"
    __table_args__ = (
        CheckConstraint(
            "verdict IN ('correct','partially_correct','incorrect','irrelevant','unclear')",
            name="ck_eval_verdict",
        ),
        *_score_check(
            "technical_accuracy",
            "relevance",
            "conceptual_understanding",
            "completeness",
            "communication_clarity",
            "grammar",
            "vocabulary",
            "confidence_indicators",
            "structure",
            "overall_score",
        ),
    )

    id: Mapped[uuid.UUID] = _pk()
    answer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview_answers.id", ondelete="CASCADE"), unique=True
    )
    verdict: Mapped[str] = mapped_column(String(20))
    technical_accuracy: Mapped[int] = mapped_column(Integer)
    relevance: Mapped[int] = mapped_column(Integer)
    conceptual_understanding: Mapped[int] = mapped_column(Integer)
    completeness: Mapped[int] = mapped_column(Integer)
    communication_clarity: Mapped[int] = mapped_column(Integer)
    grammar: Mapped[int] = mapped_column(Integer)
    vocabulary: Mapped[int] = mapped_column(Integer)
    confidence_indicators: Mapped[int] = mapped_column(Integer)  # language-based (hedging), NOT facial/voice emotion
    structure: Mapped[int] = mapped_column(Integer)
    overall_score: Mapped[int] = mapped_column(Integer)

    # Computed from audio/transcript (not by the LLM)
    fluency_score: Mapped[int | None] = mapped_column(Integer)
    words_per_minute: Mapped[float | None] = mapped_column(Float)
    filler_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    filler_words: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")

    feedback: Mapped[str] = mapped_column(Text)
    mistakes: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")
    suggestions: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")
    missed_concepts: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")
    improved_answer: Mapped[str | None] = mapped_column(Text)
    model_answer: Mapped[str | None] = mapped_column(Text)
    simple_explanation: Mapped[str | None] = mapped_column(Text)
    topic: Mapped[str | None] = mapped_column(String(120))

    ai_mode: Mapped[str] = mapped_column(String(10), default="live", server_default="live")
    model_name: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    answer: Mapped[InterviewAnswer] = relationship(back_populates="evaluation")


class InterviewReport(Base):
    __tablename__ = "interview_reports"

    id: Mapped[uuid.UUID] = _pk()
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview_sessions.id", ondelete="CASCADE"), unique=True
    )
    overall_score: Mapped[int] = mapped_column(Integer)
    status_label: Mapped[str] = mapped_column(String(40))
    data: Mapped[dict] = mapped_column(JSONB)  # aggregates + improvement plan
    plan_source: Mapped[str] = mapped_column(String(20), default="ai", server_default="ai")  # ai | rule_based | demo
    ai_mode: Mapped[str] = mapped_column(String(10), default="live", server_default="live")
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped[InterviewSession] = relationship(back_populates="report")
