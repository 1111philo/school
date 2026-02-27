from pydantic import BaseModel, Field


class AssessmentItem(BaseModel):
    objective: str
    prompt: str
    rubric: list[str] = Field(min_length=3, max_length=6)


class AssessmentSpecOutput(BaseModel):
    """Output from the assessment_creator agent."""

    assessment_title: str
    items: list[AssessmentItem] = Field(min_length=1, max_length=6)


class AssessmentSubmitRequest(BaseModel):
    responses: list["AssessmentItemResponse"]


class AssessmentItemResponse(BaseModel):
    objective: str
    text: str


class ObjectiveScore(BaseModel):
    objective: str
    score: int = Field(ge=0, le=100)
    feedback: str


class AssessmentReviewOutput(BaseModel):
    """Output from the assessment_reviewer agent."""

    overall_score: int = Field(ge=0, le=100)
    objective_scores: list[ObjectiveScore]
    pass_decision: str  # pass, fail
    next_steps: list[str] = Field(min_length=1)


class AssessmentResponse(BaseModel):
    id: str
    status: str
    score: float | None
    passed: bool | None
    feedback: dict | None
    assessment_spec: dict | None

    model_config = {"from_attributes": True}
