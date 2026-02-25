---
prd: 6
title: "Learner Profile & Personalization"
phase: Enhancement
depends_on: [5]
agents_new: []
agents_modified: [course_describer, lesson_planner, lesson_writer, activity_creator, activity_reviewer]
status: draft
created: 2026-02-24
---

# PRD 6 — Learner Profile & Personalization

## Overview

This PRD introduces the **Learner Profile** system and converts all existing agents from static to dynamic system prompts. After completing the MVP (PRDs 1-5), every agent produces the same output regardless of who the learner is. PRD 6 closes that gap by:

1. Defining a versioned Learner Profile schema that captures goals, preferences, skill signals, and accessibility needs.
2. Building a **Setup Course** that onboards first-time users, teaches them how the platform works, and collects the signals needed to populate their initial profile.
3. Wiring **continuous profile updates** so that activity scores, course completions, and user edits keep the profile current.
4. Converting every existing agent to use `@agent.instructions` (PydanticAI's re-evaluated dynamic prompt decorator) so that agent behavior adapts to the learner on every run.

The result: two learners creating the same course get meaningfully different lessons, activities, and feedback — grounded in their profile rather than one-size-fits-all defaults.

**Source references**: Master PRD Sections 4.2 (Setup Course), 4.3 (Learner Profile), 7.2 A-E (agent contracts). Decomposition Plan PRD 6.

---

## Goals

1. **Personalized agent output** — Every agent run incorporates the learner's profile signals so that course descriptions, lessons, activities, and feedback reflect who the learner is.
2. **Structured onboarding** — First-time users complete a Setup Course that teaches the platform and produces an initial profile draft.
3. **Living profile** — The profile evolves automatically via activity signals and course completions, with full change history and user editability.
4. **Transparency** — Users see when and why their profile was updated ("Updated based on your last activity").
5. **UDL integration** — Universal Design for Learning preferences (Engagement, Representation, Action-Expression) are first-class profile fields that influence every agent.

---

## Non-Goals

- **New agents**: No new agents are introduced. This PRD modifies the system prompts of all five existing agents.
- **Profile-based course recommendations**: Suggesting courses based on profile signals is deferred to PRD 10 (Course Discovery).
- **Multi-user profile comparison or social features**: Out of scope.
- **Profile import/export**: Not in v1.
- **Authentication**: PRD 6 assumes a single-user context (or relies on whatever user identity PRD 11 provides). Profile is linked to `userId` but auth enforcement is not this PRD's concern.

---

## Scope

### What ships

| Component | Description |
|-----------|-------------|
| **LearnerProfile model** | SQLAlchemy model + Pydantic schema with versioning and change history |
| **Setup Course** | Predefined course auto-enrolled on first use; collects profile signals |
| **Profile API** | `GET /api/profile`, `PATCH /api/profile`, `GET /api/profile/history` |
| **Continuous updates** | Automatic profile mutation after activity reviews and course completions |
| **Dynamic prompts** | All 5 agents converted from static to `@agent.instructions` |
| **Profile UI** | View/edit screen, change history, badge inventory display |

### What does not ship

- Visual Aid agents (PRD 7)
- Assessment agents (PRD 8)
- Agent Log UI (PRD 9)
- Course catalog browsing (PRD 10)
- Authentication (PRD 11)

---

## Technical Design

### Profile Schema

The `LearnerProfile` is stored as a versioned JSON document on the `learner_profiles` table, with a separate `profile_changes` table for the audit log.

#### Database Models

```python
# models/learner_profile.py
from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UpdateSource(StrEnum):
    SETUP_COURSE = "setup_course"
    ACTIVITY_SIGNAL = "activity_signal"
    COURSE_COMPLETION = "course_completion"
    USER_EDIT = "user_edit"


class LearnerProfile(Base):
    __tablename__ = "learner_profiles"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), unique=True)
    version: Mapped[int] = mapped_column(default=1)
    profile_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
    update_source: Mapped[UpdateSource] = mapped_column(default=UpdateSource.SETUP_COURSE)

    changes: Mapped[list["ProfileChange"]] = relationship(
        back_populates="profile", order_by="ProfileChange.changed_at.desc()"
    )


class ProfileChange(Base):
    __tablename__ = "profile_changes"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    profile_id: Mapped[UUID] = mapped_column(ForeignKey("learner_profiles.id"))
    version: Mapped[int] = mapped_column()
    diff: Mapped[dict] = mapped_column(JSONB, nullable=False)
    update_source: Mapped[UpdateSource] = mapped_column()
    reason: Mapped[str] = mapped_column(Text, nullable=True)
    changed_at: Mapped[datetime] = mapped_column(server_default=func.now())

    profile: Mapped["LearnerProfile"] = relationship(back_populates="changes")
```

#### Pydantic Schema (profile_data JSON structure)

```python
# schemas/learner_profile.py
from enum import StrEnum
from pydantic import BaseModel, Field


class ExperienceLevel(StrEnum):
    NOVICE = "novice"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class LearningStyle(StrEnum):
    TEXT_HEAVY = "text_heavy"
    EXAMPLES_HEAVY = "examples_heavy"
    VISUAL = "visual"
    HANDS_ON = "hands_on"
    MIXED = "mixed"


class TonePreference(StrEnum):
    CASUAL = "casual"
    PROFESSIONAL = "professional"
    ENCOURAGING = "encouraging"
    DIRECT = "direct"
    SOCRATIC = "socratic"


class UDLPreferences(BaseModel):
    """Universal Design for Learning preferences."""
    engagement: list[str] = Field(
        default_factory=list,
        description="Engagement preferences: motivation, self-regulation, interest triggers",
        max_length=6,
    )
    representation: list[str] = Field(
        default_factory=list,
        description="Representation preferences: how content is presented (text, audio, visual)",
        max_length=6,
    )
    action_expression: list[str] = Field(
        default_factory=list,
        description="Action & Expression preferences: how learner demonstrates understanding",
        max_length=6,
    )


class Constraints(BaseModel):
    """Learner constraints that affect content generation."""
    time_per_day_minutes: int | None = Field(
        default=None,
        description="Available learning time per day in minutes",
        ge=5,
        le=480,
    )
    device: str | None = Field(
        default=None,
        description="Primary device (mobile, tablet, desktop)",
    )
    reading_level: str | None = Field(
        default=None,
        description="Approximate reading level (e.g., 'grade 8', 'professional')",
    )


class DomainExperience(BaseModel):
    """Experience level in a specific domain."""
    domain: str
    level: ExperienceLevel


class SkillSignal(BaseModel):
    """A derived signal about learner strengths/gaps."""
    skill: str
    signal_type: str = Field(description="One of: strength, gap, misconception")
    evidence: str = Field(description="What activity/score produced this signal")
    course_instance_id: str | None = None
    recorded_at: str | None = None


class CourseHistoryEntry(BaseModel):
    """High-level record of a course interaction."""
    course_instance_id: str
    course_name: str
    status: str = Field(description="One of: started, completed, abandoned")
    started_at: str
    completed_at: str | None = None
    final_score: float | None = None


class LearnerProfileData(BaseModel):
    """The full learner profile JSON structure stored in profile_data."""
    display_name: str = Field(max_length=100)
    learning_goals: list[str] = Field(
        default_factory=list,
        description="What the learner wants to achieve",
        max_length=20,
    )
    interests: list[str] = Field(
        default_factory=list,
        description="Topics and domains the learner is interested in",
        max_length=30,
    )
    experience_levels: list[DomainExperience] = Field(
        default_factory=list,
        description="Experience level per domain (supports multiple domains)",
    )
    preferred_learning_style: LearningStyle = Field(default=LearningStyle.MIXED)
    udl_preferences: UDLPreferences = Field(default_factory=UDLPreferences)
    constraints: Constraints = Field(default_factory=Constraints)
    badge_inventory: list[str] = Field(
        default_factory=list,
        description="Badge IDs earned by the learner",
    )
    course_history: list[CourseHistoryEntry] = Field(default_factory=list)
    skill_signals: list[SkillSignal] = Field(default_factory=list)
    tone_preference: TonePreference = Field(default=TonePreference.ENCOURAGING)
    preferred_response_modality: str = Field(
        default="writing",
        description="Preferred way to respond: writing, diagrams, image_uploads",
    )


class ProfileUpdateRequest(BaseModel):
    """PATCH /api/profile request body. All fields optional."""
    display_name: str | None = None
    learning_goals: list[str] | None = None
    interests: list[str] | None = None
    experience_levels: list[DomainExperience] | None = None
    preferred_learning_style: LearningStyle | None = None
    udl_preferences: UDLPreferences | None = None
    constraints: Constraints | None = None
    tone_preference: TonePreference | None = None
    preferred_response_modality: str | None = None


class ProfileChangeResponse(BaseModel):
    """Single entry in the profile change history."""
    version: int
    diff: dict
    update_source: str
    reason: str | None
    changed_at: str
```

### Setup Course Flow

The Setup Course is a predefined course with `course_id = "setup"` that serves two purposes: teaching the learner how the platform works and collecting the signals needed to populate their initial profile.

#### Auto-Enrollment Logic

```python
# services/setup_course.py
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course_instance import CourseInstance
from app.models.learner_profile import LearnerProfile


async def ensure_onboarding(user_id: UUID, db: AsyncSession) -> CourseInstance | None:
    """Check if user needs onboarding. Returns Setup Course instance if so.

    Called on every authenticated request (via middleware or dependency).
    Returns None if user already has a profile (onboarding complete).
    """
    profile = await db.get(LearnerProfile, user_id)
    if profile is not None:
        return None  # Already onboarded

    # Check if Setup Course already in progress
    existing = await get_setup_course_instance(user_id, db)
    if existing is not None:
        return existing

    # Auto-enroll in Setup Course
    return await create_setup_course_instance(user_id, db)
```

#### Setup Course Structure

The Setup Course has 3 lessons, each with an activity that collects profile signals:

| Lesson | Teaches | Collects |
|--------|---------|----------|
| **1. How Learning Works Here** | Lesson/activity/feedback cycle, unlock progression | Learning goals, experience level, interests |
| **2. Your Personalized Experience** | How the profile shapes content, UDL framework | Preferred learning style, UDL preferences, tone preference, response modality |
| **3. Transparency & Control** | Agent log, profile editing, what data is stored | Constraints (time/device), accessibility needs, display name |

Each activity response is parsed to extract profile signals. After the final activity review, the system assembles the initial profile draft:

```python
# services/profile_builder.py
from app.schemas.learner_profile import LearnerProfileData, UDLPreferences, Constraints


async def build_initial_profile(
    user_id: str,
    setup_responses: list[dict],
) -> LearnerProfileData:
    """Assemble initial profile from Setup Course activity responses.

    Each setup_response contains the activity submission text and the
    activity_reviewer's parsed signals (structured extraction from
    the reviewer's analysis of the learner's response).
    """
    # Extract signals from each lesson's activity response
    lesson_1_signals = setup_responses[0]  # goals, experience, interests
    lesson_2_signals = setup_responses[1]  # style, UDL, tone, modality
    lesson_3_signals = setup_responses[2]  # constraints, accessibility, name

    return LearnerProfileData(
        display_name=lesson_3_signals.get("display_name", "Learner"),
        learning_goals=lesson_1_signals.get("learning_goals", []),
        interests=lesson_1_signals.get("interests", []),
        experience_levels=lesson_1_signals.get("experience_levels", []),
        preferred_learning_style=lesson_2_signals.get(
            "preferred_learning_style", "mixed"
        ),
        udl_preferences=UDLPreferences(
            engagement=lesson_2_signals.get("udl_engagement", []),
            representation=lesson_2_signals.get("udl_representation", []),
            action_expression=lesson_2_signals.get("udl_action_expression", []),
        ),
        constraints=Constraints(
            time_per_day_minutes=lesson_3_signals.get("time_per_day_minutes"),
            device=lesson_3_signals.get("device"),
            reading_level=lesson_3_signals.get("reading_level"),
        ),
        tone_preference=lesson_2_signals.get("tone_preference", "encouraging"),
        preferred_response_modality=lesson_2_signals.get(
            "preferred_response_modality", "writing"
        ),
    )
```

After the profile draft is assembled, the user is redirected to the **Profile Review Screen** where they can edit any field before confirming. On confirmation, the profile is persisted with `update_source = "setup_course"`.

### Continuous Updates

Profile updates happen automatically at two trigger points and manually via user edits.

#### After Activity Review

```python
# services/profile_updater.py
from app.models.learner_profile import UpdateSource
from app.schemas.learner_profile import SkillSignal


async def update_profile_from_activity(
    profile: "LearnerProfile",
    activity_review: "ActivityReviewOutput",
    lesson_objective: str,
    db: "AsyncSession",
) -> None:
    """Update skill signals based on activity review scores.

    Rules:
    - score < 70  -> gap signal
    - score >= 70 and < 90 -> no signal change (meets expectations)
    - score >= 90 -> strength signal

    Deduplicates: if a signal already exists for this skill, update it
    rather than appending a duplicate.
    """
    profile_data = LearnerProfileData.model_validate(profile.profile_data)

    if activity_review.score < 70:
        signal = SkillSignal(
            skill=lesson_objective,
            signal_type="gap",
            evidence=f"Scored {activity_review.score}/100 on activity",
            course_instance_id=str(activity_review.course_instance_id),
            recorded_at=datetime.utcnow().isoformat(),
        )
        _upsert_skill_signal(profile_data, signal)
    elif activity_review.score >= 90:
        signal = SkillSignal(
            skill=lesson_objective,
            signal_type="strength",
            evidence=f"Scored {activity_review.score}/100 on activity",
            course_instance_id=str(activity_review.course_instance_id),
            recorded_at=datetime.utcnow().isoformat(),
        )
        _upsert_skill_signal(profile_data, signal)

    await _save_profile_update(
        profile=profile,
        new_data=profile_data,
        source=UpdateSource.ACTIVITY_SIGNAL,
        reason=f"Updated based on your last activity (score: {activity_review.score})",
        db=db,
    )


def _upsert_skill_signal(
    profile_data: "LearnerProfileData", signal: SkillSignal
) -> None:
    """Replace existing signal for same skill, or append new one."""
    profile_data.skill_signals = [
        s for s in profile_data.skill_signals if s.skill != signal.skill
    ] + [signal]
```

#### After Course Completion

```python
async def update_profile_from_course_completion(
    profile: "LearnerProfile",
    course_instance: "CourseInstance",
    final_score: float | None,
    db: "AsyncSession",
) -> None:
    """Update courseHistory and experienceLevel after course completion."""
    profile_data = LearnerProfileData.model_validate(profile.profile_data)

    # Append to course history
    entry = CourseHistoryEntry(
        course_instance_id=str(course_instance.id),
        course_name=course_instance.generated_course_description or "Untitled",
        status="completed",
        started_at=course_instance.created_at.isoformat(),
        completed_at=datetime.utcnow().isoformat(),
        final_score=final_score,
    )
    profile_data.course_history.append(entry)

    # Adjust experience level for the course's domain if score is high
    if final_score and final_score >= 85:
        _maybe_upgrade_experience(profile_data, course_instance)

    await _save_profile_update(
        profile=profile,
        new_data=profile_data,
        source=UpdateSource.COURSE_COMPLETION,
        reason=f"Updated after completing course: {entry.course_name}",
        db=db,
    )
```

#### Profile Versioning

Every update (automatic or manual) increments the profile version and creates a `ProfileChange` record with a JSON diff of what changed:

```python
async def _save_profile_update(
    profile: "LearnerProfile",
    new_data: "LearnerProfileData",
    source: UpdateSource,
    reason: str | None,
    db: "AsyncSession",
) -> None:
    """Persist profile update with versioning and change history."""
    old_data = profile.profile_data
    new_data_dict = new_data.model_dump(mode="json")

    # Compute diff (only changed keys)
    diff = {
        key: {"old": old_data.get(key), "new": new_data_dict[key]}
        for key in new_data_dict
        if old_data.get(key) != new_data_dict[key]
    }

    if not diff:
        return  # No changes

    profile.version += 1
    profile.profile_data = new_data_dict
    profile.update_source = source

    change = ProfileChange(
        profile_id=profile.id,
        version=profile.version,
        diff=diff,
        update_source=source,
        reason=reason,
    )
    db.add(change)
    await db.flush()
```

### Dynamic Prompts

All five existing agents are converted from static system prompts to dynamic prompts using `@agent.instructions`. This is the critical architectural change: `@agent.instructions` is re-evaluated on every `agent.run()` call, including when `message_history` is passed — unlike `@agent.system_prompt` which is only evaluated once.

#### PipelineDeps Extension

The existing `PipelineDeps` dataclass (from PRD 1) gains a `profile` field:

```python
# deps.py
from dataclasses import dataclass
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.learner_profile import LearnerProfileData


@dataclass
class PipelineDeps:
    db: AsyncSession
    user_id: str
    course_instance_id: str
    profile: LearnerProfileData | None = None  # Added in PRD 6
```

#### Agent Conversion Pattern

Each agent follows the same conversion pattern. Here is `course_describer` as the reference implementation:

```python
# agents/course_describer.py
from pydantic_ai import Agent, RunContext

from app.deps import PipelineDeps
from app.schemas.course_description import CourseDescriptionOutput

course_describer = Agent(
    "openai:gpt-4o",
    output_type=CourseDescriptionOutput,
    deps_type=PipelineDeps,
    output_retries=2,
)


@course_describer.instructions
async def course_describer_instructions(ctx: RunContext[PipelineDeps]) -> str:
    """Dynamic system prompt that injects learner profile signals.

    Re-evaluated on every run, including with message_history.
    """
    base = (
        "You are a course description specialist. Given a course title, "
        "description, learning objectives, and learner profile, produce a "
        "focused course description that centers on the selected objective "
        "and personalizes the narrative to the learner.\n\n"
        "Output STRICT JSON matching the CourseDescriptionOutput schema.\n"
        "courseDescription must be 60-140 words.\n"
        "personalizationRationale must contain 2-5 items.\n"
    )

    profile = ctx.deps.profile
    if profile is None:
        return base + "\nNo learner profile available. Use sensible defaults."

    # Inject profile signals
    profile_block = _build_profile_context(profile, focus=[
        "interests", "experience_levels", "tone_preference",
        "preferred_learning_style", "udl_preferences",
    ])

    return (
        base
        + "\n## Learner Profile\n"
        + profile_block
        + "\n\nUse the learner's interests and experience level to ground "
        "examples and set appropriate complexity. Reference specific profile "
        "signals in your personalizationRationale items."
    )
```

#### Per-Agent Profile Signal Injection

Each agent receives different profile signals relevant to its purpose:

| Agent | Profile Signals Injected | How They Influence Output |
|-------|--------------------------|--------------------------|
| `course_describer` | interests, experience_levels, tone_preference, preferred_learning_style, udl_preferences | Personalizes description narrative, grounds examples in interests, adjusts complexity framing |
| `lesson_planner` | experience_levels, udl_preferences, constraints, skill_signals, preferred_learning_style | Sets activity difficulty, UDL accommodations, time estimates, targets known gaps |
| `lesson_writer` | experience_levels, interests, preferred_learning_style, tone_preference, skill_signals, udl_preferences.representation | Adapts example domains, prose complexity, explanation depth, content format |
| `activity_creator` | preferred_response_modality, experience_levels, udl_preferences.action_expression, constraints | Selects submission type, calibrates difficulty, applies action/expression accommodations |
| `activity_reviewer` | experience_levels, tone_preference, skill_signals, udl_preferences.engagement | Adjusts feedback tone, references known strengths/gaps, provides encouragement style matching preference |

#### Profile Context Builder

A shared utility constructs the profile block injected into prompts:

```python
# agents/profile_context.py
from app.schemas.learner_profile import LearnerProfileData


def _build_profile_context(
    profile: LearnerProfileData,
    focus: list[str] | None = None,
) -> str:
    """Build a text block summarizing relevant profile signals for prompt injection.

    Args:
        profile: The learner's full profile data.
        focus: Optional list of field names to include. If None, includes all.

    Returns:
        A formatted string block suitable for embedding in a system prompt.
    """
    sections: list[str] = []

    fields = focus or [
        "display_name", "learning_goals", "interests", "experience_levels",
        "preferred_learning_style", "udl_preferences", "constraints",
        "skill_signals", "tone_preference", "preferred_response_modality",
    ]

    if "display_name" in fields and profile.display_name:
        sections.append(f"- Name: {profile.display_name}")

    if "learning_goals" in fields and profile.learning_goals:
        goals = ", ".join(profile.learning_goals[:5])
        sections.append(f"- Learning goals: {goals}")

    if "interests" in fields and profile.interests:
        interests = ", ".join(profile.interests[:5])
        sections.append(f"- Interests: {interests}")

    if "experience_levels" in fields and profile.experience_levels:
        levels = "; ".join(
            f"{e.domain}: {e.level}" for e in profile.experience_levels[:5]
        )
        sections.append(f"- Experience: {levels}")

    if "preferred_learning_style" in fields:
        sections.append(f"- Learning style: {profile.preferred_learning_style}")

    if "tone_preference" in fields:
        sections.append(f"- Tone preference: {profile.tone_preference}")

    if "preferred_response_modality" in fields:
        sections.append(f"- Preferred modality: {profile.preferred_response_modality}")

    if "udl_preferences" in fields:
        udl = profile.udl_preferences
        if udl.engagement:
            sections.append(f"- UDL Engagement: {', '.join(udl.engagement)}")
        if udl.representation:
            sections.append(f"- UDL Representation: {', '.join(udl.representation)}")
        if udl.action_expression:
            sections.append(
                f"- UDL Action/Expression: {', '.join(udl.action_expression)}"
            )

    if "constraints" in fields:
        c = profile.constraints
        if c.time_per_day_minutes:
            sections.append(f"- Time available: {c.time_per_day_minutes} min/day")
        if c.device:
            sections.append(f"- Primary device: {c.device}")
        if c.reading_level:
            sections.append(f"- Reading level: {c.reading_level}")

    if "skill_signals" in fields and profile.skill_signals:
        strengths = [s for s in profile.skill_signals if s.signal_type == "strength"]
        gaps = [s for s in profile.skill_signals if s.signal_type == "gap"]
        if strengths:
            sections.append(
                f"- Known strengths: {', '.join(s.skill for s in strengths[:5])}"
            )
        if gaps:
            sections.append(
                f"- Known gaps: {', '.join(s.skill for s in gaps[:5])}"
            )

    return "\n".join(sections) if sections else "No profile signals available."
```

#### Remaining Agent Conversions

`lesson_planner`:

```python
@lesson_planner.instructions
async def lesson_planner_instructions(ctx: RunContext[PipelineDeps]) -> str:
    base = (
        "You are a lesson planning specialist using Understanding by Design (UbD). "
        "Given a course description and learning objective, produce a detailed "
        "lesson plan with activities, assessment project, mastery criteria, and "
        "UDL accommodations.\n\n"
        "Output STRICT JSON matching the LessonPlanOutput schema.\n"
        "essentialQuestions: 2-4 items. rubricChecks: 3-6 items. activities: 3-6 items.\n"
    )
    profile = ctx.deps.profile
    if profile is None:
        return base + "\nNo learner profile available. Use sensible defaults."

    profile_block = _build_profile_context(profile, focus=[
        "experience_levels", "udl_preferences", "constraints",
        "skill_signals", "preferred_learning_style",
    ])

    return (
        base
        + "\n## Learner Profile\n"
        + profile_block
        + "\n\nCalibrate activity difficulty to the learner's experience level. "
        "If the learner has known gaps, design activities that address them. "
        "If time constraints exist, adjust estimatedMinutes accordingly. "
        "Tailor UDL accommodations to the learner's stated preferences."
    )
```

`lesson_writer`:

```python
@lesson_writer.instructions
async def lesson_writer_instructions(ctx: RunContext[PipelineDeps]) -> str:
    base = (
        "You are a lesson content writer. Given a lesson plan, produce "
        "engaging lesson content in Markdown with clear structure: "
        "Objective, Why It Matters, Steps/Explanation, Worked Example, Recap.\n\n"
        "Output STRICT JSON matching the LessonContentOutput schema.\n"
        "keyTakeaways: 3-6 items. suggestedActivity must include a valid type.\n"
    )
    profile = ctx.deps.profile
    if profile is None:
        return base + "\nNo learner profile available. Use sensible defaults."

    profile_block = _build_profile_context(profile, focus=[
        "experience_levels", "interests", "preferred_learning_style",
        "tone_preference", "skill_signals", "udl_preferences",
    ])

    return (
        base
        + "\n## Learner Profile\n"
        + profile_block
        + "\n\nDraw examples from the learner's interests. Match prose "
        "complexity to their experience level. Use their preferred tone. "
        "If they prefer examples-heavy style, include more worked examples. "
        "If they have known gaps, add extra scaffolding in those areas."
    )
```

`activity_creator`:

```python
@activity_creator.instructions
async def activity_creator_instructions(ctx: RunContext[PipelineDeps]) -> str:
    base = (
        "You are an activity design specialist. Given a lesson plan's "
        "suggested activity, expand it into a full activity specification "
        "with rubric, hints, and submission requirements.\n\n"
        "Output STRICT JSON matching the ActivitySpecOutput schema.\n"
        "scoringRubric: 3-6 items. hints: 2-5 items.\n"
    )
    profile = ctx.deps.profile
    if profile is None:
        return base + "\nNo learner profile available. Use sensible defaults."

    profile_block = _build_profile_context(profile, focus=[
        "preferred_response_modality", "experience_levels",
        "udl_preferences", "constraints",
    ])

    return (
        base
        + "\n## Learner Profile\n"
        + profile_block
        + "\n\nHonor the learner's preferred response modality when choosing "
        "submission format. Calibrate difficulty to experience level. "
        "Apply UDL Action/Expression accommodations to hint design."
    )
```

`activity_reviewer`:

```python
@activity_reviewer.instructions
async def activity_reviewer_instructions(ctx: RunContext[PipelineDeps]) -> str:
    base = (
        "You are an activity review specialist. Score the learner's "
        "submission against the rubric, providing specific strengths, "
        "improvements, and tips.\n\n"
        "Output STRICT JSON matching the ActivityReviewOutput schema.\n"
        "score: 0-100. masteryDecision: not_yet (0-69), meets (70-89), exceeds (90-100).\n"
        "strengths: 2-5 items. improvements: 2-5 items. tips: 2-6 items.\n"
    )
    profile = ctx.deps.profile
    if profile is None:
        return base + "\nNo learner profile available. Use sensible defaults."

    profile_block = _build_profile_context(profile, focus=[
        "experience_levels", "tone_preference", "skill_signals",
        "udl_preferences",
    ])

    return (
        base
        + "\n## Learner Profile\n"
        + profile_block
        + "\n\nMatch feedback tone to the learner's preference. "
        "When referencing areas for improvement, connect to known gaps "
        "if relevant. When noting strengths, reinforce known strengths. "
        "Apply UDL Engagement accommodations to motivational language."
    )
```

---

## API Endpoints

### GET /api/profile

Returns the current learner profile for the authenticated user.

```
GET /api/profile
Authorization: Bearer <token>

Response 200:
{
  "id": "uuid",
  "version": 3,
  "profile_data": { ...LearnerProfileData... },
  "update_source": "activity_signal",
  "updated_at": "2026-02-24T12:00:00Z"
}

Response 404:
{ "detail": "No profile found. Complete the Setup Course first." }
```

### PATCH /api/profile

User edits to profile fields. Creates a new version with change history.

```
PATCH /api/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "interests": ["machine learning", "cooking", "photography"],
  "tone_preference": "socratic"
}

Response 200:
{
  "id": "uuid",
  "version": 4,
  "profile_data": { ...updated LearnerProfileData... },
  "update_source": "user_edit",
  "updated_at": "2026-02-24T12:05:00Z",
  "changes_applied": {
    "interests": {
      "old": ["machine learning", "cooking"],
      "new": ["machine learning", "cooking", "photography"]
    },
    "tone_preference": {
      "old": "encouraging",
      "new": "socratic"
    }
  }
}
```

### GET /api/profile/history

Returns the ordered change log for the user's profile.

```
GET /api/profile/history
Authorization: Bearer <token>

Query params:
  ?limit=20       (default 20, max 100)
  ?offset=0       (pagination)
  ?source=user_edit  (optional filter by update_source)

Response 200:
{
  "total": 5,
  "changes": [
    {
      "version": 4,
      "diff": { "interests": { "old": [...], "new": [...] } },
      "update_source": "user_edit",
      "reason": null,
      "changed_at": "2026-02-24T12:05:00Z"
    },
    {
      "version": 3,
      "diff": { "skill_signals": { "old": [...], "new": [...] } },
      "update_source": "activity_signal",
      "reason": "Updated based on your last activity (score: 45)",
      "changed_at": "2026-02-24T11:30:00Z"
    }
  ]
}
```

### FastAPI Router

```python
# routers/profile.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.learner_profile import (
    ProfileChangeResponse,
    ProfileUpdateRequest,
)
from app.services.profile_service import ProfileService

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("")
async def get_profile(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = ProfileService(db)
    profile = await service.get_profile(user_id)
    if profile is None:
        raise HTTPException(
            status_code=404,
            detail="No profile found. Complete the Setup Course first.",
        )
    return profile


@router.patch("")
async def update_profile(
    update: ProfileUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = ProfileService(db)
    return await service.update_profile(user_id, update, source="user_edit")


@router.get("/history")
async def get_profile_history(
    limit: int = 20,
    offset: int = 0,
    source: str | None = None,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = ProfileService(db)
    return await service.get_change_history(
        user_id, limit=limit, offset=offset, source_filter=source
    )
```

---

## UI Specs

### Profile View/Edit Screen

**Route**: `/profile`

**Layout** (Shadcn/ui components):

```
+--------------------------------------------------+
| Profile                              [Edit] [Save]|
+--------------------------------------------------+
| Display Name: Dylan                               |
|                                                   |
| Learning Goals                                    |
| +---------------------------+                     |
| | - Master prompt engineering|                    |
| | - Build AI-powered tools   |                    |
| | [+ Add goal]               |                    |
| +---------------------------+                     |
|                                                   |
| Interests                                         |
| [machine learning] [cooking] [photography] [+ Add]|
|                                                   |
| Experience                                        |
| Programming: Advanced    AI/ML: Intermediate      |
|                                                   |
| Learning Style: [Examples-heavy ▼]                |
| Tone: [Encouraging ▼]                             |
| Response Modality: [Writing ▼]                    |
|                                                   |
| ┌─ UDL Preferences ──────────────────────────┐   |
| │ Engagement: real-world projects, choice...  │   |
| │ Representation: code + explanation, visual..│   |
| │ Action/Expression: written responses, ...   │   |
| └─────────────────────────────────────────────┘   |
|                                                   |
| Constraints                                       |
| Time: 30 min/day  Device: Desktop                 |
| Reading Level: Professional                       |
|                                                   |
| ┌─ Skills ────────────────────────────────────┐   |
| │ Strengths: Python basics, REST APIs         │   |
| │ Gaps: async programming, type systems       │   |
| └─────────────────────────────────────────────┘   |
|                                                   |
| ┌─ Badges ────────────────────────────────────┐   |
| │ 🏅 Python Fundamentals  🏅 API Design      │   |
| └─────────────────────────────────────────────┘   |
|                                                   |
| ┌─ Course History ────────────────────────────┐   |
| │ ✅ Python Fundamentals (92/100) - Jan 2026  │   |
| │ ✅ API Design Patterns (87/100) - Feb 2026  │   |
| │ 📖 Advanced TypeScript - In Progress        │   |
| └─────────────────────────────────────────────┘   |
|                                                   |
| [View Change History →]                           |
+--------------------------------------------------+
```

**Components**:
- `Card` containers for each section
- `Input` / `Textarea` for editable text fields
- `Badge` components (Shadcn) for interest tags with add/remove
- `Select` dropdowns for enum fields (learning style, tone, modality)
- `Accordion` for UDL preferences (collapsible)
- Read-only sections for skill signals, badges, and course history
- Toast notification on save: "Profile updated"
- Toast notification on system update: "Profile updated based on your last activity"

### Change History Screen

**Route**: `/profile/history`

**Layout**:

```
+--------------------------------------------------+
| Profile Change History                            |
+--------------------------------------------------+
| Filter: [All Sources ▼]                          |
|                                                   |
| v4 — User Edit — Feb 24, 2026 12:05 PM          |
| ┌────────────────────────────────────────────┐   |
| │ interests: added "photography"             │   |
| │ tone_preference: "encouraging" → "socratic"│   |
| └────────────────────────────────────────────┘   |
|                                                   |
| v3 — Activity Signal — Feb 24, 2026 11:30 AM    |
| ┌────────────────────────────────────────────┐   |
| │ "Updated based on your last activity       │   |
| │  (score: 45)"                              │   |
| │ skill_signals: added gap "async programming│   |
| └────────────────────────────────────────────┘   |
|                                                   |
| v2 — Setup Course — Feb 23, 2026 3:00 PM        |
| ┌────────────────────────────────────────────┐   |
| │ Initial profile created from Setup Course  │   |
| └────────────────────────────────────────────┘   |
|                                                   |
| [Load More]                                       |
+--------------------------------------------------+
```

**Components**:
- `Select` filter for update source (all, setup_course, activity_signal, course_completion, user_edit)
- Timeline-style list using `Card` with version badge, source badge, timestamp
- Diff display: key-value pairs showing old/new values
- Reason text displayed when present (system-generated updates)
- Infinite scroll or "Load More" button with pagination

### Setup Course Redirect

When `ensure_onboarding` detects a first-time user:

1. Frontend receives a `303 See Other` or a JSON response with `{ "redirect": "/courses/setup" }`.
2. The Setup Course renders using the standard course UI (same lesson/activity/feedback flow as any course).
3. After the final activity, the UI transitions to the Profile Review screen (`/profile?mode=review`).
4. On review confirmation, the user is redirected to the main course catalog / dashboard.

---

## Acceptance Criteria

### Profile Schema

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-1 | `LearnerProfileData` validates all fields with correct types and constraints | Unit test |
| AC-2 | Profile versioning: each update increments version and creates a `ProfileChange` record | Unit test |
| AC-3 | `updateSource` is correctly tagged for each update path (setup_course, activity_signal, course_completion, user_edit) | Unit test |
| AC-4 | Profile diff captures only changed fields, not the full document | Unit test |

### Setup Course

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-5 | First-time user with no profile is auto-enrolled in Setup Course | Integration test |
| AC-6 | Setup Course has 3 lessons that teach platform mechanics and collect profile signals | Integration test |
| AC-7 | Completing Setup Course generates an initial profile draft with all collected signals | Integration test |
| AC-8 | User can review and edit the profile draft before it is persisted | ADW test |

### Continuous Updates

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-9 | Activity score < 70 creates or updates a "gap" skill signal | Unit test |
| AC-10 | Activity score >= 90 creates or updates a "strength" skill signal | Unit test |
| AC-11 | Course completion appends to `courseHistory` and optionally upgrades `experienceLevel` | Unit test |
| AC-12 | System-generated updates include a human-readable `reason` visible to the user | Integration test |

### Dynamic Prompts

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-13 | All 5 agents use `@agent.instructions` (not `@agent.system_prompt`) | Code review / unit test |
| AC-14 | With a "beginner" profile, each agent's instructions contain simplified language markers | Unit test |
| AC-15 | With an "advanced" profile, each agent's instructions contain depth/complexity markers | Unit test |
| AC-16 | With UDL preferences set, each agent's instructions include the relevant accommodations | Unit test |
| AC-17 | Same course generated with different profiles produces different system prompts (verified via `FunctionModel` message inspection) | Integration test |

### API

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-18 | `GET /api/profile` returns the current profile or 404 for new users | Integration test |
| AC-19 | `PATCH /api/profile` updates fields, increments version, returns updated profile with diff | Integration test |
| AC-20 | `GET /api/profile/history` returns paginated, filterable change log | Integration test |

### UI

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-21 | Profile view/edit screen renders all profile fields correctly | ADW test |
| AC-22 | Editing and saving profile reflects changes immediately | ADW test |
| AC-23 | Change history screen displays version, source, diff, and reason for each change | ADW test |
| AC-24 | Badge inventory displays earned badges with course association | ADW test |

---

## Verification

### Unit Tests

```python
# tests/unit/test_learner_profile_model.py

class TestLearnerProfileData:
    """AC-1: Schema validation."""

    def test_valid_profile(self):
        """All fields with correct types pass validation."""
        profile = LearnerProfileData(
            display_name="Dylan",
            learning_goals=["Master prompt engineering"],
            interests=["AI", "cooking"],
            experience_levels=[DomainExperience(domain="Python", level="advanced")],
            preferred_learning_style="examples_heavy",
            udl_preferences=UDLPreferences(
                engagement=["real-world projects"],
                representation=["code examples with explanation"],
                action_expression=["written responses"],
            ),
            constraints=Constraints(time_per_day_minutes=30, device="desktop"),
            tone_preference="encouraging",
        )
        assert profile.display_name == "Dylan"
        assert len(profile.learning_goals) == 1

    def test_rejects_invalid_experience_level(self):
        """Enum fields reject invalid values."""
        with pytest.raises(ValidationError):
            DomainExperience(domain="Python", level="super_expert")

    def test_rejects_excessive_goals(self):
        """Max length constraints enforced."""
        with pytest.raises(ValidationError):
            LearnerProfileData(
                display_name="Test",
                learning_goals=["goal"] * 25,  # max 20
            )


class TestProfileVersioning:
    """AC-2, AC-3, AC-4: Version and change tracking."""

    async def test_update_increments_version(self, db_session):
        profile = await create_test_profile(db_session, version=1)
        new_data = LearnerProfileData(**{**profile.profile_data, "tone_preference": "direct"})
        await _save_profile_update(profile, new_data, UpdateSource.USER_EDIT, None, db_session)
        assert profile.version == 2

    async def test_change_record_created(self, db_session):
        profile = await create_test_profile(db_session, version=1)
        new_data = LearnerProfileData(**{**profile.profile_data, "tone_preference": "direct"})
        await _save_profile_update(profile, new_data, UpdateSource.USER_EDIT, None, db_session)
        changes = await get_changes(profile.id, db_session)
        assert len(changes) == 1
        assert changes[0].update_source == UpdateSource.USER_EDIT

    async def test_diff_only_changed_fields(self, db_session):
        """AC-4: Diff is minimal, not full document."""
        profile = await create_test_profile(db_session, version=1)
        new_data = LearnerProfileData(**{**profile.profile_data, "tone_preference": "direct"})
        await _save_profile_update(profile, new_data, UpdateSource.USER_EDIT, None, db_session)
        changes = await get_changes(profile.id, db_session)
        assert "tone_preference" in changes[0].diff
        assert "display_name" not in changes[0].diff  # Unchanged field excluded

    async def test_update_source_tagged_correctly(self, db_session):
        """AC-3: Each source type is tracked."""
        profile = await create_test_profile(db_session)
        # Simulate activity signal
        await update_profile_from_activity(profile, mock_review(score=45), "async", db_session)
        assert profile.update_source == UpdateSource.ACTIVITY_SIGNAL


class TestProfileUpdateLogic:
    """AC-9, AC-10, AC-11: Continuous update rules."""

    async def test_low_score_creates_gap(self, db_session):
        """AC-9: score < 70 -> gap signal."""
        profile = await create_test_profile(db_session)
        await update_profile_from_activity(
            profile, mock_review(score=45), "async programming", db_session
        )
        data = LearnerProfileData.model_validate(profile.profile_data)
        gaps = [s for s in data.skill_signals if s.signal_type == "gap"]
        assert any(s.skill == "async programming" for s in gaps)

    async def test_high_score_creates_strength(self, db_session):
        """AC-10: score >= 90 -> strength signal."""
        profile = await create_test_profile(db_session)
        await update_profile_from_activity(
            profile, mock_review(score=95), "REST APIs", db_session
        )
        data = LearnerProfileData.model_validate(profile.profile_data)
        strengths = [s for s in data.skill_signals if s.signal_type == "strength"]
        assert any(s.skill == "REST APIs" for s in strengths)

    async def test_mid_score_no_signal(self, db_session):
        """score 70-89 -> no signal change."""
        profile = await create_test_profile(db_session)
        original_signals = profile.profile_data.get("skill_signals", [])
        await update_profile_from_activity(
            profile, mock_review(score=75), "Python basics", db_session
        )
        data = LearnerProfileData.model_validate(profile.profile_data)
        assert len(data.skill_signals) == len(original_signals)

    async def test_course_completion_updates_history(self, db_session):
        """AC-11: courseHistory appended on completion."""
        profile = await create_test_profile(db_session)
        course = mock_course_instance(name="Python Fundamentals")
        await update_profile_from_course_completion(profile, course, 92.0, db_session)
        data = LearnerProfileData.model_validate(profile.profile_data)
        assert any(
            e.course_name == "Python Fundamentals" for e in data.course_history
        )

    async def test_upsert_deduplicates_signals(self, db_session):
        """Updating the same skill replaces rather than duplicating."""
        profile = await create_test_profile(db_session)
        await update_profile_from_activity(
            profile, mock_review(score=45), "async", db_session
        )
        await update_profile_from_activity(
            profile, mock_review(score=95), "async", db_session
        )
        data = LearnerProfileData.model_validate(profile.profile_data)
        async_signals = [s for s in data.skill_signals if s.skill == "async"]
        assert len(async_signals) == 1
        assert async_signals[0].signal_type == "strength"


class TestDynamicPromptInjection:
    """AC-13 through AC-17: Dynamic system prompt generation."""

    async def test_all_agents_use_instructions_decorator(self):
        """AC-13: Verify decorator type (structural check)."""
        from app.agents.course_describer import course_describer
        from app.agents.lesson_planner import lesson_planner
        from app.agents.lesson_writer import lesson_writer
        from app.agents.activity_creator import activity_creator
        from app.agents.activity_reviewer import activity_reviewer

        for agent in [
            course_describer, lesson_planner, lesson_writer,
            activity_creator, activity_reviewer,
        ]:
            # PydanticAI stores instructions functions in _instructions
            assert len(agent._instructions) > 0, (
                f"{agent.name} has no @agent.instructions registered"
            )

    async def test_beginner_profile_prompt(self):
        """AC-14: Beginner profile produces simplified markers."""
        beginner = make_profile(experience_levels=[
            DomainExperience(domain="Programming", level="novice")
        ])
        deps = PipelineDeps(db=mock_db, user_id="u1", course_instance_id="c1", profile=beginner)
        ctx = make_run_context(deps)

        prompt = await course_describer_instructions(ctx)
        assert "novice" in prompt.lower()

    async def test_advanced_profile_prompt(self):
        """AC-15: Advanced profile produces depth markers."""
        advanced = make_profile(experience_levels=[
            DomainExperience(domain="Programming", level="advanced")
        ])
        deps = PipelineDeps(db=mock_db, user_id="u1", course_instance_id="c1", profile=advanced)
        ctx = make_run_context(deps)

        prompt = await course_describer_instructions(ctx)
        assert "advanced" in prompt.lower()

    async def test_udl_preferences_in_prompt(self):
        """AC-16: UDL preferences appear in instructions."""
        profile = make_profile(udl_preferences=UDLPreferences(
            engagement=["choice in activities"],
            representation=["audio descriptions"],
            action_expression=["verbal responses"],
        ))
        deps = PipelineDeps(db=mock_db, user_id="u1", course_instance_id="c1", profile=profile)
        ctx = make_run_context(deps)

        prompt = await lesson_planner_instructions(ctx)
        assert "choice in activities" in prompt
        assert "audio descriptions" in prompt

    async def test_different_profiles_different_prompts(self):
        """AC-17: FunctionModel verifies different system prompts."""
        beginner = make_profile(
            experience_levels=[DomainExperience(domain="AI", level="novice")],
            interests=["cooking"],
        )
        advanced = make_profile(
            experience_levels=[DomainExperience(domain="AI", level="advanced")],
            interests=["quantum computing"],
        )

        captured_prompts = []

        def capture_model(messages, info):
            system_prompt = next(
                (m.content for m in messages if m.role == "system"), ""
            )
            captured_prompts.append(system_prompt)
            return TestModel().gen_output(info)

        for profile in [beginner, advanced]:
            deps = PipelineDeps(
                db=mock_db, user_id="u1",
                course_instance_id="c1", profile=profile,
            )
            with course_describer.override(model=FunctionModel(capture_model), deps=deps):
                await course_describer.run("Generate course description")

        assert captured_prompts[0] != captured_prompts[1]
        assert "cooking" in captured_prompts[0]
        assert "quantum computing" in captured_prompts[1]
```

### Integration Tests

```python
# tests/integration/test_profile_api.py

class TestProfileAPI:
    """AC-18, AC-19, AC-20: API CRUD operations."""

    async def test_get_profile_new_user_404(self, client: AsyncClient):
        """AC-18: New user without profile gets 404."""
        response = await client.get("/api/profile")
        assert response.status_code == 404

    async def test_get_profile_after_setup(self, client: AsyncClient, setup_complete_user):
        """AC-18: User with completed setup gets profile."""
        response = await client.get("/api/profile")
        assert response.status_code == 200
        data = response.json()
        assert "profile_data" in data
        assert data["version"] >= 1

    async def test_patch_profile_updates_and_versions(self, client: AsyncClient, setup_complete_user):
        """AC-19: PATCH updates fields and increments version."""
        original = (await client.get("/api/profile")).json()
        original_version = original["version"]

        response = await client.patch("/api/profile", json={
            "interests": ["AI", "cooking", "photography"],
            "tone_preference": "socratic",
        })
        assert response.status_code == 200
        data = response.json()
        assert data["version"] == original_version + 1
        assert "photography" in data["profile_data"]["interests"]
        assert data["profile_data"]["tone_preference"] == "socratic"
        assert "changes_applied" in data

    async def test_get_profile_history(self, client: AsyncClient, setup_complete_user):
        """AC-20: History returns ordered changes."""
        # Make two edits
        await client.patch("/api/profile", json={"tone_preference": "direct"})
        await client.patch("/api/profile", json={"tone_preference": "casual"})

        response = await client.get("/api/profile/history")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 2
        # Most recent first
        assert data["changes"][0]["version"] > data["changes"][1]["version"]

    async def test_history_filter_by_source(self, client: AsyncClient, setup_complete_user):
        """AC-20: Filter history by update source."""
        response = await client.get("/api/profile/history?source=user_edit")
        assert response.status_code == 200
        for change in response.json()["changes"]:
            assert change["update_source"] == "user_edit"


class TestSetupCourseIntegration:
    """AC-5, AC-6, AC-7: Setup Course flow."""

    async def test_new_user_auto_enrolled(self, client: AsyncClient, new_user):
        """AC-5: First-time user redirected to setup."""
        response = await client.get("/api/courses")
        data = response.json()
        setup_courses = [c for c in data if c.get("source_course_id") == "setup"]
        assert len(setup_courses) == 1

    async def test_setup_course_has_three_lessons(self, client: AsyncClient, new_user):
        """AC-6: Setup Course has exactly 3 lessons."""
        courses = (await client.get("/api/courses")).json()
        setup_id = next(c["id"] for c in courses if c.get("source_course_id") == "setup")
        course = (await client.get(f"/api/courses/{setup_id}")).json()
        assert len(course["lessons"]) == 3

    async def test_setup_completion_populates_profile(
        self, client: AsyncClient, new_user
    ):
        """AC-7: Completing all setup activities generates initial profile."""
        # Complete all 3 lessons' activities
        await complete_setup_course(client)

        response = await client.get("/api/profile")
        assert response.status_code == 200
        data = response.json()
        assert data["update_source"] == "setup_course"
        assert len(data["profile_data"]["learning_goals"]) > 0


class TestPersonalizationImpact:
    """AC-17: Verify different profiles produce different agent behavior."""

    async def test_beginner_vs_advanced_different_prompts(self, db_session):
        """Generate same course with different profiles, verify different system prompts."""
        captured = {"beginner": None, "advanced": None}

        def make_capture_fn(label):
            def capture(messages, info):
                system = next((m.content for m in messages if m.role == "system"), "")
                captured[label] = system
                return TestModel().gen_output(info)
            return capture

        for label, level in [("beginner", "novice"), ("advanced", "advanced")]:
            profile = make_profile(
                experience_levels=[DomainExperience(domain="Python", level=level)]
            )
            deps = PipelineDeps(
                db=db_session, user_id="test",
                course_instance_id="c1", profile=profile,
            )
            with course_describer.override(
                model=FunctionModel(make_capture_fn(label)), deps=deps
            ):
                await course_describer.run("Describe a Python course")

        assert captured["beginner"] != captured["advanced"]
        assert "novice" in captured["beginner"].lower()
        assert "advanced" in captured["advanced"].lower()
```

### ADW Implementation Pattern

ADW tests are **single-file `uv` scripts** using [PEP 723 inline script metadata](https://peps.python.org/pep-0723/). Each test is a self-contained `.py` file that can be run directly with `uv run`:

```bash
# Run a single ADW test
uv run tests/adw/06_profile_editing.py

# Run all ADW tests
uv run tests/adw/run_all.py
```

**Script structure** — every ADW test follows this pattern:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""ADW Test: Profile Editing — setup course onboarding, profile editing, and personalization verification."""

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

### ADW Test

```markdown
<!-- tests/adw/prompts/06_profile_editing.md -->

You are a QA tester for the 1111 School learning platform.
The app is running at http://localhost:5173 and the backend at http://localhost:8000.
Use agent-browser to automate the browser.

TEST: Setup Course Onboarding, Profile Editing, and Personalization Verification

## Phase 1: Setup Course Onboarding

1. `agent-browser open http://localhost:5173`
2. `agent-browser snapshot -i` — verify you see the Setup Course (first-time user state)
3. Navigate through Lesson 1: "How Learning Works Here"
   - Read the lesson content, verify it explains the lesson/activity/feedback cycle
   - Complete the activity: answer with learning goals (e.g., "I want to learn AI prompt engineering"),
     experience level ("intermediate in programming, novice in AI"),
     and interests ("machine learning, cooking")
   - Submit and wait for feedback
4. Navigate through Lesson 2: "Your Personalized Experience"
   - Read the lesson, verify it explains personalization and UDL
   - Complete the activity: state preferences for examples-heavy learning,
     encouraging tone, writing-based responses
   - Submit and wait for feedback
5. Navigate through Lesson 3: "Transparency & Control"
   - Read the lesson, verify it explains agent log and profile editing
   - Complete the activity: set display name "TestUser",
     time constraint "30 minutes/day", device "desktop"
   - Submit and wait for feedback
6. After the final activity, verify redirect to Profile Review screen
7. `agent-browser snapshot -i` — verify profile fields are populated
8. `agent-browser screenshot --annotate ./test-results/06-profile-review.png`

## Phase 2: Profile Editing

9. On the Profile Review screen, edit the interests field:
   add "photography" to existing interests
10. Save the profile
11. Navigate to the Profile page (`/profile`)
12. Verify the updated interests include "photography"
13. Make two more edits:
    - Change tone_preference to "socratic"
    - Add a new learning goal "Build a personal website"
14. Save after each edit
15. Navigate to Change History (`/profile/history`)
16. `agent-browser snapshot -i`
17. Verify: at least 3 change entries visible with timestamps
18. Verify: entries show correct update sources (setup_course, user_edit)
19. `agent-browser screenshot --annotate ./test-results/06-change-history.png`

## Phase 3: Personalization Verification

20. Navigate to course creation
21. Create a new course: "Introduction to AI Prompt Engineering"
    with objectives:
    - "Understand how LLMs process prompts"
    - "Write effective system prompts"
    - "Evaluate prompt quality"
22. Wait for course generation to complete
23. Read the generated course description
24. SEMANTIC VERIFY: Does the course description reference any of the learner's
    interests (machine learning, cooking, photography) or experience level?
    The personalizationRationale should mention profile signals.
25. Navigate to the first lesson
26. SEMANTIC VERIFY: Are examples drawn from the learner's interest areas?
    Is the complexity appropriate for the stated experience level?
27. `agent-browser screenshot --annotate ./test-results/06-personalized-course.png`

## Report

Output a JSON object:
{
  "test": "06_profile_editing",
  "passed": true/false,
  "checks": [
    {"name": "setup_course_auto_enrolled", "passed": true/false, "notes": "..."},
    {"name": "setup_course_3_lessons", "passed": true/false, "notes": "..."},
    {"name": "profile_generated_after_setup", "passed": true/false, "notes": "..."},
    {"name": "profile_fields_populated", "passed": true/false, "notes": "..."},
    {"name": "profile_edit_saved", "passed": true/false, "notes": "..."},
    {"name": "change_history_3_entries", "passed": true/false, "notes": "..."},
    {"name": "change_history_sources_correct", "passed": true/false, "notes": "..."},
    {"name": "course_description_personalized", "passed": true/false, "notes": "..."},
    {"name": "lesson_content_personalized", "passed": true/false, "notes": "..."}
  ],
  "screenshots": [
    "./test-results/06-profile-review.png",
    "./test-results/06-change-history.png",
    "./test-results/06-personalized-course.png"
  ],
  "notes": "..."
}
```

---

## Definition of Done

All of the following must be true before PRD 6 is considered complete:

- [ ] **LearnerProfile model**: SQLAlchemy model with JSONB `profile_data`, versioning, and `ProfileChange` audit table. Alembic migration applied.
- [ ] **LearnerProfileData schema**: Pydantic model with all fields from master PRD 4.3, including enums, nested models, and validation constraints.
- [ ] **Setup Course**: Predefined course with `course_id = "setup"`, 3 lessons, auto-enrollment for first-time users, profile draft generation on completion.
- [ ] **Profile API**: `GET /api/profile`, `PATCH /api/profile`, `GET /api/profile/history` — all implemented and tested.
- [ ] **Continuous updates**: `update_profile_from_activity` and `update_profile_from_course_completion` integrated into the activity review and course completion flows.
- [ ] **Dynamic prompts**: All 5 agents (`course_describer`, `lesson_planner`, `lesson_writer`, `activity_creator`, `activity_reviewer`) converted from static system prompts to `@agent.instructions` with profile signal injection.
- [ ] **Profile UI**: View/edit screen and change history screen implemented in React with Shadcn/ui components.
- [ ] **Unit tests pass**: Profile model validation, versioning, update logic, dynamic prompt injection per profile type (beginner/advanced/UDL), deduplication of skill signals.
- [ ] **Integration tests pass**: API CRUD, Setup Course to profile populated flow, personalization impact verified via `FunctionModel` message inspection.
- [ ] **ADW test passes**: `06_profile_editing.md` — complete onboarding, edit profile, verify course personalization reflects profile.
- [ ] **No regressions**: All existing PRD 1-5 tests continue to pass (agents work with `profile=None` in deps).
