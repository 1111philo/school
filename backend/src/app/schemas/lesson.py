from pydantic import BaseModel, Field


class LessonPlanOutput(BaseModel):
    """Output from the lesson_planner agent."""

    lesson_title: str
    learning_objective: str
    key_concepts: list[str] = Field(min_length=2, max_length=8)
    lesson_outline: list[str] = Field(min_length=3, max_length=10)
    suggested_activity: "ActivitySeed"
    mastery_criteria: list[str] = Field(min_length=2, max_length=6)


class ActivitySeed(BaseModel):
    """Seed for the activity_creator agent, produced by lesson_planner."""

    activity_type: str
    prompt: str
    expected_evidence: list[str] = Field(min_length=2, max_length=5)


class LessonContentOutput(BaseModel):
    """Output from the lesson_writer agent."""

    lesson_title: str
    lesson_body: str = Field(min_length=200)
    key_takeaways: list[str] = Field(min_length=3, max_length=6)
