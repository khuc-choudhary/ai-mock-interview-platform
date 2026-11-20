"""End-to-end API tests against the real PostgreSQL database (run `alembic upgrade head` first).

Covers: auth, ownership isolation, the full interview flow (demo provider) and the live-LLM path using a stubbed
chat_json so no external API is needed.
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.rate_limit import limiter
from app.main import app
from app.services import evaluation_service, question_service, report_service

client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_limits():
    limiter.reset()


def register(email=None):
    email = email or f"t{uuid.uuid4().hex[:8]}@example.com"
    r = client.post("/auth/register", json={"full_name": "Test User", "email": email, "password": "Passw0rdX", "timezone": "Asia/Kolkata"})
    assert r.status_code == 201, r.text
    return email, {"Authorization": f"Bearer {r.json()['access_token']}"}


CONFIG = {"category": "technical", "topic": "Python", "job_role": "Python Developer", "experience_level": "fresher",
          "difficulty": "easy", "duration_minutes": 10, "num_questions": 3, "language": "English"}


def run_interview(headers, n=3, voice=False):
    r = client.post("/interviews", json={**CONFIG, "num_questions": n}, headers=headers)
    assert r.status_code == 201, r.text
    sess = r.json()
    sid, q = sess["id"], sess["questions"][0]
    for i in range(n):
        body = {"question_id": q["id"], "text": "A list is mutable while a tuple is immutable, so basically lists can change after creation and tuples cannot, which makes tuples hashable.",
                "input_method": "voice" if voice else "typed"}
        if voice:
            body["speech_metrics"] = {"recording_seconds": 12, "speaking_seconds": 9, "pause_count": 3, "long_pause_count": 1, "longest_pause_seconds": 2.5}
        a = client.post(f"/interviews/{sid}/answers", json=body, headers=headers)
        assert a.status_code == 200, a.text
        nxt = client.post(f"/interviews/{sid}/next", headers=headers).json()
        if i < n - 1:
            assert not nxt["done"] and nxt["question"]["id"] != q["id"]
            q = nxt["question"]
        else:
            assert nxt["done"]
    return sid


def test_auth_validation_and_duplicates():
    assert client.post("/auth/register", json={"full_name": "A", "email": "bad", "password": "x"}).status_code == 422
    email, h = register()
    assert client.post("/auth/register", json={"full_name": "Test User", "email": email, "password": "Passw0rdX"}).status_code == 409
    assert client.post("/auth/login", json={"email": email, "password": "wrong"}).status_code == 401
    assert client.post("/auth/login", json={"email": email, "password": "Passw0rdX"}).status_code == 200
    assert client.get("/auth/me", headers=h).json()["email"] == email
    assert client.get("/auth/me").status_code == 401
    # logout invalidates the token
    assert client.post("/auth/logout", headers=h).status_code == 200
    assert client.get("/auth/me", headers=h).status_code == 401


def test_forgot_and_reset_password():
    email, _ = register()
    r = client.post("/auth/forgot-password", json={"email": email}).json()
    token = r["dev_reset_link"].split("token=")[1]
    assert client.post("/auth/reset-password", json={"token": token, "new_password": "NewPassw0rd"}).status_code == 200
    assert client.post("/auth/reset-password", json={"token": token, "new_password": "Another1234"}).status_code == 400  # single use
    assert client.post("/auth/login", json={"email": email, "password": "NewPassw0rd"}).status_code == 200
    unknown = client.post("/auth/forgot-password", json={"email": "nobody@example.com"}).json()
    assert unknown.get("dev_reset_link") is None


def test_full_demo_flow_report_analytics_isolation():
    assert settings.demo_mode, "tests expect no LLM key"
    _, h = register()
    sid = run_interview(h, 3, voice=True)

    # empty answers are rejected
    sess = client.get(f"/interviews/{sid}", headers=h).json()
    assert client.post(f"/interviews/{sid}/answers", json={"question_id": sess["questions"][0]["id"], "text": "   "}, headers=h).status_code == 422

    fin = client.post(f"/interviews/{sid}/finish", json={"ended_early": False}, headers=h).json()
    assert fin["status"] == "completed" and fin["report_available"]
    rep = client.get(f"/interviews/{sid}/report", headers=h).json()
    assert rep["ai_mode"] == "demo" and rep["demo_notice"]
    assert rep["aggregates"]["answered"] == 3 and len(rep["questions"]) == 3
    assert rep["aggregates"]["communication"]["avg_wpm"] is not None
    pdf = client.get(f"/interviews/{sid}/report.pdf", headers=h)
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"

    dash = client.get("/dashboard", headers=h).json()
    assert dash["total_interviews"] == 1 and dash["completed_today"] == 1 and dash["avg_score"] is not None
    an = client.get("/analytics", headers=h).json()
    assert len(an["series"]) == 1 and an["total_answers"] == 3
    assert client.get("/learning", headers=h).status_code == 200

    # another user cannot see or delete it
    _, h2 = register()
    for url in (f"/interviews/{sid}", f"/interviews/{sid}/report", f"/interviews/{sid}/report.pdf"):
        assert client.get(url, headers=h2).status_code == 404
    assert client.delete(f"/interviews/{sid}", headers=h2).status_code == 404
    assert client.get("/interviews", headers=h2).json()["total"] == 0

    # history search / filter then delete
    assert client.get("/interviews?q=python&category=technical", headers=h).json()["total"] == 1
    assert client.get("/interviews?q=zzz", headers=h).json()["total"] == 0
    assert client.delete(f"/interviews/{sid}", headers=h).status_code == 204
    assert client.get("/dashboard", headers=h).json()["total_interviews"] == 0


def test_end_early_without_answers_is_abandoned_and_pause_resume():
    _, h = register()
    sid = client.post("/interviews", json=CONFIG, headers=h).json()["id"]
    assert client.post(f"/interviews/{sid}/pause", headers=h).json()["is_paused"] is True
    assert client.post(f"/interviews/{sid}/resume", headers=h).json()["is_paused"] is False
    fin = client.post(f"/interviews/{sid}/finish", json={"ended_early": True}, headers=h).json()
    assert fin["status"] == "abandoned" and not fin["report_available"]


def test_config_validation():
    _, h = register()
    assert client.post("/interviews", json={**CONFIG, "topic": None}, headers=h).status_code == 422
    assert client.post("/interviews", json={**CONFIG, "duration_minutes": 12}, headers=h).status_code == 422
    assert client.post("/interviews", json={**CONFIG, "num_questions": 20}, headers=h).status_code == 422  # > 1/min for 10 min


def test_evaluation_scoring_caps_keyword_stuffing():
    scores = {k: 95 for k in evaluation_service.CRITERIA}
    assert evaluation_service.overall_from(scores, "correct") >= 90
    assert evaluation_service.overall_from(scores, "incorrect") <= 40
    assert evaluation_service.overall_from(scores, "irrelevant") <= 15


def test_live_llm_path_with_stubbed_provider(monkeypatch):
    """Exercises the real prompt/validation path with a stubbed LLM transport."""
    monkeypatch.setattr(settings, "llm_api_key", "test-key")
    calls = []

    def fake_chat_json(system, user, **kw):
        calls.append(user)
        if "Start the interview" in user:
            return {"greeting": "Hi Test!", "introduction": "I'm Aria.", "question": "What is a list in Python?", "topic": "Python - Lists"}
        if "Decide the next question" in user:
            return {"acknowledgement": "Good.", "question": f"Follow-up number {len(calls)}?", "kind": "followup", "topic": "Python - Lists"}
        if "CANDIDATE ANSWER" in user:
            return {"verdict": "partially_correct", "scores": {k: 80 for k in evaluation_service.CRITERIA},
                    "feedback": "Too short.", "mistakes": ["No example"], "suggestions": ["Add example"],
                    "missed_concepts": ["Mutability"], "improved_answer": "A list is mutable...", "model_answer": "m", "simple_explanation": "s", "topic": "Python - Lists"}
        return {"summary": "ok", "topics_to_study": [{"topic": "Lists", "reason": "r", "how_to_study": "h"}],
                "communication_exercises": ["x"], "recommended_practice": ["y"], "next_goals": ["z"]}

    for mod in ("app.services.question_service", "app.services.evaluation_service", "app.services.report_service"):
        monkeypatch.setattr(f"{mod}.chat_json", fake_chat_json)

    _, h = register()
    sid = run_interview(h, 2)
    ev = client.get(f"/interviews/{sid}", headers=h).json()["questions"][0]["answer"]["evaluation"]
    assert ev["ai_mode"] == "live" and ev["overall_score"] == 79  # partially_correct cap applies to 80 weighted score
    client.post(f"/interviews/{sid}/finish", json={"ended_early": False}, headers=h)
    rep = client.get(f"/interviews/{sid}/report", headers=h).json()
    assert rep["ai_mode"] == "live" and rep["plan_source"] == "ai" and rep["demo_notice"] is None
    assert rep["aggregates"]["concepts_to_revise"][0]["concept"] == "Mutability"
    # previous answer was included as context for follow-up generation
    assert any("Decide the next question" in c and "A list is mutable" in c for c in calls)


def test_ai_failure_keeps_answer_and_allows_retry(monkeypatch):
    from app.ai.client import AIError

    _, h = register()
    sess = client.post("/interviews", json={**CONFIG, "num_questions": 2}, headers=h).json()
    sid, q = sess["id"], sess["questions"][0]
    monkeypatch.setattr(settings, "llm_api_key", "test-key")

    def boom(*a, **k):
        raise AIError("down")

    monkeypatch.setattr("app.services.evaluation_service.chat_json", boom)
    body = {"question_id": q["id"], "text": "Lists are mutable.", "input_method": "typed"}
    assert client.post(f"/interviews/{sid}/answers", json=body, headers=h).status_code == 502
    saved = client.get(f"/interviews/{sid}", headers=h).json()["questions"][0]["answer"]
    assert saved["text"] == "Lists are mutable." and saved["evaluation"] is None  # saved despite failure
    monkeypatch.setattr(settings, "llm_api_key", "")
    assert client.post(f"/interviews/{sid}/answers", json=body, headers=h).status_code == 200  # retry works
