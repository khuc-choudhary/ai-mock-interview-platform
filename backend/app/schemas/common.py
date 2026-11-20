from typing import Literal

Category = Literal["technical", "hr", "communication", "mixed"]
Experience = Literal["fresher", "0-2", "2-5", "experienced"]
Difficulty = Literal["easy", "medium", "hard"]
Language = Literal["English", "Hindi", "Hinglish"]
Verdict = Literal["correct", "partially_correct", "incorrect", "irrelevant", "unclear"]

TECHNICAL_TOPICS = [
    "Python",
    "Java",
    "JavaScript",
    "SQL",
    "HTML and CSS",
    "React",
    "Flutter",
    "PHP and Laravel",
    "Data Science",
    "Machine Learning",
    "Artificial Intelligence",
    ".NET",
]
HR_TOPICS = [
    "Tell me about yourself",
    "Strengths and weaknesses",
    "Career goals",
    "Why should we hire you",
    "Teamwork",
    "Problem-solving",
    "Situational questions",
]
COMMUNICATION_TOPICS = [
    "English speaking",
    "Explaining technical concepts",
    "Professional communication",
    "Confidence and clarity",
]
