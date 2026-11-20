"""Small in-memory sliding-window rate limiter (per process).

For multi-process deployments swap the store for Redis; the dependency interface stays the same.
"""
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.core.config import settings


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window: int) -> int | None:
        """Returns None if allowed, else seconds until retry."""
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > window:
                q.popleft()
            if len(q) >= limit:
                return max(1, int(window - (now - q[0])))
            q.append(now)
            return None

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _raise(retry: int) -> None:
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=f"Too many requests. Please retry in {retry}s.",
        headers={"Retry-After": str(retry)},
    )


def auth_rate_limit(request: Request) -> None:
    retry = limiter.check(
        f"auth:{request.url.path}:{_client_ip(request)}",
        settings.rate_limit_auth,
        settings.rate_limit_auth_window_seconds,
    )
    if retry:
        _raise(retry)


def ai_rate_limit(request: Request) -> None:
    """Keyed by the bearer token's user when present, otherwise IP. Applied after auth on AI routes."""
    user = getattr(request.state, "user_id", None) or _client_ip(request)
    retry = limiter.check(f"ai:{user}", settings.rate_limit_ai, settings.rate_limit_ai_window_seconds)
    if retry:
        _raise(retry)
