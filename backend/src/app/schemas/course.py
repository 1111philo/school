from pydantic import BaseModel, field_validator


class CourseCreateRequest(BaseModel):
    description: str
    objectives: list[str]

    @field_validator("objectives")
    @classmethod
    def objectives_not_empty(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("At least one learning objective is required")
        return v


class CourseResponse(BaseModel):
    id: str
    source_type: str
    input_description: str | None
    input_objectives: list
    generated_description: str | None
    status: str
    lessons: list["LessonResponse"] = []
    assessments: list["AssessmentSummary"] = []

    model_config = {"from_attributes": True}


class LessonResponse(BaseModel):
    id: str
    objective_index: int
    lesson_content: str | None
    status: str
    activity: "ActivityResponse | None" = None

    model_config = {"from_attributes": True}


class ActivityResponse(BaseModel):
    id: str
    activity_spec: dict | None
    latest_score: float | None
    latest_feedback: dict | None
    mastery_decision: str | None
    attempt_count: int

    model_config = {"from_attributes": True}


class AssessmentSummary(BaseModel):
    id: str
    status: str
    score: float | None
    passed: bool | None

    model_config = {"from_attributes": True}


class CourseListItem(BaseModel):
    id: str
    source_type: str
    input_description: str | None
    status: str
    lesson_count: int = 0
    lessons_completed: int = 0

    model_config = {"from_attributes": True}
