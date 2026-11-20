"""DEMO MODE provider.

Used ONLY when no LLM_API_KEY is configured. Questions come from a small sample bank and "evaluations" are simple
length/overlap heuristics. Everything produced here is labelled ai_mode="demo" and the UI/report say so. It is NOT an
AI evaluation and must never be presented as one.
"""
import random
import re

DEMO_DISCLAIMER = (
    "DEMO MODE: no AI provider is configured, so this score is a rough length/relevance heuristic, not a real AI "
    "evaluation. Add an LLM_API_KEY to get genuine, meaning-based evaluation."
)

_BANK: dict[str, list[str]] = {
    "Python": [
        "What is the difference between a list and a tuple in Python?",
        "How does Python manage memory, and what role does garbage collection play?",
        "Explain what decorators are and give a practical use case.",
        "What is the difference between a shallow copy and a deep copy?",
        "How do generators differ from regular functions that return lists?",
    ],
    "Java": [
        "What is the difference between an abstract class and an interface in Java?",
        "Explain how the JVM, JRE and JDK relate to each other.",
        "How does HashMap work internally in Java?",
        "What is the difference between checked and unchecked exceptions?",
    ],
    "JavaScript": [
        "Explain closures in JavaScript with an example.",
        "What is the difference between var, let and const?",
        "How does the event loop work in JavaScript?",
        "What is the difference between == and ===?",
    ],
    "SQL": [
        "What is the difference between INNER JOIN and LEFT JOIN?",
        "Explain database normalisation and why it matters.",
        "What is an index and when can it hurt performance?",
        "What is the difference between WHERE and HAVING?",
    ],
    "HTML and CSS": [
        "What is the CSS box model?",
        "Explain the difference between Flexbox and CSS Grid.",
        "What are semantic HTML elements and why are they useful?",
    ],
    "React": [
        "What is the difference between state and props in React?",
        "Explain how useEffect works and how its dependency array behaves.",
        "Why are keys important when rendering lists?",
        "What problem does the virtual DOM solve?",
    ],
    "Flutter": [
        "What is the difference between StatelessWidget and StatefulWidget?",
        "How does Flutter render UI compared with native approaches?",
        "Explain state management options in Flutter.",
    ],
    "PHP and Laravel": [
        "Explain the MVC pattern as implemented in Laravel.",
        "What are Eloquent relationships? Name a few.",
        "What is middleware in Laravel and when would you use it?",
    ],
    "Data Science": [
        "How would you handle missing values in a dataset?",
        "Explain the difference between correlation and causation.",
        "What is the bias-variance trade-off?",
    ],
    "Machine Learning": [
        "What is overfitting and how can you prevent it?",
        "Explain the difference between supervised and unsupervised learning.",
        "What do precision and recall measure?",
    ],
    "Artificial Intelligence": [
        "What is the difference between AI, machine learning and deep learning?",
        "Explain how a neural network learns using backpropagation.",
        "What are the main ethical concerns when deploying AI systems?",
    ],
    ".NET": [
        "What is the difference between .NET Framework and .NET Core?",
        "Explain dependency injection in ASP.NET Core.",
        "What is LINQ and when would you use it?",
    ],
    "_hr": [
        "Tell me about yourself.",
        "What are your greatest strengths and one weakness you are working on?",
        "Where do you see yourself in five years?",
        "Why should we hire you for this role?",
        "Describe a time you worked in a team and faced a disagreement.",
        "Tell me about a difficult problem you solved and how you approached it.",
        "How would you handle a deadline you know you cannot meet?",
    ],
    "_communication": [
        "Explain what an API is to someone who has never programmed.",
        "Describe your most recent project in two minutes as if presenting to a client.",
        "How would you politely disagree with a senior colleague's decision?",
        "Describe a concept from your field using a real-world analogy.",
    ],
}

_HR_TOPIC_MAP = {
    "Tell me about yourself": 0,
    "Strengths and weaknesses": 1,
    "Career goals": 2,
    "Why should we hire you": 3,
    "Teamwork": 4,
    "Problem-solving": 5,
    "Situational questions": 6,
}


def _pool(config: dict) -> list[tuple[str, str]]:
    cat, topic = config["category"], config.get("topic")
    if cat == "technical":
        return [(q, topic) for q in _BANK.get(topic, _BANK["Python"])]
    if cat == "hr":
        qs = _BANK["_hr"]
        idx = _HR_TOPIC_MAP.get(topic or "")
        ordered = ([qs[idx]] if idx is not None else []) + [q for i, q in enumerate(qs) if i != idx]
        return [(q, f"HR - {topic or 'General'}") for q in ordered]
    if cat == "communication":
        return [(q, f"Communication - {topic or 'General'}") for q in _BANK["_communication"]]
    mixed: list[tuple[str, str]] = []
    techs: list[tuple[str, str]] = []
    for t in ("Python", "JavaScript", "SQL"):
        techs += [(q, t) for q in _BANK[t][:2]]
    hr = [(q, "HR") for q in _BANK["_hr"][:3]]
    com = [(q, "Communication") for q in _BANK["_communication"][:2]]
    for group in zip(techs, hr + hr, com + com, techs[::-1]):
        mixed.extend(group)
    return mixed


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()


def opening(config: dict, candidate: str, name: str) -> dict:
    first = candidate.split()[0] if candidate else "there"
    q, topic = _pool(config)[0]
    return {
        "greeting": f"Hello {first}, welcome! [DEMO MODE]",
        "introduction": (
            f"I'm {name}, your demo interviewer. No AI provider is configured, so I'm asking questions from a small "
            f"sample bank and your answers will get a rough heuristic score, not a real AI evaluation. "
            f"We'll go through {config['num_questions']} questions. You can answer by voice or typing."
        ),
        "question": q,
        "topic": topic,
    }


def next_question(config: dict, asked: list[str]) -> dict:
    asked_norm = {_norm(a) for a in asked}
    pool = [(q, t) for q, t in _pool(config) if _norm(q) not in asked_norm]
    if not pool:
        pool = [("Is there anything about your experience you would like to add?", "General")]
    q, topic = pool[0] if len(pool) == 1 else random.choice(pool[:3])
    return {"acknowledgement": "Thanks. Let's move on.", "question": q, "kind": "main", "topic": topic}


_STOP = set("a an the is are was were of to in on and or for with that this it as be by from at what how why do does".split())


def _keywords(text: str) -> set[str]:
    return {w for w in _norm(text).split() if len(w) > 3 and w not in _STOP}


def evaluate(question: str, answer: str) -> dict:
    words = answer.split()
    n = len(words)
    q_kw, a_kw = _keywords(question), _keywords(answer)
    overlap = len(q_kw & a_kw) / max(1, len(q_kw))
    idk = bool(re.search(r"\b(i don'?t know|no idea|not sure|pata nahi)\b", answer.lower()))

    if n < 3 or idk:
        verdict, rel, comp = "unclear", 15, 10
    else:
        rel = min(85, 35 + int(overlap * 90) + min(n, 40) // 2)
        comp = min(80, int(n * 2.2))
        verdict = "partially_correct" if (comp >= 45 and rel >= 50) else "incorrect" if rel < 40 else "partially_correct"
    clarity = min(80, 40 + n // 2) if n >= 3 else 20
    base = (rel + comp) // 2
    scores = {
        "technical_accuracy": max(0, base - 5),
        "relevance": rel,
        "conceptual_understanding": max(0, base - 8),
        "completeness": comp,
        "communication_clarity": clarity,
        "grammar": 60 if n >= 3 else 20,
        "vocabulary": min(75, 40 + len(set(words))),
        "confidence_indicators": 25 if idk else 60,
        "structure": min(70, 30 + n // 2),
    }
    return {
        "verdict": verdict,
        "scores": scores,
        "feedback": f"{DEMO_DISCLAIMER} Heuristic notes: your answer had {n} words"
        + (" and looks short; try explaining with an example." if n < 25 else "."),
        "mistakes": [],
        "suggestions": [
            "Add a concrete example to support your explanation.",
            "Structure the answer: definition, how it works, example, when to use it.",
        ],
        "missed_concepts": [],
        "improved_answer": None,
        "model_answer": None,
        "simple_explanation": None,
        "topic": None,
    }


def plan(agg: dict) -> dict:
    weak = [t["topic"] for t in agg.get("weak_topics", [])][:3]
    return {
        "summary": f"{DEMO_DISCLAIMER} Overall heuristic score: {agg['overall_score']}/100 across "
        f"{agg['answered']} answers.",
        "topics_to_study": [
            {"topic": t, "reason": "Scored lowest in this (demo) session.", "how_to_study": "Revise the fundamentals and practise explaining aloud."}
            for t in weak
        ],
        "communication_exercises": [
            "Record yourself answering one question daily for 2 minutes and re-listen for filler words.",
            "Use the structure: answer first, explanation second, example third.",
        ],
        "recommended_practice": ["Run another mock interview with a live AI provider for a genuine evaluation."],
        "next_goals": ["Complete 3 practice interviews this week.", "Give answers of at least 40-60 words with an example."],
    }
