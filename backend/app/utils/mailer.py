import logging
import smtplib
from email.message import EmailMessage

import httpx

from app.core.config import settings

log = logging.getLogger("mailer")


def email_configured() -> bool:
    return bool(settings.resend_api_key or settings.smtp_host)


smtp_configured = email_configured  # backwards-compatible name


def _send_resend(to: str, subject: str, body: str) -> bool:
    r = httpx.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {settings.resend_api_key}"},
        json={"from": settings.smtp_from, "to": [to], "subject": subject, "text": body},
        timeout=15,
    )
    if r.status_code >= 400:
        log.error("Resend rejected email (%s): %s", r.status_code, r.text[:200])
        return False
    return True


def _send_smtp(to: str, subject: str, body: str) -> bool:
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = settings.smtp_from, to, subject
    msg.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)
    return True


def send_email(to: str, subject: str, body: str) -> bool:
    if not email_configured():
        return False
    try:
        return _send_resend(to, subject, body) if settings.resend_api_key else _send_smtp(to, subject, body)
    except Exception:  # never leak provider details to the client
        log.exception("Failed to send email")
        return False
