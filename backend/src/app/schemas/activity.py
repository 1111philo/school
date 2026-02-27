from pydantic import BaseModel, Field


class ActivitySpecOutput(BaseModel):
    """Output from the activity_creator agent."""

    activity_type: str
    instructions: str = Field(min_length=50)
    prompt: str = Field(min_length=20)
    scoring_rubric: list[str] = Field(min_length=3, max_length=6)
    hints: list[str] = Field(min_length=2, max_length=5)


class ActivitySubmitRequest(BaseModel):
    text: str = Field(min_length=1)


class ActivityReviewOutput(BaseModel):
    """Output from the activity_reviewer agent."""

    score: int = Field(ge=0, le=100)
    rationale: str = Field(min_length=50)
    strengths: list[str] = Field(min_length=2, max_length=5)
    improvements: list[str] = Field(min_length=2, max_length=5)
    tips: list[str] = Field(min_length=2, max_length=6)
    mastery_decision: str  # not_yet, meets, exceeds


class ActivitySubmitResponse(BaseModel):
    score: int
    mastery_decision: str
    rationale: str
    strengths: list[str]
    improvements: list[str]
    tips: list[str]
