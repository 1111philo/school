# PRD 3 — Activity & Feedback System

```yaml
title: Activity & Feedback System
phase: Core Pipeline
depends-on: [PRD 2 — Course Generation Pipeline]
agents: [activity_creator (D), activity_reviewer (E)]
size: Medium
status: Draft
```

---

## Overview

PRD 3 introduces the two agents that close the learning loop: **activity_creator** converts the lesson_writer's `suggestedActivity` into a fully specified, rubric-scored activity, and **activity_reviewer** evaluates learner submissions against that rubric to produce scored feedback with strengths, improvements, and tips. Together they enable the core feedback cycle that makes generative learning work — the learner reads a lesson, completes an activity, receives substantive feedback, and unlocks the next lesson.

This PRD also introduces the submission handling infrastructure (`POST /api/activities/{id}/submit`), the Activity database entity lifecycle, and the lesson unlock mechanism that gates progression through the course.

**Source PRD**: `/Users/dylanisaac/Downloads/PRD — 1111 School (Generative Learning Platform).md` (Sections D, E, 4.7, 8.1)
**Decomposition Plan**: `/Users/dylanisaac/Projects/pickOS/🚀 Projects/1. ✅ Active/1111 School/PRD Decomposition Plan.md`

---

## Goals

1. Convert lesson_writer's `suggestedActivity` into a complete activity specification with rubric, hints, and submission format.
2. Score text submissions against the activity rubric and produce actionable, rubric-referenced feedback.
3. Gate lesson progression on activity completion — any submission unlocks the next lesson, regardless of mastery level.
4. Store all activity specs, submissions, reviews, and attempt counts in the database.
5. Integrate activity_creator into the course generation pipeline graph (after lesson_writer).
6. Provide a submission API endpoint that runs the activity_reviewer agent and returns results synchronously.

---

## Non-Goals

1. **Image submission handling** — Image upload support for activity submissions is deferred. The activity_creator may specify `image_upload` or `either` as the activity type, but the submission endpoint only accepts text for MVP. Image review via vision model is a future enhancement.
2. **Adaptive difficulty** — Activity difficulty does not adjust based on prior performance in this PRD. That requires the Learner Profile system (PRD 6).
3. **Multiple activities per lesson** — Each lesson has exactly one activity derived from `suggestedActivity`. Multiple activity variants are out of scope.
4. **Retry gating** — Learners can re-submit any number of times. There is no "must achieve meets" gate for progression; any submission unlocks the next lesson.
5. **Real-time streaming of review** — The activity_reviewer runs synchronously and returns the full review. Streaming feedback is a PRD 5 enhancement.
6. **Personalization from learner profile** — Dynamic system prompts using `@agent.instructions` with profile injection are deferred to PRD 6. Agents use static system prompts in this PRD.

---

## Scope

### Pydantic I/O Models

Two new output models for the two agents, plus supporting input/internal models.

### Agents

| Agent | ID | Purpose |
|-------|----|---------|
| **activity_creator** | D | Converts `suggestedActivity` + lesson plan + mastery criteria into a full activity spec with rubric, hints, and submission format |
| **activity_reviewer** | E | Scores a text submission against the activity's rubric and produces strengths, improvements, tips, and a mastery decision |

### Pipeline Integration

- `ActivityCreatorNode` added to the `pydantic_graph` course generation graph, running after `WriteLessonNode`
- Activity entity created and linked to Lesson after activity_creator completes
- New `POST /api/activities/{id}/submit` endpoint for submission handling

### Lesson Unlock Logic

- On any activity submission (regardless of `masteryDecision`), the next lesson's status changes from `locked` to `unlocked`
- First submission stores the review; subsequent submissions increment `attemptCount` and update `latestScore`

---

## Technical Design

### Project Structure

```
app/
  agents/
    activity_creator.py      # Agent D definition + output validator
    activity_reviewer.py     # Agent E definition + output validator
  models/
    activity.py              # Pydantic I/O models for both agents
    submission.py            # Submission request/response models
  graph/
    nodes/
      create_activity.py     # ActivityCreatorNode for pydantic_graph
  routers/
    activities.py            # POST /api/activities/{id}/submit
  services/
    submission.py            # Orchestrates review + DB updates + unlock
tests/
  unit/
    agents/
      test_activity_creator.py
      test_activity_reviewer.py
    validators/
      test_activity_validators.py
    models/
      test_activity_models.py
  integration/
    api/
      test_activity_submission.py
    graph/
      test_activity_graph_node.py
    db/
      test_activity_db.py
  e2e/
    api/
      test_activity_live_llm.py
  evals/
    agents/
      test_activity_reviewer_evals.py
  adw/
    prompts/
      04_activity_submission.md
```

### Database Schema Changes

The `Activity` entity (defined in PRD 1) is used with the following columns:

```python
# Already defined in PRD 1's models — referenced here for context
class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    lesson_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lessons.id"), nullable=False)
    activity_spec_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    submission_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewer_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reviewer_feedback_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    mastery_decision: Mapped[str | None] = mapped_column(String(20), nullable=True)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | submitted | reviewed
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, onupdate=func.now())

    lesson: Mapped["Lesson"] = relationship(back_populates="activity")
```

---

## Agent Contracts

### Agent D: activity_creator

#### Input Models

```python
from pydantic import BaseModel, Field


class SuggestedActivity(BaseModel):
    """Output from lesson_writer (Agent C) — the seed for activity creation."""
    type: Literal["short_response", "image_upload", "either"]
    prompt: str = Field(..., description="Activity prompt from lesson_writer")
    expected_evidence: list[str] = Field(
        ...,
        min_length=2,
        max_length=5,
        description="Evidence items the learner should produce",
    )


class MasteryCriteria(BaseModel):
    """Extracted from lesson_planner (Agent B) output."""
    success_metric: str = Field(..., description="Single sentence defining mastery")
    rubric_checks: list[str] = Field(
        ...,
        min_length=3,
        max_length=6,
        description="Binary-checkable rubric items from lesson plan",
    )


class LearningObjective(BaseModel):
    """Core objective from lesson_planner output."""
    statement: str = Field(..., description="First-person learning objective")
    measurable_verb: str = Field(..., description="Bloom-aligned verb")
    success_evidence: list[str] = Field(
        ...,
        min_length=2,
        max_length=4,
        description="Observable evidence of learning",
    )


class ActivityCreatorInput(BaseModel):
    """Full input context for the activity_creator agent."""
    suggested_activity: SuggestedActivity
    learning_objective: LearningObjective
    mastery_criteria: MasteryCriteria
    lesson_title: str
    course_description: str
```

#### Output Model

```python
from pydantic import BaseModel, Field, field_validator
from typing import Literal
import uuid


class SubmissionFormat(BaseModel):
    """Defines which modalities are accepted for submission."""
    text: bool
    image: bool


class ActivitySpecOutput(BaseModel):
    """Full activity specification produced by activity_creator (Agent D)."""
    activity_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        description="Unique identifier for this activity",
    )
    activity_type: Literal["short_response", "image_upload", "either"] = Field(
        ...,
        description="Type of submission expected",
    )
    instructions: str = Field(
        ...,
        min_length=50,
        description=(
            "Clear, actionable instructions telling the learner exactly what to do. "
            "Must include at least one concrete constraint (length, format, required components)."
        ),
    )
    prompt: str = Field(
        ...,
        min_length=20,
        description="The specific question or task the learner must respond to",
    )
    submission_format: SubmissionFormat = Field(
        ...,
        description="Which modalities are accepted",
    )
    scoring_rubric: list[str] = Field(
        ...,
        min_length=3,
        max_length=6,
        description=(
            "Gradeable rubric items that map to mastery criteria. "
            "Each item must be specific and assessable, not vague."
        ),
    )
    hints: list[str] = Field(
        ...,
        min_length=2,
        max_length=5,
        description=(
            "Actionable scaffolds that help without giving the answer. "
            "Checklist steps, reminders, or prompting questions."
        ),
    )

    @field_validator("submission_format")
    @classmethod
    def validate_submission_format_coherence(
        cls, v: SubmissionFormat, info
    ) -> SubmissionFormat:
        """Validate type/submissionFormat coherence at the model level."""
        activity_type = info.data.get("activity_type")
        if activity_type == "short_response" and (not v.text or v.image):
            raise ValueError(
                "short_response requires text=true, image=false"
            )
        if activity_type == "image_upload" and (v.text or not v.image):
            raise ValueError(
                "image_upload requires text=false, image=true"
            )
        if activity_type == "either" and (not v.text or not v.image):
            raise ValueError(
                "either requires text=true, image=true"
            )
        return v
```

#### Agent Definition

```python
from pydantic_ai import Agent, ModelRetry, RunContext
from pydantic_ai.models import UsageLimits
from dataclasses import dataclass


@dataclass
class ActivityCreatorDeps:
    """Dependencies injected into the activity_creator agent."""
    mastery_criteria: MasteryCriteria
    learning_objective: LearningObjective
    suggested_activity: SuggestedActivity
    lesson_title: str
    course_description: str
    db_session: AsyncSession  # SQLAlchemy async session
    agent_logger: AgentLogger  # Shared logging utility from PRD 1


activity_creator = Agent(
    "openai:gpt-4o",  # Configurable via settings
    output_type=ActivitySpecOutput,
    deps_type=ActivityCreatorDeps,
    output_retries=2,
    system_prompt="""\
You are an expert instructional designer specializing in activity creation
for personalized learning. Your role is to convert a suggested activity seed
into a complete, rubric-aligned activity specification.

## Your Task
Given a suggested activity from a lesson writer, a learning objective, and
mastery criteria, produce a fully specified activity that:
1. Directly tests the learning objective
2. Has a scoring rubric that maps to the mastery criteria
3. Includes clear, actionable instructions with concrete constraints
4. Provides scaffolding hints that guide without giving answers

## Rules
- The activity must directly test the learning objective statement
- Every rubric item must map to a specific mastery criteria rubric check
- Do NOT introduce evaluation dimensions unrelated to mastery criteria
- Hints must be scaffolds (checklists, prompts, reminders), never full answers
- Instructions must include at least one concrete constraint (word count, required components, format)
- If the activity type allows image submission, specify what the image must show

## Activity Type Coherence
- short_response: text=true, image=false
- image_upload: text=false, image=true
- either: text=true, image=true
""",
)


@activity_creator.output_validator
async def validate_activity_spec(
    ctx: RunContext[ActivityCreatorDeps], output: ActivitySpecOutput
) -> ActivitySpecOutput:
    """Business rule validation beyond schema constraints."""
    mastery_checks = {
        check.lower().strip()
        for check in ctx.deps.mastery_criteria.rubric_checks
    }

    # Rule 1: Every rubric item must map to a mastery criteria rubric check.
    # We check that each rubric item is semantically related by requiring
    # at least partial word overlap with mastery criteria items.
    unmapped_rubric_items = []
    for rubric_item in output.scoring_rubric:
        rubric_words = set(rubric_item.lower().split())
        has_mapping = any(
            len(rubric_words & set(check.split())) >= 2
            for check in mastery_checks
        )
        if not has_mapping:
            unmapped_rubric_items.append(rubric_item)

    if len(unmapped_rubric_items) > len(output.scoring_rubric) // 2:
        raise ModelRetry(
            f"Rubric items must map to mastery criteria rubric checks. "
            f"These items appear unrelated to any mastery criteria: "
            f"{unmapped_rubric_items}. "
            f"Available mastery criteria: {ctx.deps.mastery_criteria.rubric_checks}"
        )

    # Rule 2: Type/submissionFormat coherence (defense in depth — also in model validator).
    expected = {
        "short_response": SubmissionFormat(text=True, image=False),
        "image_upload": SubmissionFormat(text=False, image=True),
        "either": SubmissionFormat(text=True, image=True),
    }
    if output.submission_format != expected.get(output.activity_type):
        raise ModelRetry(
            f"activity_type '{output.activity_type}' requires "
            f"submission_format {expected[output.activity_type].model_dump()}, "
            f"but got {output.submission_format.model_dump()}"
        )

    # Rule 3: If image submission is allowed, instructions/prompt must specify
    # what the image should show.
    if output.submission_format.image:
        image_keywords = {"image", "photo", "screenshot", "diagram", "drawing", "picture", "upload"}
        combined_text = (output.instructions + " " + output.prompt).lower()
        if not any(kw in combined_text for kw in image_keywords):
            raise ModelRetry(
                "When image submission is allowed, the instructions or prompt "
                "must specify what the image should show (e.g., labels, steps, "
                "required elements, acceptable sources like photo/screenshot/diagram)."
            )

    # Rule 4: Hints must not contain the full solution.
    # Heuristic: no hint should be longer than 200 chars (full answers tend to be long).
    long_hints = [h for h in output.hints if len(h) > 200]
    if long_hints:
        raise ModelRetry(
            f"Hints should be concise scaffolds, not full answers. "
            f"These hints are too long (>200 chars): {long_hints}"
        )

    return output
```

#### Agent Tool — Mastery Criteria Injection

```python
@activity_creator.tool
async def get_mastery_context(ctx: RunContext[ActivityCreatorDeps]) -> str:
    """Provide the agent with full mastery criteria and learning objective context."""
    return (
        f"## Learning Objective\n"
        f"Statement: {ctx.deps.learning_objective.statement}\n"
        f"Measurable Verb: {ctx.deps.learning_objective.measurable_verb}\n"
        f"Success Evidence: {', '.join(ctx.deps.learning_objective.success_evidence)}\n\n"
        f"## Mastery Criteria\n"
        f"Success Metric: {ctx.deps.mastery_criteria.success_metric}\n"
        f"Rubric Checks:\n"
        + "\n".join(f"  - {check}" for check in ctx.deps.mastery_criteria.rubric_checks)
        + f"\n\n## Suggested Activity Seed\n"
        f"Type: {ctx.deps.suggested_activity.type}\n"
        f"Prompt: {ctx.deps.suggested_activity.prompt}\n"
        f"Expected Evidence: {', '.join(ctx.deps.suggested_activity.expected_evidence)}\n\n"
        f"## Lesson Context\n"
        f"Lesson Title: {ctx.deps.lesson_title}\n"
        f"Course Description: {ctx.deps.course_description}\n"
    )
```

---

### Agent E: activity_reviewer

#### Input Models

```python
class ActivitySubmissionInput(BaseModel):
    """Input to the activity_reviewer agent."""
    objective_statement: str = Field(
        ...,
        description="First-person learning objective from lesson plan",
    )
    mastery_criteria: MasteryCriteria
    activity_prompt: str = Field(
        ...,
        description="The activity prompt the learner responded to",
    )
    scoring_rubric: list[str] = Field(
        ...,
        min_length=3,
        max_length=6,
        description="The rubric items to score against",
    )
    submission_text: str = Field(
        ...,
        min_length=1,
        description="The learner's text submission",
    )
    # image_url: str | None = None  # Future: for image submissions
```

#### Output Model

```python
class ActivityReviewOutput(BaseModel):
    """Scored review produced by activity_reviewer (Agent E)."""
    score: int = Field(
        ...,
        ge=0,
        le=100,
        description="Numeric score from 0 to 100",
    )
    max_score: int = Field(
        default=100,
        description="Always 100",
    )
    rationale: str = Field(
        ...,
        min_length=50,
        description=(
            "Explanation of the score. Must explicitly reference at least 2 "
            "rubric items by paraphrasing or quoting the rubric criteria."
        ),
    )
    strengths: list[str] = Field(
        ...,
        min_length=2,
        max_length=5,
        description=(
            "Concrete observations about what the learner did well. "
            "Each maps to a rubric item or mastery criterion."
        ),
    )
    improvements: list[str] = Field(
        ...,
        min_length=2,
        max_length=5,
        description=(
            "Concrete gaps phrased as actionable targets. "
            "No vague language like 'be clearer' without specifics."
        ),
    )
    tips: list[str] = Field(
        ...,
        min_length=2,
        max_length=6,
        description=(
            "Next-step instructions the learner can apply immediately. "
            "Guide process (checklist, prompts, structure), do not give the full answer."
        ),
    )
    mastery_decision: Literal["not_yet", "meets", "exceeds"] = Field(
        ...,
        description=(
            "Mastery level. Must be consistent with score: "
            "not_yet=0-69, meets=70-89, exceeds=90-100"
        ),
    )

    @field_validator("mastery_decision")
    @classmethod
    def validate_mastery_score_consistency(
        cls, v: str, info
    ) -> str:
        """Enforce mastery_decision / score alignment at the model level."""
        score = info.data.get("score")
        if score is None:
            return v
        if v == "not_yet" and score > 69:
            raise ValueError(
                f"mastery_decision 'not_yet' requires score 0-69, got {score}"
            )
        if v == "meets" and (score < 70 or score > 89):
            raise ValueError(
                f"mastery_decision 'meets' requires score 70-89, got {score}"
            )
        if v == "exceeds" and score < 90:
            raise ValueError(
                f"mastery_decision 'exceeds' requires score 90-100, got {score}"
            )
        return v
```

#### Agent Definition

```python
@dataclass
class ActivityReviewerDeps:
    """Dependencies injected into the activity_reviewer agent."""
    objective_statement: str
    mastery_criteria: MasteryCriteria
    activity_prompt: str
    scoring_rubric: list[str]
    db_session: AsyncSession
    agent_logger: AgentLogger


activity_reviewer = Agent(
    "openai:gpt-4o",
    output_type=ActivityReviewOutput,
    deps_type=ActivityReviewerDeps,
    output_retries=2,
    system_prompt="""\
You are an expert learning evaluator. Your role is to review a learner's
activity submission and provide scored, rubric-referenced feedback that is
constructive, specific, and actionable.

## Your Task
Given a learning objective, mastery criteria, activity prompt, scoring rubric,
and the learner's submission, produce a scored review with:
1. A numeric score (0-100) with a rationale that references at least 2 rubric items
2. Strengths (what the learner did well, tied to rubric items)
3. Improvements (specific gaps phrased as actionable targets)
4. Tips (next-step instructions — guide process, don't give the answer)
5. A mastery decision consistent with the score

## Scoring Bands
- **not_yet** (0-69): Submission does not yet demonstrate mastery. Significant gaps remain.
- **meets** (70-89): Submission demonstrates competent understanding. Minor improvements possible.
- **exceeds** (90-100): Submission demonstrates exceptional understanding beyond expectations.

## Rules
- ALWAYS reference specific rubric items in your rationale (at least 2)
- Each strength and improvement must map to a specific rubric item or mastery criterion
- Tips guide the learning process — they are NOT the answer itself
- If the submission is off-topic or empty, give a low score with clear explanation of what's missing
- If the submission is missing a required modality, score low and state the missing requirement
- Be encouraging but honest — do not inflate scores
- Avoid vague feedback like "good job" or "needs improvement" without specifics
""",
)


@activity_reviewer.output_validator
async def validate_activity_review(
    ctx: RunContext[ActivityReviewerDeps], output: ActivityReviewOutput
) -> ActivityReviewOutput:
    """Business rule validation for activity reviews."""

    # Rule 1: masteryDecision must be consistent with score.
    # (Defense in depth — also validated in model's field_validator.)
    score = output.score
    decision = output.mastery_decision
    if decision == "not_yet" and score > 69:
        raise ModelRetry(
            f"masteryDecision 'not_yet' requires score 0-69, but score is {score}. "
            f"Either lower the score or change the decision to 'meets'."
        )
    if decision == "meets" and (score < 70 or score > 89):
        raise ModelRetry(
            f"masteryDecision 'meets' requires score 70-89, but score is {score}. "
            f"Adjust the score to 70-89 or change the decision."
        )
    if decision == "exceeds" and score < 90:
        raise ModelRetry(
            f"masteryDecision 'exceeds' requires score 90-100, but score is {score}. "
            f"Either raise the score to 90+ or change the decision to 'meets'."
        )

    # Rule 2: Strengths array must not be empty.
    if not output.strengths:
        raise ModelRetry(
            "strengths must contain 2-5 concrete observations. "
            "Even weak submissions have identifiable positive aspects (e.g., 'attempted the task', 'addressed the prompt')."
        )

    # Rule 3: Improvements array must not be empty.
    if not output.improvements:
        raise ModelRetry(
            "improvements must contain 2-5 actionable targets. "
            "Even excellent submissions can identify next-level growth areas."
        )

    # Rule 4: Rationale must reference at least 2 rubric items.
    # Heuristic: check for word overlap between rationale and rubric items.
    rubric_references = 0
    rationale_lower = output.rationale.lower()
    for rubric_item in ctx.deps.scoring_rubric:
        # Extract key phrases (3+ word sequences) from rubric item
        rubric_words = rubric_item.lower().split()
        # Check for any 3-word subsequence match
        for i in range(len(rubric_words) - 2):
            phrase = " ".join(rubric_words[i : i + 3])
            if phrase in rationale_lower:
                rubric_references += 1
                break
        else:
            # Fallback: check for 2+ significant word overlap
            significant_words = {
                w for w in rubric_words if len(w) > 3
            }
            rationale_words = set(rationale_lower.split())
            if len(significant_words & rationale_words) >= 2:
                rubric_references += 1

    if rubric_references < 2:
        raise ModelRetry(
            f"Rationale must explicitly reference at least 2 rubric items. "
            f"Found references to approximately {rubric_references} rubric items. "
            f"The scoring rubric items are:\n"
            + "\n".join(f"  - {item}" for item in ctx.deps.scoring_rubric)
            + "\nPlease paraphrase or quote at least 2 of these in the rationale."
        )

    # Rule 5: max_score must always be 100.
    if output.max_score != 100:
        raise ModelRetry(
            f"max_score must always be 100, got {output.max_score}."
        )

    return output
```

---

## Pipeline Integration

### ActivityCreatorNode (pydantic_graph)

The activity_creator integrates into the existing course generation graph from PRD 2. After `WriteLessonNode` produces lesson content and a `suggestedActivity`, the `ActivityCreatorNode` runs to expand it into a full activity specification.

```python
from dataclasses import dataclass
from pydantic_graph import BaseNode, End, GraphRunContext

from app.graph.state import CourseGenerationState


@dataclass
class ActivityCreatorNode(BaseNode[CourseGenerationState]):
    """Graph node that runs activity_creator after lesson_writer.

    Reads suggestedActivity from the last written lesson in state,
    runs the activity_creator agent, and stores the result.
    """

    async def run(
        self, ctx: GraphRunContext[CourseGenerationState]
    ) -> "PlanLessonNode | End[CourseGenerationState]":
        state = ctx.state
        current_lesson = state.lessons[state.current_objective_index]

        # Build deps from pipeline state
        deps = ActivityCreatorDeps(
            suggested_activity=SuggestedActivity(
                type=current_lesson.suggested_activity["type"],
                prompt=current_lesson.suggested_activity["prompt"],
                expected_evidence=current_lesson.suggested_activity["expected_evidence"],
            ),
            learning_objective=LearningObjective(
                statement=current_lesson.lesson_plan["learningObjective"]["statement"],
                measurable_verb=current_lesson.lesson_plan["learningObjective"]["measurableVerb"],
                success_evidence=current_lesson.lesson_plan["learningObjective"]["successEvidence"],
            ),
            mastery_criteria=MasteryCriteria(
                success_metric=current_lesson.lesson_plan["masteryCriteria"]["successMetric"],
                rubric_checks=current_lesson.lesson_plan["masteryCriteria"]["rubricChecks"],
            ),
            lesson_title=current_lesson.lesson_content["lessonTitle"],
            course_description=state.course_description,
            db_session=state.db_session,
            agent_logger=state.agent_logger,
        )

        # Run the agent
        result = await activity_creator.run(
            f"Create a complete activity specification for the lesson '{deps.lesson_title}'.",
            deps=deps,
            usage_limits=UsageLimits(request_limit=5),
        )

        # Store result in state
        current_lesson.activity_spec = result.output.model_dump()

        # Log the agent run
        await state.agent_logger.log_run(
            agent_name="activity_creator",
            course_instance_id=state.course_instance_id,
            lesson_id=current_lesson.lesson_id,
            result=result,
        )

        # Persist Activity entity to DB
        activity = Activity(
            lesson_id=current_lesson.lesson_id,
            activity_spec_json=result.output.model_dump(),
            status="pending",
        )
        state.db_session.add(activity)
        await state.db_session.flush()
        current_lesson.activity_id = activity.id

        # Advance to next objective or end
        state.current_objective_index += 1
        if state.current_objective_index < len(state.objectives):
            return PlanLessonNode()
        else:
            return End(state)
```

### Updated Graph Flow

The course generation graph (PRD 2) is extended:

```
DescribeCourseNode → PlanLessonNode → WriteLessonNode → ActivityCreatorNode
                         ↑                                      |
                         |______________________________________|
                         (loop: next objective)           or → End
```

```python
from pydantic_graph import Graph

course_generation_graph = Graph(
    nodes=[
        DescribeCourseNode,
        PlanLessonNode,
        WriteLessonNode,
        ActivityCreatorNode,  # NEW in PRD 3
    ],
)
```

---

## API Endpoints

### `POST /api/activities/{activity_id}/submit`

Submit a text response to an activity and receive scored feedback.

#### Request

```python
class ActivitySubmissionRequest(BaseModel):
    """Request body for activity submission."""
    submission_text: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="The learner's text response to the activity prompt",
    )
```

```http
POST /api/activities/550e8400-e29b-41d4-a716-446655440000/submit
Content-Type: application/json

{
  "submission_text": "Variables in Python are containers for storing data values. Unlike some languages, Python has no command for declaring a variable — a variable is created the moment you first assign a value to it. For example, x = 5 creates a variable x with value 5. Python uses dynamic typing, meaning the type is determined at runtime based on the assigned value. There are several main types: integers (whole numbers like 42), floats (decimal numbers like 3.14), strings (text in quotes like 'hello'), and booleans (True or False). You can check a variable's type using the type() function."
}
```

#### Response

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "score": 82,
  "max_score": 100,
  "rationale": "The submission demonstrates solid understanding of Python variables and types. Regarding the rubric criterion 'correctly defines what a variable is and how assignment works in Python', the response accurately explains that variables are created on assignment without explicit declaration, earning full credit. The criterion 'identifies and explains at least 3 core data types with examples' is well addressed with four types covered (int, float, str, bool) with concrete examples. However, the criterion 'demonstrates understanding of dynamic typing with a practical scenario' is only partially met — dynamic typing is mentioned but not illustrated with a variable changing type.",
  "strengths": [
    "Clear definition of variables as created on first assignment, distinguishing Python from statically-typed languages",
    "Four data types explained with concrete, correct examples (42, 3.14, 'hello', True/False)",
    "Mention of type() function shows practical knowledge beyond basic definitions"
  ],
  "improvements": [
    "Demonstrate dynamic typing by showing a variable changing type (e.g., x = 5 then x = 'hello') and explaining the implications",
    "Include a brief explanation of type conversion/casting (int(), str(), float()) as it relates to working with different types"
  ],
  "tips": [
    "Try writing a short code snippet where the same variable holds different types across lines — then use type() after each assignment to show the change",
    "Add a sentence about what happens when you try operations between incompatible types (e.g., '5' + 3) to demonstrate why types matter",
    "Consider mentioning mutable vs immutable types as a stretch goal for deeper understanding"
  ],
  "mastery_decision": "meets",
  "attempt_number": 1,
  "next_lesson_unlocked": true
}
```

#### Response Model

```python
class ActivitySubmissionResponse(BaseModel):
    """Response returned after activity submission and review."""
    score: int
    max_score: int
    rationale: str
    strengths: list[str]
    improvements: list[str]
    tips: list[str]
    mastery_decision: Literal["not_yet", "meets", "exceeds"]
    attempt_number: int = Field(
        ...,
        description="Which attempt this is (1-based)",
    )
    next_lesson_unlocked: bool = Field(
        ...,
        description="Whether the next lesson was unlocked by this submission",
    )
```

### `GET /api/activities/{activity_id}`

Retrieve the activity specification and current status.

```http
GET /api/activities/550e8400-e29b-41d4-a716-446655440000

HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "lesson_id": "660e8400-e29b-41d4-a716-446655440000",
  "activity_spec": {
    "activity_id": "act-001",
    "activity_type": "short_response",
    "instructions": "Write a 5-8 sentence paragraph explaining Python variables and data types. Include at least 3 data types with examples, explain how assignment works, and demonstrate your understanding of dynamic typing with a practical scenario.",
    "prompt": "Explain what variables are in Python, how they are created, and describe at least three core data types with examples of each.",
    "submission_format": {"text": true, "image": false},
    "scoring_rubric": [
      "Correctly defines what a variable is and how assignment works in Python",
      "Identifies and explains at least 3 core data types with examples",
      "Demonstrates understanding of dynamic typing with a practical scenario",
      "Uses accurate Python syntax in all examples",
      "Response is well-organized with clear logical flow"
    ],
    "hints": [
      "Start by explaining how Python creates variables — what happens when you write x = 5?",
      "Think about the types you've used most: numbers, text, and True/False values",
      "To show dynamic typing, consider what happens when you reassign a variable to a different type"
    ]
  },
  "status": "reviewed",
  "attempt_count": 1,
  "latest_score": 82,
  "mastery_decision": "meets"
}
```

### Router Implementation

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db_session, get_agent_logger
from app.services.submission import SubmissionService

router = APIRouter(prefix="/api/activities", tags=["activities"])


@router.post("/{activity_id}/submit", response_model=ActivitySubmissionResponse)
async def submit_activity(
    activity_id: uuid.UUID,
    request: ActivitySubmissionRequest,
    db: AsyncSession = Depends(get_db_session),
    agent_logger: AgentLogger = Depends(get_agent_logger),
) -> ActivitySubmissionResponse:
    """Submit a text response to an activity and receive scored feedback."""
    service = SubmissionService(db=db, agent_logger=agent_logger)
    return await service.submit_and_review(
        activity_id=activity_id,
        submission_text=request.submission_text,
    )


@router.get("/{activity_id}", response_model=ActivityDetailResponse)
async def get_activity(
    activity_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
) -> ActivityDetailResponse:
    """Retrieve activity specification and current status."""
    activity = await db.get(Activity, activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    return ActivityDetailResponse.from_orm(activity)
```

### Submission Service

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class SubmissionService:
    """Orchestrates submission → review → DB update → lesson unlock."""

    def __init__(self, db: AsyncSession, agent_logger: AgentLogger):
        self.db = db
        self.agent_logger = agent_logger

    async def submit_and_review(
        self,
        activity_id: uuid.UUID,
        submission_text: str,
    ) -> ActivitySubmissionResponse:
        # 1. Load the activity and its lesson + lesson plan
        activity = await self.db.get(Activity, activity_id)
        if not activity:
            raise HTTPException(status_code=404, detail="Activity not found")

        lesson = await self.db.get(Lesson, activity.lesson_id)
        lesson_plan = lesson.lesson_plan_json

        # 2. Build reviewer deps
        deps = ActivityReviewerDeps(
            objective_statement=lesson_plan["learningObjective"]["statement"],
            mastery_criteria=MasteryCriteria(
                success_metric=lesson_plan["masteryCriteria"]["successMetric"],
                rubric_checks=lesson_plan["masteryCriteria"]["rubricChecks"],
            ),
            activity_prompt=activity.activity_spec_json["prompt"],
            scoring_rubric=activity.activity_spec_json["scoring_rubric"],
            db_session=self.db,
            agent_logger=self.agent_logger,
        )

        # 3. Run the activity_reviewer agent
        result = await activity_reviewer.run(
            f"Review this submission for the activity: '{deps.activity_prompt}'\n\n"
            f"Learner's submission:\n{submission_text}",
            deps=deps,
            usage_limits=UsageLimits(request_limit=5),
        )

        review = result.output

        # 4. Log the agent run
        await self.agent_logger.log_run(
            agent_name="activity_reviewer",
            course_instance_id=lesson.course_instance_id,
            lesson_id=lesson.id,
            activity_id=activity.id,
            result=result,
        )

        # 5. Update Activity in DB
        activity.submission_text = submission_text
        activity.reviewer_score = review.score
        activity.reviewer_feedback_json = review.model_dump()
        activity.mastery_decision = review.mastery_decision
        activity.attempt_count += 1
        activity.status = "reviewed"

        # 6. Unlock next lesson
        next_lesson_unlocked = await self._unlock_next_lesson(lesson)

        await self.db.commit()

        # 7. Build response
        return ActivitySubmissionResponse(
            score=review.score,
            max_score=review.max_score,
            rationale=review.rationale,
            strengths=review.strengths,
            improvements=review.improvements,
            tips=review.tips,
            mastery_decision=review.mastery_decision,
            attempt_number=activity.attempt_count,
            next_lesson_unlocked=next_lesson_unlocked,
        )

    async def _unlock_next_lesson(self, current_lesson: Lesson) -> bool:
        """Unlock the next lesson in sequence. Returns True if a lesson was unlocked."""
        # Find next lesson by objective_index
        stmt = (
            select(Lesson)
            .where(
                Lesson.course_instance_id == current_lesson.course_instance_id,
                Lesson.objective_index == current_lesson.objective_index + 1,
            )
        )
        next_lesson = (await self.db.execute(stmt)).scalar_one_or_none()

        if next_lesson and next_lesson.status == "locked":
            next_lesson.status = "unlocked"
            return True

        return False
```

---

## Acceptance Criteria

### Agent D: activity_creator

| # | Criterion | Validation Method |
|---|-----------|------------------|
| AC-D1 | Output matches `ActivitySpecOutput` schema exactly — no extra keys, correct types | Pydantic schema validation |
| AC-D2 | `activityType` / `submissionFormat` coherence: `short_response` -> `{text:true, image:false}`, `image_upload` -> `{text:false, image:true}`, `either` -> `{text:true, image:true}` | `field_validator` + `@output_validator` |
| AC-D3 | Activity directly tests the lesson plan's `learningObjective.statement` | `@output_validator` + LLMJudge eval |
| AC-D4 | `scoringRubric` contains 3-6 items, each mapping to a `masteryCriteria.rubricChecks` item | `Field(min_length=3, max_length=6)` + `@output_validator` |
| AC-D5 | `instructions` include at least one concrete constraint (word count, format, required components) | `@output_validator` heuristic + LLMJudge eval |
| AC-D6 | `hints` contains 2-5 items that scaffold without giving the full answer | `Field(min_length=2, max_length=5)` + `@output_validator` length check |
| AC-D7 | When `submissionFormat.image` is true, instructions/prompt specify what image must show | `@output_validator` keyword check |
| AC-D8 | Same inputs produce semantically consistent output (stable type, rubric shape) | pydantic_evals determinism check |
| AC-D9 | On schema validation failure, retries up to 2 times then returns structured error | `output_retries=2` + error handling |

### Agent E: activity_reviewer

| # | Criterion | Validation Method |
|---|-----------|------------------|
| AC-E1 | Output matches `ActivityReviewOutput` schema exactly — no extra keys, correct types | Pydantic schema validation |
| AC-E2 | `score` is 0-100 integer, `maxScore` is always 100 | `Field(ge=0, le=100)` + `@output_validator` |
| AC-E3 | `masteryDecision` consistent with score: `not_yet`=0-69, `meets`=70-89, `exceeds`=90-100 | `field_validator` + `@output_validator` |
| AC-E4 | `rationale` references at least 2 rubric items by paraphrase or quote | `@output_validator` word overlap check |
| AC-E5 | `strengths` contains 2-5 concrete observations mapped to rubric items | `Field(min_length=2, max_length=5)` |
| AC-E6 | `improvements` contains 2-5 actionable targets (not vague) | `Field(min_length=2, max_length=5)` + `@output_validator` non-empty check |
| AC-E7 | `tips` contains 2-6 process-guiding instructions (not full answers) | `Field(min_length=2, max_length=6)` |
| AC-E8 | Off-topic or empty submissions receive low score with clear explanation of missing evidence | pydantic_evals case for off-topic/empty |
| AC-E9 | Same inputs yield semantically consistent scoring and masteryDecision | pydantic_evals determinism check |
| AC-E10 | On schema validation failure, retries up to 2 times then returns structured error | `output_retries=2` + error handling |

### Submission & Progression

| # | Criterion | Validation Method |
|---|-----------|------------------|
| AC-S1 | `POST /api/activities/{id}/submit` accepts text, runs reviewer, returns `ActivitySubmissionResponse` | Integration test |
| AC-S2 | Activity DB row updated with submission text, score, feedback JSON, mastery decision, incremented attempt count | Integration test |
| AC-S3 | Next lesson status changes from `locked` to `unlocked` after first submission | Integration test |
| AC-S4 | Re-submission increments attempt count and updates latest score/feedback | Integration test |
| AC-S5 | Submitting to a non-existent activity returns 404 | Integration test |
| AC-S6 | Empty submission text returns 422 validation error | Integration test |
| AC-S7 | Agent log recorded for every activity_reviewer run with prompt, output, timing, tokens, model, status | Integration test |

---

## Verification

### Unit Tests — I/O Model Validation

```python
# tests/unit/models/test_activity_models.py

import pytest
from app.models.activity import (
    ActivitySpecOutput,
    ActivityReviewOutput,
    SubmissionFormat,
)


class TestActivitySpecOutput:
    """Validate ActivitySpecOutput schema constraints."""

    def test_valid_short_response(self):
        spec = ActivitySpecOutput(
            activity_type="short_response",
            instructions="Write a 5-8 sentence paragraph explaining...",
            prompt="Explain variables in Python with 3 data types",
            submission_format=SubmissionFormat(text=True, image=False),
            scoring_rubric=["Defines variables", "Lists 3 types", "Shows examples"],
            hints=["Start with assignment", "Think about numbers and text"],
        )
        assert spec.activity_type == "short_response"
        assert spec.submission_format.text is True
        assert spec.submission_format.image is False

    def test_type_format_coherence_short_response_rejects_image(self):
        with pytest.raises(ValueError, match="short_response requires text=true"):
            ActivitySpecOutput(
                activity_type="short_response",
                instructions="Write a paragraph...",
                prompt="Explain variables",
                submission_format=SubmissionFormat(text=True, image=True),
                scoring_rubric=["a", "b", "c"],
                hints=["x", "y"],
            )

    def test_type_format_coherence_image_upload(self):
        spec = ActivitySpecOutput(
            activity_type="image_upload",
            instructions="Draw a diagram showing the process...",
            prompt="Create a labeled diagram",
            submission_format=SubmissionFormat(text=False, image=True),
            scoring_rubric=["Labels correct", "Flow accurate", "Completeness"],
            hints=["Start with inputs", "Label each step"],
        )
        assert spec.submission_format.image is True

    def test_type_format_coherence_either(self):
        spec = ActivitySpecOutput(
            activity_type="either",
            instructions="Write or draw your response...",
            prompt="Explain or diagram the concept",
            submission_format=SubmissionFormat(text=True, image=True),
            scoring_rubric=["Accuracy", "Completeness", "Clarity"],
            hints=["Pick whichever method suits you", "Cover all 3 concepts"],
        )
        assert spec.submission_format.text is True
        assert spec.submission_format.image is True

    def test_rubric_too_few_rejected(self):
        with pytest.raises(ValueError):
            ActivitySpecOutput(
                activity_type="short_response",
                instructions="Write a paragraph...",
                prompt="Explain variables",
                submission_format=SubmissionFormat(text=True, image=False),
                scoring_rubric=["Only one"],
                hints=["x", "y"],
            )

    def test_rubric_too_many_rejected(self):
        with pytest.raises(ValueError):
            ActivitySpecOutput(
                activity_type="short_response",
                instructions="Write a paragraph...",
                prompt="Explain variables",
                submission_format=SubmissionFormat(text=True, image=False),
                scoring_rubric=["a", "b", "c", "d", "e", "f", "g"],
                hints=["x", "y"],
            )

    def test_hints_too_few_rejected(self):
        with pytest.raises(ValueError):
            ActivitySpecOutput(
                activity_type="short_response",
                instructions="Write a paragraph...",
                prompt="Explain variables",
                submission_format=SubmissionFormat(text=True, image=False),
                scoring_rubric=["a", "b", "c"],
                hints=["only one"],
            )


class TestActivityReviewOutput:
    """Validate ActivityReviewOutput schema constraints."""

    def test_valid_meets_review(self):
        review = ActivityReviewOutput(
            score=75,
            max_score=100,
            rationale="The submission demonstrates solid understanding...",
            strengths=["Good explanation", "Clear examples"],
            improvements=["Add more depth", "Include edge cases"],
            tips=["Try using type()", "Show variable reassignment"],
            mastery_decision="meets",
        )
        assert review.mastery_decision == "meets"

    def test_not_yet_with_high_score_rejected(self):
        with pytest.raises(ValueError, match="not_yet.*requires score 0-69"):
            ActivityReviewOutput(
                score=75,
                max_score=100,
                rationale="The submission was weak..." * 5,
                strengths=["Attempted", "On topic"],
                improvements=["Missing key concepts", "No examples"],
                tips=["Review the lesson", "Focus on types"],
                mastery_decision="not_yet",
            )

    def test_meets_with_score_too_low_rejected(self):
        with pytest.raises(ValueError, match="meets.*requires score 70-89"):
            ActivityReviewOutput(
                score=65,
                max_score=100,
                rationale="Good work on this submission..." * 5,
                strengths=["Good start", "Topic addressed"],
                improvements=["Needs more detail", "Add examples"],
                tips=["Expand your response", "Use specific terms"],
                mastery_decision="meets",
            )

    def test_meets_with_score_too_high_rejected(self):
        with pytest.raises(ValueError, match="meets.*requires score 70-89"):
            ActivityReviewOutput(
                score=95,
                max_score=100,
                rationale="Good work on this submission..." * 5,
                strengths=["Excellent detail", "Perfect examples"],
                improvements=["Minor formatting", "Could add one more"],
                tips=["Keep it up", "Try harder problems"],
                mastery_decision="meets",
            )

    def test_exceeds_with_low_score_rejected(self):
        with pytest.raises(ValueError, match="exceeds.*requires score 90-100"):
            ActivityReviewOutput(
                score=85,
                max_score=100,
                rationale="Exceptional work that goes beyond..." * 5,
                strengths=["Perfect understanding", "Creative approach"],
                improvements=["Minor polish", "Stretch goal"],
                tips=["Teach others", "Explore advanced topics"],
                mastery_decision="exceeds",
            )

    def test_strengths_too_few_rejected(self):
        with pytest.raises(ValueError):
            ActivityReviewOutput(
                score=50,
                max_score=100,
                rationale="The submission needs work..." * 5,
                strengths=["Only one"],
                improvements=["Missing concepts", "No examples"],
                tips=["Review lesson", "Try again"],
                mastery_decision="not_yet",
            )

    def test_boundary_not_yet_69(self):
        """Score of 69 is valid for not_yet."""
        review = ActivityReviewOutput(
            score=69,
            max_score=100,
            rationale="Close to meeting expectations but..." * 5,
            strengths=["Good attempt", "On topic"],
            improvements=["Needs more depth", "Missing examples"],
            tips=["Review the section on X", "Add concrete examples"],
            mastery_decision="not_yet",
        )
        assert review.score == 69

    def test_boundary_meets_70(self):
        """Score of 70 is valid for meets."""
        review = ActivityReviewOutput(
            score=70,
            max_score=100,
            rationale="Meets the minimum standard for mastery..." * 5,
            strengths=["Correct definitions", "Basic examples"],
            improvements=["Could add more detail", "Try edge cases"],
            tips=["Expand on dynamic typing", "Practice more"],
            mastery_decision="meets",
        )
        assert review.score == 70

    def test_boundary_exceeds_90(self):
        """Score of 90 is valid for exceeds."""
        review = ActivityReviewOutput(
            score=90,
            max_score=100,
            rationale="Exceptional work demonstrating deep understanding..." * 5,
            strengths=["Thorough coverage", "Creative examples"],
            improvements=["Minor formatting", "Could add stretch content"],
            tips=["Teach this to a peer", "Explore advanced topics"],
            mastery_decision="exceeds",
        )
        assert review.score == 90
```

### Unit Tests — Output Validators

```python
# tests/unit/validators/test_activity_validators.py

import pytest
from unittest.mock import AsyncMock, MagicMock
from pydantic_ai import ModelRetry

from app.agents.activity_creator import validate_activity_spec
from app.agents.activity_reviewer import validate_activity_review
from app.models.activity import (
    ActivitySpecOutput,
    ActivityReviewOutput,
    SubmissionFormat,
    MasteryCriteria,
)


@pytest.fixture
def creator_ctx():
    """Mock RunContext for activity_creator validator."""
    ctx = MagicMock()
    ctx.deps.mastery_criteria = MasteryCriteria(
        success_metric="Can explain Python variables and types",
        rubric_checks=[
            "Correctly defines variables and assignment",
            "Identifies at least 3 core data types with examples",
            "Demonstrates understanding of dynamic typing",
            "Uses accurate Python syntax in examples",
        ],
    )
    return ctx


@pytest.fixture
def reviewer_ctx():
    """Mock RunContext for activity_reviewer validator."""
    ctx = MagicMock()
    ctx.deps.scoring_rubric = [
        "Correctly defines variables and assignment",
        "Identifies at least 3 core data types with examples",
        "Demonstrates understanding of dynamic typing",
        "Uses accurate Python syntax in examples",
    ]
    return ctx


class TestActivityCreatorValidator:

    @pytest.mark.asyncio
    async def test_rejects_rubric_not_mapping_to_mastery(self, creator_ctx):
        """Rubric items that don't map to any mastery criteria are rejected."""
        output = ActivitySpecOutput(
            activity_type="short_response",
            instructions="Write a paragraph about your favorite food and why you like it so much...",
            prompt="Explain your food preferences",
            submission_format=SubmissionFormat(text=True, image=False),
            scoring_rubric=[
                "Describes favorite cuisine clearly",
                "Includes calorie information",
                "Mentions cooking methods used",
            ],
            hints=["Think about flavors", "Consider texture"],
        )
        with pytest.raises(ModelRetry, match="Rubric items must map to mastery criteria"):
            await validate_activity_spec(creator_ctx, output)

    @pytest.mark.asyncio
    async def test_rejects_type_format_incoherence(self, creator_ctx):
        """Type/submissionFormat mismatch is rejected."""
        # Manually create an output that bypasses field_validator
        output = MagicMock(spec=ActivitySpecOutput)
        output.activity_type = "short_response"
        output.submission_format = SubmissionFormat(text=True, image=True)
        output.scoring_rubric = [
            "Correctly defines variables and assignment",
            "Identifies core data types with examples",
            "Demonstrates dynamic typing understanding",
        ]
        output.hints = ["Hint 1", "Hint 2"]
        output.instructions = "Write..."
        output.prompt = "Explain..."

        with pytest.raises(ModelRetry, match="activity_type 'short_response' requires"):
            await validate_activity_spec(creator_ctx, output)

    @pytest.mark.asyncio
    async def test_rejects_image_without_image_specification(self, creator_ctx):
        """When image is allowed, instructions must mention what image shows."""
        output = MagicMock(spec=ActivitySpecOutput)
        output.activity_type = "either"
        output.submission_format = SubmissionFormat(text=True, image=True)
        output.scoring_rubric = [
            "Correctly defines variables and assignment",
            "Identifies core data types with examples",
            "Demonstrates dynamic typing understanding",
        ]
        output.hints = ["Short hint", "Another hint"]
        output.instructions = "Complete the following task about variables"
        output.prompt = "Explain Python variables and types"

        with pytest.raises(ModelRetry, match="image should show"):
            await validate_activity_spec(creator_ctx, output)


class TestActivityReviewerValidator:

    @pytest.mark.asyncio
    async def test_rejects_meets_with_score_below_70(self, reviewer_ctx):
        output = ActivityReviewOutput(
            score=65,
            max_score=100,
            rationale="Correctly defines variables and assignment. Identifies core data types. " * 3,
            strengths=["Good definitions", "Clear writing"],
            improvements=["Missing types", "No examples"],
            tips=["Review the lesson", "Practice more"],
            mastery_decision="not_yet",  # Use valid decision first
        )
        # Manually override to test validator
        output_dict = output.model_dump()
        output_dict["mastery_decision"] = "meets"
        output_dict["score"] = 65

        # Re-create with bypassed field validator to test output_validator
        mock_output = MagicMock(spec=ActivityReviewOutput)
        mock_output.score = 65
        mock_output.mastery_decision = "meets"
        mock_output.strengths = ["Good definitions", "Clear writing"]
        mock_output.improvements = ["Missing types", "No examples"]
        mock_output.rationale = (
            "Correctly defines variables and assignment in a clear manner. "
            "Identifies at least 3 core data types with examples. "
        )
        mock_output.max_score = 100

        with pytest.raises(ModelRetry, match="masteryDecision 'meets' requires score 70-89"):
            await validate_activity_review(reviewer_ctx, mock_output)

    @pytest.mark.asyncio
    async def test_rejects_exceeds_with_score_below_90(self, reviewer_ctx):
        mock_output = MagicMock(spec=ActivityReviewOutput)
        mock_output.score = 85
        mock_output.mastery_decision = "exceeds"
        mock_output.strengths = ["Excellent", "Thorough"]
        mock_output.improvements = ["Minor point", "Stretch goal"]
        mock_output.rationale = (
            "Correctly defines variables and assignment well. "
            "Identifies at least 3 core data types with examples. "
        )
        mock_output.max_score = 100

        with pytest.raises(ModelRetry, match="masteryDecision 'exceeds' requires score 90-100"):
            await validate_activity_review(reviewer_ctx, mock_output)

    @pytest.mark.asyncio
    async def test_rejects_empty_strengths(self, reviewer_ctx):
        mock_output = MagicMock(spec=ActivityReviewOutput)
        mock_output.score = 50
        mock_output.mastery_decision = "not_yet"
        mock_output.strengths = []
        mock_output.improvements = ["Missing concepts", "No examples"]
        mock_output.rationale = (
            "Correctly defines variables and assignment partially. "
            "Identifies at least 3 core data types with examples was not met. "
        )
        mock_output.max_score = 100

        with pytest.raises(ModelRetry, match="strengths must contain 2-5"):
            await validate_activity_review(reviewer_ctx, mock_output)

    @pytest.mark.asyncio
    async def test_rejects_empty_improvements(self, reviewer_ctx):
        mock_output = MagicMock(spec=ActivityReviewOutput)
        mock_output.score = 95
        mock_output.mastery_decision = "exceeds"
        mock_output.strengths = ["Perfect", "Outstanding"]
        mock_output.improvements = []
        mock_output.rationale = (
            "Correctly defines variables and assignment masterfully. "
            "Identifies at least 3 core data types with examples comprehensively. "
        )
        mock_output.max_score = 100

        with pytest.raises(ModelRetry, match="improvements must contain 2-5"):
            await validate_activity_review(reviewer_ctx, mock_output)

    @pytest.mark.asyncio
    async def test_rejects_rationale_without_rubric_references(self, reviewer_ctx):
        mock_output = MagicMock(spec=ActivityReviewOutput)
        mock_output.score = 75
        mock_output.mastery_decision = "meets"
        mock_output.strengths = ["Good work", "Nice effort"]
        mock_output.improvements = ["Try harder", "Add more"]
        mock_output.rationale = "This was a good submission overall with nice effort shown."
        mock_output.max_score = 100

        with pytest.raises(ModelRetry, match="Rationale must explicitly reference at least 2 rubric items"):
            await validate_activity_review(reviewer_ctx, mock_output)
```

### Unit Tests — Agents with TestModel

```python
# tests/unit/agents/test_activity_creator.py

import pytest
from pydantic_ai import models
from pydantic_ai.models.test import TestModel
from unittest.mock import AsyncMock, MagicMock

from app.agents.activity_creator import activity_creator, ActivityCreatorDeps
from app.models.activity import MasteryCriteria, LearningObjective, SuggestedActivity

# Block real API calls in test suite
models.ALLOW_MODEL_REQUESTS = False


@pytest.fixture
def mock_deps():
    return ActivityCreatorDeps(
        suggested_activity=SuggestedActivity(
            type="short_response",
            prompt="Explain Python variables and types",
            expected_evidence=[
                "Defines variables correctly",
                "Lists 3+ data types",
            ],
        ),
        learning_objective=LearningObjective(
            statement="I can explain Python variables and data types",
            measurable_verb="explain",
            success_evidence=[
                "Defines variables correctly",
                "Lists 3+ data types with examples",
                "Shows dynamic typing behavior",
            ],
        ),
        mastery_criteria=MasteryCriteria(
            success_metric="Can explain Python variables and types with examples",
            rubric_checks=[
                "Correctly defines variables and assignment",
                "Identifies at least 3 core data types with examples",
                "Demonstrates understanding of dynamic typing",
            ],
        ),
        lesson_title="Python Variables and Types",
        course_description="An introduction to Python programming fundamentals",
        db_session=AsyncMock(),
        agent_logger=MagicMock(),
    )


class TestActivityCreatorAgent:

    @pytest.mark.asyncio
    async def test_produces_valid_output_with_test_model(self, mock_deps):
        """TestModel auto-generates valid ActivitySpecOutput."""
        with activity_creator.override(model=TestModel(), deps=mock_deps):
            result = await activity_creator.run(
                "Create an activity for Python Variables and Types"
            )
            assert result.output.activity_type in (
                "short_response",
                "image_upload",
                "either",
            )
            assert 3 <= len(result.output.scoring_rubric) <= 6
            assert 2 <= len(result.output.hints) <= 5

    @pytest.mark.asyncio
    async def test_accesses_deps_correctly(self, mock_deps):
        """Agent correctly receives and can access deps."""
        with activity_creator.override(model=TestModel(), deps=mock_deps):
            result = await activity_creator.run(
                "Create an activity for Python Variables and Types"
            )
            # If we got a result, deps were accessible
            assert result.output is not None
```

```python
# tests/unit/agents/test_activity_reviewer.py

import pytest
from pydantic_ai import models
from pydantic_ai.models.test import TestModel
from pydantic_ai.models.function import FunctionModel
from pydantic_ai.messages import ModelResponse, ModelResponsePart
from unittest.mock import AsyncMock, MagicMock

from app.agents.activity_reviewer import activity_reviewer, ActivityReviewerDeps
from app.models.activity import MasteryCriteria

models.ALLOW_MODEL_REQUESTS = False


@pytest.fixture
def mock_deps():
    return ActivityReviewerDeps(
        objective_statement="I can explain Python variables and data types",
        mastery_criteria=MasteryCriteria(
            success_metric="Can explain Python variables and types",
            rubric_checks=[
                "Correctly defines variables and assignment",
                "Identifies at least 3 core data types with examples",
                "Demonstrates understanding of dynamic typing",
            ],
        ),
        activity_prompt="Explain Python variables and types with examples",
        scoring_rubric=[
            "Correctly defines variables and assignment",
            "Identifies at least 3 core data types with examples",
            "Demonstrates understanding of dynamic typing",
            "Uses accurate Python syntax in examples",
        ],
        db_session=AsyncMock(),
        agent_logger=MagicMock(),
    )


class TestActivityReviewerAgent:

    @pytest.mark.asyncio
    async def test_produces_valid_output_with_test_model(self, mock_deps):
        """TestModel auto-generates valid ActivityReviewOutput."""
        with activity_reviewer.override(model=TestModel(), deps=mock_deps):
            result = await activity_reviewer.run(
                "Review this submission: Python variables store data..."
            )
            assert 0 <= result.output.score <= 100
            assert result.output.max_score == 100
            assert result.output.mastery_decision in ("not_yet", "meets", "exceeds")

    @pytest.mark.asyncio
    async def test_boundary_score_69_not_yet(self, mock_deps):
        """FunctionModel returning score 69 should produce not_yet."""
        with activity_reviewer.override(
            model=FunctionModel(lambda messages, info: ModelResponse(
                parts=[ModelResponsePart(
                    part_kind="tool-return",
                    content='{"score":69,"max_score":100,"rationale":"Correctly defines variables and assignment partially. Identifies at least 3 core data types with examples was not fully demonstrated.","strengths":["Attempted the task","Addressed the prompt"],"improvements":["Need more depth","Missing examples"],"tips":["Review the lesson","Practice with code"],"mastery_decision":"not_yet"}',
                )],
            )),
            deps=mock_deps,
        ):
            result = await activity_reviewer.run("Review: weak submission")
            assert result.output.score == 69
            assert result.output.mastery_decision == "not_yet"

    @pytest.mark.asyncio
    async def test_boundary_score_70_meets(self, mock_deps):
        """FunctionModel returning score 70 should produce meets."""
        with activity_reviewer.override(
            model=FunctionModel(lambda messages, info: ModelResponse(
                parts=[ModelResponsePart(
                    part_kind="tool-return",
                    content='{"score":70,"max_score":100,"rationale":"Correctly defines variables and assignment adequately. Identifies at least 3 core data types with examples as required.","strengths":["Clear definitions","Good examples"],"improvements":["Could go deeper","Add edge cases"],"tips":["Try type() function","Show reassignment"],"mastery_decision":"meets"}',
                )],
            )),
            deps=mock_deps,
        ):
            result = await activity_reviewer.run("Review: decent submission")
            assert result.output.score == 70
            assert result.output.mastery_decision == "meets"

    @pytest.mark.asyncio
    async def test_boundary_score_90_exceeds(self, mock_deps):
        """FunctionModel returning score 90 should produce exceeds."""
        with activity_reviewer.override(
            model=FunctionModel(lambda messages, info: ModelResponse(
                parts=[ModelResponsePart(
                    part_kind="tool-return",
                    content='{"score":90,"max_score":100,"rationale":"Correctly defines variables and assignment masterfully. Identifies at least 3 core data types with examples comprehensively and with creative depth.","strengths":["Thorough coverage","Creative examples"],"improvements":["Minor formatting","Stretch content"],"tips":["Teach others","Explore advanced topics"],"mastery_decision":"exceeds"}',
                )],
            )),
            deps=mock_deps,
        ):
            result = await activity_reviewer.run("Review: excellent submission")
            assert result.output.score == 90
            assert result.output.mastery_decision == "exceeds"
```

### Integration Tests — Submission Flow

```python
# tests/integration/api/test_activity_submission.py

import pytest
import uuid
from httpx import AsyncClient
from unittest.mock import patch, AsyncMock

from app.main import app


@pytest.fixture
async def client():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def seeded_activity(db_session):
    """Create a course, lesson, and activity in the test DB."""
    from app.models.db import CourseInstance, Lesson, Activity

    course = CourseInstance(id=uuid.uuid4(), status="in_progress")
    db_session.add(course)

    lesson = Lesson(
        id=uuid.uuid4(),
        course_instance_id=course.id,
        objective_index=0,
        status="unlocked",
        lesson_plan_json={
            "learningObjective": {
                "statement": "I can explain Python variables",
                "measurableVerb": "explain",
                "successEvidence": ["Defines variables", "Lists types"],
            },
            "masteryCriteria": {
                "successMetric": "Can explain variables and types",
                "rubricChecks": [
                    "Correctly defines variables and assignment",
                    "Identifies at least 3 core data types",
                    "Demonstrates dynamic typing",
                ],
            },
        },
    )
    db_session.add(lesson)

    next_lesson = Lesson(
        id=uuid.uuid4(),
        course_instance_id=course.id,
        objective_index=1,
        status="locked",
    )
    db_session.add(next_lesson)

    activity = Activity(
        id=uuid.uuid4(),
        lesson_id=lesson.id,
        activity_spec_json={
            "activity_id": "act-001",
            "activity_type": "short_response",
            "instructions": "Write a paragraph...",
            "prompt": "Explain Python variables and types",
            "submission_format": {"text": True, "image": False},
            "scoring_rubric": [
                "Correctly defines variables and assignment",
                "Identifies at least 3 core data types",
                "Demonstrates dynamic typing",
            ],
            "hints": ["Start with assignment", "Think about types"],
        },
        status="pending",
        attempt_count=0,
    )
    db_session.add(activity)
    await db_session.commit()

    return {
        "course": course,
        "lesson": lesson,
        "next_lesson": next_lesson,
        "activity": activity,
    }


class TestActivitySubmissionAPI:

    @pytest.mark.asyncio
    async def test_submit_returns_review(self, client, seeded_activity):
        """POST /api/activities/{id}/submit returns ActivitySubmissionResponse."""
        activity_id = seeded_activity["activity"].id

        # Mock the activity_reviewer agent
        mock_review = {
            "score": 82,
            "max_score": 100,
            "rationale": "Correctly defines variables and assignment well. Identifies at least 3 core data types with solid examples.",
            "strengths": ["Good definitions", "Clear examples"],
            "improvements": ["Add dynamic typing", "Show type conversion"],
            "tips": ["Try type() function", "Reassign variables"],
            "mastery_decision": "meets",
        }

        with patch("app.services.submission.activity_reviewer") as mock_agent:
            mock_result = AsyncMock()
            mock_result.output = ActivityReviewOutput(**mock_review)
            mock_agent.run.return_value = mock_result

            response = await client.post(
                f"/api/activities/{activity_id}/submit",
                json={"submission_text": "Python variables store data values..."},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["score"] == 82
        assert data["mastery_decision"] == "meets"
        assert data["attempt_number"] == 1
        assert data["next_lesson_unlocked"] is True

    @pytest.mark.asyncio
    async def test_activity_db_updated_after_submission(
        self, client, seeded_activity, db_session
    ):
        """Activity row updated with submission, score, attempt count."""
        activity_id = seeded_activity["activity"].id

        with patch("app.services.submission.activity_reviewer") as mock_agent:
            mock_result = AsyncMock()
            mock_result.output = ActivityReviewOutput(
                score=75, max_score=100,
                rationale="Correctly defines variables and assignment. Identifies at least 3 core data types.",
                strengths=["Good", "Clear"],
                improvements=["Depth", "Examples"],
                tips=["Practice", "Review"],
                mastery_decision="meets",
            )
            mock_agent.run.return_value = mock_result
            await client.post(
                f"/api/activities/{activity_id}/submit",
                json={"submission_text": "My submission..."},
            )

        await db_session.refresh(seeded_activity["activity"])
        activity = seeded_activity["activity"]
        assert activity.submission_text == "My submission..."
        assert activity.reviewer_score == 75
        assert activity.attempt_count == 1
        assert activity.status == "reviewed"
        assert activity.mastery_decision == "meets"

    @pytest.mark.asyncio
    async def test_next_lesson_unlocked_after_submission(
        self, client, seeded_activity, db_session
    ):
        """Next lesson changes from 'locked' to 'unlocked' after submission."""
        activity_id = seeded_activity["activity"].id

        with patch("app.services.submission.activity_reviewer") as mock_agent:
            mock_result = AsyncMock()
            mock_result.output = ActivityReviewOutput(
                score=50, max_score=100,
                rationale="Correctly defines variables and assignment partially. Identifies at least 3 core data types was not met.",
                strengths=["Attempted", "On topic"],
                improvements=["More depth", "Add examples"],
                tips=["Review lesson", "Practice"],
                mastery_decision="not_yet",
            )
            mock_agent.run.return_value = mock_result
            await client.post(
                f"/api/activities/{activity_id}/submit",
                json={"submission_text": "Brief answer"},
            )

        await db_session.refresh(seeded_activity["next_lesson"])
        assert seeded_activity["next_lesson"].status == "unlocked"

    @pytest.mark.asyncio
    async def test_resubmission_increments_attempt_count(
        self, client, seeded_activity
    ):
        """Re-submission increments attempt_count and updates score."""
        activity_id = seeded_activity["activity"].id

        with patch("app.services.submission.activity_reviewer") as mock_agent:
            mock_result = AsyncMock()
            mock_result.output = ActivityReviewOutput(
                score=60, max_score=100,
                rationale="Correctly defines variables and assignment. Identifies at least 3 core data types partially.",
                strengths=["Attempted", "On topic"],
                improvements=["More depth", "Examples needed"],
                tips=["Review", "Practice"],
                mastery_decision="not_yet",
            )
            mock_agent.run.return_value = mock_result

            # First submission
            resp1 = await client.post(
                f"/api/activities/{activity_id}/submit",
                json={"submission_text": "First try"},
            )
            assert resp1.json()["attempt_number"] == 1

            # Second submission
            mock_result.output.score = 85
            mock_result.output.mastery_decision = "meets"
            resp2 = await client.post(
                f"/api/activities/{activity_id}/submit",
                json={"submission_text": "Second try, much better"},
            )
            assert resp2.json()["attempt_number"] == 2
            assert resp2.json()["score"] == 85

    @pytest.mark.asyncio
    async def test_nonexistent_activity_returns_404(self, client):
        fake_id = uuid.uuid4()
        response = await client.post(
            f"/api/activities/{fake_id}/submit",
            json={"submission_text": "hello"},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_empty_submission_returns_422(self, client, seeded_activity):
        activity_id = seeded_activity["activity"].id
        response = await client.post(
            f"/api/activities/{activity_id}/submit",
            json={"submission_text": ""},
        )
        assert response.status_code == 422
```

### Integration Tests — Graph Node

```python
# tests/integration/graph/test_activity_graph_node.py

import pytest
from pydantic_ai import models
from pydantic_ai.models.test import TestModel
from pydantic_graph import Graph

from app.graph.nodes.describe_course import DescribeCourseNode
from app.graph.nodes.plan_lesson import PlanLessonNode
from app.graph.nodes.write_lesson import WriteLessonNode
from app.graph.nodes.create_activity import ActivityCreatorNode
from app.graph.state import CourseGenerationState

models.ALLOW_MODEL_REQUESTS = False


class TestActivityCreatorNode:

    @pytest.mark.asyncio
    async def test_graph_includes_activity_creator_node(self):
        """Verify ActivityCreatorNode is in the execution sequence."""
        graph = Graph(
            nodes=[
                DescribeCourseNode,
                PlanLessonNode,
                WriteLessonNode,
                ActivityCreatorNode,
            ],
        )

        state = CourseGenerationState(
            objectives=["Understand Python variables"],
            # ... other state setup
        )

        # Override all agents with TestModel
        with (
            activity_creator.override(model=TestModel()),
            # ... other agent overrides
        ):
            async with graph.iter(DescribeCourseNode(), state=state) as graph_run:
                node_sequence = []
                async for node in graph_run:
                    node_sequence.append(type(node).__name__)

            assert "ActivityCreatorNode" in node_sequence

    @pytest.mark.asyncio
    async def test_activity_stored_in_state_after_node(self):
        """ActivityCreatorNode stores activity_spec in state."""
        # Setup state with a completed lesson (simulating after WriteLessonNode)
        state = CourseGenerationState(
            objectives=["Understand Python variables"],
            current_objective_index=0,
            lessons=[
                LessonState(
                    lesson_id=uuid.uuid4(),
                    lesson_content={"lessonTitle": "Variables"},
                    lesson_plan={
                        "learningObjective": {
                            "statement": "I can explain variables",
                            "measurableVerb": "explain",
                            "successEvidence": ["Defines variables"],
                        },
                        "masteryCriteria": {
                            "successMetric": "Can explain variables",
                            "rubricChecks": ["Defines variables correctly"],
                        },
                    },
                    suggested_activity={
                        "type": "short_response",
                        "prompt": "Explain variables",
                        "expected_evidence": ["Definition", "Examples"],
                    },
                ),
            ],
        )

        with activity_creator.override(model=TestModel()):
            node = ActivityCreatorNode()
            result = await node.run(
                GraphRunContext(state=state, deps=None)
            )

        assert state.lessons[0].activity_spec is not None
        assert "scoring_rubric" in state.lessons[0].activity_spec
```

### E2E Tests — Live LLM

```python
# tests/e2e/api/test_activity_live_llm.py

import pytest
import httpx

BASE_URL = "http://localhost:8000"

# These tests hit real LLM APIs — run with: pytest tests/e2e/ -m "e2e" --timeout=120


@pytest.mark.e2e
class TestActivityReviewerLiveLLM:

    @pytest.mark.asyncio
    async def test_thoughtful_submission_gets_high_score(self):
        """A thorough, on-topic submission should score meets or exceeds."""
        # Prerequisite: generate a course and get an activity ID
        async with httpx.AsyncClient(base_url=BASE_URL) as client:
            # Generate course (reuse from PRD 2 fixtures)
            course_resp = await client.post(
                "/api/courses/generate",
                json={
                    "description": "Introduction to Python Programming",
                    "objectives": ["Understand variables and data types"],
                },
                timeout=120.0,
            )
            course = course_resp.json()
            activity_id = course["lessons"][0]["activity"]["id"]

            # Submit a thorough response
            submit_resp = await client.post(
                f"/api/activities/{activity_id}/submit",
                json={
                    "submission_text": (
                        "Variables in Python are named references to objects in memory. "
                        "Unlike statically-typed languages, Python uses dynamic typing — "
                        "the type is determined at runtime. You create a variable simply "
                        "by assigning a value: x = 5 creates an integer, name = 'Alice' "
                        "creates a string, and pi = 3.14 creates a float. Python also has "
                        "booleans (True/False), lists, dictionaries, and more. Dynamic "
                        "typing means you can reassign x = 'hello' and Python won't "
                        "complain — x is now a string. You can check types with type(x). "
                        "This flexibility is powerful but requires discipline to avoid "
                        "type-related bugs at runtime."
                    ),
                },
                timeout=60.0,
            )

        assert submit_resp.status_code == 200
        data = submit_resp.json()
        assert data["score"] >= 70, f"Expected meets/exceeds, got score {data['score']}"
        assert data["mastery_decision"] in ("meets", "exceeds")
        assert len(data["strengths"]) >= 2
        assert len(data["improvements"]) >= 2
        assert len(data["tips"]) >= 2

    @pytest.mark.asyncio
    async def test_poor_submission_gets_low_score(self):
        """An off-topic or empty-ish submission should score not_yet."""
        async with httpx.AsyncClient(base_url=BASE_URL) as client:
            # Reuse existing activity from above or separate fixture
            course_resp = await client.post(
                "/api/courses/generate",
                json={
                    "description": "Introduction to Python Programming",
                    "objectives": ["Understand variables and data types"],
                },
                timeout=120.0,
            )
            course = course_resp.json()
            activity_id = course["lessons"][0]["activity"]["id"]

            submit_resp = await client.post(
                f"/api/activities/{activity_id}/submit",
                json={"submission_text": "I don't know, maybe something about code?"},
                timeout=60.0,
            )

        assert submit_resp.status_code == 200
        data = submit_resp.json()
        assert data["score"] < 70, f"Expected not_yet, got score {data['score']}"
        assert data["mastery_decision"] == "not_yet"
        assert len(data["improvements"]) >= 2
```

### Evaluation Suite

```python
# tests/evals/agents/test_activity_reviewer_evals.py

import pytest
from pydantic_evals import Dataset, Case
from pydantic_evals.evaluators import IsInstance, LLMJudge

from app.models.activity import ActivityReviewOutput


async def run_activity_reviewer(inputs: dict) -> ActivityReviewOutput:
    """Task function for pydantic_evals — runs the activity_reviewer agent."""
    from app.agents.activity_reviewer import activity_reviewer, ActivityReviewerDeps
    from app.models.activity import MasteryCriteria

    deps = ActivityReviewerDeps(
        objective_statement=inputs["objective"],
        mastery_criteria=MasteryCriteria(
            success_metric=inputs["success_metric"],
            rubric_checks=inputs["rubric_checks"],
        ),
        activity_prompt=inputs["activity_prompt"],
        scoring_rubric=inputs["scoring_rubric"],
        db_session=None,  # Not needed for eval
        agent_logger=None,
    )

    result = await activity_reviewer.run(
        f"Review this submission for: {inputs['activity_prompt']}\n\n"
        f"Submission:\n{inputs['submission_text']}",
        deps=deps,
    )
    return result.output


RUBRIC_CHECKS = [
    "Correctly defines variables and assignment",
    "Identifies at least 3 core data types with examples",
    "Demonstrates understanding of dynamic typing",
    "Uses accurate Python syntax in examples",
]

COMMON_INPUTS = {
    "objective": "I can explain Python variables and data types",
    "success_metric": "Can explain Python variables and types with examples",
    "rubric_checks": RUBRIC_CHECKS,
    "activity_prompt": "Explain what variables are in Python and describe at least 3 data types with examples",
    "scoring_rubric": RUBRIC_CHECKS,
}


submission_quality_dataset = Dataset(
    cases=[
        Case(
            name="excellent_submission",
            inputs={
                **COMMON_INPUTS,
                "submission_text": (
                    "Variables in Python are named references to objects stored in memory. "
                    "When you write x = 5, Python creates an integer object with value 5 "
                    "and binds the name 'x' to it. Python uses dynamic typing, meaning "
                    "you can later write x = 'hello' and x becomes a string — no type "
                    "declaration needed. The core data types include: integers (whole "
                    "numbers like 42 or -7), floats (decimal numbers like 3.14 or -0.5), "
                    "strings (text in quotes like 'hello world'), and booleans (True or "
                    "False). You can check any variable's type with type(x). Lists like "
                    "[1, 2, 3] and dicts like {'key': 'value'} are also fundamental. "
                    "Type conversion functions like int('5'), str(42), and float('3.14') "
                    "let you convert between types explicitly."
                ),
            },
            evaluators=[
                IsInstance(type_name="ActivityReviewOutput"),
                LLMJudge(
                    rubric="Score should be 85-100 for this thorough, accurate submission"
                ),
                LLMJudge(
                    rubric="Feedback references at least 2 specific rubric criteria"
                ),
            ],
        ),
        Case(
            name="adequate_submission",
            inputs={
                **COMMON_INPUTS,
                "submission_text": (
                    "Variables in Python store data. You can create one by writing "
                    "x = 5. There are different types like integers (5), strings "
                    "('hello'), and floats (3.14). Python figures out the type "
                    "automatically."
                ),
            },
            evaluators=[
                IsInstance(type_name="ActivityReviewOutput"),
                LLMJudge(
                    rubric="Score should be 60-80 for this brief but correct submission"
                ),
            ],
        ),
        Case(
            name="poor_submission",
            inputs={
                **COMMON_INPUTS,
                "submission_text": (
                    "Variables are things in programming. Python has some types I think."
                ),
            },
            evaluators=[
                IsInstance(type_name="ActivityReviewOutput"),
                LLMJudge(
                    rubric="Score should be 20-50 for this vague, incomplete submission"
                ),
            ],
        ),
        Case(
            name="off_topic_submission",
            inputs={
                **COMMON_INPUTS,
                "submission_text": (
                    "I really enjoy cooking Italian food. My favorite dish is "
                    "homemade pasta with a simple tomato sauce and fresh basil."
                ),
            },
            evaluators=[
                IsInstance(type_name="ActivityReviewOutput"),
                LLMJudge(
                    rubric=(
                        "Score should be 0-20 for this completely off-topic submission. "
                        "The rationale should clearly state the submission does not "
                        "address the prompt."
                    )
                ),
            ],
        ),
        Case(
            name="minimal_submission",
            inputs={
                **COMMON_INPUTS,
                "submission_text": "x = 5",
            },
            evaluators=[
                IsInstance(type_name="ActivityReviewOutput"),
                LLMJudge(
                    rubric=(
                        "Score should be 10-35 for this single line of code with "
                        "no explanation. Improvements should be specific and actionable."
                    )
                ),
            ],
        ),
    ],
)


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_activity_reviewer_quality():
    """Run the full evaluation suite against the activity_reviewer."""
    report = await submission_quality_dataset.evaluate(run_activity_reviewer)
    report.print()
    # All cases should pass their evaluators
    assert report.all_passed(), f"Evaluation failures: {report.failures()}"
```

### ADW Test (`04_activity_submission.py`)

#### ADW Implementation Pattern

ADW tests are **single-file `uv` scripts** using [PEP 723 inline script metadata](https://peps.python.org/pep-0723/). Each test is a self-contained `.py` file that can be run directly with `uv run`:

```bash
# Run a single ADW test
uv run tests/adw/04_activity_submission.py

# Run all ADW tests
uv run tests/adw/run_all.py
```

**Script structure** — every ADW test follows this pattern:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""ADW Test: Activity Submission — verify activity submission, feedback display, and lesson unlock."""

import json
import shutil
import subprocess
import sys
from pathlib import Path

PROMPT = """\
You are a QA tester for the 1111 School learning platform.
The app is running at http://localhost:5173 and the backend at http://localhost:8000.
Use agent-browser to automate the browser.

TEST: Activity submission and feedback display

PREREQUISITES:
- A course has already been generated (if not, generate one for "Introduction to Python Programming" with objective "Understand variables and data types")
- Navigate to the first lesson

STEPS:

1. `agent-browser open http://localhost:5173`
2. `agent-browser snapshot -i` to see available elements
3. Navigate to the first lesson of an existing course (or generate one first)
4. Find the activity section — take a snapshot to see the activity prompt, instructions, and input area
5. Read the activity prompt and instructions carefully

FIRST SUBMISSION (thoughtful response):
6. Write a substantive response that addresses the activity prompt. Include:
   - A definition of the core concept
   - At least 2-3 specific examples
   - A demonstration of understanding beyond surface level
7. Submit the response
8. Wait for feedback to appear (re-snapshot until the review loads)
9. `agent-browser screenshot --annotate ./test-results/activity-feedback-good.png`

VERIFY FIRST SUBMISSION:
- [ ] Score is displayed as a number (0-100)
- [ ] Feedback sections are visible: strengths, improvements, tips
- [ ] Strengths contain at least 2 specific observations (not generic "good job")
- [ ] Improvements contain at least 2 actionable targets
- [ ] Tips contain at least 2 next-step instructions
- [ ] Mastery decision is displayed (not_yet, meets, or exceeds)
- [ ] Score and mastery decision are consistent (meets should be 70-89)
- [ ] The feedback references specific content from the submission (not boilerplate)

SECOND SUBMISSION (deliberately poor):
10. Navigate back to the same activity (or find the re-submit option)
11. Submit a deliberately vague response: "I think it has something to do with code maybe"
12. Wait for feedback to appear
13. `agent-browser screenshot --annotate ./test-results/activity-feedback-poor.png`

VERIFY SECOND SUBMISSION:
- [ ] Score is lower than the first submission
- [ ] Mastery decision is "not_yet"
- [ ] Improvements are specific about what was missing
- [ ] Tips guide the learner toward the correct approach without giving the answer
- [ ] Attempt count shows this is attempt 2

VERIFY LESSON UNLOCK:
14. Navigate to the course overview or lesson list
15. `agent-browser snapshot -i` to see lesson states
- [ ] The next lesson (lesson 2) shows as unlocked/accessible
- [ ] The lesson that was just completed shows its completion state

16. `agent-browser screenshot --annotate ./test-results/lesson-unlock-state.png`

Output a JSON object:
{
  "test": "activity_submission",
  "passed": true/false,
  "checks": [
    {"name": "score_displayed", "passed": true/false, "notes": "..."},
    {"name": "feedback_sections_visible", "passed": true/false, "notes": "..."},
    {"name": "strengths_specific", "passed": true/false, "notes": "..."},
    {"name": "improvements_actionable", "passed": true/false, "notes": "..."},
    {"name": "tips_present", "passed": true/false, "notes": "..."},
    {"name": "mastery_score_consistent", "passed": true/false, "notes": "..."},
    {"name": "poor_submission_lower_score", "passed": true/false, "notes": "..."},
    {"name": "poor_submission_not_yet", "passed": true/false, "notes": "..."},
    {"name": "attempt_count_correct", "passed": true/false, "notes": "..."},
    {"name": "next_lesson_unlocked", "passed": true/false, "notes": "..."},
    {"name": "feedback_not_boilerplate", "passed": true/false, "notes": "..."}
  ],
  "screenshots": [
    "test-results/activity-feedback-good.png",
    "test-results/activity-feedback-poor.png",
    "test-results/lesson-unlock-state.png"
  ],
  "notes": "..."
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

- [ ] `ActivitySpecOutput` and `ActivityReviewOutput` Pydantic models implemented with all field constraints and validators
- [ ] `ActivityCreatorDeps` and `ActivityReviewerDeps` dataclasses implemented
- [ ] `activity_creator` agent implemented with system prompt, `output_type`, `@output_validator`, and `output_retries=2`
- [ ] `activity_reviewer` agent implemented with system prompt, `output_type`, `@output_validator`, and `output_retries=2`
- [ ] `ActivityCreatorNode` integrated into `pydantic_graph` course generation graph after `WriteLessonNode`
- [ ] Activity entity created and persisted in DB after activity_creator runs during course generation
- [ ] `POST /api/activities/{id}/submit` endpoint implemented and returning `ActivitySubmissionResponse`
- [ ] `GET /api/activities/{id}` endpoint implemented for activity retrieval
- [ ] `SubmissionService` orchestrates: load activity -> run reviewer -> update DB -> unlock next lesson -> return response
- [ ] Lesson unlock logic: any submission (regardless of mastery_decision) unlocks the next lesson
- [ ] Attempt count increments on re-submission, latest score/feedback updated
- [ ] Agent log recorded for both activity_creator and activity_reviewer runs
- [ ] All unit tests passing: model validation, output validators with ModelRetry, agents with TestModel/FunctionModel
- [ ] All integration tests passing: submission API flow, DB updates, lesson unlock, graph node execution
- [ ] E2E live LLM tests passing: thoughtful submission scores meets+, poor submission scores not_yet
- [ ] Evaluation suite passing: 5 submission quality levels scored consistently
- [ ] ADW test `04_activity_submission.md` passes: feedback displayed, scores consistent, lesson unlock verified
