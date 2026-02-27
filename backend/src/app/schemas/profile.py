from pydantic import BaseModel


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = None
    experience_level: str | None = None
    learning_goals: list[str] | None = None
    interests: list[str] | None = None
    learning_style: str | None = None
    tone_preference: str | None = None


class ProfileResponse(BaseModel):
    display_name: str | None
    experience_level: str | None
    learning_goals: list
    interests: list
    learning_style: str | None
    tone_preference: str | None
    skill_signals: dict
    version: int

    model_config = {"from_attributes": True}
