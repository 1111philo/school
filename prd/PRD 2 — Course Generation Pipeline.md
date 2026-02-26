---
title: "PRD 2 — Course Generation Pipeline"
phase: Core Pipeline
depends-on: PRD 1 (Backend Foundation & Infrastructure)
agents: [course_describer (A), lesson_planner (B), lesson_writer (C)]
size: Large
status: Draft
---

# PRD 2 — Course Generation Pipeline

## Overview

PRD 2 implements the core course generation pipeline: three PydanticAI agents orchestrated by a `pydantic_graph` workflow that transforms a course description and learning objectives into a fully generated course with structured lessons. This is the first PRD that delivers AI-generated content and the foundation upon which all subsequent agent PRDs build.

The pipeline follows a deterministic sequence: for each learning objective, a `course_describer` creates a focused course description, a `lesson_planner` produces a detailed lesson plan, and a `lesson_writer` generates the full lesson content. The orchestration graph manages state, handles validation failures with retries, records agent logs at each step, and persists the resulting CourseInstance and Lessons to the database.

This PRD delivers a working API endpoint (`POST /api/courses/generate`) that accepts a course description and objectives and returns a complete course. It is testable via curl, httpx, or any HTTP client without a frontend.

---

## Goals

1. Implement three production-quality PydanticAI agents (`course_describer`, `lesson_planner`, `lesson_writer`) with strict Pydantic output schemas and business rule validation.
2. Orchestrate the agents using `pydantic_graph` with typed nodes, shared state, and deterministic execution order.
3. Deliver a REST API endpoint that accepts minimal input and returns a fully generated course.
4. Persist generated courses (CourseInstance + Lessons) to the database with agent logs for every step.
5. Establish the agent development pattern (output_type, @output_validator, ModelRetry, output_retries, PipelineDeps) that all future agent PRDs will follow.

## Non-Goals

1. **Streaming/SSE** -- Course generation returns synchronously in PRD 2. SSE streaming is added in PRD 5.
2. **Learner profile personalization** -- Agents use static system prompts. Dynamic `@agent.instructions` with profile injection comes in PRD 6.
3. **Activity creation and scoring** -- The `lesson_writer` produces a `suggestedActivity`, but the full activity spec and reviewer agents are PRD 3.
4. **Visual aids** -- No visual aid detection or generation. PRD 7.
5. **Frontend integration** -- No UI changes. API-only delivery. PRD 5.
6. **Authentication** -- Single-user mode with stubbed user. PRD 11.
7. **Course state machine** -- CourseInstance is created with status `Active`. Full state machine transitions are PRD 4.

---

## Scope

### Pydantic I/O Models

Complete Pydantic models for all three agent outputs, plus shared input models and enums.

### Agent Implementations

Three PydanticAI agents, each with:
- Static system prompt
- `output_type` set to the corresponding Pydantic model
- `@output_validator` for business rule validation beyond schema
- `output_retries` configured (default: 2)
- `deps_type` set to `PipelineDeps` (from PRD 1)

### pydantic_graph Orchestration

- `CourseGenerationState` dataclass for shared state across nodes
- `DescribeCourseNode` -> `PlanLessonNode` -> `WriteLessonNode` -> `End`
- Loop: the graph processes one objective at a time, cycling through describe -> plan -> write
- Error handling: structured error on double validation failure

### Agent Logging

Every agent run records to AgentLog (using the logging wrapper from PRD 1):
- Agent name, prompt, output, timing, tokens, model metadata, status
- Captured via `capture_run_messages()` + `result.usage()` + `result.response.model_name`

### API Endpoint

- `POST /api/courses/generate` -- accepts course description + objectives, returns generated course

### Database Persistence

- CourseInstance created with generated description and status `Active`
- Lesson records created for each objective with plan JSON, content, and status

---

## Technical Design

### Project Structure

```
src/
  agents/
    __init__.py
    course_describer.py      # Agent A
    lesson_planner.py        # Agent B
    lesson_writer.py         # Agent C
  models/
    __init__.py
    course_description.py    # CourseDescriptionOutput + input models
    lesson_plan.py           # LessonPlanOutput + nested models
    lesson_content.py        # LessonContentOutput + nested models
    enums.py                 # Shared enums (BloomsLevel, SubmissionType, ActivityType)
  graph/
    __init__.py
    course_generation.py     # Graph definition, nodes, state
  routers/
    courses.py               # POST /api/courses/generate
```

### Shared Enums

```python
# src/models/enums.py
from enum import StrEnum


class SubmissionType(StrEnum):
    SHORT_RESPONSE = "short_response"
    IMAGE_UPLOAD = "image_upload"
    EITHER = "either"


class BloomsLevel(StrEnum):
    REMEMBER = "remember"
    UNDERSTAND = "understand"
    APPLY = "apply"
    ANALYZE = "analyze"
    EVALUATE = "evaluate"
    CREATE = "create"


class ActivityType(StrEnum):
    READ = "read"
    WATCH = "watch"
    PRACTICE = "practice"
    REFLECT = "reflect"
    DISCUSS = "discuss"
    BUILD = "build"
```

---

## Agent Contracts

### A) course_describer

#### Purpose

Create a focused course description that emphasizes one primary objective and provides a clear narrative thread for the course. Uses the course title, base description, learning objectives, and (eventually) the learner profile.

#### Input Model

```python
# src/models/course_description.py
from pydantic import BaseModel, Field


class CourseDescriptionInput(BaseModel):
    """Input to the course_describer agent."""

    course_name: str = Field(
        ...,
        description="The title of the course.",
        min_length=1,
        max_length=200,
    )
    base_description: str = Field(
        ...,
        description="The base course description providing topic framing.",
        min_length=1,
        max_length=2000,
    )
    learning_objectives: list[str] = Field(
        ...,
        description="All learning objectives for the course.",
        min_length=1,
    )
    selected_objective: str = Field(
        ...,
        description="The specific objective this description should focus on.",
        min_length=1,
    )
    # learner_profile: LearnerProfile | None = None  # Added in PRD 6
```

#### Output Model

```python
# src/models/course_description.py (continued)
from pydantic import BaseModel, Field, field_validator


class CourseDescriptionOutput(BaseModel):
    """Output from the course_describer agent."""

    focused_objective: str = Field(
        ...,
        description=(
            "The selected objective text, exactly matching or clearly "
            "restating the input without changing meaning."
        ),
        min_length=1,
    )
    course_description: str = Field(
        ...,
        description=(
            "A concise, specific course description of 60-140 words "
            "that centers on the focused objective. Includes at least "
            "one concrete outcome and a clear learning arc."
        ),
        min_length=1,
    )
    personalization_rationale: list[str] = Field(
        ...,
        description=(
            "2-5 bullets explaining how learner profile signals "
            "influenced the description. Each references a specific "
            "profile signal."
        ),
        min_length=2,
        max_length=5,
    )

    @field_validator("personalization_rationale")
    @classmethod
    def validate_rationale_count(cls, v: list[str]) -> list[str]:
        if len(v) < 2 or len(v) > 5:
            raise ValueError(
                f"personalization_rationale must contain 2-5 items, got {len(v)}"
            )
        return v
```

#### Agent Implementation

```python
# src/agents/course_describer.py
from pydantic_ai import Agent, ModelRetry, RunContext

from src.models.course_description import CourseDescriptionOutput
from src.deps import PipelineDeps

course_describer = Agent(
    "openai:gpt-4o",  # configurable via settings
    output_type=CourseDescriptionOutput,
    deps_type=PipelineDeps,
    output_retries=2,
    system_prompt=(
        "You are a course description specialist for a generative learning platform. "
        "Your job is to create a concise, focused course description that centers on "
        "a single learning objective.\n\n"
        "Requirements:\n"
        "- Write a course description of exactly 60-140 words\n"
        "- Center the description on the focused objective — no competing primary objectives\n"
        "- Include at least one concrete outcome tied to the objective (what the learner will produce/do)\n"
        "- Include a clear learning arc (e.g., 'you'll start by…, then…, and finish by…')\n"
        "- Reference the course title/name\n"
        "- Reflect the base course description for topic framing\n"
        "- The focusedObjective must exactly match or clearly restate the selected objective\n"
        "- Provide 2-5 personalization rationale bullets\n"
        "- Each rationale bullet must reference a specific learner profile signal\n"
        "- Do not invent personal details not present in the learner profile\n"
        "- Avoid generic filler (e.g., 'this course will help you learn a lot')\n"
        "- Output strict JSON only — no markdown, no commentary"
    ),
)


@course_describer.output_validator
async def validate_course_description(
    ctx: RunContext[PipelineDeps], output: CourseDescriptionOutput
) -> CourseDescriptionOutput:
    """Validate business rules beyond schema validation."""
    word_count = len(output.course_description.split())

    if word_count < 60:
        raise ModelRetry(
            f"Course description is {word_count} words. "
            f"It must be between 60 and 140 words. "
            f"Expand the description with more specific details about the learning arc."
        )
    if word_count > 140:
        raise ModelRetry(
            f"Course description is {word_count} words. "
            f"It must be between 60 and 140 words. "
            f"Make the description more concise while keeping the focused objective and learning arc."
        )

    rationale_count = len(output.personalization_rationale)
    if rationale_count < 2 or rationale_count > 5:
        raise ModelRetry(
            f"personalization_rationale has {rationale_count} items. "
            f"It must contain exactly 2-5 items, each referencing a specific learner profile signal."
        )

    return output
```

#### Acceptance Criteria

1. Output is valid JSON matching `CourseDescriptionOutput` schema exactly. No extra keys.
2. `focused_objective` exactly matches or clearly restates the selected objective without changing meaning.
3. `course_description` is 60-140 words, avoids generic filler, includes at least one concrete outcome.
4. `course_description` includes a clear learning arc connecting lessons to the objective.
5. `course_description` references or clearly implies the course title/name.
6. `personalization_rationale` contains 2-5 bullets, each referencing a specific learner profile signal.
7. No sensitive data (tokens, passwords, raw PII) in output.
8. On validation failure, agent retries once with correction prompt. On double failure, returns structured error.

---

### B) lesson_planner

#### Purpose

Generate a single, complete lesson plan for one learning objective. The plan must be specific enough that `lesson_writer`, `activity_creator`, and `activity_reviewer` can produce aligned instruction, practice, and assessment without guessing or inventing missing details.

#### Input Model

```python
# src/models/lesson_plan.py
from pydantic import BaseModel, Field


class LessonPlanConstraints(BaseModel):
    """Optional constraints for lesson planning."""

    time_minutes: int | None = Field(
        default=None,
        description="Target time in minutes for all activities combined.",
        ge=5,
        le=480,
    )
    allowed_submission_types: list[SubmissionType] | None = Field(
        default=None,
        description="Permitted submission types for the assessment.",
    )
    reading_level: str | None = Field(
        default=None,
        description="Target reading level (e.g., 'grade 8', 'professional').",
    )


class LessonPlanInput(BaseModel):
    """Input to the lesson_planner agent."""

    course_description: str = Field(
        ...,
        description="The personalized course description (focused on an objective).",
        min_length=1,
    )
    objective_source: str = Field(
        ...,
        description="The original learning objective text.",
        min_length=1,
    )
    objective_index: int = Field(
        ...,
        description="The 1-based index of this objective within the course.",
        ge=1,
    )
    constraints: LessonPlanConstraints = Field(
        default_factory=LessonPlanConstraints,
        description="Optional constraints for the lesson plan.",
    )
    # learner_profile: LearnerProfile | None = None  # Added in PRD 6
```

#### Output Model

```python
# src/models/lesson_plan.py (continued)
from pydantic import BaseModel, Field, field_validator, model_validator
from src.models.enums import SubmissionType, BloomsLevel, ActivityType


class LearningObjective(BaseModel):
    """The restated, measurable learning objective."""

    statement: str = Field(
        ...,
        description=(
            "First-person, one-sentence, measurable objective. "
            "Pattern: 'I can [measurable verb] [thing] [context] [quality/constraint].'"
        ),
        min_length=10,
    )
    measurable_verb: str = Field(
        ...,
        description=(
            "A single Bloom's-aligned verb (e.g., 'draft', 'compare', 'design', 'justify'). "
            "Must appear in the statement."
        ),
        min_length=2,
    )
    success_evidence: list[str] = Field(
        ...,
        description="2-4 observable evidence items describing what proof of mastery looks like.",
        min_length=2,
        max_length=4,
    )

    @field_validator("success_evidence")
    @classmethod
    def validate_success_evidence_count(cls, v: list[str]) -> list[str]:
        if len(v) < 2 or len(v) > 4:
            raise ValueError(
                f"success_evidence must contain 2-4 items, got {len(v)}"
            )
        return v


class Competency(BaseModel):
    """The numbered competency heading for the lesson."""

    index: int = Field(
        ...,
        description="Integer used as the numbered heading (e.g., 1, 2, 3).",
        ge=1,
    )
    label: str = Field(
        ...,
        description="Short heading of 3-8 words (e.g., '1. Prompting for Reliable Outputs').",
        min_length=3,
    )
    summary: str = Field(
        ...,
        description="One sentence describing the broader skill area.",
        min_length=10,
    )


class EnduringUnderstanding(BaseModel):
    """Why this lesson matters in the long term."""

    why_it_matters: str = Field(
        ...,
        description="1-2 sentences on long-term value.",
        min_length=10,
    )
    key_takeaways: list[str] = Field(
        ...,
        description="2-4 concise bullets the lesson should reinforce.",
        min_length=2,
        max_length=4,
    )

    @field_validator("key_takeaways")
    @classmethod
    def validate_key_takeaways_count(cls, v: list[str]) -> list[str]:
        if len(v) < 2 or len(v) > 4:
            raise ValueError(
                f"key_takeaways must contain 2-4 items, got {len(v)}"
            )
        return v


class AssessmentProject(BaseModel):
    """The single portfolio artifact proving the objective."""

    artifact_name: str = Field(
        ...,
        description="Clear name for the artifact (e.g., 'One-Page Strategy Memo').",
        min_length=3,
    )
    prompt: str = Field(
        ...,
        description="The exact instructions a learner sees.",
        min_length=20,
    )
    submission_type: SubmissionType = Field(
        ...,
        description="One of: short_response, image_upload, either.",
    )
    blooms_level: BloomsLevel = Field(
        ...,
        description="One of the Bloom's taxonomy levels.",
    )
    webb_dok: int = Field(
        ...,
        description="Webb's Depth of Knowledge, integer 1-4.",
        ge=1,
        le=4,
    )
    requirements: list[str] = Field(
        ...,
        description="3-7 concrete requirements (length, components, constraints).",
        min_length=3,
        max_length=7,
    )
    scoring_dimensions: list[str] = Field(
        ...,
        description=(
            "3-6 scoring dimensions (e.g., 'accuracy', 'clarity', 'justification', 'completeness')."
        ),
        min_length=3,
        max_length=6,
    )

    @field_validator("requirements")
    @classmethod
    def validate_requirements_count(cls, v: list[str]) -> list[str]:
        if len(v) < 3 or len(v) > 7:
            raise ValueError(
                f"requirements must contain 3-7 items, got {len(v)}"
            )
        return v

    @field_validator("scoring_dimensions")
    @classmethod
    def validate_scoring_dimensions_count(cls, v: list[str]) -> list[str]:
        if len(v) < 3 or len(v) > 6:
            raise ValueError(
                f"scoring_dimensions must contain 3-6 items, got {len(v)}"
            )
        return v


class MasteryCriteria(BaseModel):
    """Defines what 'meets mastery' means for this lesson."""

    success_metric: str = Field(
        ...,
        description="A single sentence defining what 'meets mastery' means.",
        min_length=10,
    )
    rubric_checks: list[str] = Field(
        ...,
        description=(
            "3-6 rubric-style checks. Must be binary-checkable where possible. "
            "Must map directly to assessment requirements/scoring dimensions."
        ),
        min_length=3,
        max_length=6,
    )

    @field_validator("rubric_checks")
    @classmethod
    def validate_rubric_checks_count(cls, v: list[str]) -> list[str]:
        if len(v) < 3 or len(v) > 6:
            raise ValueError(
                f"rubric_checks must contain 3-6 items, got {len(v)}"
            )
        return v


class UDLAccommodations(BaseModel):
    """Universal Design for Learning accommodations."""

    engagement: list[str] = Field(
        ...,
        description="2-4 engagement accommodations (choice, relevance, motivation, scaffolding).",
        min_length=2,
        max_length=4,
    )
    representation: list[str] = Field(
        ...,
        description="2-4 representation accommodations (multiple formats, examples, vocabulary support).",
        min_length=2,
        max_length=4,
    )
    action_expression: list[str] = Field(
        ...,
        description="2-4 action/expression accommodations (multiple response ways, tools, templates).",
        min_length=2,
        max_length=4,
    )

    @field_validator("engagement")
    @classmethod
    def validate_engagement_count(cls, v: list[str]) -> list[str]:
        if len(v) < 2 or len(v) > 4:
            raise ValueError(
                f"engagement must contain 2-4 items, got {len(v)}"
            )
        return v

    @field_validator("representation")
    @classmethod
    def validate_representation_count(cls, v: list[str]) -> list[str]:
        if len(v) < 2 or len(v) > 4:
            raise ValueError(
                f"representation must contain 2-4 items, got {len(v)}"
            )
        return v

    @field_validator("action_expression")
    @classmethod
    def validate_action_expression_count(cls, v: list[str]) -> list[str]:
        if len(v) < 2 or len(v) > 4:
            raise ValueError(
                f"action_expression must contain 2-4 items, got {len(v)}"
            )
        return v


class ActivityAlignment(BaseModel):
    """Traceability from an activity to objective evidence and rubric checks."""

    objective_evidence: list[str] = Field(
        ...,
        description=(
            "Which learningObjective.successEvidence items this activity supports. "
            "Values must match strings from successEvidence."
        ),
        min_length=1,
    )
    rubric_checks: list[str] = Field(
        ...,
        description=(
            "Which masteryCriteria.rubricChecks items this activity prepares for. "
            "Values must exactly match strings from rubricChecks."
        ),
        min_length=1,
    )


class PlannedActivity(BaseModel):
    """A single learning activity within the lesson plan."""

    title: str = Field(
        ...,
        description="Short, specific activity title.",
        min_length=3,
    )
    type: ActivityType = Field(
        ...,
        description="One of: read, watch, practice, reflect, discuss, build.",
    )
    instructions: str = Field(
        ...,
        description="Actionable, step-based instructions (not vague guidance).",
        min_length=20,
    )
    estimated_minutes: int = Field(
        ...,
        description="Estimated time in minutes for this activity.",
        ge=1,
        le=120,
    )
    outputs: list[str] = Field(
        ...,
        description="What the learner produces (notes, draft, checklist, etc.).",
        min_length=1,
    )
    alignment: ActivityAlignment = Field(
        ...,
        description="Traceability to objective evidence and rubric checks.",
    )


class LessonPlanOutput(BaseModel):
    """Complete lesson plan output from the lesson_planner agent."""

    learning_objective: LearningObjective
    competency: Competency
    enduring_understanding: EnduringUnderstanding
    essential_questions: list[str] = Field(
        ...,
        description=(
            "2-4 essential questions answerable by end of lesson + assessment. "
            "Must be how/why/what framing, not yes/no."
        ),
        min_length=2,
        max_length=4,
    )
    assessment_project: AssessmentProject
    mastery_criteria: MasteryCriteria
    udl_accommodations: UDLAccommodations
    activities: list[PlannedActivity] = Field(
        ...,
        description="3-6 activities that prepare learners to succeed on the assessment.",
        min_length=3,
        max_length=6,
    )

    @field_validator("essential_questions")
    @classmethod
    def validate_essential_questions_count(cls, v: list[str]) -> list[str]:
        if len(v) < 2 or len(v) > 4:
            raise ValueError(
                f"essential_questions must contain 2-4 items, got {len(v)}"
            )
        return v

    @field_validator("activities")
    @classmethod
    def validate_activities_count(cls, v: list[PlannedActivity]) -> list[PlannedActivity]:
        if len(v) < 3 or len(v) > 6:
            raise ValueError(
                f"activities must contain 3-6 items, got {len(v)}"
            )
        return v
```

#### Agent Implementation

```python
# src/agents/lesson_planner.py
from pydantic_ai import Agent, ModelRetry, RunContext

from src.models.lesson_plan import LessonPlanOutput
from src.deps import PipelineDeps

lesson_planner = Agent(
    "openai:gpt-4o",
    output_type=LessonPlanOutput,
    deps_type=PipelineDeps,
    output_retries=2,
    system_prompt=(
        "You are an expert instructional designer for a generative learning platform. "
        "Your job is to create a single, complete lesson plan for one learning objective.\n\n"
        "The lesson plan must be detailed enough that downstream agents (lesson_writer, "
        "activity_creator, activity_reviewer) can produce aligned instruction, practice, "
        "and assessment without guessing or inventing missing details.\n\n"
        "Requirements:\n"
        "- learningObjective.statement: first-person, one sentence, measurable, "
        "aligned to assessment. Pattern: 'I can [verb] [thing] [context] [quality].'\n"
        "- learningObjective.measurableVerb: single Bloom's-aligned verb that appears in statement\n"
        "- learningObjective.successEvidence: 2-4 observable evidence items\n"
        "- competency.index: integer matching the objective's position\n"
        "- competency.label: 3-8 word heading\n"
        "- enduringUnderstanding.whyItMatters: 1-2 sentences on long-term value\n"
        "- enduringUnderstanding.keyTakeaways: 2-4 concise bullets\n"
        "- essentialQuestions: 2-4 how/why/what questions (no yes/no)\n"
        "- assessmentProject: ONE artifact with clear prompt, 3-7 requirements, 3-6 scoring dimensions\n"
        "- bloomsLevel: one of remember/understand/apply/analyze/evaluate/create\n"
        "- webbDOK: integer 1-4\n"
        "- masteryCriteria.rubricChecks: 3-6 binary-checkable checks mapping to assessment\n"
        "- udlAccommodations: 2-4 items per category (engagement, representation, actionExpression)\n"
        "- activities: 3-6 activities, each with alignment to successEvidence and rubricChecks\n"
        "- EVERY activity must align to at least one successEvidence item AND one rubricCheck\n"
        "- No activity may have empty alignment arrays\n"
        "- Output strict JSON only — no markdown, no commentary, no extra keys"
    ),
)


@lesson_planner.output_validator
async def validate_lesson_plan(
    ctx: RunContext[PipelineDeps], output: LessonPlanOutput
) -> LessonPlanOutput:
    """Validate business rules beyond schema validation."""
    errors: list[str] = []

    # Validate essential questions count
    if len(output.essential_questions) < 2 or len(output.essential_questions) > 4:
        errors.append(
            f"essential_questions must contain 2-4 items, got {len(output.essential_questions)}"
        )

    # Validate rubric checks count
    rubric_checks = output.mastery_criteria.rubric_checks
    if len(rubric_checks) < 3 or len(rubric_checks) > 6:
        errors.append(
            f"rubric_checks must contain 3-6 items, got {len(rubric_checks)}"
        )

    # Validate activities count
    if len(output.activities) < 3 or len(output.activities) > 6:
        errors.append(
            f"activities must contain 3-6 items, got {len(output.activities)}"
        )

    # Validate assessment requirements count
    reqs = output.assessment_project.requirements
    if len(reqs) < 3 or len(reqs) > 7:
        errors.append(
            f"assessment_project.requirements must contain 3-7 items, got {len(reqs)}"
        )

    # Validate scoring dimensions count
    dims = output.assessment_project.scoring_dimensions
    if len(dims) < 3 or len(dims) > 6:
        errors.append(
            f"assessment_project.scoring_dimensions must contain 3-6 items, got {len(dims)}"
        )

    # Validate webbDOK range
    if output.assessment_project.webb_dok < 1 or output.assessment_project.webb_dok > 4:
        errors.append(
            f"assessment_project.webb_dok must be 1-4, got {output.assessment_project.webb_dok}"
        )

    # Validate UDL accommodation counts
    for category_name, items in [
        ("engagement", output.udl_accommodations.engagement),
        ("representation", output.udl_accommodations.representation),
        ("action_expression", output.udl_accommodations.action_expression),
    ]:
        if len(items) < 2 or len(items) > 4:
            errors.append(
                f"udl_accommodations.{category_name} must contain 2-4 items, got {len(items)}"
            )

    # Validate activity alignment: every activity must align to at least one
    # successEvidence item and one rubricCheck
    success_evidence_set = set(output.learning_objective.success_evidence)
    rubric_checks_set = set(rubric_checks)

    for i, activity in enumerate(output.activities):
        if not activity.alignment.objective_evidence:
            errors.append(
                f"activities[{i}] ('{activity.title}') has empty alignment.objective_evidence"
            )
        if not activity.alignment.rubric_checks:
            errors.append(
                f"activities[{i}] ('{activity.title}') has empty alignment.rubric_checks"
            )

        # Validate that alignment values reference actual successEvidence/rubricChecks
        for evidence in activity.alignment.objective_evidence:
            if evidence not in success_evidence_set:
                errors.append(
                    f"activities[{i}] alignment.objective_evidence item "
                    f"'{evidence}' does not match any learningObjective.successEvidence"
                )
        for check in activity.alignment.rubric_checks:
            if check not in rubric_checks_set:
                errors.append(
                    f"activities[{i}] alignment.rubric_checks item "
                    f"'{check}' does not match any masteryCriteria.rubricChecks"
                )

    # Validate rubric checks map to assessment dimensions/requirements
    # (At minimum, each rubric check should be relatable to a scoring dimension)
    if len(rubric_checks) > 0 and len(dims) > 0:
        # Soft check: ensure rubric checks are not completely disconnected from
        # scoring dimensions. This is a structural check -- the LLM judge in
        # evals will do the semantic check.
        pass

    # Validate measurable verb appears in statement
    verb = output.learning_objective.measurable_verb.lower()
    statement = output.learning_objective.statement.lower()
    if verb not in statement:
        errors.append(
            f"learningObjective.measurableVerb '{output.learning_objective.measurable_verb}' "
            f"does not appear in learningObjective.statement"
        )

    if errors:
        raise ModelRetry(
            "Lesson plan validation failed. Fix these issues:\n"
            + "\n".join(f"- {e}" for e in errors)
        )

    return output
```

#### Acceptance Criteria

1. Output is valid JSON matching `LessonPlanOutput` schema exactly. No extra keys.
2. `learning_objective.statement` is one sentence, first person, measurable. `measurable_verb` appears in the statement.
3. `learning_objective.success_evidence` contains 2-4 observable evidence items.
4. `essential_questions` contains 2-4 non-yes/no questions.
5. `mastery_criteria.rubric_checks` contains 3-6 binary-checkable items mapping to assessment.
6. `activities` contains 3-6 items, each with non-empty `alignment.objective_evidence` and `alignment.rubric_checks`.
7. All alignment values exactly match strings from `success_evidence` and `rubric_checks` respectively.
8. `assessment_project` defines one artifact with 3-7 requirements, 3-6 scoring dimensions.
9. `blooms_level` is a valid enum; `webb_dok` is 1-4.
10. Each UDL category contains 2-4 items.
11. If `constraints.time_minutes` is set, sum of `activities[].estimated_minutes` is within +/-20%.
12. On validation failure, agent retries with correction prompt. On double failure, returns structured error.

---

### C) lesson_writer

#### Purpose

Write the full lesson content and suggest an activity, based on the lesson plan, focused course description, and (eventually) the learner profile.

#### Input Model

```python
# src/models/lesson_content.py
from pydantic import BaseModel, Field

from src.models.lesson_plan import LessonPlanOutput


class LessonContentInput(BaseModel):
    """Input to the lesson_writer agent."""

    lesson_plan: LessonPlanOutput = Field(
        ...,
        description="The complete lesson plan from the lesson_planner agent.",
    )
    course_description: str = Field(
        ...,
        description="The focused course description from the course_describer agent.",
        min_length=1,
    )
    # learner_profile: LearnerProfile | None = None  # Added in PRD 6
```

#### Output Model

```python
# src/models/lesson_content.py (continued)
from pydantic import BaseModel, Field, field_validator
from src.models.enums import SubmissionType


class SuggestedActivity(BaseModel):
    """A suggested activity for the lesson, to be expanded by activity_creator (PRD 3)."""

    type: SubmissionType = Field(
        ...,
        description="One of: short_response, image_upload, either.",
    )
    prompt: str = Field(
        ...,
        description=(
            "A specific, doable activity prompt clearly tied to the lesson objective."
        ),
        min_length=20,
    )
    expected_evidence: list[str] = Field(
        ...,
        description=(
            "2-5 items describing expected evidence, aligned to "
            "learningObjective.successEvidence and/or masteryCriteria.rubricChecks."
        ),
        min_length=2,
        max_length=5,
    )

    @field_validator("expected_evidence")
    @classmethod
    def validate_expected_evidence_count(cls, v: list[str]) -> list[str]:
        if len(v) < 2 or len(v) > 5:
            raise ValueError(
                f"expected_evidence must contain 2-5 items, got {len(v)}"
            )
        return v


class LessonContentOutput(BaseModel):
    """Output from the lesson_writer agent."""

    lesson_title: str = Field(
        ...,
        description="A clear, descriptive lesson title.",
        min_length=3,
    )
    lesson_body: str = Field(
        ...,
        description=(
            "The full lesson content in Markdown. Must include sections: "
            "Objective, Why it matters, Steps/How-to, Worked example(s), "
            "Check for understanding/Recap."
        ),
        min_length=200,
    )
    key_takeaways: list[str] = Field(
        ...,
        description=(
            "3-6 concise bullets. Each maps to a mastery rubric check "
            "or a required component of the assessment artifact."
        ),
        min_length=3,
        max_length=6,
    )
    suggested_activity: SuggestedActivity = Field(
        ...,
        description="A suggested activity for the lesson.",
    )

    @field_validator("key_takeaways")
    @classmethod
    def validate_key_takeaways_count(cls, v: list[str]) -> list[str]:
        if len(v) < 3 or len(v) > 6:
            raise ValueError(
                f"key_takeaways must contain 3-6 items, got {len(v)}"
            )
        return v
```

#### Agent Implementation

```python
# src/agents/lesson_writer.py
from pydantic_ai import Agent, ModelRetry, RunContext

from src.models.lesson_content import LessonContentOutput
from src.deps import PipelineDeps

REQUIRED_SECTIONS = [
    "Objective",
    "Why it matters",
    "Steps",  # matches "Steps" or "Steps/How-to" or "How-to"
    "Example",  # matches "Example" or "Worked example" or "Examples"
    "Recap",  # matches "Recap" or "Check for understanding"
]

lesson_writer = Agent(
    "openai:gpt-4o",
    output_type=LessonContentOutput,
    deps_type=PipelineDeps,
    output_retries=2,
    system_prompt=(
        "You are an expert lesson content writer for a generative learning platform. "
        "Your job is to write a complete, engaging lesson based on a lesson plan.\n\n"
        "Requirements:\n"
        "- lessonTitle: clear and descriptive\n"
        "- lessonBody: full Markdown lesson content that MUST include these sections as headings:\n"
        "  1. **Objective** — state what the learner will achieve\n"
        "  2. **Why it matters** — connect to enduring understanding\n"
        "  3. **Steps / How-to** — actionable instructional steps\n"
        "  4. **Worked example(s)** — at least one concrete example tailored to context\n"
        "  5. **Check for understanding / Recap** — summarize and reinforce\n"
        "- Include at least 1 concrete example tailored to learner context\n"
        "- Implement UDL accommodations from the lesson plan where feasible:\n"
        "  * Engagement: choice, relevance, scaffolds\n"
        "  * Representation: definitions, multiple formats, visual guidance\n"
        "  * Action/Expression: response options, templates, tools\n"
        "- Define any necessary jargon with brief just-in-time explanations\n"
        "- keyTakeaways: 3-6 concise bullets, each mapping to a rubric check or assessment component\n"
        "- suggestedActivity:\n"
        "  * type: short_response, image_upload, or either\n"
        "  * prompt: specific and tied to the lesson objective\n"
        "  * expectedEvidence: 2-5 items aligned to successEvidence/rubricChecks\n"
        "- Do not invent personal details not in the learner profile\n"
        "- Output strict JSON only — no markdown wrappers, no commentary"
    ),
)


@lesson_writer.output_validator
async def validate_lesson_content(
    ctx: RunContext[PipelineDeps], output: LessonContentOutput
) -> LessonContentOutput:
    """Validate business rules beyond schema validation."""
    errors: list[str] = []

    # Validate required sections exist in lesson body
    body_lower = output.lesson_body.lower()
    section_patterns = {
        "Objective": ["## objective", "# objective", "**objective**"],
        "Why it matters": [
            "## why it matters",
            "# why it matters",
            "**why it matters**",
            "## why this matters",
        ],
        "Steps / How-to": [
            "## steps",
            "# steps",
            "## how-to",
            "## how to",
            "**steps**",
            "## steps / how-to",
            "## steps/how-to",
        ],
        "Worked example(s)": [
            "## example",
            "# example",
            "## worked example",
            "**example**",
            "## examples",
            "## worked examples",
        ],
        "Recap": [
            "## recap",
            "# recap",
            "## check for understanding",
            "**recap**",
            "## check for understanding / recap",
            "## check for understanding/recap",
        ],
    }

    for section_name, patterns in section_patterns.items():
        found = any(pattern in body_lower for pattern in patterns)
        if not found:
            errors.append(
                f"lessonBody is missing required section: '{section_name}'. "
                f"Include it as a Markdown heading."
            )

    # Validate key takeaways count
    if len(output.key_takeaways) < 3 or len(output.key_takeaways) > 6:
        errors.append(
            f"key_takeaways must contain 3-6 items, got {len(output.key_takeaways)}"
        )

    # Validate suggested activity expected evidence count
    evidence_count = len(output.suggested_activity.expected_evidence)
    if evidence_count < 2 or evidence_count > 5:
        errors.append(
            f"suggestedActivity.expected_evidence must contain 2-5 items, "
            f"got {evidence_count}"
        )

    # Validate lesson body has reasonable length (at least 200 words)
    word_count = len(output.lesson_body.split())
    if word_count < 200:
        errors.append(
            f"lessonBody is {word_count} words. "
            f"A complete lesson should be at least 200 words to cover all required sections."
        )

    if errors:
        raise ModelRetry(
            "Lesson content validation failed. Fix these issues:\n"
            + "\n".join(f"- {e}" for e in errors)
        )

    return output
```

#### Acceptance Criteria

1. Output is valid JSON matching `LessonContentOutput` schema exactly. No extra keys.
2. `lesson_body` includes clearly headed sections: Objective, Why it matters, Steps/How-to, Worked example(s), Recap.
3. `lesson_body` contains at least one concrete example.
4. `lesson_body` implements at least one UDL accommodation from each category where feasible.
5. `lesson_body` is at least 200 words.
6. `key_takeaways` contains 3-6 concise bullets, each mapping to a rubric check or assessment component.
7. `suggested_activity.type` is a valid `SubmissionType` enum.
8. `suggested_activity.prompt` is specific, doable, tied to the lesson objective.
9. `suggested_activity.expected_evidence` contains 2-5 items aligned to `successEvidence`/`rubricChecks`.
10. No fabricated learner details.
11. On validation failure, agent retries with correction prompt. On double failure, returns structured error.

---

## pydantic_graph Orchestration Design

### CourseGenerationState

```python
# src/graph/course_generation.py
from dataclasses import dataclass, field

from src.models.course_description import CourseDescriptionOutput
from src.models.lesson_plan import LessonPlanOutput
from src.models.lesson_content import LessonContentOutput


@dataclass
class GeneratedLesson:
    """One fully generated lesson (description + plan + content)."""

    objective_index: int
    objective_text: str
    description: CourseDescriptionOutput | None = None
    plan: LessonPlanOutput | None = None
    content: LessonContentOutput | None = None


@dataclass
class CourseGenerationState:
    """Shared state across all graph nodes during course generation."""

    # Inputs
    course_name: str = ""
    base_description: str = ""
    learning_objectives: list[str] = field(default_factory=list)

    # Processing state
    current_objective_index: int = 0
    generated_lessons: list[GeneratedLesson] = field(default_factory=list)

    # Error tracking
    errors: list[dict] = field(default_factory=list)

    # Agent log IDs (for traceability)
    agent_log_ids: list[int] = field(default_factory=list)

    @property
    def current_objective(self) -> str:
        """The objective currently being processed."""
        return self.learning_objectives[self.current_objective_index]

    @property
    def current_lesson(self) -> GeneratedLesson:
        """The lesson currently being built."""
        return self.generated_lessons[self.current_objective_index]

    @property
    def all_objectives_processed(self) -> bool:
        """Whether all objectives have been processed."""
        return self.current_objective_index >= len(self.learning_objectives)

    @property
    def latest_description(self) -> CourseDescriptionOutput | None:
        """The most recently generated course description."""
        if self.generated_lessons:
            return self.generated_lessons[self.current_objective_index].description
        return None
```

### Graph Nodes

```python
# src/graph/course_generation.py (continued)
from dataclasses import dataclass
from pydantic_graph import BaseNode, GraphRunContext, End, Graph
from pydantic_ai import capture_run_messages

from src.agents.course_describer import course_describer
from src.agents.lesson_planner import lesson_planner
from src.agents.lesson_writer import lesson_writer
from src.models.course_description import CourseDescriptionInput
from src.models.lesson_plan import LessonPlanInput
from src.models.lesson_content import LessonContentInput
from src.deps import PipelineDeps


@dataclass
class InitCourseNode(BaseNode[CourseGenerationState]):
    """Initialize the generation state with a GeneratedLesson for each objective."""

    async def run(
        self, ctx: GraphRunContext[CourseGenerationState]
    ) -> "DescribeCourseNode":
        state = ctx.state
        state.generated_lessons = [
            GeneratedLesson(
                objective_index=i,
                objective_text=obj,
            )
            for i, obj in enumerate(state.learning_objectives)
        ]
        state.current_objective_index = 0
        return DescribeCourseNode()


@dataclass
class DescribeCourseNode(BaseNode[CourseGenerationState]):
    """Run course_describer for the current objective."""

    async def run(
        self, ctx: GraphRunContext[CourseGenerationState]
    ) -> "PlanLessonNode":
        state = ctx.state
        deps: PipelineDeps = ctx.deps

        prompt = (
            f"Create a focused course description for the following:\n\n"
            f"Course Name: {state.course_name}\n"
            f"Base Description: {state.base_description}\n"
            f"All Learning Objectives: {', '.join(state.learning_objectives)}\n"
            f"Selected Objective (focus on this one): {state.current_objective}\n"
        )

        with capture_run_messages() as messages:
            result = await course_describer.run(
                prompt,
                deps=deps,
            )

        # Record agent log
        log_id = await deps.record_agent_log(
            agent_name="course_describer",
            messages=messages,
            result=result,
        )
        state.agent_log_ids.append(log_id)

        # Store result in state
        state.current_lesson.description = result.output

        return PlanLessonNode()


@dataclass
class PlanLessonNode(BaseNode[CourseGenerationState]):
    """Run lesson_planner for the current objective."""

    async def run(
        self, ctx: GraphRunContext[CourseGenerationState]
    ) -> "WriteLessonNode":
        state = ctx.state
        deps: PipelineDeps = ctx.deps

        description = state.current_lesson.description
        assert description is not None, "DescribeCourseNode must run first"

        prompt = (
            f"Create a lesson plan for the following:\n\n"
            f"Course Description: {description.course_description}\n"
            f"Learning Objective: {state.current_objective}\n"
            f"Objective Index: {state.current_objective_index + 1}\n"
        )

        with capture_run_messages() as messages:
            result = await lesson_planner.run(
                prompt,
                deps=deps,
            )

        log_id = await deps.record_agent_log(
            agent_name="lesson_planner",
            messages=messages,
            result=result,
        )
        state.agent_log_ids.append(log_id)

        state.current_lesson.plan = result.output

        return WriteLessonNode()


@dataclass
class WriteLessonNode(BaseNode[CourseGenerationState]):
    """Run lesson_writer for the current objective, then advance or end."""

    async def run(
        self, ctx: GraphRunContext[CourseGenerationState]
    ) -> DescribeCourseNode | End[list[GeneratedLesson]]:
        state = ctx.state
        deps: PipelineDeps = ctx.deps

        description = state.current_lesson.description
        plan = state.current_lesson.plan
        assert description is not None, "DescribeCourseNode must run first"
        assert plan is not None, "PlanLessonNode must run first"

        prompt = (
            f"Write the full lesson content for the following:\n\n"
            f"Course Description: {description.course_description}\n"
            f"Lesson Plan (JSON): {plan.model_dump_json()}\n"
        )

        with capture_run_messages() as messages:
            result = await lesson_writer.run(
                prompt,
                deps=deps,
            )

        log_id = await deps.record_agent_log(
            agent_name="lesson_writer",
            messages=messages,
            result=result,
        )
        state.agent_log_ids.append(log_id)

        state.current_lesson.content = result.output

        # Advance to next objective or end
        state.current_objective_index += 1
        if state.all_objectives_processed:
            return End(state.generated_lessons)
        else:
            return DescribeCourseNode()


# Define the graph
course_generation_graph = Graph(
    nodes=[InitCourseNode, DescribeCourseNode, PlanLessonNode, WriteLessonNode],
)
```

### Graph Execution

```python
# src/graph/course_generation.py (continued)

async def generate_course(
    course_name: str,
    base_description: str,
    learning_objectives: list[str],
    deps: PipelineDeps,
) -> list[GeneratedLesson]:
    """
    Execute the full course generation pipeline.

    Args:
        course_name: The course title.
        base_description: The base course description.
        learning_objectives: List of learning objective strings.
        deps: Shared pipeline dependencies (DB, logger, etc.).

    Returns:
        List of GeneratedLesson objects, one per objective.

    Raises:
        CourseGenerationError: If the pipeline fails after retries.
    """
    state = CourseGenerationState(
        course_name=course_name,
        base_description=base_description,
        learning_objectives=learning_objectives,
    )

    result = await course_generation_graph.run(
        InitCourseNode(),
        state=state,
        deps=deps,
    )

    return result.output
```

### Error Handling Strategy

```python
# src/graph/errors.py
from dataclasses import dataclass


@dataclass
class CourseGenerationError(Exception):
    """Raised when course generation fails after all retries."""

    agent_name: str
    objective_index: int
    objective_text: str
    error_message: str
    agent_log_id: int | None = None

    def __str__(self) -> str:
        return (
            f"Course generation failed at agent '{self.agent_name}' "
            f"for objective {self.objective_index}: '{self.objective_text}'. "
            f"Error: {self.error_message}"
        )
```

Error handling at each node follows this pattern:

1. PydanticAI handles the first retry automatically via `output_retries=2`.
2. If all retries are exhausted, PydanticAI raises `UnexpectedModelBehavior`.
3. The graph node catches this, records the error to `state.errors`, logs the failure, and raises `CourseGenerationError`.
4. The API endpoint catches `CourseGenerationError` and returns a structured 500 response.

```python
# Error handling within a node (pattern applied to all three nodes):
from pydantic_ai.exceptions import UnexpectedModelBehavior

try:
    with capture_run_messages() as messages:
        result = await course_describer.run(prompt, deps=deps)
except UnexpectedModelBehavior as e:
    log_id = await deps.record_agent_log(
        agent_name="course_describer",
        messages=messages,
        result=None,
        error=str(e),
    )
    state.errors.append({
        "agent": "course_describer",
        "objective_index": state.current_objective_index,
        "error": str(e),
        "log_id": log_id,
    })
    raise CourseGenerationError(
        agent_name="course_describer",
        objective_index=state.current_objective_index,
        objective_text=state.current_objective,
        error_message=str(e),
        agent_log_id=log_id,
    )
```

---

## API Endpoints

### POST /api/courses/generate

Creates and generates a complete course from a description and learning objectives.

#### Request

```python
# src/routers/courses.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.deps import get_pipeline_deps, PipelineDeps
from src.graph.course_generation import generate_course
from src.graph.errors import CourseGenerationError

router = APIRouter(prefix="/api/courses", tags=["courses"])


class CourseGenerateRequest(BaseModel):
    """Request body for course generation."""

    course_name: str = Field(
        ...,
        description="The title of the course to generate.",
        min_length=1,
        max_length=200,
    )
    description: str = Field(
        ...,
        description="A brief description of the course topic and goals.",
        min_length=1,
        max_length=2000,
    )
    learning_objectives: list[str] = Field(
        ...,
        description="Learning objectives for the course (1-10).",
        min_length=1,
        max_length=10,
    )


class GeneratedLessonResponse(BaseModel):
    """A single generated lesson in the API response."""

    objective_index: int
    objective_text: str
    lesson_title: str
    lesson_body: str
    key_takeaways: list[str]
    suggested_activity_type: str
    suggested_activity_prompt: str


class CourseGenerateResponse(BaseModel):
    """Response body for course generation."""

    course_instance_id: int
    course_name: str
    course_description: str
    status: str
    lessons: list[GeneratedLessonResponse]
    agent_log_ids: list[int]
```

#### Endpoint

```python
@router.post("/generate", response_model=CourseGenerateResponse)
async def generate_course_endpoint(
    request: CourseGenerateRequest,
    deps: PipelineDeps = Depends(get_pipeline_deps),
) -> CourseGenerateResponse:
    """
    Generate a complete course from a description and learning objectives.

    This endpoint runs three agents per objective (course_describer,
    lesson_planner, lesson_writer) and persists the results to the database.
    """
    try:
        generated_lessons = await generate_course(
            course_name=request.course_name,
            base_description=request.description,
            learning_objectives=request.learning_objectives,
            deps=deps,
        )
    except CourseGenerationError as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "course_generation_failed",
                "agent": e.agent_name,
                "objective_index": e.objective_index,
                "message": e.error_message,
                "agent_log_id": e.agent_log_id,
            },
        )

    # Persist to database
    course_instance = await deps.persist_course(
        course_name=request.course_name,
        description=generated_lessons[0].description.course_description,
        learning_objectives=request.learning_objectives,
        generated_lessons=generated_lessons,
    )

    # Build response
    lesson_responses = []
    for gl in generated_lessons:
        assert gl.content is not None
        lesson_responses.append(
            GeneratedLessonResponse(
                objective_index=gl.objective_index,
                objective_text=gl.objective_text,
                lesson_title=gl.content.lesson_title,
                lesson_body=gl.content.lesson_body,
                key_takeaways=gl.content.key_takeaways,
                suggested_activity_type=gl.content.suggested_activity.type.value,
                suggested_activity_prompt=gl.content.suggested_activity.prompt,
            )
        )

    return CourseGenerateResponse(
        course_instance_id=course_instance.id,
        course_name=request.course_name,
        course_description=generated_lessons[0].description.course_description,
        status="active",
        lessons=lesson_responses,
        agent_log_ids=[],  # populated from state
    )
```

#### Example Request

```bash
curl -X POST http://localhost:8000/api/courses/generate \
  -H "Content-Type: application/json" \
  -d '{
    "course_name": "Introduction to Python Programming",
    "description": "A beginner-friendly course covering Python fundamentals for aspiring developers.",
    "learning_objectives": [
      "Understand variables, data types, and basic operators",
      "Write functions with parameters and return values",
      "Use control flow statements (if/elif/else, for, while)"
    ]
  }'
```

#### Example Response

```json
{
  "course_instance_id": 1,
  "course_name": "Introduction to Python Programming",
  "course_description": "In this course, you'll build a solid foundation in Python by focusing on variables, data types, and operators — the building blocks of every program. You'll start by exploring how Python stores and manipulates data, then practice writing expressions that combine different types. By the end, you'll confidently declare variables, choose appropriate data types, and use operators to solve real problems. Each lesson includes hands-on exercises tailored to practical scenarios, so you'll write actual code from day one rather than just reading about it.",
  "status": "active",
  "lessons": [
    {
      "objective_index": 0,
      "objective_text": "Understand variables, data types, and basic operators",
      "lesson_title": "Variables, Data Types, and Operators: The Building Blocks",
      "lesson_body": "## Objective\n\nBy the end of this lesson, you will be able to...",
      "key_takeaways": [
        "Variables are named containers that store values of specific types",
        "Python's core data types include int, float, str, and bool",
        "Operators combine values to produce new results",
        "Type conversion lets you transform data between types when needed"
      ],
      "suggested_activity_type": "short_response",
      "suggested_activity_prompt": "Write a Python script that declares variables of four different data types..."
    }
  ],
  "agent_log_ids": [1, 2, 3, 4, 5, 6, 7, 8, 9]
}
```

#### Error Responses

```json
// 422 — Validation Error (empty objectives)
{
  "detail": [
    {
      "type": "too_short",
      "loc": ["body", "learning_objectives"],
      "msg": "List should have at least 1 item after validation, not 0"
    }
  ]
}

// 500 — Agent Generation Failure
{
  "detail": {
    "error": "course_generation_failed",
    "agent": "lesson_planner",
    "objective_index": 1,
    "message": "Output validation failed after 2 retries: activities must contain 3-6 items, got 8",
    "agent_log_id": 5
  }
}
```

---

## Database Persistence

### CourseInstance Creation

After successful generation, the endpoint creates:

1. **CourseInstance** record:
   - `source_type`: `"user_created"`
   - `input_description`: the original request description
   - `input_objectives`: the original objectives array
   - `generated_course_description`: the focused description from `course_describer`
   - `status`: `"active"`

2. **Lesson** records (one per objective):
   - `course_instance_id`: FK to CourseInstance
   - `objective_index`: 0-based position
   - `lesson_plan_json`: serialized `LessonPlanOutput`
   - `lesson_content`: the `lesson_body` Markdown
   - `lesson_title`: from `LessonContentOutput`
   - `key_takeaways_json`: serialized takeaways array
   - `suggested_activity_json`: serialized `SuggestedActivity`
   - `status`: first lesson `"unlocked"`, rest `"locked"`

3. **AgentLog** records (one per agent run):
   - Created by the logging wrapper during graph execution
   - Linked to `course_instance_id` and (where applicable) `lesson_id`

```python
# src/deps.py (persistence method on PipelineDeps)

async def persist_course(
    self,
    course_name: str,
    description: str,
    learning_objectives: list[str],
    generated_lessons: list[GeneratedLesson],
) -> CourseInstance:
    """Persist a generated course and its lessons to the database."""
    async with self.db_session() as session:
        course = CourseInstance(
            user_id=self.user_id,
            source_type="user_created",
            input_description=description,
            input_objectives=learning_objectives,
            generated_course_description=description,
            course_name=course_name,
            status="active",
        )
        session.add(course)
        await session.flush()  # get course.id

        for i, gl in enumerate(generated_lessons):
            lesson = Lesson(
                course_instance_id=course.id,
                objective_index=i,
                lesson_plan_json=gl.plan.model_dump_json() if gl.plan else None,
                lesson_content=gl.content.lesson_body if gl.content else None,
                lesson_title=gl.content.lesson_title if gl.content else None,
                key_takeaways_json=(
                    [t for t in gl.content.key_takeaways] if gl.content else None
                ),
                suggested_activity_json=(
                    gl.content.suggested_activity.model_dump_json()
                    if gl.content
                    else None
                ),
                status="unlocked" if i == 0 else "locked",
            )
            session.add(lesson)

        await session.commit()
        await session.refresh(course)
        return course
```

---

## Acceptance Criteria

### Functional

| # | Criterion | Verification Method |
|---|-----------|-------------------|
| AC-1 | `POST /api/courses/generate` with valid input returns 200 and a complete course | Integration test |
| AC-2 | Course contains exactly N lessons where N = number of input objectives | Integration test |
| AC-3 | Each lesson has a non-empty title, body, key takeaways, and suggested activity | Integration test |
| AC-4 | `course_describer` output has a 60-140 word description | Unit test + output validator |
| AC-5 | `lesson_planner` output has 2-4 essential questions, 3-6 rubric checks, 3-6 activities | Unit test + output validator |
| AC-6 | Every activity in the lesson plan aligns to at least one successEvidence and one rubricCheck | Output validator |
| AC-7 | `lesson_writer` output has all 5 required sections in the lesson body | Output validator |
| AC-8 | `lesson_writer` output has 3-6 key takeaways | Unit test + output validator |
| AC-9 | CourseInstance and Lesson rows are created in the database after generation | Integration test |
| AC-10 | First lesson is `unlocked`, remaining lessons are `locked` | Integration test |
| AC-11 | AgentLog records exist for every agent run (3 per objective) | Integration test |
| AC-12 | Invalid input (empty objectives) returns 422 | Integration test |
| AC-13 | Agent failure after retries returns structured 500 error with agent name and log ID | Integration test |

### Non-Functional

| # | Criterion | Verification Method |
|---|-----------|-------------------|
| NF-1 | Each agent uses `output_retries=2` for automatic retry on validation failure | Code review |
| NF-2 | Agent logs capture prompt, output, timing, tokens, model name, status | Integration test |
| NF-3 | All Pydantic models use `Field` with descriptions and constraints | Code review |
| NF-4 | Graph execution is deterministic: same inputs produce same node sequence | Graph integration test |

---

## Verification

### Unit Tests -- Agent I/O Models

```python
# tests/unit/models/test_course_description.py
import pytest
from src.models.course_description import CourseDescriptionOutput


def test_valid_course_description():
    """Valid output passes schema validation."""
    output = CourseDescriptionOutput(
        focused_objective="Understand variables, data types, and basic operators",
        course_description=" ".join(["word"] * 80),  # 80 words
        personalization_rationale=[
            "Adapted examples to software development context based on stated interests",
            "Used beginner-friendly language based on novice experience level",
            "Included hands-on coding exercises based on preferred learning style",
        ],
    )
    assert output.focused_objective == "Understand variables, data types, and basic operators"


def test_rejects_too_few_rationale_items():
    """Rejects personalization_rationale with < 2 items."""
    with pytest.raises(ValueError, match="at least 2"):
        CourseDescriptionOutput(
            focused_objective="test",
            course_description=" ".join(["word"] * 80),
            personalization_rationale=["only one"],
        )


def test_rejects_too_many_rationale_items():
    """Rejects personalization_rationale with > 5 items."""
    with pytest.raises(ValueError, match="at most 5"):
        CourseDescriptionOutput(
            focused_objective="test",
            course_description=" ".join(["word"] * 80),
            personalization_rationale=["a", "b", "c", "d", "e", "f"],
        )
```

```python
# tests/unit/models/test_lesson_plan.py
import pytest
from src.models.lesson_plan import LessonPlanOutput, LearningObjective, ...
from src.models.enums import SubmissionType, BloomsLevel, ActivityType


def test_valid_lesson_plan():
    """A fully valid lesson plan passes all validation."""
    plan = build_valid_lesson_plan()  # factory helper
    assert len(plan.essential_questions) >= 2
    assert len(plan.mastery_criteria.rubric_checks) >= 3
    assert len(plan.activities) >= 3


def test_rejects_too_few_essential_questions():
    """Rejects essential_questions with < 2 items."""
    with pytest.raises(ValueError, match="2-4"):
        LessonPlanOutput(
            ...,
            essential_questions=["only one"],
            ...
        )


def test_rejects_too_many_activities():
    """Rejects activities with > 6 items."""
    with pytest.raises(ValueError, match="3-6"):
        LessonPlanOutput(
            ...,
            activities=[build_activity() for _ in range(7)],
            ...
        )


def test_rejects_invalid_blooms_level():
    """Rejects invalid bloomsLevel enum value."""
    with pytest.raises(ValueError):
        AssessmentProject(
            ...,
            blooms_level="memorize",  # not a valid enum value
            ...
        )


def test_rejects_webb_dok_out_of_range():
    """Rejects webbDOK outside 1-4."""
    with pytest.raises(ValueError):
        AssessmentProject(
            ...,
            webb_dok=5,
            ...
        )
```

```python
# tests/unit/models/test_lesson_content.py
import pytest
from src.models.lesson_content import LessonContentOutput, SuggestedActivity
from src.models.enums import SubmissionType


def test_valid_lesson_content():
    """Valid lesson content passes schema validation."""
    output = LessonContentOutput(
        lesson_title="Variables and Data Types",
        lesson_body="## Objective\n...\n## Why it matters\n...\n## Steps\n...\n## Example\n...\n## Recap\n..." + " word" * 200,
        key_takeaways=["takeaway 1", "takeaway 2", "takeaway 3"],
        suggested_activity=SuggestedActivity(
            type=SubmissionType.SHORT_RESPONSE,
            prompt="Write a script that demonstrates..." + " " * 20,
            expected_evidence=["evidence 1", "evidence 2"],
        ),
    )
    assert output.lesson_title == "Variables and Data Types"


def test_rejects_too_few_key_takeaways():
    """Rejects key_takeaways with < 3 items."""
    with pytest.raises(ValueError, match="3-6"):
        LessonContentOutput(
            ...,
            key_takeaways=["only one", "only two"],
            ...
        )


def test_rejects_invalid_submission_type():
    """Rejects invalid submission type in suggested activity."""
    with pytest.raises(ValueError):
        SuggestedActivity(
            type="invalid_type",
            prompt="x" * 20,
            expected_evidence=["a", "b"],
        )
```

### Unit Tests -- Output Validators

```python
# tests/unit/validators/test_course_describer_validator.py
import pytest
from pydantic_ai import ModelRetry
from unittest.mock import AsyncMock, MagicMock

from src.agents.course_describer import validate_course_description
from src.models.course_description import CourseDescriptionOutput


@pytest.fixture
def mock_ctx():
    ctx = MagicMock()
    ctx.deps = MagicMock()
    return ctx


@pytest.mark.asyncio
async def test_rejects_description_under_60_words(mock_ctx):
    """ModelRetry raised for description under 60 words."""
    output = CourseDescriptionOutput(
        focused_objective="test objective",
        course_description=" ".join(["word"] * 50),  # 50 words
        personalization_rationale=["reason 1", "reason 2"],
    )
    with pytest.raises(ModelRetry, match="between 60 and 140 words"):
        await validate_course_description(mock_ctx, output)


@pytest.mark.asyncio
async def test_rejects_description_over_140_words(mock_ctx):
    """ModelRetry raised for description over 140 words."""
    output = CourseDescriptionOutput(
        focused_objective="test objective",
        course_description=" ".join(["word"] * 150),  # 150 words
        personalization_rationale=["reason 1", "reason 2"],
    )
    with pytest.raises(ModelRetry, match="between 60 and 140 words"):
        await validate_course_description(mock_ctx, output)


@pytest.mark.asyncio
async def test_accepts_valid_description(mock_ctx):
    """Valid description within word count bounds passes."""
    output = CourseDescriptionOutput(
        focused_objective="test objective",
        course_description=" ".join(["word"] * 100),  # 100 words
        personalization_rationale=["reason 1", "reason 2", "reason 3"],
    )
    result = await validate_course_description(mock_ctx, output)
    assert result == output
```

```python
# tests/unit/validators/test_lesson_planner_validator.py
import pytest
from pydantic_ai import ModelRetry
from src.agents.lesson_planner import validate_lesson_plan


@pytest.mark.asyncio
async def test_rejects_empty_activity_alignment(mock_ctx):
    """ModelRetry raised when any activity has empty alignment arrays."""
    plan = build_valid_lesson_plan()
    plan.activities[0].alignment.objective_evidence = []
    with pytest.raises(ModelRetry, match="empty alignment.objective_evidence"):
        await validate_lesson_plan(mock_ctx, plan)


@pytest.mark.asyncio
async def test_rejects_mismatched_rubric_check_alignment(mock_ctx):
    """ModelRetry raised when activity alignment references non-existent rubric check."""
    plan = build_valid_lesson_plan()
    plan.activities[0].alignment.rubric_checks = ["non-existent check"]
    with pytest.raises(ModelRetry, match="does not match any masteryCriteria.rubricChecks"):
        await validate_lesson_plan(mock_ctx, plan)


@pytest.mark.asyncio
async def test_rejects_verb_not_in_statement(mock_ctx):
    """ModelRetry raised when measurableVerb doesn't appear in statement."""
    plan = build_valid_lesson_plan()
    plan.learning_objective.measurable_verb = "synthesize"
    plan.learning_objective.statement = "I can explain variables and data types"
    with pytest.raises(ModelRetry, match="does not appear in learningObjective.statement"):
        await validate_lesson_plan(mock_ctx, plan)
```

```python
# tests/unit/validators/test_lesson_writer_validator.py
import pytest
from pydantic_ai import ModelRetry
from src.agents.lesson_writer import validate_lesson_content


@pytest.mark.asyncio
async def test_rejects_missing_required_sections(mock_ctx):
    """ModelRetry raised when lesson body is missing required sections."""
    output = build_valid_lesson_content()
    output.lesson_body = "Some content without proper headings and just text"
    with pytest.raises(ModelRetry, match="missing required section"):
        await validate_lesson_content(mock_ctx, output)


@pytest.mark.asyncio
async def test_rejects_short_lesson_body(mock_ctx):
    """ModelRetry raised when lesson body is under 200 words."""
    output = build_valid_lesson_content()
    output.lesson_body = "## Objective\nShort.\n## Why it matters\nBrief.\n## Steps\nDo.\n## Example\nHere.\n## Recap\nDone."
    with pytest.raises(ModelRetry, match="at least 200 words"):
        await validate_lesson_content(mock_ctx, output)
```

### Unit Tests -- Agents with TestModel

```python
# tests/unit/agents/test_course_describer.py
import pytest
from pydantic_ai import models
from pydantic_ai.models.test import TestModel

from src.agents.course_describer import course_describer
from src.deps import PipelineDeps

# Block real API calls
models.ALLOW_MODEL_REQUESTS = False


@pytest.mark.asyncio
async def test_course_describer_produces_valid_output(mock_deps):
    """course_describer with TestModel produces valid CourseDescriptionOutput."""
    with course_describer.override(
        model=TestModel(
            custom_output_args={
                "focused_objective": "Understand variables and data types",
                "course_description": " ".join(["word"] * 80),
                "personalization_rationale": [
                    "Adapted for beginner experience level",
                    "Used practical coding examples",
                    "Focused on hands-on learning style",
                ],
            }
        ),
        deps=mock_deps,
    ):
        result = await course_describer.run(
            "Create a focused course description for Python basics"
        )
        assert result.output.focused_objective == "Understand variables and data types"
        assert len(result.output.personalization_rationale) == 3


@pytest.mark.asyncio
async def test_course_describer_accesses_deps(mock_deps):
    """course_describer correctly accesses ctx.deps."""
    with course_describer.override(
        model=TestModel(),
        deps=mock_deps,
    ):
        result = await course_describer.run("test")
        # If we get here without error, deps injection worked
        assert result.output is not None
```

```python
# tests/unit/agents/test_lesson_planner.py
import pytest
from pydantic_ai import models
from pydantic_ai.models.test import TestModel

from src.agents.lesson_planner import lesson_planner

models.ALLOW_MODEL_REQUESTS = False


@pytest.mark.asyncio
async def test_lesson_planner_produces_valid_output(mock_deps):
    """lesson_planner with TestModel produces valid LessonPlanOutput."""
    with lesson_planner.override(model=TestModel(), deps=mock_deps):
        result = await lesson_planner.run("Create a lesson plan for variables")
        assert result.output is not None
        assert len(result.output.essential_questions) >= 2
        assert len(result.output.activities) >= 3


@pytest.mark.asyncio
async def test_lesson_planner_retry_on_invalid_output(mock_deps):
    """lesson_planner retries when output_validator raises ModelRetry."""
    # TestModel with intentionally too few activities would trigger retry
    # The TestModel auto-generates valid output, so we use FunctionModel
    # to test retry behavior
    from pydantic_ai.models.function import FunctionModel
    call_count = 0

    def mock_fn(messages, info):
        nonlocal call_count
        call_count += 1
        # Return valid output on second call
        if call_count == 1:
            # Return output with too few activities (triggers validator)
            return build_minimal_plan_with_2_activities()
        return build_valid_plan()

    with lesson_planner.override(model=FunctionModel(mock_fn), deps=mock_deps):
        result = await lesson_planner.run("test")
        assert call_count >= 2  # Retry occurred
```

### Integration Tests -- Graph Orchestration

```python
# tests/integration/graph/test_course_generation.py
import pytest
from pydantic_ai import models
from pydantic_ai.models.test import TestModel

from src.graph.course_generation import (
    course_generation_graph,
    InitCourseNode,
    CourseGenerationState,
)
from src.agents.course_describer import course_describer
from src.agents.lesson_planner import lesson_planner
from src.agents.lesson_writer import lesson_writer

models.ALLOW_MODEL_REQUESTS = False


@pytest.mark.asyncio
async def test_graph_node_sequence(mock_deps):
    """Graph executes nodes in correct sequence: Init -> Describe -> Plan -> Write -> End."""
    state = CourseGenerationState(
        course_name="Test Course",
        base_description="A test course",
        learning_objectives=["Objective 1"],
    )

    with (
        course_describer.override(model=TestModel(), deps=mock_deps),
        lesson_planner.override(model=TestModel(), deps=mock_deps),
        lesson_writer.override(model=TestModel(), deps=mock_deps),
    ):
        async with course_generation_graph.iter(
            InitCourseNode(), state=state, deps=mock_deps
        ) as graph_run:
            node_sequence = []
            async for node in graph_run:
                node_sequence.append(type(node).__name__)

    assert node_sequence == [
        "InitCourseNode",
        "DescribeCourseNode",
        "PlanLessonNode",
        "WriteLessonNode",
    ]


@pytest.mark.asyncio
async def test_graph_processes_multiple_objectives(mock_deps):
    """Graph loops through all objectives: Describe->Plan->Write per objective."""
    state = CourseGenerationState(
        course_name="Test Course",
        base_description="A test course",
        learning_objectives=["Objective 1", "Objective 2", "Objective 3"],
    )

    with (
        course_describer.override(model=TestModel(), deps=mock_deps),
        lesson_planner.override(model=TestModel(), deps=mock_deps),
        lesson_writer.override(model=TestModel(), deps=mock_deps),
    ):
        async with course_generation_graph.iter(
            InitCourseNode(), state=state, deps=mock_deps
        ) as graph_run:
            node_sequence = []
            async for node in graph_run:
                node_sequence.append(type(node).__name__)

    # Init + 3x (Describe, Plan, Write)
    assert node_sequence == [
        "InitCourseNode",
        "DescribeCourseNode", "PlanLessonNode", "WriteLessonNode",
        "DescribeCourseNode", "PlanLessonNode", "WriteLessonNode",
        "DescribeCourseNode", "PlanLessonNode", "WriteLessonNode",
    ]


@pytest.mark.asyncio
async def test_graph_state_mutation(mock_deps):
    """State is correctly mutated at each step."""
    state = CourseGenerationState(
        course_name="Test Course",
        base_description="A test course",
        learning_objectives=["Objective 1"],
    )

    with (
        course_describer.override(model=TestModel(), deps=mock_deps),
        lesson_planner.override(model=TestModel(), deps=mock_deps),
        lesson_writer.override(model=TestModel(), deps=mock_deps),
    ):
        result = await course_generation_graph.run(
            InitCourseNode(), state=state, deps=mock_deps
        )

    generated = result.output
    assert len(generated) == 1
    assert generated[0].description is not None
    assert generated[0].plan is not None
    assert generated[0].content is not None
```

### Integration Tests -- API Endpoint

```python
# tests/integration/api/test_courses.py
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_generate_course_valid_input(test_client: AsyncClient, mock_agents):
    """POST /api/courses/generate with valid input returns 200."""
    response = await test_client.post(
        "/api/courses/generate",
        json={
            "course_name": "Python Basics",
            "description": "Learn Python fundamentals",
            "learning_objectives": [
                "Understand variables and data types",
                "Write basic functions",
            ],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["course_name"] == "Python Basics"
    assert len(data["lessons"]) == 2
    assert data["status"] == "active"


@pytest.mark.asyncio
async def test_generate_course_empty_objectives(test_client: AsyncClient):
    """POST /api/courses/generate with empty objectives returns 422."""
    response = await test_client.post(
        "/api/courses/generate",
        json={
            "course_name": "Test",
            "description": "Test description",
            "learning_objectives": [],
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_generate_course_persists_to_db(
    test_client: AsyncClient, mock_agents, db_session
):
    """Generated course is persisted to the database."""
    response = await test_client.post(
        "/api/courses/generate",
        json={
            "course_name": "Python Basics",
            "description": "Learn Python",
            "learning_objectives": ["Understand variables"],
        },
    )
    assert response.status_code == 200
    course_id = response.json()["course_instance_id"]

    # Verify CourseInstance exists
    course = await db_session.get(CourseInstance, course_id)
    assert course is not None
    assert course.course_name == "Python Basics"
    assert course.status == "active"

    # Verify Lesson exists
    lessons = await db_session.execute(
        select(Lesson).where(Lesson.course_instance_id == course_id)
    )
    lesson_list = lessons.scalars().all()
    assert len(lesson_list) == 1
    assert lesson_list[0].status == "unlocked"


@pytest.mark.asyncio
async def test_generate_course_first_lesson_unlocked(
    test_client: AsyncClient, mock_agents, db_session
):
    """First lesson is unlocked, rest are locked."""
    response = await test_client.post(
        "/api/courses/generate",
        json={
            "course_name": "Test",
            "description": "Test",
            "learning_objectives": ["Obj 1", "Obj 2", "Obj 3"],
        },
    )
    course_id = response.json()["course_instance_id"]

    lessons = await db_session.execute(
        select(Lesson)
        .where(Lesson.course_instance_id == course_id)
        .order_by(Lesson.objective_index)
    )
    lesson_list = lessons.scalars().all()

    assert lesson_list[0].status == "unlocked"
    assert lesson_list[1].status == "locked"
    assert lesson_list[2].status == "locked"
```

### E2E Tests -- Live LLM

```python
# tests/e2e/api/test_course_generation_live.py
"""
E2E tests using live LLM. These are slow and expensive.
Run with: pytest tests/e2e/ -m "live_llm" --timeout=300
"""
import pytest
from httpx import AsyncClient

pytestmark = [pytest.mark.live_llm, pytest.mark.slow]


@pytest.mark.asyncio
async def test_generate_python_course_live(live_client: AsyncClient):
    """Generate a real course and validate all outputs."""
    response = await live_client.post(
        "/api/courses/generate",
        json={
            "course_name": "Introduction to Python Programming",
            "description": "A beginner-friendly course for aspiring developers.",
            "learning_objectives": [
                "Understand variables, data types, and basic operators",
                "Write functions with parameters and return values",
                "Use control flow statements",
            ],
        },
    )
    assert response.status_code == 200
    data = response.json()

    # Validate structure
    assert len(data["lessons"]) == 3
    assert data["status"] == "active"

    # Validate each lesson
    for lesson in data["lessons"]:
        assert len(lesson["lesson_title"]) > 0
        assert len(lesson["lesson_body"]) > 200
        assert len(lesson["key_takeaways"]) >= 3
        assert len(lesson["key_takeaways"]) <= 6
        assert lesson["suggested_activity_type"] in [
            "short_response", "image_upload", "either"
        ]
        assert len(lesson["suggested_activity_prompt"]) > 20

    # Validate course description word count
    description_words = len(data["course_description"].split())
    assert 60 <= description_words <= 140, (
        f"Course description is {description_words} words, expected 60-140"
    )
```

### Evaluation Suite (pydantic_evals)

```python
# tests/evals/agents/test_course_describer_eval.py
"""
Evaluation suite for course_describer using pydantic_evals.
Run with: pytest tests/evals/ -m "evals" --timeout=600
"""
import pytest
from pydantic_evals import Dataset, Case
from pydantic_evals.evaluators import Contains, IsInstance, LLMJudge

pytestmark = [pytest.mark.evals, pytest.mark.slow]

COURSE_TOPICS = [
    {
        "name": "Introduction to Python Programming",
        "description": "A beginner-friendly course for aspiring developers.",
        "objectives": [
            "Understand variables, data types, and basic operators",
            "Write functions with parameters and return values",
            "Use control flow statements",
        ],
    },
    {
        "name": "Home Cooking Fundamentals",
        "description": "Learn to cook delicious, healthy meals at home.",
        "objectives": [
            "Master basic knife skills and kitchen safety",
            "Understand flavor profiles and seasoning techniques",
            "Plan and execute a complete meal from scratch",
        ],
    },
    {
        "name": "Digital Photography Basics",
        "description": "Master the fundamentals of digital photography.",
        "objectives": [
            "Understand exposure triangle (aperture, shutter speed, ISO)",
            "Apply composition rules to create compelling images",
            "Edit photos using basic post-processing techniques",
        ],
    },
    {
        "name": "Project Management Essentials",
        "description": "Learn core project management skills for any industry.",
        "objectives": [
            "Define project scope and create a work breakdown structure",
            "Manage timelines using Gantt charts and critical path analysis",
            "Lead effective stakeholder communication and status reporting",
        ],
    },
    {
        "name": "Music Theory for Beginners",
        "description": "Understand the building blocks of music.",
        "objectives": [
            "Read musical notation and identify notes on the staff",
            "Understand scales, intervals, and chord construction",
            "Analyze simple song structures and harmonic progressions",
        ],
    },
]


async def run_course_describer(inputs: dict) -> dict:
    """Task function for pydantic_evals evaluation."""
    from src.agents.course_describer import course_describer
    prompt = (
        f"Create a focused course description for:\n"
        f"Course Name: {inputs['name']}\n"
        f"Description: {inputs['description']}\n"
        f"Objectives: {', '.join(inputs['objectives'])}\n"
        f"Selected Objective: {inputs['selected_objective']}\n"
    )
    result = await course_describer.run(prompt, deps=inputs.get("deps"))
    return result.output.model_dump()


dataset = Dataset(
    cases=[
        Case(
            name=f"{topic['name']}_obj_{i}",
            inputs={
                **topic,
                "selected_objective": obj,
            },
            evaluators=[
                IsInstance(type_name="dict"),
                Contains(
                    value=obj[:30],  # Check focused objective contains start of input
                    path="$.focused_objective",
                ),
                LLMJudge(
                    rubric=(
                        "The course description centers on the focused objective "
                        "and mentions a concrete outcome the learner will achieve. "
                        "It includes a learning arc (start/middle/end progression). "
                        "It does not contain generic filler."
                    ),
                ),
            ],
        )
        for topic in COURSE_TOPICS
        for i, obj in enumerate([topic["objectives"][0]])  # Test first objective per topic
    ]
)


@pytest.mark.asyncio
async def test_course_describer_eval_suite():
    """Run the full evaluation suite for course_describer."""
    report = await dataset.evaluate(run_course_describer)
    print(report.summary())
    assert report.pass_rate >= 0.8, f"Pass rate {report.pass_rate} < 0.8"
```

```python
# tests/evals/agents/test_lesson_planner_eval.py
"""Evaluation suite for lesson_planner."""
from pydantic_evals import Dataset, Case
from pydantic_evals.evaluators import IsInstance, LLMJudge


class ActivityRubricTraceability:
    """Custom evaluator: every activity aligns to successEvidence and rubricChecks."""

    def evaluate(self, output: dict) -> bool:
        success_evidence = set(
            output["learning_objective"]["success_evidence"]
        )
        rubric_checks = set(
            output["mastery_criteria"]["rubric_checks"]
        )

        for activity in output["activities"]:
            alignment = activity["alignment"]
            if not alignment["objective_evidence"]:
                return False
            if not alignment["rubric_checks"]:
                return False
            # Check references exist
            for ev in alignment["objective_evidence"]:
                if ev not in success_evidence:
                    return False
            for rc in alignment["rubric_checks"]:
                if rc not in rubric_checks:
                    return False
        return True


# Dataset defined similarly to course_describer, with evaluators:
# - IsInstance for output type
# - ActivityRubricTraceability custom evaluator
# - LLMJudge for "plan is detailed enough that a lesson writer can produce
#   the lesson without inventing missing details"
```

```python
# tests/evals/agents/test_lesson_writer_eval.py
"""Evaluation suite for lesson_writer."""
from pydantic_evals.evaluators import LLMJudge

# Key evaluator:
LLMJudge(
    rubric=(
        "The lesson has a clear learning arc with: "
        "1) A stated objective, "
        "2) Explanation of why it matters, "
        "3) Step-by-step instructional content, "
        "4) At least one worked example with concrete details, "
        "5) A recap or check-for-understanding section. "
        "The lesson is engaging and does not read like a template."
    ),
)
```

### ADW Test (`02_course_creation.py`)

#### ADW Implementation Pattern

ADW tests are **single-file `uv` scripts** using [PEP 723 inline script metadata](https://peps.python.org/pep-0723/). Each test is a self-contained `.py` file that can be run directly with `uv run`:

```bash
# Run a single ADW test
uv run tests/adw/02_course_creation.py

# Run all ADW tests
uv run tests/adw/run_all.py
```

**Script structure** — every ADW test follows this pattern:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""ADW Test: Course Creation and Lesson Display — verify end-to-end course generation flow."""

import json
import shutil
import subprocess
import sys
from pathlib import Path

PROMPT = """\
# ADW Test: Course Creation and Lesson Display

You are a QA tester for the 1111 School learning platform.
The app is running at http://localhost:5173 and the backend at http://localhost:8000.
Use agent-browser to automate the browser.

## Test: Course Creation Flow

### Setup
1. `agent-browser open http://localhost:5173`
2. `agent-browser snapshot -i` to see what's available

### Execute
3. Find the course description input and fill it with "Introduction to Python Programming"
4. Add 3 learning objectives:
   - "Understand variables, data types, and basic operators"
   - "Write functions with parameters and return values"
   - "Use control flow statements (if/elif/else, for, while)"
5. Click the Generate Course button
6. Wait for generation to complete:
   - Use `agent-browser snapshot -i` periodically (every 10 seconds)
   - Watch for lesson content or lesson titles to appear
   - Use `agent-browser wait --text "Lesson" --timeout 120000` if available
7. Take a snapshot of the generated course

### Verify (report pass/fail for each)
- [ ] At least 3 lessons were generated (check the left nav or lesson list)
- [ ] Each lesson has a visible title
- [ ] The first lesson is accessible/unlocked (clickable, not grayed out)
- [ ] Lessons 2+ show a locked indicator (if applicable at this stage)
- [ ] Click first lesson — verify lesson content contains structured sections
      (look for headings like "Objective", "Why it matters", "Example", "Recap")
- [ ] An activity section is visible for the first lesson
- [ ] Take an annotated screenshot: `agent-browser screenshot --annotate ./test-results/course-creation.png`

### Save baseline
- `agent-browser snapshot > ./test-results/baselines/course-created.txt`

### Output
Output a JSON object:
{
  "test": "course_creation",
  "passed": true/false,
  "checks": [
    {"name": "3+ lessons generated", "passed": true/false, "notes": "..."},
    {"name": "lesson titles visible", "passed": true/false, "notes": "..."},
    {"name": "first lesson unlocked", "passed": true/false, "notes": "..."},
    {"name": "locked indicators present", "passed": true/false, "notes": "..."},
    {"name": "structured sections in lesson", "passed": true/false, "notes": "..."},
    {"name": "activity section visible", "passed": true/false, "notes": "..."}
  ],
  "notes": "Overall observations..."
}
"""

def main() -> int:
    # 1. Preflight checks
    if not shutil.which("claude"):
        print("SKIP: 'claude' CLI not found on PATH. Install Claude Code to run ADW tests.")
        return 0  # Skip, don't fail

    if not shutil.which("agent-browser"):
        print("SKIP: 'agent-browser' not found. Run: npm install -g agent-browser && agent-browser install")
        return 0

    # 2. Ensure results directory exists
    results_dir = Path(__file__).parent / "results"
    results_dir.mkdir(exist_ok=True)

    # 3. Run Claude Code in headless mode
    print(f"Running ADW test: {Path(__file__).stem}")
    result = subprocess.run(
        [
            "claude", "-p", PROMPT,
            "--output-format", "json",
            "--allowedTools", "Bash,Read",
            "--max-turns", "25",
            "--model", "claude-sonnet-4-6",
        ],
        capture_output=True,
        text=True,
        cwd=str(Path(__file__).resolve().parents[2]),  # project root
        timeout=300,  # 5 minute timeout
    )

    if result.returncode != 0:
        print(f"FAIL: claude exited with code {result.returncode}")
        print(result.stderr)
        return 1

    # 4. Parse and save results
    try:
        output = json.loads(result.stdout)
    except json.JSONDecodeError:
        print(f"FAIL: Could not parse claude output as JSON")
        print(result.stdout[:500])
        return 1

    result_file = results_dir / f"{Path(__file__).stem}.json"
    result_file.write_text(json.dumps(output, indent=2))
    print(f"Results saved to {result_file}")

    # 5. Report
    # The actual test result is in the agent's response — extract and report
    agent_result = output.get("result", "")
    print(f"\nAgent response:\n{agent_result[:1000]}")

    return 0

if __name__ == "__main__":
    sys.exit(main())
```

**Orchestrator** — `tests/adw/run_all.py` runs all ADW tests in sequence:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Run all ADW tests in order."""

import subprocess
import sys
from pathlib import Path

def main() -> int:
    tests_dir = Path(__file__).parent
    test_files = sorted(tests_dir.glob("[0-9]*.py"))

    results = []
    for test_file in test_files:
        print(f"\n{'='*60}")
        print(f"Running: {test_file.name}")
        print(f"{'='*60}")
        ret = subprocess.run([sys.executable, str(test_file)]).returncode
        results.append((test_file.name, ret))

    print(f"\n{'='*60}")
    print("ADW Test Summary")
    print(f"{'='*60}")
    for name, ret in results:
        status = "PASS" if ret == 0 else "FAIL"
        print(f"  {status}: {name}")

    passed = sum(1 for _, r in results if r == 0)
    print(f"\n{passed}/{len(results)} passed")
    return 0 if all(r == 0 for _, r in results) else 1

if __name__ == "__main__":
    sys.exit(main())
```

---

## Definition of Done

PRD 2 is complete when:

1. **All three agents** (`course_describer`, `lesson_planner`, `lesson_writer`) are implemented with `output_type`, `@output_validator`, and `output_retries`.

2. **All Pydantic models** (`CourseDescriptionOutput`, `LessonPlanOutput`, `LessonContentOutput` and all nested models) are defined with complete `Field` descriptions, type constraints, and `field_validator`s.

3. **The `pydantic_graph` orchestration** processes N objectives through the full Describe -> Plan -> Write cycle and returns N `GeneratedLesson` objects.

4. **`POST /api/courses/generate`** accepts a course name, description, and objectives; returns a complete course with all lessons.

5. **Database persistence** creates CourseInstance and Lesson records with correct statuses (first lesson unlocked, rest locked).

6. **Agent logs** are recorded for every agent run with prompt, output, timing, tokens, model name, and status.

7. **Error handling** returns structured 500 errors when agents fail after retries, including agent name and log ID.

8. **Unit tests pass**: I/O model validation, output validator business rules, agents with TestModel.

9. **Integration tests pass**: graph node sequence verification, state mutation, API endpoint with mocked agents, DB persistence.

10. **E2E tests pass**: at least one live LLM generation of a 3-objective course with all validation checks.

11. **Evaluation suite** runs against 5 course topics with per-agent evaluators (Contains, LLMJudge, custom traceability) and achieves >= 80% pass rate.

12. **ADW test** (`02_course_creation.md`) passes: agent-browser creates a course and verifies lessons are visible with structured content.
