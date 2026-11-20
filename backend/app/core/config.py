from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_SECRET = "change-me-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    database_url: str = "postgresql+pg8000://postgres:postgres@localhost:5432/mock_interview"

    # Auth
    jwt_secret: str = _DEFAULT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24
    password_reset_expire_minutes: int = 30

    # Web
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    frontend_url: str = "http://localhost:5173"

    # LLM (any OpenAI-compatible chat-completions API). Empty key => DEMO MODE.
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str = ""
    llm_model: str = "gpt-4o-mini"
    llm_timeout_seconds: float = 60.0
    # For reasoning models (e.g. gpt-oss on Groq): low | medium | high. Empty = provider default.
    llm_reasoning_effort: str = ""
    # Extra completion-token headroom so reasoning tokens never cut the JSON answer short
    llm_reasoning_budget: int = 3000
    llm_json_mode: bool = True  # send response_format=json_object (disable for providers that reject it)

    # Whisper-compatible speech-to-text (falls back to the LLM base url / key when blank)
    whisper_base_url: str = ""
    whisper_api_key: str = ""
    whisper_model: str = "whisper-1"

    interviewer_name: str = "Aria"

    # Rate limits (requests per window) for expensive / sensitive endpoints
    rate_limit_ai: int = 30
    rate_limit_ai_window_seconds: int = 60
    rate_limit_auth: int = 10
    rate_limit_auth_window_seconds: int = 60

    # Optional SMTP for password-reset emails
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "no-reply@mockinterview.local"
    # HTTP email API (works on hosts that block SMTP ports). If set, it is used instead of SMTP.
    resend_api_key: str = ""

    @field_validator("database_url")
    @classmethod
    def _normalize_db_url(cls, v: str) -> str:
        v = v.strip()
        for prefix in ("postgres://", "postgresql://"):  # Render/Neon/Heroku style URLs
            if v.startswith(prefix):
                return "postgresql+pg8000://" + v[len(prefix):]
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def demo_mode(self) -> bool:
        return not self.llm_api_key.strip()

    @property
    def whisper_available(self) -> bool:
        return bool((self.whisper_api_key or self.llm_api_key).strip())

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if s.is_production and s.jwt_secret == _DEFAULT_SECRET:
        raise RuntimeError("JWT_SECRET must be set to a strong random value in production")
    return s


settings = get_settings()
