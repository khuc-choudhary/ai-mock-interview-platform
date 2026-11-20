from datetime import datetime
from uuid import UUID
from zoneinfo import available_timezones

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.common import Experience


def _check_password(v: str) -> str:
    if len(v.encode("utf-8")) > 72:
        raise ValueError("Password must be at most 72 bytes")
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not any(c.isalpha() for c in v) or not any(c.isdigit() for c in v):
        raise ValueError("Password must contain at least one letter and one number")
    return v


def _clean_skills(v: list[str]) -> list[str]:
    out: list[str] = []
    for s in v:
        s = s.strip()
        if s and s.lower() not in {x.lower() for x in out}:
            out.append(s[:50])
    return out[:30]


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str
    education: str | None = Field(default=None, max_length=200)
    experience_level: Experience = "fresher"
    preferred_role: str | None = Field(default=None, max_length=120)
    skills: list[str] = Field(default_factory=list)
    timezone: str = "UTC"

    _pw = field_validator("password")(_check_password)
    _sk = field_validator("skills")(_clean_skills)

    @field_validator("full_name")
    @classmethod
    def _name(cls, v: str) -> str:
        return v.strip()

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v: str) -> str:
        return v if v in available_timezones() else "UTC"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    new_password: str

    _pw = field_validator("new_password")(_check_password)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    _pw = field_validator("new_password")(_check_password)


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    education: str | None
    experience_level: str
    preferred_role: str | None
    skills: list[str]
    daily_goal: int
    timezone: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: str
    full_name: str
    created_at: datetime
    profile: ProfileOut


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ProfileUpdate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    education: str | None = Field(default=None, max_length=200)
    experience_level: Experience
    preferred_role: str | None = Field(default=None, max_length=120)
    skills: list[str] = Field(default_factory=list)
    daily_goal: int = Field(default=1, ge=1, le=20)
    timezone: str = "UTC"

    _sk = field_validator("skills")(_clean_skills)

    @field_validator("full_name")
    @classmethod
    def _name(cls, v: str) -> str:
        return v.strip()

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v: str) -> str:
        return v if v in available_timezones() else "UTC"


class MessageResponse(BaseModel):
    message: str
    dev_reset_link: str | None = None
