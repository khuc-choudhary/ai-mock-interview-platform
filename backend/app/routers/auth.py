import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user
from app.core.rate_limit import auth_rate_limit
from app.core.security import (
    create_access_token,
    hash_password,
    hash_reset_token,
    new_reset_token,
    verify_password,
)
from app.database.session import get_db
from app.models import PasswordResetToken, User, UserProfile
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    ProfileUpdate,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserOut,
)
from app.utils import mailer

log = logging.getLogger("auth")
router = APIRouter(prefix="/auth", tags=["auth"])

# Pre-computed so login time does not reveal whether an email exists
_DUMMY_HASH = hash_password("not-a-real-password-1")


def _token_for(user: User) -> TokenResponse:
    return TokenResponse(access_token=create_access_token(str(user.id), user.token_version), user=UserOut.model_validate(user))


@router.post("/register", response_model=TokenResponse, status_code=201, dependencies=[Depends(auth_rate_limit)])
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.execute(select(User).where(User.email == email)).scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = User(email=email, full_name=body.full_name, hashed_password=hash_password(body.password))
    user.profile = UserProfile(
        education=body.education,
        experience_level=body.experience_level,
        preferred_role=body.preferred_role,
        skills=body.skills,
        timezone=body.timezone,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    return _token_for(user)


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(auth_rate_limit)])
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    ok = verify_password(body.password, user.hashed_password if user else _DUMMY_HASH)
    if not user or not ok or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    return _token_for(user)


@router.post("/logout", response_model=MessageResponse)
def logout(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Invalidates every token issued so far for this account (token_version bump)."""
    user.token_version += 1
    db.commit()
    return MessageResponse(message="Logged out")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.put("/me", response_model=UserOut)
def update_me(body: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.full_name = body.full_name
    p = user.profile
    p.education, p.experience_level, p.preferred_role = body.education, body.experience_level, body.preferred_role
    p.skills, p.daily_goal, p.timezone = body.skills, body.daily_goal, body.timezone
    db.commit()
    return user


@router.post("/change-password", response_model=TokenResponse)
def change_password(body: ChangePasswordRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.hashed_password = hash_password(body.new_password)
    user.token_version += 1  # signs out other sessions
    db.commit()
    return _token_for(user)


@router.delete("/me", response_model=MessageResponse)
def delete_account(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(user)
    db.commit()
    return MessageResponse(message="Account deleted")


@router.post("/forgot-password", response_model=MessageResponse, dependencies=[Depends(auth_rate_limit)])
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    generic = "If an account exists for that email, a password reset link has been sent."
    user = db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    if not user:
        return MessageResponse(message=generic)
    raw, hashed = new_reset_token()
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hashed,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.password_reset_expire_minutes),
        )
    )
    db.commit()
    link = f"{settings.frontend_url.rstrip('/')}/reset-password?token={raw}"
    body_text = f"Hi {user.full_name},\n\nReset your password (valid {settings.password_reset_expire_minutes} minutes):\n{link}\n\nIf you did not request this, ignore this email."
    sent = mailer.send_email(user.email, "Reset your password", body_text)
    if sent:
        return MessageResponse(message=generic)
    # No SMTP configured: log the link for the developer. Only expose it in the response in development.
    log.warning("Password reset link for %s (SMTP not configured): %s", user.email, link)
    if settings.is_production:
        return MessageResponse(message=generic)
    return MessageResponse(
        message=generic + " (Development mode: email is not configured, so the link is shown below.)",
        dev_reset_link=link,
    )


@router.post("/reset-password", response_model=MessageResponse, dependencies=[Depends(auth_rate_limit)])
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    row = db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_reset_token(body.token))
    ).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if not row or row.used_at is not None or row.expires_at < now:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This reset link is invalid or has expired")
    user = db.get(User, row.user_id)
    user.hashed_password = hash_password(body.new_password)
    user.token_version += 1
    row.used_at = now
    db.commit()
    return MessageResponse(message="Password updated. You can now sign in.")
