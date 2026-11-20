import uuid

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.database.session import get_db
from app.models import User

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status.HTTP_401_UNAUTHORIZED, "Not authenticated", headers={"WWW-Authenticate": "Bearer"}
    )
    if creds is None:
        raise unauthorized
    payload = decode_access_token(creds.credentials)
    if not payload:
        raise unauthorized
    try:
        uid = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise unauthorized
    user = db.execute(select(User).where(User.id == uid)).scalar_one_or_none()
    if user is None or not user.is_active or payload.get("tv") != user.token_version:
        raise unauthorized
    request.state.user_id = str(user.id)  # used by the per-user rate limiter
    return user
