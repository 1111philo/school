---
prd: 8
title: Assessment & Course Completion
phase: Enhancement
depends_on: [5]
agents: [assessment_creator (H), assessment_reviewer (I)]
status: draft
created: 2026-02-24
---

# PRD 8 — Assessment & Course Completion

## Overview

This PRD introduces summative assessment and course completion to 1111 School. After a learner completes all lessons and activities, the system generates a final assessment that covers every learning objective. The assessment_creator agent produces assessment items targeted at weak areas (informed by activity reviewer signals), and the assessment_reviewer agent scores each objective independently with rubric-referenced feedback. Passing the assessment awards a badge and marks the course complete; failing provides actionable next steps and allows retry.

This PRD delivers two new agents (H and I), the course completion state flow, the badge system, four API endpoints, and the assessment UI.

**Source PRD**: `/Users/dylanisaac/Downloads/PRD — 1111 School (Generative Learning Platform).md` (Sections 4.8, 7.2 H-I, 8.1 steps 5-6)
**Decomposition Plan**: `/Users/dylanisaac/Projects/pickOS/🚀 Projects/1. ✅ Active/1111 School/PRD Decomposition Plan.md`

---

## Goals

1. Validate learner mastery across all course objectives via a summative assessment generated after lesson completion.
2. Score each objective independently with rubric-referenced feedback so learners know exactly where they stand.
3. Provide actionable next steps for weak objectives (score < 70) so learners can improve and retry.
4. Award badges on course completion to recognize achievement and populate the learner profile.
5. Use activity reviewer signals (gaps, strengths) to target assessment items at areas needing verification.

## Non-Goals

- Adaptive assessment follow-ups for weak objectives (v2 iteration).
- Timed assessments or proctoring.
- Multi-attempt analytics dashboards (beyond attempt count and latest score).
- Image upload submissions (text-only for v1; image_upload type defined in schema but submission handling deferred).
- Badge design/artwork (placeholder visuals; design pass separate).
- Earlier in-course checkpoints or formative micro-assessments.
- Assessment item editing or regeneration by the learner.

---

## Scope

### New Agents

| Agent | ID | Purpose |
|-------|----|---------|
| assessment_creator | H | Generate assessment spec after all lessons complete |
| assessment_reviewer | I | Score assessment submission per objective, determine pass/fail |

### New Entities

| Entity | Purpose |
|--------|---------|
| Assessment | Stores spec, submissions, review, status per course instance |
| Badge | Tracks badge awards linked to course completion |

### State Machine Extensions

New transitions added to the course state machine (defined in PRD 4):

```
InProgress -> AwaitingAssessment    (all lessons completed)
AwaitingAssessment -> AssessmentReady (assessment_creator completes)
AssessmentReady -> Completed         (assessment_reviewer passes)
AssessmentReady -> AssessmentReady   (assessment_reviewer fails -> retry allowed)
Completed -> Completed               (terminal, badge awarded)
```

### API Endpoints (4 new)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/courses/{id}/assessment/generate` | Trigger assessment_creator |
| GET | `/api/courses/{id}/assessment` | Retrieve assessment spec + results |
| POST | `/api/courses/{id}/assessment/submit` | Submit responses, trigger assessment_reviewer |
| GET | `/api/badges` | List all badges for the current user |

### UI Screens

| Screen | Purpose |
|--------|---------|
| Assessment Screen | Display assessment items, accept per-item submissions |
| Assessment Results | Per-objective scores, overall pass/fail, next steps |
| Badge Award | Animated badge presentation on pass |
| Badge Display (Profile) | Badge inventory in learner profile (extends PRD 6) |

---

## Technical Design

### Agent Contracts

#### Agent H: assessment_creator

**Purpose**: Generate a summative assessment after all lessons are complete. Covers 100% of learning objectives, targets weak areas identified by activity reviewer signals.

**PydanticAI Configuration**:
```python
from pydantic_ai import Agent

assessment_creator = Agent(
    "google-gla:gemini-2.0-flash",
    output_type=AssessmentSpecOutput,
    deps_type=PipelineDeps,
    output_retries=2,
    instructions=dynamic_assessment_creator_instructions,  # @agent.instructions
)
```

**Input Context** (provided via system prompt + user message):
- Course description (focused objective per lesson)
- Learning objectives[]
- Learner profile (optional, for personalization)
- Activity reviewer outputs across all lessons: scores, gaps (improvements), strengths, tips

**Output Model**:

```python
from pydantic import BaseModel, Field
from enum import Enum
from typing import Literal


class AssessmentItemType(str, Enum):
    SHORT_RESPONSE = "short_response"
    IMAGE_UPLOAD = "image_upload"
    EITHER = "either"


class AssessmentItem(BaseModel):
    """A single assessment item targeting one learning objective."""

    objective: str = Field(
        description="The learning objective this item assesses. "
        "Must match exactly one objective from the input objectives list."
    )
    type: AssessmentItemType = Field(
        description="The submission modality required for this item."
    )
    prompt: str = Field(
        min_length=20,
        max_length=1000,
        description="A concise prompt requiring concrete artifact/evidence "
        "aligned to the objective. Must ask the learner to explain, apply, "
        "produce, or demonstrate — not vague asks like 'describe what you learned'."
    )
    rubric: list[str] = Field(
        min_length=3,
        max_length=6,
        description="3-6 gradeable criteria that are specific, observable, "
        "and binary-checkable where possible. Must align to objective mastery."
    )


class SubmissionRules(BaseModel):
    """Defines allowed submission modalities. Must be coherent with item types."""

    allowText: bool = Field(
        description="True if any item type is short_response or either."
    )
    allowImage: bool = Field(
        description="True if any item type is image_upload or either."
    )


class AssessmentSpecOutput(BaseModel):
    """Complete assessment specification generated by assessment_creator.

    Covers 100% of learning objectives with min(len(objectives), 6) items.
    Each item has a rubric-aligned prompt requiring evidence of mastery.
    """

    assessmentTitle: str = Field(
        min_length=5,
        max_length=200,
        description="A descriptive title for the assessment."
    )
    items: list[AssessmentItem] = Field(
        min_length=1,
        max_length=6,
        description="Assessment items. Count = min(len(objectives), 6). "
        "Every learning objective must be covered by at least one item."
    )
    submissionRules: SubmissionRules = Field(
        description="Allowed submission modalities, coherent with item types."
    )
```

**Output Validator**:

```python
from pydantic_ai import ModelRetry, RunContext


@assessment_creator.output_validator
async def validate_assessment_spec(
    ctx: RunContext[PipelineDeps], output: AssessmentSpecOutput
) -> AssessmentSpecOutput:
    objectives = ctx.deps.learning_objectives

    # 1. Item count = min(len(objectives), 6)
    expected_count = min(len(objectives), 6)
    if len(output.items) != expected_count:
        raise ModelRetry(
            f"Expected exactly {expected_count} items "
            f"(min(objectives={len(objectives)}, 6)), got {len(output.items)}."
        )

    # 2. 100% objective coverage — every objective assessed
    covered_objectives = {item.objective for item in output.items}
    missing = set(objectives) - covered_objectives
    if missing:
        raise ModelRetry(
            f"Missing objective coverage. These objectives are not assessed: "
            f"{missing}. Every objective must appear as an item.objective."
        )

    # 3. No phantom objectives — items must reference real objectives
    extra = covered_objectives - set(objectives)
    if extra:
        raise ModelRetry(
            f"Items reference objectives not in the input list: {extra}. "
            f"Valid objectives are: {objectives}"
        )

    # 4. Submission rules coherent with item types
    has_text = any(
        item.type in (AssessmentItemType.SHORT_RESPONSE, AssessmentItemType.EITHER)
        for item in output.items
    )
    has_image = any(
        item.type in (AssessmentItemType.IMAGE_UPLOAD, AssessmentItemType.EITHER)
        for item in output.items
    )
    if has_text and not output.submissionRules.allowText:
        raise ModelRetry(
            "submissionRules.allowText must be true because at least one item "
            "has type short_response or either."
        )
    if has_image and not output.submissionRules.allowImage:
        raise ModelRetry(
            "submissionRules.allowImage must be true because at least one item "
            "has type image_upload or either."
        )

    # 5. Rubric count per item (3-6) — enforced by Pydantic, but double-check
    for i, item in enumerate(output.items):
        if not (3 <= len(item.rubric) <= 6):
            raise ModelRetry(
                f"Item {i} rubric has {len(item.rubric)} criteria; must be 3-6."
            )

    return output
```

**Dynamic Instructions**:

```python
@assessment_creator.instructions
async def dynamic_assessment_creator_instructions(
    ctx: RunContext[PipelineDeps],
) -> str:
    profile_section = ""
    if ctx.deps.learner_profile:
        profile_section = (
            f"\n\nLearner Profile:\n"
            f"- Experience Level: {ctx.deps.learner_profile.experience_level}\n"
            f"- Learning Style: {ctx.deps.learner_profile.preferred_learning_style}\n"
            f"- Interests: {', '.join(ctx.deps.learner_profile.interests)}\n"
            f"Incorporate at least one profile signal to personalize assessment "
            f"relevance without fabricating details not in the profile."
        )

    activity_signals = ""
    if ctx.deps.activity_review_summaries:
        gaps = []
        strengths = []
        for summary in ctx.deps.activity_review_summaries:
            gaps.extend(summary.get("improvements", []))
            strengths.extend(summary.get("strengths", []))
        activity_signals = (
            f"\n\nActivity Reviewer Signals:\n"
            f"- Identified gaps/weaknesses: {gaps[:10]}\n"
            f"- Identified strengths: {strengths[:10]}\n"
            f"Target weak areas with assessment items. If gaps are common for "
            f"an objective, that item should explicitly probe the gap. "
            f"Strong objectives can be streamlined but must still verify mastery."
        )

    return (
        "You are an assessment designer for a personalized learning platform.\n\n"
        "Your task: Create a summative assessment covering ALL learning objectives.\n\n"
        "Rules:\n"
        "1. Produce exactly min(len(objectives), 6) items.\n"
        "2. Every learning objective must be assessed by at least one item.\n"
        "3. Each item prompt requires concrete evidence of mastery "
        "(explain, apply, produce, demonstrate).\n"
        "4. Each item has 3-6 specific, observable, gradeable rubric criteria.\n"
        "5. submissionRules must be coherent with item types.\n"
        "6. Prompts must avoid vague asks — require specific artifacts.\n"
        "7. Use activity reviewer signals to target weak areas.\n"
        f"{profile_section}"
        f"{activity_signals}"
    )
```

---

#### Agent I: assessment_reviewer

**Purpose**: Score the assessment submission per objective, determine pass/fail, provide actionable next steps for weak objectives.

**PydanticAI Configuration**:
```python
assessment_reviewer = Agent(
    "google-gla:gemini-2.0-flash",
    output_type=AssessmentReviewOutput,
    deps_type=PipelineDeps,
    output_retries=2,
    instructions=dynamic_assessment_reviewer_instructions,  # @agent.instructions
)
```

**Input Context** (provided via system prompt + user message):
- Assessment spec (items + rubrics)
- Submission responses per item
- Learner profile (optional, for personalized next steps)

**Output Model**:

```python
from pydantic import BaseModel, Field, model_validator
from typing import Literal


class PassDecision(str, Enum):
    FAIL = "fail"
    PASS = "pass"


class ObjectiveScore(BaseModel):
    """Score and feedback for a single learning objective."""

    objective: str = Field(
        description="The learning objective being scored. "
        "Must match an objective from the assessment spec."
    )
    score: int = Field(
        ge=0,
        le=100,
        description="Score for this objective, 0-100."
    )
    maxScore: Literal[100] = Field(
        default=100,
        description="Always 100."
    )
    feedback: str = Field(
        min_length=10,
        max_length=800,
        description="1-4 sentences of rubric-referenced feedback: "
        "what met the rubric, what did not, what to change. "
        "Must reference specific rubric criteria."
    )


class AssessmentReviewOutput(BaseModel):
    """Assessment review with per-objective scoring and pass/fail decision.

    pass = overallScore 70-100, fail = overallScore 0-69.
    Every objective scored independently. Actionable next steps
    for any objective with score < 70.
    """

    overallScore: int = Field(
        ge=0,
        le=100,
        description="Overall assessment score, 0-100."
    )
    maxScore: Literal[100] = Field(
        default=100,
        description="Always 100."
    )
    objectiveScores: list[ObjectiveScore] = Field(
        min_length=1,
        description="One score entry per objective in the assessment spec. "
        "Every objective must be represented."
    )
    passDecision: PassDecision = Field(
        description="pass if overallScore >= 70, fail if overallScore <= 69."
    )
    nextSteps: list[str] = Field(
        description="Actionable next steps. Required for every objective "
        "with score < 70. Each step is a concrete task, not vague advice."
    )

    @model_validator(mode="after")
    def validate_pass_decision_consistency(self) -> "AssessmentReviewOutput":
        if self.passDecision == PassDecision.PASS and self.overallScore < 70:
            raise ValueError(
                f"passDecision is 'pass' but overallScore is {self.overallScore} "
                f"(must be >= 70 for pass)."
            )
        if self.passDecision == PassDecision.FAIL and self.overallScore >= 70:
            raise ValueError(
                f"passDecision is 'fail' but overallScore is {self.overallScore} "
                f"(must be < 70 for fail)."
            )
        return self
```

**Output Validator**:

```python
@assessment_reviewer.output_validator
async def validate_assessment_review(
    ctx: RunContext[PipelineDeps], output: AssessmentReviewOutput
) -> AssessmentReviewOutput:
    spec_objectives = {item.objective for item in ctx.deps.assessment_spec.items}

    # 1. Complete objective coverage
    scored_objectives = {s.objective for s in output.objectiveScores}
    missing = spec_objectives - scored_objectives
    if missing:
        raise ModelRetry(
            f"Missing scores for objectives: {missing}. "
            f"Every objective in the assessment spec must be scored."
        )

    extra = scored_objectives - spec_objectives
    if extra:
        raise ModelRetry(
            f"Scores reference objectives not in the assessment spec: {extra}."
        )

    # 2. Pass/fail consistency (also in model_validator, but ModelRetry is better for LLM)
    if output.passDecision == PassDecision.PASS and output.overallScore < 70:
        raise ModelRetry(
            f"passDecision is 'pass' but overallScore is {output.overallScore}. "
            f"pass requires overallScore >= 70."
        )
    if output.passDecision == PassDecision.FAIL and output.overallScore >= 70:
        raise ModelRetry(
            f"passDecision is 'fail' but overallScore is {output.overallScore}. "
            f"fail requires overallScore < 70."
        )

    # 3. Actionable next steps for weak objectives
    weak_objectives = [
        s.objective for s in output.objectiveScores if s.score < 70
    ]
    if weak_objectives and not output.nextSteps:
        raise ModelRetry(
            f"Objectives with score < 70 exist ({weak_objectives}) but "
            f"nextSteps is empty. Provide at least one actionable next step "
            f"per weak objective."
        )

    # 4. Next steps count >= weak objectives count
    if len(output.nextSteps) < len(weak_objectives):
        raise ModelRetry(
            f"There are {len(weak_objectives)} weak objectives (score < 70) "
            f"but only {len(output.nextSteps)} next steps. Provide at least "
            f"one next step per weak objective."
        )

    # 5. Per-objective score bounds (enforced by Pydantic, but explicit for LLM)
    for s in output.objectiveScores:
        if not (0 <= s.score <= 100):
            raise ModelRetry(
                f"Objective '{s.objective}' has score {s.score}; must be 0-100."
            )

    return output
```

**Dynamic Instructions**:

```python
@assessment_reviewer.instructions
async def dynamic_assessment_reviewer_instructions(
    ctx: RunContext[PipelineDeps],
) -> str:
    profile_section = ""
    if ctx.deps.learner_profile:
        profile_section = (
            f"\n\nLearner Profile (for personalized next steps only):\n"
            f"- Experience Level: {ctx.deps.learner_profile.experience_level}\n"
            f"- Preferred Style: {ctx.deps.learner_profile.preferred_learning_style}\n"
            f"Adapt next steps to the learner's level and preferences. "
            f"Do not include sensitive profile data in output."
        )

    return (
        "You are an assessment reviewer for a personalized learning platform.\n\n"
        "Your task: Score the learner's assessment submission per objective.\n\n"
        "Rules:\n"
        "1. Score each objective independently (0-100) based on demonstrated "
        "evidence, not averaged impressions.\n"
        "2. overallScore is 0-100. passDecision: pass = 70-100, fail = 0-69.\n"
        "3. Reference specific rubric criteria in each objective's feedback.\n"
        "4. Feedback is 1-4 sentences: what met rubric, what didn't, what to change.\n"
        "5. For every objective with score < 70, include at least one specific, "
        "actionable next step (concrete task, not 'study more').\n"
        "6. If a required submission modality is missing, score that objective "
        "low and state the missing requirement.\n"
        "7. maxScore is always 100 for overall and per-objective.\n"
        f"{profile_section}"
    )
```

---

### Supporting Models

#### Assessment Submission Input

```python
class AssessmentItemSubmission(BaseModel):
    """A learner's response to a single assessment item."""

    itemIndex: int = Field(
        ge=0,
        description="Index of the item in the assessment spec's items array."
    )
    textResponse: str | None = Field(
        default=None,
        max_length=5000,
        description="Text submission for short_response or either items."
    )
    imageUrl: str | None = Field(
        default=None,
        description="URL of uploaded image for image_upload or either items. "
        "Deferred to v2 implementation."
    )


class AssessmentSubmissionInput(BaseModel):
    """Complete assessment submission from the learner."""

    responses: list[AssessmentItemSubmission] = Field(
        min_length=1,
        description="One response per assessment item."
    )
```

#### Activity Review Summary (Input to assessment_creator)

```python
class ActivityReviewSummary(BaseModel):
    """Summary of activity reviewer output for a single lesson.
    Passed to assessment_creator as context for targeting weak areas."""

    lessonObjective: str
    score: int = Field(ge=0, le=100)
    masteryDecision: Literal["not_yet", "meets", "exceeds"]
    strengths: list[str]
    improvements: list[str]
    tips: list[str]
```

---

### Completion Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    COURSE COMPLETION FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Learner completes all lessons + activities                      │
│       │                                                          │
│       ▼                                                          │
│  ┌──────────────────────┐                                        │
│  │  InProgress →        │  Guard: all lessons status=completed   │
│  │  AwaitingAssessment  │  Trigger: automatic on last activity   │
│  └──────────┬───────────┘                                        │
│             │                                                    │
│             ▼                                                    │
│  ┌──────────────────────┐                                        │
│  │  POST /assessment/   │  Client triggers generation            │
│  │  generate            │                                        │
│  └──────────┬───────────┘                                        │
│             │                                                    │
│             ▼                                                    │
│  ┌──────────────────────┐                                        │
│  │  assessment_creator  │  Agent H runs                          │
│  │  (Agent H)           │  Input: objectives, profile,           │
│  │                      │         activity review summaries       │
│  └──────────┬───────────┘                                        │
│             │                                                    │
│             ▼                                                    │
│  ┌──────────────────────┐                                        │
│  │  AwaitingAssessment  │  Assessment spec stored in DB          │
│  │  → AssessmentReady   │  State transition                      │
│  └──────────┬───────────┘                                        │
│             │                                                    │
│             ▼                                                    │
│  ┌──────────────────────┐                                        │
│  │  Learner views       │  GET /assessment returns spec          │
│  │  assessment items    │  UI renders per-item prompts           │
│  └──────────┬───────────┘                                        │
│             │                                                    │
│             ▼                                                    │
│  ┌──────────────────────┐                                        │
│  │  POST /assessment/   │  Learner submits all responses         │
│  │  submit              │                                        │
│  └──────────┬───────────┘                                        │
│             │                                                    │
│             ▼                                                    │
│  ┌──────────────────────┐                                        │
│  │  assessment_reviewer │  Agent I runs                          │
│  │  (Agent I)           │  Input: spec + rubrics, submissions,   │
│  │                      │         learner profile                 │
│  └──────────┬───────────┘                                        │
│             │                                                    │
│        ┌────┴────┐                                               │
│        │         │                                               │
│        ▼         ▼                                               │
│   ┌────────┐ ┌────────┐                                          │
│   │ PASS   │ │ FAIL   │                                          │
│   │ ≥ 70   │ │ < 70   │                                          │
│   └───┬────┘ └───┬────┘                                          │
│       │          │                                               │
│       ▼          ▼                                               │
│  ┌─────────┐ ┌──────────────────┐                                │
│  │Completed│ │ Show next steps  │                                │
│  │+ Badge  │ │ Allow retry      │                                │
│  │awarded  │ │ State stays      │                                │
│  └─────────┘ │ AssessmentReady  │                                │
│              └──────────────────┘                                 │
│                     │                                            │
│                     ▼                                            │
│              ┌──────────────┐                                    │
│              │ Retry submit │  New attempt, re-run Agent I       │
│              │ (loop back)  │  Attempt count incremented         │
│              └──────────────┘                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### State Transition Guards

```python
class CourseStateTransitions:
    """Assessment-related state transition guards."""

    @staticmethod
    def can_enter_awaiting_assessment(course: CourseInstance) -> bool:
        """All lessons must have status=completed."""
        return all(
            lesson.status == LessonStatus.COMPLETED
            for lesson in course.lessons
        )

    @staticmethod
    def can_enter_assessment_ready(course: CourseInstance) -> bool:
        """Assessment spec must exist in DB."""
        return course.assessment is not None and course.assessment.spec_json is not None

    @staticmethod
    def can_enter_completed(course: CourseInstance) -> bool:
        """Assessment must be reviewed with passDecision=pass."""
        return (
            course.assessment is not None
            and course.assessment.review_json is not None
            and course.assessment.review_json.get("passDecision") == "pass"
        )
```

---

### Badge System

#### Badge Entity

```python
from sqlalchemy import Column, String, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
import enum


class BadgeType(str, enum.Enum):
    COURSE_COMPLETION = "course_completion"


class Badge(Base):
    """Badge awarded on course completion."""

    __tablename__ = "badges"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    course_instance_id: Mapped[str] = mapped_column(
        ForeignKey("course_instances.id"), nullable=False, unique=True
    )
    badge_type: Mapped[BadgeType] = mapped_column(
        SAEnum(BadgeType), nullable=False, default=BadgeType.COURSE_COMPLETION
    )
    awarded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    user = relationship("User", back_populates="badges")
    course_instance = relationship("CourseInstance", back_populates="badge")
```

#### Badge Pydantic Response Model

```python
class BadgeResponse(BaseModel):
    """Badge data returned by the API."""

    id: str
    badgeType: BadgeType
    awardedAt: datetime
    courseInstanceId: str
    courseTitle: str  # Denormalized for display convenience
    courseDescription: str | None = None
```

#### Badge Award Logic

```python
async def award_badge_on_pass(
    db: AsyncSession,
    course: CourseInstance,
    review: AssessmentReviewOutput,
) -> Badge | None:
    """Award a badge if the assessment was passed. Idempotent."""
    if review.passDecision != PassDecision.PASS:
        return None

    # Check if badge already exists (idempotent)
    existing = await db.execute(
        select(Badge).where(Badge.course_instance_id == course.id)
    )
    if existing.scalar_one_or_none():
        return existing.scalar_one()

    badge = Badge(
        user_id=course.user_id,
        course_instance_id=course.id,
        badge_type=BadgeType.COURSE_COMPLETION,
    )
    db.add(badge)
    await db.flush()
    return badge
```

---

### Assessment Entity (SQLAlchemy)

```python
class AssessmentStatus(str, enum.Enum):
    GENERATING = "generating"
    READY = "ready"
    SUBMITTED = "submitted"
    REVIEWED = "reviewed"


class Assessment(Base):
    """Assessment for a course instance. One assessment per course."""

    __tablename__ = "assessments"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    course_instance_id: Mapped[str] = mapped_column(
        ForeignKey("course_instances.id"), nullable=False, unique=True
    )
    spec_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    submission_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    review_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[AssessmentStatus] = mapped_column(
        SAEnum(AssessmentStatus), nullable=False, default=AssessmentStatus.GENERATING
    )
    attempt_count: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    course_instance = relationship("CourseInstance", back_populates="assessment")
```

---

## API Endpoints

### POST `/api/courses/{id}/assessment/generate`

Trigger assessment generation. Requires all lessons to be completed.

**Request**: No body (course ID in path).

**Guards**:
- Course must be in `AwaitingAssessment` state (all lessons completed).
- If course is not in `AwaitingAssessment`, return `409 Conflict` with message explaining prerequisite.
- If assessment already exists (idempotent), return existing assessment.

**Flow**:
1. Validate course state is `AwaitingAssessment`.
2. Collect activity reviewer summaries from all lessons.
3. Run `assessment_creator` agent with objectives, profile, and activity signals.
4. Store `AssessmentSpecOutput` as `spec_json` on Assessment entity.
5. Transition course state to `AssessmentReady`.
6. Log agent run to AgentLog.

**Response** (`200 OK`):
```json
{
  "assessmentId": "string",
  "status": "ready",
  "spec": { ...AssessmentSpecOutput... }
}
```

**Error Responses**:
- `404`: Course not found.
- `409`: Course not in AwaitingAssessment state (lessons incomplete).
- `500`: Agent failure after retries.

---

### GET `/api/courses/{id}/assessment`

Retrieve assessment spec and review results (if submitted).

**Response** (`200 OK`):
```json
{
  "assessmentId": "string",
  "status": "ready | submitted | reviewed",
  "spec": { ...AssessmentSpecOutput... },
  "review": { ...AssessmentReviewOutput... } | null,
  "attemptCount": 0,
  "badge": { ...BadgeResponse... } | null
}
```

**Error Responses**:
- `404`: Course not found or no assessment generated yet.

---

### POST `/api/courses/{id}/assessment/submit`

Submit assessment responses and trigger review.

**Request Body**:
```json
{
  "responses": [
    {
      "itemIndex": 0,
      "textResponse": "My answer to item 0..."
    },
    {
      "itemIndex": 1,
      "textResponse": "My answer to item 1..."
    }
  ]
}
```

**Guards**:
- Course must be in `AssessmentReady` state.
- Assessment must exist with `spec_json` populated.
- Every item in the spec must have a corresponding response.
- Response modality must match item type (text for short_response, etc.).

**Flow**:
1. Validate course state and submission completeness.
2. Store submission in `submission_json`.
3. Increment `attempt_count`.
4. Run `assessment_reviewer` agent with spec, rubrics, submissions, and profile.
5. Store `AssessmentReviewOutput` as `review_json`.
6. If `passDecision == "pass"`:
   - Transition course state to `Completed`.
   - Award badge via `award_badge_on_pass()`.
7. If `passDecision == "fail"`:
   - State remains `AssessmentReady` (retry allowed).
   - Clear `submission_json` and `review_json` on next attempt (keep latest only).
8. Log agent run to AgentLog.

**Response** (`200 OK`):
```json
{
  "review": { ...AssessmentReviewOutput... },
  "badge": { ...BadgeResponse... } | null,
  "courseStatus": "Completed | AssessmentReady"
}
```

**Error Responses**:
- `404`: Course or assessment not found.
- `409`: Course not in AssessmentReady state.
- `422`: Missing responses for required items.
- `500`: Agent failure after retries.

---

### GET `/api/badges`

List all badges for the current user.

**Response** (`200 OK`):
```json
{
  "badges": [
    {
      "id": "string",
      "badgeType": "course_completion",
      "awardedAt": "2026-02-24T12:00:00Z",
      "courseInstanceId": "string",
      "courseTitle": "Introduction to Python",
      "courseDescription": "A beginner-friendly course..."
    }
  ]
}
```

---

## UI Specs

### Assessment Screen

**Route**: `/courses/{id}/assessment`

**Layout**:
- Header with assessment title and progress indicator (items completed / total)
- Sequential item display (one at a time or scrollable list)
- Per-item card with:
  - Objective label (which objective this item tests)
  - Prompt text (rendered as Markdown)
  - Text input area (Shadcn Textarea, 5000 char limit visible)
  - Item type indicator badge (short_response / image_upload / either)
- Submit button (disabled until all required items have responses)
- "Save draft" option (stores locally, not submitted to server)

**Components** (Shadcn/ui):
- `Card` for each assessment item
- `Textarea` for text responses
- `Badge` for item type indicators
- `Button` for submit
- `Progress` bar for item completion
- `Alert` for validation messages (missing responses)

**States**:
- `loading`: Skeleton cards while fetching assessment spec
- `in_progress`: Items displayed, responses being entered
- `submitting`: Submit button disabled, spinner shown
- `reviewed`: Redirect to results screen

---

### Assessment Results Screen

**Route**: `/courses/{id}/assessment/results`

**Layout**:
- Overall result banner:
  - Pass: Green banner with checkmark, overall score, "Congratulations!"
  - Fail: Amber banner with retry icon, overall score, "Keep going!"
- Overall score display: large number with circular progress indicator
- Per-objective score cards (expandable):
  - Objective name
  - Score bar (0-100, color-coded: red < 70, yellow 70-89, green >= 90)
  - Feedback text (rubric-referenced)
- Next steps section (only shown on fail):
  - Numbered list of actionable next steps
  - Each step is specific and tied to a weak objective
- Action buttons:
  - Pass: "View Badge" button, "Return to Course" button
  - Fail: "Retry Assessment" button, "Review Lessons" button

**Components** (Shadcn/ui):
- `Alert` for overall result banner (variant: success or warning)
- `Progress` circular for overall score
- `Accordion` for per-objective score cards
- `Badge` for score labels (pass/fail/per-objective)
- `Button` for actions
- `Card` for next steps section

---

### Badge Award Animation

**Trigger**: Displayed when assessment results show pass.

**Animation sequence** (Framer Motion):
1. Overlay dims background (0.3s fade)
2. Badge icon scales from 0 to 1.2 to 1.0 (spring animation, 0.6s)
3. Course title fades in below badge (0.3s delay)
4. "Course Completed" text appears (0.2s delay)
5. Confetti particles (optional, 2s duration)
6. "Continue" button fades in (0.5s delay)

**Badge visual** (placeholder for v1):
- Circular badge with gradient border
- Star or checkmark icon center
- Course title text below

---

### Badge Display (Profile Extension)

**Location**: Learner Profile page (PRD 6), badge inventory section.

**Layout**:
- Grid of badge cards (responsive: 2-4 columns)
- Each badge card:
  - Badge icon (same as award animation)
  - Course title
  - Award date
  - Click to navigate to completed course overview

**Empty state**: "Complete a course to earn your first badge!"

---

## Acceptance Criteria

### assessment_creator (Agent H)

1. Output is valid JSON matching `AssessmentSpecOutput` schema exactly. No extra keys.
2. Every learning objective appears as at least one `items[i].objective`.
3. Item count = `min(len(objectives), 6)`.
4. Each item has 3-6 specific, observable, gradeable rubric criteria.
5. `submissionRules` is coherent with item types (allowText/allowImage match modalities present).
6. Each prompt requires concrete evidence of mastery (explain, apply, produce, demonstrate).
7. Assessment adapts based on activity reviewer signals: gaps targeted, strong areas streamlined.
8. At least one learner profile signal incorporated if profile is provided.
9. Schema validation failure retries once with correction prompt; second failure returns structured error.

### assessment_reviewer (Agent I)

1. Output is valid JSON matching `AssessmentReviewOutput` schema exactly. No extra keys.
2. `overallScore` is 0-100. `maxScore` is always 100.
3. `passDecision` is consistent: pass = 70-100, fail = 0-69.
4. `objectiveScores` covers every objective in the assessment spec. No extra objectives.
5. Each `objectiveScores[i].feedback` references specific rubric criteria (not generic).
6. Feedback is 1-4 sentences: what met rubric, what didn't, what to change.
7. For every objective with score < 70, `nextSteps` includes at least one specific, actionable step.
8. `nextSteps` are concrete tasks, not vague ("study more" is insufficient).
9. If a required submission modality is missing, score is low and feedback states what's missing.
10. Schema validation failure retries once; second failure returns structured error.

### Completion Flow

1. Course transitions to `AwaitingAssessment` only when all lessons are completed.
2. `POST /assessment/generate` returns 409 if lessons are not all completed.
3. `POST /assessment/generate` is idempotent (returns existing assessment if already generated).
4. `POST /assessment/submit` triggers `assessment_reviewer` and stores results.
5. Pass (>= 70) transitions course to `Completed` and awards badge.
6. Fail (< 70) keeps state at `AssessmentReady`, shows next steps, allows retry.
7. Retry increments `attempt_count` and re-runs `assessment_reviewer` on new submission.
8. Badge is created exactly once per course (idempotent).

### Badge System

1. Badge created with correct `badgeType`, `awardedAt`, and `courseInstanceId` on pass.
2. Badge appears in `GET /api/badges` response immediately after creation.
3. No badge created on fail.
4. Badge is visible in learner profile badge inventory.

---

## Verification

### Unit Tests

**Agent I/O Models**:
- `AssessmentSpecOutput` rejects: missing fields, items > 6, rubric outside 3-6, invalid item type enum.
- `AssessmentReviewOutput` rejects: overallScore outside 0-100, passDecision inconsistent with score, missing objectiveScores.
- `ObjectiveScore` rejects: score outside 0-100, maxScore != 100, empty feedback.
- `SubmissionRules` coherence: allowText=false with short_response items raises validation.
- `AssessmentSubmissionInput` rejects: empty responses, negative itemIndex.

**Output Validators**:
- `validate_assessment_spec`: raises `ModelRetry` when objective is missing from items.
- `validate_assessment_spec`: raises `ModelRetry` when items > `min(objectives, 6)`.
- `validate_assessment_spec`: raises `ModelRetry` when phantom objectives referenced.
- `validate_assessment_spec`: raises `ModelRetry` when submissionRules incoherent with types.
- `validate_assessment_review`: raises `ModelRetry` when passDecision="pass" but score < 70.
- `validate_assessment_review`: raises `ModelRetry` when weak objective (< 70) has no nextStep.
- `validate_assessment_review`: raises `ModelRetry` when objective missing from scores.

**Badge Logic**:
- `award_badge_on_pass` creates badge when passDecision=pass.
- `award_badge_on_pass` returns None when passDecision=fail.
- `award_badge_on_pass` is idempotent (second call returns existing badge).
- Badge appears in user's badge list after creation.

**State Transitions**:
- `can_enter_awaiting_assessment` returns False when any lesson is not completed.
- `can_enter_awaiting_assessment` returns True when all lessons completed.
- `can_enter_completed` returns False when review is None or passDecision=fail.
- `can_enter_completed` returns True when passDecision=pass.

**Agents (TestModel)**:
- `assessment_creator` with `TestModel(custom_output_args={...})` produces valid `AssessmentSpecOutput`.
- `assessment_reviewer` with `FunctionModel` returns controlled scores to test boundary: 69 -> fail, 70 -> pass.
- Agent with intentionally invalid `custom_output_args` triggers retry behavior.
- Both agents correctly access `ctx.deps` (PipelineDeps with mock DB and logger).

### Integration Tests

**Completion Flow API**:
- Complete all lessons -> `POST /assessment/generate` -> 200, assessment stored (agents mocked).
- `GET /assessment` returns spec with all objectives covered.
- `POST /assessment/submit` with all responses -> 200, review stored, badge created if pass (agents mocked).
- Attempt `POST /assessment/generate` when lessons incomplete -> 409 Conflict.
- Attempt `POST /assessment/submit` before generation -> 409 or 404.
- Course state transitions verified at each step: InProgress -> AwaitingAssessment -> AssessmentReady -> Completed.
- Retry flow: submit fail response -> state stays AssessmentReady -> submit pass response -> state becomes Completed.

**Badge API**:
- `GET /api/badges` returns empty list for user with no completed courses.
- After course completion, `GET /api/badges` returns 1 badge with correct fields.
- Badge `courseTitle` is denormalized correctly.

**Agent Logging**:
- After `POST /assessment/generate`, AgentLog contains entry for assessment_creator.
- After `POST /assessment/submit`, AgentLog contains entry for assessment_reviewer.
- Log entries include prompt, output, timing, tokens, model, status.

### E2E Tests (Live LLM, CI-gated)

**Full Lifecycle**:
- Generate a course -> complete all activities -> generate assessment -> verify all objectives covered in spec.
- Submit thoughtful assessment responses -> verify pass with score >= 70 and badge awarded.
- Submit weak/empty responses -> verify fail with score < 70, actionable next steps per weak objective.
- Verify next steps reference specific objectives and are concrete (not "study more").

**Scoring Consistency**:
- Submit identical strong responses twice -> verify scores are semantically consistent (within 10-point range).
- Verify passDecision matches overallScore on every live run.

**Edge Cases**:
- Course with 1 objective -> 1 assessment item covering it.
- Course with 8 objectives -> 6 assessment items (capped), all 8 objectives still covered (some items cover multiple via explicit listing).

### Evaluation Suite (`pydantic_evals`)

**assessment_creator Dataset** (5 cases):
```python
Dataset(cases=[
    Case(name="python_basics_3obj", inputs={...}, evaluators=[
        IsInstance(type_name="AssessmentSpecOutput"),
        # Custom: verify item count = min(3, 6) = 3
        # Custom: verify all 3 objectives covered
        LLMJudge(rubric="Each prompt requires concrete evidence of mastery, "
                         "not vague 'describe what you learned'"),
    ]),
    Case(name="cooking_5obj", inputs={...}, evaluators=[...]),
    Case(name="photography_2obj", inputs={...}, evaluators=[...]),
    Case(name="project_mgmt_6obj", inputs={...}, evaluators=[...]),
    Case(name="music_theory_8obj_capped", inputs={...}, evaluators=[
        # Custom: verify item count = 6 (capped) with 8 objectives covered
    ]),
])
```

**assessment_reviewer Dataset** (5 cases):
```python
Dataset(cases=[
    Case(name="strong_submission", inputs={...}, evaluators=[
        # Custom: overallScore >= 70, passDecision = pass
        LLMJudge(rubric="Feedback references specific rubric criteria "
                         "and provides constructive assessment"),
    ]),
    Case(name="weak_submission", inputs={...}, evaluators=[
        # Custom: overallScore < 70, passDecision = fail
        # Custom: nextSteps.length >= count(objectives with score < 70)
        LLMJudge(rubric="Next steps are specific, actionable tasks "
                         "targeting the weak objectives"),
    ]),
    Case(name="mixed_submission", inputs={...}, evaluators=[...]),
    Case(name="off_topic_submission", inputs={...}, evaluators=[...]),
    Case(name="empty_submission", inputs={...}, evaluators=[
        # Custom: all scores very low, fail, comprehensive next steps
    ]),
])
```

### ADW Implementation Pattern

ADW tests are **single-file `uv` scripts** using [PEP 723 inline script metadata](https://peps.python.org/pep-0723/). Each test is a self-contained `.py` file that can be run directly with `uv run`:

```bash
# Run a single ADW test
uv run tests/adw/07_assessment_flow.py

# Run all ADW tests
uv run tests/adw/run_all.py
```

**Script structure** — every ADW test follows this pattern:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""ADW Test: Assessment Flow — full assessment lifecycle and course completion."""

import json
import shutil
import subprocess
import sys
from pathlib import Path

PROMPT = """\
<the existing ADW prompt content goes here — see test prompt below>
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

### ADW Test (`07_assessment_flow.md`)

```markdown
# ADW Test: Assessment & Course Completion Flow

You are a QA tester for the 1111 School learning platform.
The app is running at http://localhost:5173 and the backend at http://localhost:8000.
Use agent-browser to automate the browser.

## TEST: Full Assessment Lifecycle

### Setup
1. `agent-browser open http://localhost:5173`
2. Navigate to a course that has all lessons completed (or generate a fresh course
   and complete all lessons by navigating to each activity and submitting responses).

### Phase 1: Assessment Generation
3. After the final lesson activity is completed, take a snapshot.
4. Verify: an "Assessment" section or button is now visible (AwaitingAssessment state).
5. Click the assessment generation trigger (button or auto-redirect).
6. Wait for assessment to load (re-snapshot periodically, look for assessment items).
7. Take an annotated screenshot: `agent-browser screenshot --annotate ./test-results/assessment-ready.png`

### Phase 2: Assessment Submission
8. Read each assessment item prompt via snapshot.
9. For each item, write a substantive, thoughtful response relevant to the prompt
   (demonstrate understanding, not just filler text).
10. Fill in each response field.
11. Click Submit.
12. Wait for results to load (re-snapshot periodically).

### Phase 3: Results Verification
13. Take a snapshot of the results screen.
14. `agent-browser screenshot --annotate ./test-results/assessment-results.png`

VERIFY and report pass/fail for each:
- [ ] Overall score is displayed as a number (0-100)
- [ ] Pass/fail decision is clearly visible
- [ ] Per-objective scores are listed with visual indicators (progress bars or color coding)
- [ ] Each objective has feedback text that references specific criteria (not generic "good job")
- [ ] If pass: badge award animation or badge display is visible
- [ ] If fail: next steps section is visible with actionable items
- [ ] If fail: retry button is available

### Phase 4: Badge Verification (if passed)
15. If the assessment passed, navigate to the learner profile page.
16. Take a snapshot. Look for badge inventory section.
17. Verify: the badge for the completed course is visible with course title and date.
18. Navigate back to course overview.
19. Verify: course shows "Completed" status with badge indicator.
20. `agent-browser screenshot --annotate ./test-results/badge-profile.png`

### Phase 5: Retry Flow (if failed)
15. If the assessment failed, verify next steps are displayed.
16. Semantic check: are the next steps relevant to the weak objectives? (Read the text, reason about quality.)
17. Click "Retry Assessment."
18. Verify: assessment items are displayed again with empty response fields.
19. Write improved responses targeting the weak areas mentioned in next steps.
20. Submit and verify new results.

Output a JSON object:
{
  "test": "assessment_flow",
  "passed": true/false,
  "checks": [...],
  "screenshots": [...],
  "notes": "..."
}
```

---

## Definition of Done

- [ ] `AssessmentSpecOutput` and `AssessmentReviewOutput` Pydantic models implemented with all field constraints.
- [ ] `assessment_creator` agent (H) implemented with dynamic instructions, output_type, and output_validator.
- [ ] `assessment_reviewer` agent (I) implemented with dynamic instructions, output_type, and output_validator.
- [ ] Assessment and Badge SQLAlchemy entities created with Alembic migration.
- [ ] Course state machine extended: AwaitingAssessment, AssessmentReady transitions with guards.
- [ ] All 4 API endpoints implemented: generate, submit, get assessment, get badges.
- [ ] Assessment generation guard: returns 409 when lessons not complete.
- [ ] Badge awarded on pass, idempotent (no duplicate badges).
- [ ] Retry flow: fail keeps state at AssessmentReady, new submission re-runs reviewer.
- [ ] Agent runs logged to AgentLog for both assessment_creator and assessment_reviewer.
- [ ] Assessment UI: item display, per-item text submission, results with per-objective scores.
- [ ] Badge award animation on pass.
- [ ] Badge inventory displayed in learner profile.
- [ ] Unit tests pass: model validation, output validators, badge logic, state transitions.
- [ ] Integration tests pass: full completion flow API, badge API, state transitions, 409 on incomplete.
- [ ] E2E tests pass: live LLM pass and fail scenarios, scoring consistency.
- [ ] ADW test (`07_assessment_flow.md`) passes: full lifecycle with semantic verification.
- [ ] All agent runs produce valid structured output with no extra keys or markdown leakage.
