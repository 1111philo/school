---
title: "PRD 4 — Course Progression Engine"
phase: Core Pipeline
depends-on:
  - "[[PRD 3 — Activity & Feedback System]]"
agents: None (pure state management)
size: Medium
status: Draft
---

# PRD 4 — Course Progression Engine

## 1. Overview

PRD 4 introduces the state management layer that governs a course's entire lifecycle — from creation through completion and archival. This is the "game engine" of 1111 School: it enforces which transitions are legal, tracks what the learner has done, controls which lessons are accessible, calculates progress, and exposes all of this through a REST API.

There are no AI agents in this PRD. Everything here is deterministic business logic: a finite state machine for course status, a simpler state machine for lesson status, progress calculation, time tracking, and CRUD operations for course persistence. The agents from PRDs 2 and 3 (course generation, activity submission/review) trigger state transitions, but the transition logic itself lives here.

This PRD also introduces v1 content editing — the ability to regenerate a lesson or request variants ("more examples", "simpler explanation") — as a controlled re-entry into the generation pipeline with attempt limits.

**Delivers**: Full lifecycle management — create, progress through, complete, and resume courses. All state tracked and queryable via API.

---

## 2. Goals

1. **Enforce valid course lifecycle transitions** — No course can skip from Draft to Completed, no lesson can be accessed before it's unlocked. The state machine is the single source of truth.
2. **Track learner progress with precision** — Every lesson view, activity submission, score, and time spent is recorded. Course-level progress percentage is always derivable.
3. **Enable course persistence and resumability** — A learner can close the app, come back days later, and resume exactly where they left off.
4. **Provide clean CRUD for course management** — List, view, delete courses with proper cascade behavior.
5. **Support content iteration** — Learners can regenerate lessons or request variants within controlled limits.

---

## 3. Non-Goals

- **Assessment flow** — The AwaitingAssessment and AssessmentReady states are defined here (the state machine must be complete), but assessment generation/submission logic is PRD 8.
- **Agent execution** — This PRD does not run any agents. It calls the lesson_writer agent (from PRD 2) only during regeneration, but the agent itself is already implemented.
- **Frontend UI** — No UI work. All functionality is exposed via API. Frontend integration is PRD 5.
- **Multi-user isolation** — Single-user mode (stubbed user) per the decomposition plan. Auth is PRD 11.
- **Adaptive sequencing** — Lessons unlock linearly. No skip-ahead, no adaptive reordering based on performance (v2).

---

## 4. Scope

### 4.1 Course State Machine

Eight states governing the lifecycle of a `CourseInstance`:

```
Draft → Generating → Active → InProgress → AwaitingAssessment → AssessmentReady → Completed → Archived
```

### 4.2 Lesson State Management

Three states per lesson: `locked`, `unlocked`, `completed`. Linear unlock progression gated by activity completion.

### 4.3 Progress Tracking

Lesson-level and course-level metrics: view timestamps, activity scores, attempt counts, time tracking, aggregate progress percentage.

### 4.4 Course Persistence

Full CRUD: create (handled by PRD 2 generation), list, get, delete with cascade.

### 4.5 Content Editing (v1)

Lesson regeneration with attempt limits. Variant requests ("more examples", "simpler explanation").

### 4.6 API Endpoints

Seven endpoints covering course CRUD, state transitions, lesson events, and content editing.

---

## 5. Technical Design

### 5.1 Course State Machine

#### States

| State | Description |
|-------|-------------|
| `draft` | CourseInstance created with input description and objectives, but generation has not started. |
| `generating` | The generation pipeline (PRD 2) is actively producing lessons. |
| `active` | Generation complete. All lessons exist. No lesson has been viewed yet. |
| `in_progress` | At least one lesson has been viewed or one activity submitted. |
| `awaiting_assessment` | All lessons completed (all activities submitted). Waiting for assessment generation (PRD 8). |
| `assessment_ready` | Assessment has been generated and is available for the learner. |
| `completed` | Assessment passed (or course completed without assessment in MVP). Badge awarded. |
| `archived` | Course moved to archive by the learner. Read-only. Can be unarchived. |

#### Transition Table

```
┌──────────────────────┬──────────────────────┬─────────────────────────────────────────────┐
│ From                 │ To                   │ Guard Condition                             │
├──────────────────────┼──────────────────────┼─────────────────────────────────────────────┤
│ draft                │ generating           │ Generation pipeline started                 │
│ generating           │ active               │ All lessons successfully generated          │
│ generating           │ draft                │ Generation failed (rollback)                │
│ active               │ in_progress          │ First lesson viewed OR first activity       │
│                      │                      │ submitted                                   │
│ in_progress          │ awaiting_assessment  │ All lessons have status = completed         │
│ in_progress          │ archived             │ User requests archive                       │
│ awaiting_assessment  │ assessment_ready     │ Assessment successfully generated           │
│ awaiting_assessment  │ archived             │ User requests archive                       │
│ assessment_ready     │ completed            │ Assessment passed (score >= 70)             │
│ assessment_ready     │ in_progress          │ Assessment failed, user retries lessons     │
│ assessment_ready     │ archived             │ User requests archive                       │
│ completed            │ archived             │ User requests archive                       │
│ archived             │ active               │ User unarchives (if was active)             │
│ archived             │ in_progress          │ User unarchives (if was in_progress)        │
│ archived             │ awaiting_assessment  │ User unarchives (if was awaiting_assessment)│
│ archived             │ assessment_ready     │ User unarchives (if was assessment_ready)   │
│ archived             │ completed            │ User unarchives (if was completed)          │
└──────────────────────┴──────────────────────┴─────────────────────────────────────────────┘
```

All transitions not listed above are **invalid** and raise `InvalidStateTransitionError`.

#### Implementation

```python
from enum import StrEnum
from dataclasses import dataclass


class CourseState(StrEnum):
    DRAFT = "draft"
    GENERATING = "generating"
    ACTIVE = "active"
    IN_PROGRESS = "in_progress"
    AWAITING_ASSESSMENT = "awaiting_assessment"
    ASSESSMENT_READY = "assessment_ready"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class InvalidStateTransitionError(Exception):
    """Raised when a state transition is not allowed."""

    def __init__(self, from_state: CourseState, to_state: CourseState, reason: str = ""):
        self.from_state = from_state
        self.to_state = to_state
        self.reason = reason
        msg = f"Invalid transition: {from_state} -> {to_state}"
        if reason:
            msg += f" ({reason})"
        super().__init__(msg)


class GuardFailedError(InvalidStateTransitionError):
    """Raised when the transition is defined but the guard condition is not met."""
    pass


@dataclass
class TransitionRule:
    from_state: CourseState
    to_state: CourseState
    guard: str  # Human-readable guard description
    guard_fn: str  # Method name on CourseStateMachine to call


# Transition registry — single source of truth
TRANSITIONS: list[TransitionRule] = [
    TransitionRule(CourseState.DRAFT, CourseState.GENERATING,
                   "Generation pipeline started", "_guard_always"),
    TransitionRule(CourseState.GENERATING, CourseState.ACTIVE,
                   "All lessons generated", "_guard_all_lessons_generated"),
    TransitionRule(CourseState.GENERATING, CourseState.DRAFT,
                   "Generation failed", "_guard_always"),
    TransitionRule(CourseState.ACTIVE, CourseState.IN_PROGRESS,
                   "First lesson viewed or activity submitted", "_guard_has_activity"),
    TransitionRule(CourseState.IN_PROGRESS, CourseState.AWAITING_ASSESSMENT,
                   "All lessons completed", "_guard_all_lessons_completed"),
    TransitionRule(CourseState.IN_PROGRESS, CourseState.ARCHIVED,
                   "User requests archive", "_guard_always"),
    TransitionRule(CourseState.AWAITING_ASSESSMENT, CourseState.ASSESSMENT_READY,
                   "Assessment generated", "_guard_always"),
    TransitionRule(CourseState.AWAITING_ASSESSMENT, CourseState.ARCHIVED,
                   "User requests archive", "_guard_always"),
    TransitionRule(CourseState.ASSESSMENT_READY, CourseState.COMPLETED,
                   "Assessment passed", "_guard_assessment_passed"),
    TransitionRule(CourseState.ASSESSMENT_READY, CourseState.IN_PROGRESS,
                   "Assessment failed, retry", "_guard_always"),
    TransitionRule(CourseState.ASSESSMENT_READY, CourseState.ARCHIVED,
                   "User requests archive", "_guard_always"),
    TransitionRule(CourseState.COMPLETED, CourseState.ARCHIVED,
                   "User requests archive", "_guard_always"),
    # Unarchive transitions — restore to pre_archive_state
    TransitionRule(CourseState.ARCHIVED, CourseState.ACTIVE,
                   "Unarchive", "_guard_was_state"),
    TransitionRule(CourseState.ARCHIVED, CourseState.IN_PROGRESS,
                   "Unarchive", "_guard_was_state"),
    TransitionRule(CourseState.ARCHIVED, CourseState.AWAITING_ASSESSMENT,
                   "Unarchive", "_guard_was_state"),
    TransitionRule(CourseState.ARCHIVED, CourseState.ASSESSMENT_READY,
                   "Unarchive", "_guard_was_state"),
    TransitionRule(CourseState.ARCHIVED, CourseState.COMPLETED,
                   "Unarchive", "_guard_was_state"),
]


class CourseStateMachine:
    """Enforces valid state transitions for a CourseInstance.

    Usage:
        machine = CourseStateMachine(course_instance)
        machine.transition(CourseState.GENERATING)  # raises on invalid
    """

    def __init__(self, course: "CourseInstance"):
        self.course = course
        self._valid_transitions: dict[tuple[CourseState, CourseState], TransitionRule] = {
            (t.from_state, t.to_state): t for t in TRANSITIONS
        }

    def can_transition(self, to_state: CourseState) -> bool:
        """Check if a transition is valid without executing it."""
        key = (CourseState(self.course.status), to_state)
        if key not in self._valid_transitions:
            return False
        rule = self._valid_transitions[key]
        try:
            guard_fn = getattr(self, rule.guard_fn)
            guard_fn(to_state)
            return True
        except (GuardFailedError, InvalidStateTransitionError):
            return False

    async def transition(self, to_state: CourseState, db: "AsyncSession") -> "CourseInstance":
        """Execute a state transition. Raises on invalid transition or failed guard."""
        from_state = CourseState(self.course.status)
        key = (from_state, to_state)

        if key not in self._valid_transitions:
            raise InvalidStateTransitionError(from_state, to_state)

        rule = self._valid_transitions[key]
        guard_fn = getattr(self, rule.guard_fn)
        guard_fn(to_state)

        # Record pre-archive state for unarchive
        if to_state == CourseState.ARCHIVED:
            self.course.pre_archive_state = from_state.value

        self.course.status = to_state.value
        self.course.updated_at = datetime.utcnow()
        db.add(self.course)
        await db.flush()
        return self.course

    # --- Guard methods ---

    def _guard_always(self, to_state: CourseState) -> None:
        """No additional condition required."""
        pass

    def _guard_all_lessons_generated(self, to_state: CourseState) -> None:
        if not self.course.lessons:
            raise GuardFailedError(
                CourseState(self.course.status), to_state,
                "No lessons have been generated"
            )

    def _guard_has_activity(self, to_state: CourseState) -> None:
        has_view = any(l.viewed_at is not None for l in self.course.lessons)
        has_submission = any(
            a.submission_count > 0
            for l in self.course.lessons
            for a in l.activities
        )
        if not has_view and not has_submission:
            raise GuardFailedError(
                CourseState(self.course.status), to_state,
                "No lesson viewed and no activity submitted"
            )

    def _guard_all_lessons_completed(self, to_state: CourseState) -> None:
        if not self.course.lessons:
            raise GuardFailedError(
                CourseState(self.course.status), to_state,
                "Course has no lessons"
            )
        incomplete = [l for l in self.course.lessons if l.status != "completed"]
        if incomplete:
            raise GuardFailedError(
                CourseState(self.course.status), to_state,
                f"{len(incomplete)} lesson(s) not completed"
            )

    def _guard_assessment_passed(self, to_state: CourseState) -> None:
        if not self.course.assessment:
            raise GuardFailedError(
                CourseState(self.course.status), to_state,
                "No assessment exists"
            )
        if self.course.assessment.reviewer_score is None:
            raise GuardFailedError(
                CourseState(self.course.status), to_state,
                "Assessment has not been reviewed"
            )
        if self.course.assessment.reviewer_score < 70:
            raise GuardFailedError(
                CourseState(self.course.status), to_state,
                f"Assessment score {self.course.assessment.reviewer_score} < 70"
            )

    def _guard_was_state(self, to_state: CourseState) -> None:
        if self.course.pre_archive_state != to_state.value:
            raise GuardFailedError(
                CourseState.ARCHIVED, to_state,
                f"Pre-archive state was '{self.course.pre_archive_state}', not '{to_state.value}'"
            )
```

### 5.2 Lesson States

#### States

| State | Description |
|-------|-------------|
| `locked` | Lesson is not accessible. Previous lesson's activity has not been completed. |
| `unlocked` | Lesson is accessible. Learner can view content and submit activities. |
| `completed` | Lesson has been viewed AND its activity has been submitted (any mastery decision). |

#### Unlock Rules

```
1. When a course enters `active` state:
   - Lesson at objectiveIndex=0 → unlocked
   - All other lessons → locked

2. When an activity submission is recorded (any masteryDecision):
   - The activity's parent lesson → completed
   - The next lesson (objectiveIndex + 1) → unlocked (if it exists)
   - Course progress percentage is recalculated

3. Edge cases:
   - Last lesson's activity completed → no next lesson to unlock
   - Re-submitting an already-completed activity → lesson stays completed,
     attempt count increments, next lesson stays unlocked
   - Lesson with no activity (edge case) → mark completed on view
```

#### Implementation

```python
class LessonState(StrEnum):
    LOCKED = "locked"
    UNLOCKED = "unlocked"
    COMPLETED = "completed"


async def unlock_initial_lesson(course: CourseInstance, db: AsyncSession) -> None:
    """Set the first lesson to unlocked when course becomes active."""
    first_lesson = min(course.lessons, key=lambda l: l.objective_index)
    first_lesson.status = LessonState.UNLOCKED
    db.add(first_lesson)
    await db.flush()


async def on_activity_completed(
    lesson: Lesson,
    db: AsyncSession,
) -> Lesson | None:
    """Handle lesson state changes after activity completion.

    Returns the newly unlocked lesson, or None if this was the last lesson.
    """
    # Mark current lesson as completed
    lesson.status = LessonState.COMPLETED
    lesson.completed_at = datetime.utcnow()
    db.add(lesson)

    # Find and unlock the next lesson
    course = lesson.course_instance
    next_lesson = next(
        (l for l in course.lessons if l.objective_index == lesson.objective_index + 1),
        None,
    )

    if next_lesson and next_lesson.status == LessonState.LOCKED:
        next_lesson.status = LessonState.UNLOCKED
        next_lesson.unlocked_at = datetime.utcnow()
        db.add(next_lesson)

    await db.flush()
    return next_lesson
```

### 5.3 Progress Tracking

#### Lesson-Level Tracking

| Field | Type | Description |
|-------|------|-------------|
| `viewed_at` | `datetime | None` | Timestamp of first view |
| `completed_at` | `datetime | None` | Timestamp when activity completed |
| `unlocked_at` | `datetime | None` | Timestamp when lesson became accessible |
| `time_spent_seconds` | `int` | Accumulated time spent on lesson content |

#### Activity-Level Tracking

| Field | Type | Description |
|-------|------|-------------|
| `submission_count` | `int` | Number of attempts |
| `latest_score` | `float | None` | Most recent review score (0-100) |
| `best_score` | `float | None` | Highest score across all attempts |
| `latest_mastery_decision` | `str | None` | `not_yet` / `meets` / `exceeds` |
| `latest_feedback_json` | `JSON | None` | Full ActivityReviewOutput from last attempt |
| `first_submitted_at` | `datetime | None` | Timestamp of first submission |
| `last_submitted_at` | `datetime | None` | Timestamp of most recent submission |
| `time_spent_seconds` | `int` | Accumulated time on activity |

#### Course-Level Progress

```python
def calculate_progress(course: CourseInstance) -> CourseProgress:
    """Calculate course progress from lesson and activity states.

    Progress percentage = (completed_lessons / total_lessons) * 100

    In PRD 8, this formula will be adjusted to account for the assessment
    step (e.g., completed_lessons / (total_lessons + 1) * 100), but for
    the MVP (PRDs 1-5), 100% means all lessons completed.
    """
    total = len(course.lessons)
    if total == 0:
        return CourseProgress(
            percentage=0.0,
            lessons_completed=0,
            lessons_total=0,
            current_lesson_index=None,
            total_time_seconds=0,
            total_attempts=0,
            average_score=None,
        )

    completed = sum(1 for l in course.lessons if l.status == LessonState.COMPLETED)
    percentage = (completed / total) * 100

    # Current lesson = first unlocked lesson, or last completed if all done
    current = next(
        (l for l in sorted(course.lessons, key=lambda l: l.objective_index)
         if l.status == LessonState.UNLOCKED),
        None,
    )
    current_index = current.objective_index if current else None

    # Aggregate time
    total_time = sum(l.time_spent_seconds or 0 for l in course.lessons)
    total_time += sum(
        a.time_spent_seconds or 0
        for l in course.lessons
        for a in l.activities
    )

    # Aggregate attempts and scores
    all_activities = [a for l in course.lessons for a in l.activities]
    total_attempts = sum(a.submission_count for a in all_activities)
    scored = [a for a in all_activities if a.latest_score is not None]
    average_score = (
        sum(a.latest_score for a in scored) / len(scored)
        if scored else None
    )

    return CourseProgress(
        percentage=round(percentage, 1),
        lessons_completed=completed,
        lessons_total=total,
        current_lesson_index=current_index,
        total_time_seconds=total_time,
        total_attempts=total_attempts,
        average_score=round(average_score, 1) if average_score else None,
    )
```

#### Pydantic Response Model

```python
from pydantic import BaseModel


class CourseProgress(BaseModel):
    percentage: float  # 0.0 - 100.0
    lessons_completed: int
    lessons_total: int
    current_lesson_index: int | None  # Index of the first unlocked lesson
    total_time_seconds: int
    total_attempts: int
    average_score: float | None  # Average of latest scores across activities

    class Config:
        json_schema_extra = {
            "example": {
                "percentage": 66.7,
                "lessons_completed": 2,
                "lessons_total": 3,
                "current_lesson_index": 2,
                "total_time_seconds": 2400,
                "total_attempts": 4,
                "average_score": 82.5,
            }
        }
```

### 5.4 Time Tracking

Time tracking uses a heartbeat pattern from the client. The frontend (PRD 5) will send periodic `PATCH` requests to update time spent.

```python
# Time update endpoint — called by frontend heartbeat
# PATCH /api/lessons/{id}/time
# Body: {"seconds_to_add": 30}

async def update_lesson_time(
    lesson_id: UUID,
    seconds_to_add: int,
    db: AsyncSession,
) -> None:
    """Increment time spent on a lesson. Called by client heartbeat."""
    lesson = await db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    lesson.time_spent_seconds = (lesson.time_spent_seconds or 0) + seconds_to_add
    db.add(lesson)
    await db.flush()
```

### 5.5 Content Editing (v1)

#### Regeneration

Learners can regenerate a lesson by re-running the `lesson_writer` agent with the same `LessonPlanOutput` input. This produces new content while keeping the same lesson plan structure.

```python
MAX_REGENERATION_ATTEMPTS = 3


async def regenerate_lesson(
    lesson: Lesson,
    variant: str | None,  # "more_examples" | "simpler_explanation" | None
    db: AsyncSession,
    deps: PipelineDeps,
) -> Lesson:
    """Re-run lesson_writer for a lesson. Preserves lesson plan, replaces content.

    Args:
        lesson: The lesson to regenerate.
        variant: Optional variant modifier appended to the lesson_writer prompt.
        db: Async database session.
        deps: Pipeline dependencies including agent references.

    Raises:
        RegenerationLimitError: If max attempts exceeded.
        LessonLockedError: If the lesson is locked.
    """
    if lesson.regeneration_count >= MAX_REGENERATION_ATTEMPTS:
        raise RegenerationLimitError(
            f"Lesson has been regenerated {lesson.regeneration_count} times "
            f"(max {MAX_REGENERATION_ATTEMPTS})"
        )

    if lesson.status == LessonState.LOCKED:
        raise LessonLockedError("Cannot regenerate a locked lesson")

    # Build variant instruction
    variant_instruction = ""
    if variant == "more_examples":
        variant_instruction = (
            "\n\nIMPORTANT: Include significantly more worked examples than "
            "the previous version. At least 3 concrete examples with step-by-step "
            "walkthroughs."
        )
    elif variant == "simpler_explanation":
        variant_instruction = (
            "\n\nIMPORTANT: Simplify the explanation significantly. Use shorter "
            "sentences, more analogies, and assume less prior knowledge than the "
            "previous version."
        )

    # Re-run lesson_writer with existing lesson plan + variant instruction
    # (lesson_writer agent is from PRD 2)
    new_content = await deps.lesson_writer.run(
        lesson.lesson_plan_json,
        extra_instructions=variant_instruction,
        deps=deps,
    )

    # Update lesson
    lesson.lesson_content = new_content.output.lesson_body
    lesson.regeneration_count += 1
    lesson.regenerated_at = datetime.utcnow()
    lesson.regeneration_variant = variant
    db.add(lesson)
    await db.flush()

    return lesson
```

### 5.6 Database Schema Additions

PRD 1 defines the core models. PRD 4 adds the following columns and ensures the state machine fields exist:

```python
# Additions to CourseInstance (PRD 1 base model)
class CourseInstance(Base):
    # ... existing fields from PRD 1 ...
    pre_archive_state: Mapped[str | None] = mapped_column(
        String(30), nullable=True, default=None,
        comment="State before archiving, used for unarchive restoration"
    )

# Additions to Lesson (PRD 1 base model)
class Lesson(Base):
    # ... existing fields from PRD 1 ...
    viewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    unlocked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    time_spent_seconds: Mapped[int] = mapped_column(Integer, default=0)
    regeneration_count: Mapped[int] = mapped_column(Integer, default=0)
    regenerated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    regeneration_variant: Mapped[str | None] = mapped_column(String(30), nullable=True)

# Additions to Activity (PRD 1 base model)
class Activity(Base):
    # ... existing fields from PRD 1 ...
    submission_count: Mapped[int] = mapped_column(Integer, default=0)
    latest_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    best_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    latest_mastery_decision: Mapped[str | None] = mapped_column(String(20), nullable=True)
    latest_feedback_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    first_submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    time_spent_seconds: Mapped[int] = mapped_column(Integer, default=0)
```

Alembic migration:

```python
# alembic/versions/xxxx_add_progression_fields.py

def upgrade() -> None:
    op.add_column("course_instances",
        sa.Column("pre_archive_state", sa.String(30), nullable=True))

    op.add_column("lessons",
        sa.Column("viewed_at", sa.DateTime, nullable=True))
    op.add_column("lessons",
        sa.Column("completed_at", sa.DateTime, nullable=True))
    op.add_column("lessons",
        sa.Column("unlocked_at", sa.DateTime, nullable=True))
    op.add_column("lessons",
        sa.Column("time_spent_seconds", sa.Integer, server_default="0"))
    op.add_column("lessons",
        sa.Column("regeneration_count", sa.Integer, server_default="0"))
    op.add_column("lessons",
        sa.Column("regenerated_at", sa.DateTime, nullable=True))
    op.add_column("lessons",
        sa.Column("regeneration_variant", sa.String(30), nullable=True))

    op.add_column("activities",
        sa.Column("submission_count", sa.Integer, server_default="0"))
    op.add_column("activities",
        sa.Column("latest_score", sa.Float, nullable=True))
    op.add_column("activities",
        sa.Column("best_score", sa.Float, nullable=True))
    op.add_column("activities",
        sa.Column("latest_mastery_decision", sa.String(20), nullable=True))
    op.add_column("activities",
        sa.Column("latest_feedback_json", sa.JSON, nullable=True))
    op.add_column("activities",
        sa.Column("first_submitted_at", sa.DateTime, nullable=True))
    op.add_column("activities",
        sa.Column("last_submitted_at", sa.DateTime, nullable=True))
    op.add_column("activities",
        sa.Column("time_spent_seconds", sa.Integer, server_default="0"))


def downgrade() -> None:
    op.drop_column("course_instances", "pre_archive_state")
    for col in ["viewed_at", "completed_at", "unlocked_at", "time_spent_seconds",
                "regeneration_count", "regenerated_at", "regeneration_variant"]:
        op.drop_column("lessons", col)
    for col in ["submission_count", "latest_score", "best_score",
                "latest_mastery_decision", "latest_feedback_json",
                "first_submitted_at", "last_submitted_at", "time_spent_seconds"]:
        op.drop_column("activities", col)
```

---

## 6. API Endpoints

### 6.1 `GET /api/courses` — List User's Courses

Returns all courses for the current user with progress summary.

**Query Parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | `string` | `null` | Filter by course state |
| `limit` | `int` | `20` | Max courses returned |
| `offset` | `int` | `0` | Pagination offset |

**Response**: `200 OK`

```json
{
  "courses": [
    {
      "id": "uuid-1",
      "input_description": "Introduction to Python Programming",
      "status": "in_progress",
      "source_type": "user_created",
      "created_at": "2025-03-01T10:00:00Z",
      "updated_at": "2025-03-02T14:30:00Z",
      "progress": {
        "percentage": 33.3,
        "lessons_completed": 1,
        "lessons_total": 3,
        "current_lesson_index": 1,
        "total_time_seconds": 1200,
        "total_attempts": 2,
        "average_score": 85.0
      }
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

**Errors**: None (empty list for no courses).

---

### 6.2 `GET /api/courses/{id}` — Full Course with Progress

Returns the complete course including all lessons, activities, and progress data.

**Response**: `200 OK`

```json
{
  "id": "uuid-1",
  "input_description": "Introduction to Python Programming",
  "input_objectives": [
    "Understand variables and types",
    "Write basic functions",
    "Use control flow statements"
  ],
  "generated_course_description": "This course...",
  "status": "in_progress",
  "source_type": "user_created",
  "created_at": "2025-03-01T10:00:00Z",
  "updated_at": "2025-03-02T14:30:00Z",
  "progress": {
    "percentage": 33.3,
    "lessons_completed": 1,
    "lessons_total": 3,
    "current_lesson_index": 1,
    "total_time_seconds": 1200,
    "total_attempts": 2,
    "average_score": 85.0
  },
  "lessons": [
    {
      "id": "lesson-uuid-1",
      "objective_index": 0,
      "status": "completed",
      "lesson_title": "Variables and Types in Python",
      "lesson_content": "# Variables and Types...",
      "viewed_at": "2025-03-01T10:05:00Z",
      "completed_at": "2025-03-01T10:45:00Z",
      "unlocked_at": "2025-03-01T10:00:00Z",
      "time_spent_seconds": 600,
      "regeneration_count": 0,
      "activity": {
        "id": "activity-uuid-1",
        "activity_type": "short_response",
        "instructions": "Write a Python script that...",
        "submission_count": 1,
        "latest_score": 85.0,
        "best_score": 85.0,
        "latest_mastery_decision": "meets",
        "time_spent_seconds": 300
      }
    },
    {
      "id": "lesson-uuid-2",
      "objective_index": 1,
      "status": "unlocked",
      "lesson_title": "Functions in Python",
      "lesson_content": "# Writing Functions...",
      "viewed_at": null,
      "completed_at": null,
      "unlocked_at": "2025-03-01T10:45:00Z",
      "time_spent_seconds": 0,
      "regeneration_count": 0,
      "activity": {
        "id": "activity-uuid-2",
        "activity_type": "short_response",
        "instructions": "Define a function that...",
        "submission_count": 0,
        "latest_score": null,
        "best_score": null,
        "latest_mastery_decision": null,
        "time_spent_seconds": 0
      }
    },
    {
      "id": "lesson-uuid-3",
      "objective_index": 2,
      "status": "locked",
      "lesson_title": null,
      "lesson_content": null,
      "viewed_at": null,
      "completed_at": null,
      "unlocked_at": null,
      "time_spent_seconds": 0,
      "regeneration_count": 0,
      "activity": null
    }
  ]
}
```

**Note**: Locked lessons return `null` for `lesson_title` and `lesson_content` to prevent content leakage. The lesson data exists in the database but is redacted in the API response.

**Errors**:
- `404 Not Found` — Course does not exist.

---

### 6.3 `GET /api/courses/{id}/progress` — Progress Summary

Returns only the progress data without full lesson content. Lightweight endpoint for dashboards and list views.

**Response**: `200 OK`

```json
{
  "course_id": "uuid-1",
  "status": "in_progress",
  "progress": {
    "percentage": 33.3,
    "lessons_completed": 1,
    "lessons_total": 3,
    "current_lesson_index": 1,
    "total_time_seconds": 1200,
    "total_attempts": 2,
    "average_score": 85.0
  },
  "lessons": [
    {"objective_index": 0, "status": "completed"},
    {"objective_index": 1, "status": "unlocked"},
    {"objective_index": 2, "status": "locked"}
  ]
}
```

**Errors**:
- `404 Not Found` — Course does not exist.

---

### 6.4 `PATCH /api/courses/{id}/state` — State Transition

Transition a course to a new state. The state machine validates the transition and runs guard checks.

**Request Body**:

```json
{
  "target_state": "archived"
}
```

**Response**: `200 OK`

```json
{
  "id": "uuid-1",
  "previous_state": "in_progress",
  "current_state": "archived",
  "transitioned_at": "2025-03-02T15:00:00Z"
}
```

**Errors**:
- `404 Not Found` — Course does not exist.
- `409 Conflict` — Invalid transition or guard condition failed.

```json
{
  "detail": "Invalid transition: draft -> completed",
  "error_type": "invalid_state_transition",
  "from_state": "draft",
  "to_state": "completed"
}
```

```json
{
  "detail": "2 lesson(s) not completed",
  "error_type": "guard_failed",
  "from_state": "in_progress",
  "to_state": "awaiting_assessment"
}
```

---

### 6.5 `POST /api/lessons/{id}/viewed` — Mark Lesson Viewed

Records the first view timestamp for a lesson. Idempotent — subsequent calls are no-ops if already viewed.

Also triggers `active -> in_progress` course state transition if this is the first lesson interaction.

**Request Body**: None (empty POST).

**Response**: `200 OK`

```json
{
  "lesson_id": "lesson-uuid-1",
  "viewed_at": "2025-03-01T10:05:00Z",
  "first_view": true
}
```

If already viewed:

```json
{
  "lesson_id": "lesson-uuid-1",
  "viewed_at": "2025-03-01T10:05:00Z",
  "first_view": false
}
```

**Errors**:
- `404 Not Found` — Lesson does not exist.
- `403 Forbidden` — Lesson is locked.

---

### 6.6 `DELETE /api/courses/{id}` — Delete Course with Cascade

Permanently deletes a course and all associated data: lessons, activities, submissions, agent logs.

**Response**: `204 No Content`

**Errors**:
- `404 Not Found` — Course does not exist.

**Cascade behavior** (single SQL cascade, configured in model relationships):

```sql
-- Cascades handled by SQLAlchemy relationship(cascade="all, delete-orphan"):
-- DELETE course_instance
--   -> DELETE lessons (via FK cascade)
--     -> DELETE activities (via FK cascade)
--   -> DELETE assessment (via FK cascade)
--   -> DELETE agent_logs (via FK cascade)
```

---

### 6.7 `POST /api/lessons/{id}/regenerate` — Regenerate Lesson Content

Re-runs the `lesson_writer` agent for this lesson with the existing lesson plan. Optionally applies a variant modifier.

**Request Body**:

```json
{
  "variant": "more_examples"
}
```

Valid variants: `null` (plain regeneration), `"more_examples"`, `"simpler_explanation"`.

**Response**: `200 OK`

```json
{
  "lesson_id": "lesson-uuid-1",
  "regeneration_count": 1,
  "max_regenerations": 3,
  "regenerated_at": "2025-03-02T16:00:00Z",
  "variant": "more_examples",
  "lesson_content": "# Variables and Types (Updated)..."
}
```

**Errors**:
- `404 Not Found` — Lesson does not exist.
- `403 Forbidden` — Lesson is locked.
- `429 Too Many Requests` — Regeneration limit reached.

```json
{
  "detail": "Lesson has been regenerated 3 times (max 3)",
  "error_type": "regeneration_limit",
  "regeneration_count": 3,
  "max_regenerations": 3
}
```

---

### 6.8 `PATCH /api/lessons/{id}/time` — Update Lesson Time

Increment time spent on a lesson. Called by frontend heartbeat (typically every 30 seconds while the lesson is in focus).

**Request Body**:

```json
{
  "seconds_to_add": 30
}
```

**Response**: `200 OK`

```json
{
  "lesson_id": "lesson-uuid-1",
  "time_spent_seconds": 630
}
```

**Errors**:
- `404 Not Found` — Lesson does not exist.
- `422 Unprocessable Entity` — `seconds_to_add` is negative or > 300 (5 min cap per heartbeat to prevent abuse).

---

### 6.9 `PATCH /api/activities/{id}/time` — Update Activity Time

Same heartbeat pattern for activity time tracking.

**Request Body**:

```json
{
  "seconds_to_add": 30
}
```

**Response**: `200 OK`

```json
{
  "activity_id": "activity-uuid-1",
  "time_spent_seconds": 330
}
```

**Errors**:
- `404 Not Found` — Activity does not exist.
- `422 Unprocessable Entity` — Invalid `seconds_to_add`.

---

## 7. FastAPI Router Structure

```python
# app/api/routes/courses.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/courses", tags=["courses"])


@router.get("/")
async def list_courses(
    status: str | None = None,
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
) -> CourseListResponse:
    ...


@router.get("/{course_id}")
async def get_course(
    course_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> CourseDetailResponse:
    ...


@router.get("/{course_id}/progress")
async def get_progress(
    course_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> CourseProgressResponse:
    ...


@router.patch("/{course_id}/state")
async def transition_state(
    course_id: UUID,
    body: StateTransitionRequest,
    db: AsyncSession = Depends(get_db),
) -> StateTransitionResponse:
    ...


@router.delete("/{course_id}", status_code=204)
async def delete_course(
    course_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    ...


# app/api/routes/lessons.py

router = APIRouter(prefix="/api/lessons", tags=["lessons"])


@router.post("/{lesson_id}/viewed")
async def mark_viewed(
    lesson_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> LessonViewedResponse:
    ...


@router.post("/{lesson_id}/regenerate")
async def regenerate_lesson(
    lesson_id: UUID,
    body: RegenerateLessonRequest,
    db: AsyncSession = Depends(get_db),
    deps: PipelineDeps = Depends(get_pipeline_deps),
) -> RegenerateLessonResponse:
    ...


@router.patch("/{lesson_id}/time")
async def update_lesson_time(
    lesson_id: UUID,
    body: TimeUpdateRequest,
    db: AsyncSession = Depends(get_db),
) -> TimeUpdateResponse:
    ...


# app/api/routes/activities.py (addition to PRD 3 router)

@router.patch("/{activity_id}/time")
async def update_activity_time(
    activity_id: UUID,
    body: TimeUpdateRequest,
    db: AsyncSession = Depends(get_db),
) -> TimeUpdateResponse:
    ...
```

---

## 8. Acceptance Criteria

### Course State Machine

- [ ] All 8 states are implemented as a `CourseState` enum.
- [ ] All valid transitions from the transition table succeed and update the course status.
- [ ] All invalid transitions (any pair not in the table) raise `InvalidStateTransitionError` with descriptive message.
- [ ] Guard conditions are checked before transition:
  - `generating -> active` requires all lessons to exist.
  - `active -> in_progress` requires at least one lesson viewed or activity submitted.
  - `in_progress -> awaiting_assessment` requires all lessons completed.
  - `assessment_ready -> completed` requires assessment score >= 70.
  - `archived -> *` requires the target state to match `pre_archive_state`.
- [ ] `pre_archive_state` is recorded when archiving and used to restore on unarchive.
- [ ] State transitions update `updated_at` timestamp.

### Lesson State Management

- [ ] First lesson is set to `unlocked` when course enters `active` state.
- [ ] All other lessons start as `locked`.
- [ ] Completing an activity on lesson N sets lesson N to `completed` and lesson N+1 to `unlocked`.
- [ ] Completing the last lesson's activity does not error (no N+1 to unlock).
- [ ] Re-submitting a completed activity increments `submission_count` without changing lesson states.
- [ ] Locked lessons cannot be viewed (API returns 403).
- [ ] Lesson states are correctly reflected in API responses.

### Progress Tracking

- [ ] Progress percentage is calculated as `(completed_lessons / total_lessons) * 100`.
- [ ] Progress is 0% when no lessons are completed.
- [ ] Progress is 100% when all lessons are completed.
- [ ] `current_lesson_index` points to the first unlocked lesson.
- [ ] Time tracking accumulates correctly across multiple heartbeat updates.
- [ ] Activity scores and attempt counts are accurately aggregated.
- [ ] `average_score` is calculated from `latest_score` across all scored activities.

### Course Persistence

- [ ] `GET /api/courses` returns all courses for the current user.
- [ ] `GET /api/courses` supports `status` filter, `limit`, and `offset` pagination.
- [ ] `GET /api/courses/{id}` returns full course with nested lessons, activities, and progress.
- [ ] Locked lessons in `GET /api/courses/{id}` have `null` title and content (redacted).
- [ ] `DELETE /api/courses/{id}` cascades to all child entities.
- [ ] After delete, the course is not returned by `GET /api/courses`.

### Content Editing

- [ ] `POST /api/lessons/{id}/regenerate` re-runs lesson_writer and replaces content.
- [ ] Regeneration count is incremented and persisted.
- [ ] Regeneration is blocked after `MAX_REGENERATION_ATTEMPTS` (3) with 429 response.
- [ ] Regeneration is blocked for locked lessons with 403 response.
- [ ] Variant modifier (`more_examples`, `simpler_explanation`) alters the generation prompt.
- [ ] Regenerated lesson keeps its position in the course (same `objective_index`).

### API Contracts

- [ ] All endpoints return proper HTTP status codes (200, 204, 403, 404, 409, 422, 429).
- [ ] Error responses include `detail`, `error_type`, and relevant context fields.
- [ ] All UUID path parameters are validated.
- [ ] `PATCH /api/lessons/{id}/time` rejects negative values and values > 300.

---

## 9. Verification

### Unit Tests — State Machine (`tests/unit/state/`)

```python
# tests/unit/state/test_course_state_machine.py

import pytest
from app.state.course_state_machine import (
    CourseStateMachine, CourseState,
    InvalidStateTransitionError, GuardFailedError,
)


class TestValidTransitions:
    """Verify all transitions in the transition table succeed."""

    def test_draft_to_generating(self, course_factory):
        course = course_factory(status="draft")
        machine = CourseStateMachine(course)
        assert machine.can_transition(CourseState.GENERATING)

    def test_generating_to_active(self, course_factory, lesson_factory):
        course = course_factory(status="generating")
        lesson_factory(course=course)  # At least one lesson exists
        machine = CourseStateMachine(course)
        assert machine.can_transition(CourseState.ACTIVE)

    def test_generating_to_draft_on_failure(self, course_factory):
        course = course_factory(status="generating")
        machine = CourseStateMachine(course)
        assert machine.can_transition(CourseState.DRAFT)

    def test_active_to_in_progress(self, course_factory, lesson_factory):
        course = course_factory(status="active")
        lesson = lesson_factory(course=course, viewed_at=datetime.utcnow())
        machine = CourseStateMachine(course)
        assert machine.can_transition(CourseState.IN_PROGRESS)

    def test_in_progress_to_awaiting_assessment(self, course_factory, lesson_factory):
        course = course_factory(status="in_progress")
        lesson_factory(course=course, status="completed")
        lesson_factory(course=course, status="completed")
        machine = CourseStateMachine(course)
        assert machine.can_transition(CourseState.AWAITING_ASSESSMENT)

    def test_full_happy_path(self, course_factory, lesson_factory, assessment_factory):
        """Walk through every state in the happy path."""
        course = course_factory(status="draft")
        machine = CourseStateMachine(course)
        # draft -> generating -> active -> in_progress ->
        # awaiting_assessment -> assessment_ready -> completed -> archived
        # (Guards satisfied at each step via factory setup)
        ...


class TestInvalidTransitions:
    """Verify all impossible transitions raise errors."""

    @pytest.mark.parametrize("from_state,to_state", [
        ("draft", "completed"),
        ("draft", "in_progress"),
        ("draft", "active"),
        ("active", "draft"),
        ("active", "generating"),
        ("active", "completed"),
        ("in_progress", "draft"),
        ("in_progress", "generating"),
        ("in_progress", "active"),
        ("completed", "draft"),
        ("completed", "in_progress"),
        ("completed", "generating"),
    ])
    def test_invalid_transition_raises(self, from_state, to_state, course_factory):
        course = course_factory(status=from_state)
        machine = CourseStateMachine(course)
        assert not machine.can_transition(CourseState(to_state))


class TestGuardConditions:
    """Verify guard conditions block transitions when not met."""

    def test_generating_to_active_without_lessons(self, course_factory):
        course = course_factory(status="generating", lessons=[])
        machine = CourseStateMachine(course)
        with pytest.raises(GuardFailedError, match="No lessons"):
            machine._guard_all_lessons_generated(CourseState.ACTIVE)

    def test_active_to_in_progress_without_activity(self, course_factory, lesson_factory):
        course = course_factory(status="active")
        lesson_factory(course=course, viewed_at=None)
        machine = CourseStateMachine(course)
        with pytest.raises(GuardFailedError, match="No lesson viewed"):
            machine._guard_has_activity(CourseState.IN_PROGRESS)

    def test_in_progress_to_awaiting_with_incomplete_lessons(
        self, course_factory, lesson_factory
    ):
        course = course_factory(status="in_progress")
        lesson_factory(course=course, status="completed")
        lesson_factory(course=course, status="unlocked")  # Not completed
        machine = CourseStateMachine(course)
        with pytest.raises(GuardFailedError, match="1 lesson.*not completed"):
            machine._guard_all_lessons_completed(CourseState.AWAITING_ASSESSMENT)

    def test_assessment_ready_to_completed_without_passing_score(
        self, course_factory, assessment_factory
    ):
        course = course_factory(status="assessment_ready")
        assessment_factory(course=course, reviewer_score=65)
        machine = CourseStateMachine(course)
        with pytest.raises(GuardFailedError, match="score 65 < 70"):
            machine._guard_assessment_passed(CourseState.COMPLETED)

    def test_unarchive_to_wrong_state(self, course_factory):
        course = course_factory(status="archived", pre_archive_state="in_progress")
        machine = CourseStateMachine(course)
        with pytest.raises(GuardFailedError, match="Pre-archive state was 'in_progress'"):
            machine._guard_was_state(CourseState.ACTIVE)
```

### Unit Tests — Lesson State (`tests/unit/state/`)

```python
# tests/unit/state/test_lesson_state.py

class TestLessonUnlockLogic:

    async def test_first_lesson_unlocked_on_activation(self, db, course_with_lessons):
        await unlock_initial_lesson(course_with_lessons, db)
        lessons = sorted(course_with_lessons.lessons, key=lambda l: l.objective_index)
        assert lessons[0].status == "unlocked"
        assert all(l.status == "locked" for l in lessons[1:])

    async def test_completing_activity_unlocks_next(self, db, course_with_lessons):
        lessons = sorted(course_with_lessons.lessons, key=lambda l: l.objective_index)
        lessons[0].status = "unlocked"
        next_lesson = await on_activity_completed(lessons[0], db)
        assert lessons[0].status == "completed"
        assert next_lesson is not None
        assert next_lesson.status == "unlocked"
        assert next_lesson.objective_index == 1

    async def test_completing_last_lesson_no_crash(self, db, course_with_lessons):
        lessons = sorted(course_with_lessons.lessons, key=lambda l: l.objective_index)
        last = lessons[-1]
        last.status = "unlocked"
        result = await on_activity_completed(last, db)
        assert last.status == "completed"
        assert result is None  # No next lesson

    async def test_resubmit_keeps_existing_states(self, db, course_with_lessons):
        lessons = sorted(course_with_lessons.lessons, key=lambda l: l.objective_index)
        lessons[0].status = "completed"
        lessons[1].status = "unlocked"
        # Re-complete lesson 0
        next_lesson = await on_activity_completed(lessons[0], db)
        assert lessons[0].status == "completed"
        assert lessons[1].status == "unlocked"  # Unchanged
```

### Unit Tests — Progress Calculation (`tests/unit/state/`)

```python
# tests/unit/state/test_progress.py

class TestProgressCalculation:

    def test_zero_lessons(self, empty_course):
        progress = calculate_progress(empty_course)
        assert progress.percentage == 0.0
        assert progress.lessons_completed == 0
        assert progress.lessons_total == 0

    def test_no_completed_lessons(self, course_with_3_lessons):
        progress = calculate_progress(course_with_3_lessons)
        assert progress.percentage == 0.0
        assert progress.lessons_completed == 0
        assert progress.lessons_total == 3

    def test_half_completed(self, course_with_4_lessons_2_completed):
        progress = calculate_progress(course_with_4_lessons_2_completed)
        assert progress.percentage == 50.0
        assert progress.lessons_completed == 2
        assert progress.lessons_total == 4

    def test_all_completed(self, course_with_3_lessons_all_completed):
        progress = calculate_progress(course_with_3_lessons_all_completed)
        assert progress.percentage == 100.0
        assert progress.lessons_completed == 3
        assert progress.lessons_total == 3

    def test_current_lesson_index(self, course_with_mixed_states):
        """First unlocked lesson should be the current lesson."""
        progress = calculate_progress(course_with_mixed_states)
        assert progress.current_lesson_index == 1  # Second lesson unlocked

    def test_time_aggregation(self, course_with_time_data):
        progress = calculate_progress(course_with_time_data)
        # 300s lesson + 200s activity + 300s lesson + 200s activity = 1000s
        assert progress.total_time_seconds == 1000

    def test_average_score(self, course_with_scored_activities):
        # Activities scored: 80, 90 -> average 85.0
        progress = calculate_progress(course_with_scored_activities)
        assert progress.average_score == 85.0

    def test_average_score_with_unscored(self, course_with_partial_scores):
        # Activities: 80 (scored), None (unscored) -> average = 80.0
        progress = calculate_progress(course_with_partial_scores)
        assert progress.average_score == 80.0
```

### Integration Tests — API (`tests/integration/api/`)

```python
# tests/integration/api/test_course_progression_api.py

import httpx
import pytest


class TestListCourses:

    async def test_empty_list(self, client: httpx.AsyncClient):
        resp = await client.get("/api/courses")
        assert resp.status_code == 200
        data = resp.json()
        assert data["courses"] == []
        assert data["total"] == 0

    async def test_returns_courses_with_progress(
        self, client: httpx.AsyncClient, seeded_course
    ):
        resp = await client.get("/api/courses")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["courses"]) == 1
        assert "progress" in data["courses"][0]
        assert data["courses"][0]["progress"]["percentage"] == 0.0

    async def test_status_filter(
        self, client: httpx.AsyncClient, seeded_course_in_progress, seeded_course_completed
    ):
        resp = await client.get("/api/courses?status=in_progress")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["courses"]) == 1
        assert data["courses"][0]["status"] == "in_progress"


class TestGetCourse:

    async def test_full_course_response(
        self, client: httpx.AsyncClient, seeded_course_with_lessons
    ):
        course_id = seeded_course_with_lessons.id
        resp = await client.get(f"/api/courses/{course_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["lessons"]) == 3
        assert data["progress"]["lessons_total"] == 3

    async def test_locked_lessons_redacted(
        self, client: httpx.AsyncClient, seeded_course_with_lessons
    ):
        course_id = seeded_course_with_lessons.id
        resp = await client.get(f"/api/courses/{course_id}")
        data = resp.json()
        locked = [l for l in data["lessons"] if l["status"] == "locked"]
        for lesson in locked:
            assert lesson["lesson_title"] is None
            assert lesson["lesson_content"] is None

    async def test_not_found(self, client: httpx.AsyncClient):
        resp = await client.get(f"/api/courses/{uuid4()}")
        assert resp.status_code == 404


class TestStateTransition:

    async def test_valid_transition(
        self, client: httpx.AsyncClient, seeded_course_in_progress
    ):
        course_id = seeded_course_in_progress.id
        resp = await client.patch(
            f"/api/courses/{course_id}/state",
            json={"target_state": "archived"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["previous_state"] == "in_progress"
        assert data["current_state"] == "archived"

    async def test_invalid_transition_409(
        self, client: httpx.AsyncClient, seeded_course_draft
    ):
        course_id = seeded_course_draft.id
        resp = await client.patch(
            f"/api/courses/{course_id}/state",
            json={"target_state": "completed"},
        )
        assert resp.status_code == 409
        data = resp.json()
        assert data["error_type"] == "invalid_state_transition"

    async def test_guard_failure_409(
        self, client: httpx.AsyncClient, seeded_course_in_progress_incomplete
    ):
        course_id = seeded_course_in_progress_incomplete.id
        resp = await client.patch(
            f"/api/courses/{course_id}/state",
            json={"target_state": "awaiting_assessment"},
        )
        assert resp.status_code == 409
        data = resp.json()
        assert data["error_type"] == "guard_failed"
        assert "not completed" in data["detail"]


class TestMarkViewed:

    async def test_first_view(self, client: httpx.AsyncClient, seeded_unlocked_lesson):
        lesson_id = seeded_unlocked_lesson.id
        resp = await client.post(f"/api/lessons/{lesson_id}/viewed")
        assert resp.status_code == 200
        data = resp.json()
        assert data["first_view"] is True
        assert data["viewed_at"] is not None

    async def test_idempotent_view(self, client: httpx.AsyncClient, seeded_viewed_lesson):
        lesson_id = seeded_viewed_lesson.id
        resp = await client.post(f"/api/lessons/{lesson_id}/viewed")
        assert resp.status_code == 200
        data = resp.json()
        assert data["first_view"] is False

    async def test_locked_lesson_403(self, client: httpx.AsyncClient, seeded_locked_lesson):
        lesson_id = seeded_locked_lesson.id
        resp = await client.post(f"/api/lessons/{lesson_id}/viewed")
        assert resp.status_code == 403


class TestDeleteCourse:

    async def test_cascade_delete(
        self, client: httpx.AsyncClient, db: AsyncSession, seeded_course_with_lessons
    ):
        course_id = seeded_course_with_lessons.id
        resp = await client.delete(f"/api/courses/{course_id}")
        assert resp.status_code == 204

        # Verify cascade
        resp = await client.get(f"/api/courses/{course_id}")
        assert resp.status_code == 404

    async def test_not_found(self, client: httpx.AsyncClient):
        resp = await client.delete(f"/api/courses/{uuid4()}")
        assert resp.status_code == 404


class TestProgressionFlow:
    """Integration test: full progression through a course via API."""

    async def test_full_progression(self, client: httpx.AsyncClient, generated_course_id):
        # 1. Course starts as active with progress 0%
        resp = await client.get(f"/api/courses/{generated_course_id}/progress")
        assert resp.json()["progress"]["percentage"] == 0.0
        lessons = resp.json()["lessons"]
        assert lessons[0]["status"] == "unlocked"
        assert lessons[1]["status"] == "locked"

        # 2. View lesson 1
        lesson_1_id = lessons[0]["id"] if "id" in lessons[0] else ...
        resp = await client.post(f"/api/lessons/{lesson_1_id}/viewed")
        assert resp.status_code == 200

        # 3. Submit activity 1 (via PRD 3 endpoint)
        activity_1_id = ...  # From GET course response
        resp = await client.post(
            f"/api/activities/{activity_1_id}/submit",
            json={"text": "My response to the activity"},
        )
        assert resp.status_code == 200

        # 4. Verify lesson 2 is now unlocked
        resp = await client.get(f"/api/courses/{generated_course_id}/progress")
        lessons = resp.json()["lessons"]
        assert lessons[0]["status"] == "completed"
        assert lessons[1]["status"] == "unlocked"

        # 5. Verify progress updated
        assert resp.json()["progress"]["lessons_completed"] == 1

    async def test_resume_after_restart(self, client: httpx.AsyncClient, partially_completed_course_id):
        """Simulate resume: new client, same course ID, verify state persisted."""
        resp = await client.get(f"/api/courses/{partially_completed_course_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "in_progress"
        assert data["progress"]["lessons_completed"] > 0


class TestRegeneration:

    async def test_regenerate_lesson(
        self, client: httpx.AsyncClient, seeded_unlocked_lesson
    ):
        lesson_id = seeded_unlocked_lesson.id
        resp = await client.post(
            f"/api/lessons/{lesson_id}/regenerate",
            json={"variant": None},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["regeneration_count"] == 1

    async def test_regenerate_with_variant(
        self, client: httpx.AsyncClient, seeded_unlocked_lesson
    ):
        lesson_id = seeded_unlocked_lesson.id
        resp = await client.post(
            f"/api/lessons/{lesson_id}/regenerate",
            json={"variant": "more_examples"},
        )
        assert resp.status_code == 200
        assert resp.json()["variant"] == "more_examples"

    async def test_regeneration_limit(
        self, client: httpx.AsyncClient, lesson_at_regen_limit
    ):
        lesson_id = lesson_at_regen_limit.id
        resp = await client.post(
            f"/api/lessons/{lesson_id}/regenerate",
            json={"variant": None},
        )
        assert resp.status_code == 429
        assert resp.json()["error_type"] == "regeneration_limit"

    async def test_regenerate_locked_lesson_403(
        self, client: httpx.AsyncClient, seeded_locked_lesson
    ):
        lesson_id = seeded_locked_lesson.id
        resp = await client.post(
            f"/api/lessons/{lesson_id}/regenerate",
            json={"variant": None},
        )
        assert resp.status_code == 403
```

### E2E Tests — Full Lifecycle (`tests/e2e/api/`)

```python
# tests/e2e/api/test_course_lifecycle.py

class TestCourseLifecycleE2E:
    """Full lifecycle test against a running server.
    These tests hit the live server and exercise the real database.
    They do NOT call live LLMs — agents are mocked at the service layer.
    """

    async def test_create_progress_complete(self, live_client: httpx.AsyncClient):
        """Create a course, progress through all lessons, verify 100% completion."""
        # Generate course (PRD 2 endpoint)
        resp = await live_client.post("/api/courses/generate", json={
            "description": "Test course",
            "objectives": ["Obj 1", "Obj 2", "Obj 3"],
        })
        course_id = resp.json()["id"]

        # Progress through each lesson
        for i in range(3):
            course = (await live_client.get(f"/api/courses/{course_id}")).json()
            lesson = next(l for l in course["lessons"] if l["status"] == "unlocked")

            # View lesson
            await live_client.post(f"/api/lessons/{lesson['id']}/viewed")

            # Submit activity
            activity_id = lesson["activity"]["id"]
            await live_client.post(
                f"/api/activities/{activity_id}/submit",
                json={"text": f"Response for lesson {i + 1}"},
            )

        # Verify 100% progress
        progress = (await live_client.get(f"/api/courses/{course_id}/progress")).json()
        assert progress["progress"]["percentage"] == 100.0
        assert progress["status"] in ("in_progress", "awaiting_assessment")

    async def test_resume_after_restart(self, live_client: httpx.AsyncClient):
        """Create a course, partially complete it, verify resumability."""
        # Generate and partially complete
        resp = await live_client.post("/api/courses/generate", json={
            "description": "Resume test",
            "objectives": ["Obj 1", "Obj 2"],
        })
        course_id = resp.json()["id"]

        # Complete first lesson only
        course = (await live_client.get(f"/api/courses/{course_id}")).json()
        lesson = next(l for l in course["lessons"] if l["status"] == "unlocked")
        await live_client.post(f"/api/lessons/{lesson['id']}/viewed")
        await live_client.post(
            f"/api/activities/{lesson['activity']['id']}/submit",
            json={"text": "Response"},
        )

        # Simulate restart: new client, same course
        course = (await live_client.get(f"/api/courses/{course_id}")).json()
        assert course["status"] == "in_progress"
        assert course["progress"]["lessons_completed"] == 1
        assert any(l["status"] == "unlocked" for l in course["lessons"])

    async def test_regenerate_lesson_preserves_position(
        self, live_client: httpx.AsyncClient
    ):
        """Regenerate a lesson, verify it stays in the same position."""
        resp = await live_client.post("/api/courses/generate", json={
            "description": "Regen test",
            "objectives": ["Obj 1", "Obj 2"],
        })
        course_id = resp.json()["id"]
        course = (await live_client.get(f"/api/courses/{course_id}")).json()
        lesson = next(l for l in course["lessons"] if l["status"] == "unlocked")
        original_index = lesson["objective_index"]

        # Regenerate
        resp = await live_client.post(
            f"/api/lessons/{lesson['id']}/regenerate",
            json={"variant": "simpler_explanation"},
        )
        assert resp.status_code == 200

        # Verify position preserved
        course = (await live_client.get(f"/api/courses/{course_id}")).json()
        regenerated = next(l for l in course["lessons"] if l["id"] == lesson["id"])
        assert regenerated["objective_index"] == original_index
        assert regenerated["regeneration_count"] == 1
```

### ADW Tests

#### ADW Implementation Pattern

ADW tests are **single-file `uv` scripts** using [PEP 723 inline script metadata](https://peps.python.org/pep-0723/). Each test is a self-contained `.py` file that can be run directly with `uv run`:

```bash
# Run a single ADW test
uv run tests/adw/03_lesson_navigation.py
uv run tests/adw/05_course_progression.py

# Run all ADW tests
uv run tests/adw/run_all.py
```

**Script structure** — every ADW test follows this pattern:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""ADW Test: <Test Name> — <brief description>."""

import json
import shutil
import subprocess
import sys
from pathlib import Path

PROMPT = """\
<the ADW prompt content goes here>
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

#### `tests/adw/03_lesson_navigation.py`

The `PROMPT` variable in this script contains:

```markdown
You are a QA tester for the 1111 School learning platform.
The app is running at http://localhost:5173 and the backend at http://localhost:8000.
Use agent-browser to automate the browser.

TEST: Lesson navigation and lock state verification

PRECONDITION: A course has already been generated. Use the API to confirm:
`curl http://localhost:8000/api/courses | jq '.'`

Steps:
1. `agent-browser open http://localhost:5173`
2. `agent-browser snapshot -i` to orient
3. Navigate to the first course in the list
4. Take a snapshot of the course view — identify the lesson navigation (left nav or lesson list)

VERIFY lock states:
5. Lesson 1 should show an unlocked/accessible indicator — verify you can click it
6. Lessons 2+ should show locked indicators — try clicking a locked lesson, verify it's blocked
7. Take an annotated screenshot: `agent-browser screenshot --annotate ./test-results/03-lock-states.png`

VERIFY navigation after completion:
8. Navigate to Lesson 1's activity
9. Read the activity prompt, write a relevant response, submit it
10. Wait for feedback to appear (re-snapshot until feedback visible)
11. Take a snapshot of the left nav / lesson list again
12. Lesson 2 should now show as unlocked — verify you can navigate to it
13. Navigate to Lesson 2, verify different content loaded (compare headings/text)
14. Take an annotated screenshot: `agent-browser screenshot --annotate ./test-results/03-after-unlock.png`

VERIFY progress indicator:
15. Look for a progress bar, percentage, or step indicator on the page
16. Verify it reflects 1/N lessons completed (where N is total lessons)

Output a JSON object:
{
  "test": "lesson_navigation",
  "passed": true/false,
  "checks": [
    {"name": "lesson_1_unlocked", "passed": true/false, "notes": "..."},
    {"name": "lesson_2_locked", "passed": true/false, "notes": "..."},
    {"name": "locked_lesson_blocked", "passed": true/false, "notes": "..."},
    {"name": "activity_submission", "passed": true/false, "notes": "..."},
    {"name": "lesson_2_unlocked_after", "passed": true/false, "notes": "..."},
    {"name": "lesson_2_different_content", "passed": true/false, "notes": "..."},
    {"name": "progress_indicator_updated", "passed": true/false, "notes": "..."}
  ],
  "notes": "..."
}
```

#### `tests/adw/05_course_progression.py`

The `PROMPT` variable in this script contains:

```markdown
You are a QA tester for the 1111 School learning platform.
The app is running at http://localhost:5173 and the backend at http://localhost:8000.
Use agent-browser to automate the browser.

TEST: Full course lifecycle — create, progress, complete

Steps:
1. `agent-browser open http://localhost:5173`
2. `agent-browser snapshot -i`

PHASE 1: Create a course
3. Find the course creation input. Enter description: "Introduction to Basic Cooking"
4. Add 3 learning objectives:
   - "Understand knife safety and basic cuts"
   - "Learn to make a simple sauce"
   - "Prepare a complete one-pot meal"
5. Click Generate / Create
6. Wait for generation to complete (re-snapshot periodically, look for lesson content)
7. `agent-browser screenshot --annotate ./test-results/05-course-created.png`

PHASE 2: Progress through every lesson
8. For each lesson (iterate through all):
   a. Navigate to the lesson (if unlocked)
   b. Verify lesson content is visible (headings, text, not empty)
   c. Mark as viewed (scroll through or interact)
   d. Navigate to the lesson's activity
   e. Read the activity prompt
   f. Write a thoughtful, on-topic response (2-3 sentences minimum)
   g. Submit the response
   h. Wait for feedback to appear
   i. Verify feedback shows: score, strengths, improvements
   j. Verify the next lesson unlocks (check nav/list)
   k. `agent-browser screenshot --annotate ./test-results/05-lesson-{N}-complete.png`

PHASE 3: Verify final state
9. After completing all lessons:
   - Verify progress shows 100% (or equivalent visual indicator)
   - Verify course status reflects completion
   - Check if assessment prompt appears (if implemented)
10. `agent-browser screenshot --annotate ./test-results/05-course-complete.png`

PHASE 4: Verify persistence (resume)
11. Reload the page: `agent-browser open http://localhost:5173`
12. Navigate back to the course
13. Verify all progress is preserved (all lessons still show as completed)
14. `agent-browser screenshot --annotate ./test-results/05-resumed.png`

Output a JSON object:
{
  "test": "course_progression",
  "passed": true/false,
  "checks": [
    {"name": "course_created", "passed": true/false, "notes": "..."},
    {"name": "lesson_1_completed", "passed": true/false, "notes": "..."},
    {"name": "lesson_2_unlocked", "passed": true/false, "notes": "..."},
    {"name": "lesson_2_completed", "passed": true/false, "notes": "..."},
    {"name": "lesson_3_unlocked", "passed": true/false, "notes": "..."},
    {"name": "lesson_3_completed", "passed": true/false, "notes": "..."},
    {"name": "progress_100_percent", "passed": true/false, "notes": "..."},
    {"name": "persistence_after_reload", "passed": true/false, "notes": "..."}
  ],
  "notes": "..."
}
```

---

## 10. Definition of Done

- [ ] `CourseStateMachine` class implemented with all 8 states and transition table.
- [ ] All guard conditions implemented and tested.
- [ ] `InvalidStateTransitionError` and `GuardFailedError` exceptions defined.
- [ ] Lesson state management functions (`unlock_initial_lesson`, `on_activity_completed`) implemented.
- [ ] `calculate_progress` function returns accurate `CourseProgress` for all edge cases.
- [ ] Time tracking heartbeat endpoints for lessons and activities.
- [ ] Content editing: regeneration with attempt limits and variant support.
- [ ] Alembic migration adds all new columns to existing tables.
- [ ] All 9 API endpoints implemented and returning correct status codes.
- [ ] Locked lessons redacted in API responses (null title/content).
- [ ] Delete cascade verified — no orphaned records.
- [ ] Unit tests pass: state machine transitions, guard conditions, lesson unlock logic, progress calculation.
- [ ] Integration tests pass: all API endpoints, full progression flow, delete cascade.
- [ ] E2E tests pass: full lifecycle, resume after restart, regeneration.
- [ ] ADW test prompts written: `03_lesson_navigation.md`, `05_course_progression.md`.
- [ ] All tests run via `uv run pytest` with no failures.
- [ ] No agent dependencies — this PRD is pure state management and can be tested without LLM calls.
