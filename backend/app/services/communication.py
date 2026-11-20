"""Communication analysis computed from the transcript and (for voice answers) audio-derived measurements.

Measured here (not by the LLM): words-per-minute, filler words, pause statistics, fluency score.
NOT measured: facial expression, emotion, or vocal confidence.
Note: browser speech recognition frequently drops fillers ("umm"), so filler counts from the Web Speech API are a lower
bound; Whisper-based transcription preserves more of them.
"""
import re
from collections import Counter

FILLER_PATTERNS = [
    "um", "umm", "uh", "uhh", "er", "erm", "hmm", "ah",
    "you know", "i mean", "basically", "actually", "literally", "kind of", "sort of",
    "matlab", "yaani", "toh basically",
]
_FILLER_RE = re.compile(
    r"\b(" + "|".join(sorted((re.escape(f) for f in FILLER_PATTERNS), key=len, reverse=True)) + r")\b", re.IGNORECASE
)


def count_words(text: str) -> int:
    return len(re.findall(r"\b[\w'’-]+\b", text, flags=re.UNICODE))


def find_fillers(text: str) -> dict[str, int]:
    return dict(Counter(m.group(1).lower() for m in _FILLER_RE.finditer(text)))


def pace_label(wpm: float | None) -> str | None:
    if wpm is None:
        return None
    if wpm < 100:
        return "slow"
    if wpm <= 170:
        return "good"
    return "fast"


def analyze(text: str, input_method: str, metrics: dict | None) -> dict:
    words = count_words(text)
    fillers = find_fillers(text)
    filler_count = sum(fillers.values())
    wpm: float | None = None
    fluency: int | None = None

    if input_method == "voice" and metrics and metrics.get("recording_seconds", 0) >= 3 and words >= 3:
        rec = metrics["recording_seconds"]
        wpm = round(words / (rec / 60.0), 1)
        filler_rate = filler_count / max(1, words) * 100
        score = 100.0
        score -= min(35.0, filler_rate * 5)
        if wpm < 100:
            score -= min(25.0, (100 - wpm) * 0.5)
        elif wpm > 180:
            score -= min(20.0, (wpm - 180) * 0.4)
        score -= min(25.0, metrics.get("long_pause_count", 0) * 6)
        speaking = metrics.get("speaking_seconds", 0)
        silence_ratio = 1 - (speaking / rec) if rec else 0
        if silence_ratio > 0.4:
            score -= min(15.0, (silence_ratio - 0.4) * 50)
        fluency = int(max(0, min(100, round(score))))

    return {
        "word_count": words,
        "filler_count": filler_count,
        "filler_words": fillers,
        "words_per_minute": wpm,
        "pace": pace_label(wpm),
        "fluency_score": fluency,
    }


def communication_suggestions(agg: dict) -> list[str]:
    """Rule-based tips derived from measured numbers (used alongside AI-written exercises)."""
    tips: list[str] = []
    wpm = agg.get("avg_wpm")
    if wpm is not None:
        if wpm < 100:
            tips.append(f"Your speaking pace averaged {wpm:.0f} wpm, which is slow. Aim for 120-160 wpm by practising with a timer.")
        elif wpm > 180:
            tips.append(f"Your speaking pace averaged {wpm:.0f} wpm, which is fast. Pause briefly between ideas.")
        else:
            tips.append(f"Your speaking pace ({wpm:.0f} wpm) is in a comfortable range.")
    if agg.get("filler_count", 0) >= 3:
        top = ", ".join(f"'{w}' ×{c}" for w, c in list(agg.get("top_fillers", {}).items())[:3])
        tips.append(f"Reduce filler words ({top}). Replace them with a silent pause.")
    if agg.get("long_pauses", 0) >= 2:
        tips.append("You had several long pauses. Jot a 3-point outline mentally before you start speaking.")
    return tips
