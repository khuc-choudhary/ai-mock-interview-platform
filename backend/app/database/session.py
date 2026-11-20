import ssl
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


def _engine_args() -> tuple[str, dict]:
    """pg8000 does not understand libpq's ?sslmode=... so translate it into an ssl context."""
    url = make_url(settings.database_url)
    connect_args: dict = {}
    if url.drivername.endswith("pg8000"):
        query = dict(url.query)
        mode = query.pop("sslmode", None)
        query.pop("channel_binding", None)
        url = url.set(query=query)
        if mode in ("require", "prefer", "verify-ca", "verify-full"):
            ctx = ssl.create_default_context()
            if mode in ("require", "prefer"):  # libpq semantics: encrypt, do not verify the certificate
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
            connect_args["ssl_context"] = ctx
    return url.render_as_string(hide_password=False), connect_args


_url, _connect_args = _engine_args()
engine = create_engine(_url, connect_args=_connect_args, pool_pre_ping=True, pool_recycle=1800, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
