"""PDF export of the final report (ReportLab).

Note: the built-in PDF fonts do not contain Devanagari glyphs, so Hindi (Devanagari) text may not render in the PDF.
English and Hinglish (Roman script) interviews export correctly.
"""
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import HRFlowable, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

VIOLET = colors.HexColor("#6d4aff")
NAVY = colors.HexColor("#14163a")
MUTED = colors.HexColor("#5b5f80")

VERDICT_LABEL = {
    "correct": "Correct", "partially_correct": "Partially correct", "incorrect": "Incorrect",
    "irrelevant": "Irrelevant", "unclear": "Empty / unclear",
}


def _p(text, style):
    return Paragraph(escape(str(text)).replace("\n", "<br/>"), style)


def build_pdf(report: dict, candidate: str) -> bytes:
    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Title"], textColor=NAVY, fontSize=22, alignment=0, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], textColor=VIOLET, fontSize=14, spaceBefore=14, spaceAfter=6)
    h3 = ParagraphStyle("h3", parent=ss["Heading3"], textColor=NAVY, fontSize=11, spaceBefore=8, spaceAfter=3)
    body = ParagraphStyle("body", parent=ss["BodyText"], fontSize=9.5, leading=13)
    small = ParagraphStyle("small", parent=body, fontSize=8.5, textColor=MUTED)
    warn = ParagraphStyle("warn", parent=body, textColor=colors.HexColor("#9a3412"), backColor=colors.HexColor("#ffedd5"), borderPadding=6)

    sess, agg, plan = report["session"], report["aggregates"], report["plan"]
    comm = agg["communication"]
    story: list = []

    story.append(_p("AI Mock Interview Report", h1))
    meta = f"{candidate} · {sess['job_role']} · {sess['category'].title()}" + (f" ({sess['topic']})" if sess.get("topic") else "")
    story.append(_p(meta, small))
    story.append(_p(f"{sess['difficulty'].title()} difficulty · {sess['language']} · {sess['started_at'][:10]}", small))
    story.append(Spacer(1, 6))
    if report.get("demo_notice"):
        story.append(_p(report["demo_notice"], warn))
        story.append(Spacer(1, 6))

    story.append(_p("A. Overall performance", h2))
    vc = agg["verdict_counts"]
    t = Table(
        [
            ["Overall score", f"{agg['overall_score']}/100", "Status", agg["status"]],
            ["Questions answered", f"{agg['answered']} of {agg['planned']} planned", "Ended early", "Yes" if sess["ended_early"] else "No"],
            ["Correct", vc["correct"], "Partially correct", vc["partially_correct"]],
            ["Incorrect", vc["incorrect"], "Irrelevant / unclear", vc["irrelevant"] + vc["unclear"]],
        ],
        colWidths=[40 * mm, 45 * mm, 40 * mm, 45 * mm],
    )
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9.5), ("TEXTCOLOR", (0, 0), (0, -1), MUTED), ("TEXTCOLOR", (2, 0), (2, -1), MUTED),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d9dcf0")), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#efeaff")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("PADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t)
    story.append(Spacer(1, 6))
    story.append(_p(plan.get("summary", ""), body))

    story.append(_p("B. Technical performance", h2))
    story.append(_p(f"Technical knowledge score: {agg['technical_score']}/100", body))
    if agg["strong_topics"]:
        story.append(_p("Strong topics: " + ", ".join(f"{x['topic']} ({x['avg']})" for x in agg["strong_topics"]), body))
    if agg["weak_topics"]:
        story.append(_p("Weak topics: " + ", ".join(f"{x['topic']} ({x['avg']})" for x in agg["weak_topics"]), body))
    if agg["concepts_to_revise"]:
        story.append(_p("Concepts to revise: " + ", ".join(c["concept"] for c in agg["concepts_to_revise"]), body))

    story.append(_p("C. Communication performance", h2))
    rows = [
        ["Communication score", f"{agg['communication_score']}/100"],
        ["Fluency (speech-based)", f"{comm['fluency']}/100" if comm["fluency"] is not None else "n/a (typed answers)"],
        ["Grammar", f"{comm['grammar']}/100"], ["Vocabulary", f"{comm['vocabulary']}/100"],
        ["Answer clarity", f"{comm['clarity']}/100"],
        ["Speaking pace", f"{comm['avg_wpm']:.0f} wpm ({comm['pace']})" if comm["avg_wpm"] else "n/a"],
        ["Filler words", str(comm["filler_count"])],
    ]
    t2 = Table(rows, colWidths=[60 * mm, 110 * mm])
    t2.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 9.5), ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d9dcf0")), ("PADDING", (0, 0), (-1, -1), 4)]))
    story.append(t2)
    for tip in comm.get("tips", []):
        story.append(_p("• " + tip, body))
    story.append(_p("Confidence is assessed from language only (hedging phrases); facial expression and emotion are not measured.", small))

    story.append(_p("D. Question-wise analysis", h2))
    for q in report["questions"]:
        block = [
            _p(f"Q{q['order']}. {q['question']}", h3),
            _p(f"Score {q['score']}/100 · {VERDICT_LABEL.get(q['verdict'], q['verdict'])} · {q.get('topic') or ''}", small),
            _p("Your answer: " + q["answer"], body),
            _p("Evaluation: " + q["feedback"], body),
        ]
        if q["mistakes"]:
            block.append(_p("Mistakes: " + "; ".join(q["mistakes"]), body))
        if q.get("improved_answer"):
            block.append(_p("Improved answer: " + q["improved_answer"], body))
        if q["suggestions"]:
            block.append(_p("Suggestions: " + "; ".join(q["suggestions"]), body))
        block.append(HRFlowable(width="100%", thickness=0.4, color=colors.HexColor("#d9dcf0")))
        story.append(KeepTogether(block))

    story.append(_p("E. Personalised improvement plan", h2))
    for title, key in (("Topics to study", "topics_to_study"), ("Communication exercises", "communication_exercises"),
                       ("Recommended practice", "recommended_practice"), ("Next practice goals", "next_goals")):
        items = plan.get(key) or []
        if not items:
            continue
        story.append(_p(title, h3))
        for it in items:
            if isinstance(it, dict):
                story.append(_p(f"• {it.get('topic', '')}: {it.get('reason', '')} {it.get('how_to_study', '')}", body))
            else:
                story.append(_p("• " + str(it), body))

    buf = BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                      title="AI Mock Interview Report").build(story)
    return buf.getvalue()
