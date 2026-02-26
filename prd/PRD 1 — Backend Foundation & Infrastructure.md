---
title: "PRD 1 — Backend Foundation & Infrastructure"
phase: Foundation
depends-on: None
agents: None (framework only)
size: Medium (infrastructure-heavy, no business logic)
status: Draft
project: 1111 School
prd-series: 1 of 11
---

# PRD 1 — Backend Foundation & Infrastructure

## 1. Overview

This PRD establishes the complete backend foundation for the 1111 School generative learning platform. It delivers a runnable FastAPI application with all database models, migration infrastructure, reusable PydanticAI agent patterns, and the API skeleton that every subsequent PRD builds upon.

After this PRD is implemented, a developer can run `uv run uvicorn app.main:app` and hit health check endpoints. The database schema supports all 8 core entities. The PydanticAI framework patterns (dependency injection, agent logging, output validation) are implemented as reusable base infrastructure that PRDs 2-11 will consume.

No AI agents are implemented in this PRD — only the framework, patterns, and plumbing they depend on.

**Source PRD**: The master PRD for 1111 School defines the full system. This document extracts and fully specifies the foundation layer.
**Decomposition Plan**: `/Users/dylanisaac/Projects/pickOS/🚀 Projects/1. ✅ Active/1111 School/PRD Decomposition Plan.md`
**Existing Frontend**: `/Users/dylanisaac/Projects/External Projects/school` (React 19 SPA — not modified in this PRD)

---

## 2. Goals

1. **Runnable backend**: `uv run uvicorn app.main:app` starts a FastAPI server that responds to health checks.
2. **Complete database schema**: All 8 entities (User, LearnerProfile, CourseInstance, Lesson, Activity, Assessment, Badge, AgentLog) defined as SQLAlchemy async models with Alembic migrations.
3. **Reusable agent framework**: `PipelineDeps`, agent logging wrapper, and output validation patterns that every future agent will consume.
4. **API skeleton**: Router structure, middleware, CORS, and error handling that subsequent PRDs add endpoints to.
5. **Configuration system**: Environment-driven configuration for model selection, rate limits, database URLs, and feature flags.
6. **Development environment**: Docker Compose for PostgreSQL, `.env` template, dev server commands, and test infrastructure.

---

## 3. Non-Goals

- **No AI agent implementations** — agents are delivered in PRDs 2, 3, 7, and 8.
- **No business logic** — course generation, progression, scoring are future PRDs.
- **No frontend changes** — the React SPA is untouched until PRD 5.
- **No authentication** — user identity is stubbed with a default dev user until PRD 11.
- **No SSE streaming endpoints** — streaming is added in PRD 5.
- **No predefined course loading** — course catalog is PRD 10.

---

## 4. Scope

### 4.1 Python Project Scaffolding

- Initialize a `uv` project with `pyproject.toml`
- FastAPI application with async support
- uvicorn ASGI server configuration
- Development dependencies: pytest, pytest-asyncio, httpx, ruff, mypy

### 4.2 Database Layer

- SQLAlchemy 2.0 async engine and session factory
- Dual-database support: PostgreSQL (production) via `asyncpg`, SQLite (dev/test) via `aiosqlite`
- Alembic migration infrastructure with async support
- Initial migration creating all 8 entity tables
- Database session dependency injection for FastAPI routes

### 4.3 All Core Database Models

Eight entities covering the full application domain (detailed schemas in Section 5):
- **User** — identity and auth metadata
- **LearnerProfile** — versioned learner profile JSON with update tracking
- **CourseInstance** — generated or predefined course with status tracking
- **Lesson** — individual lesson content linked to a course
- **Activity** — activity spec, submissions, and review results linked to a lesson
- **Assessment** — summative assessment linked to a course
- **Badge** — achievement awards linked to user and course
- **AgentLog** — comprehensive agent run logging for transparency

### 4.4 PydanticAI Agent Framework Patterns

Reusable infrastructure for all future agents:
- `PipelineDeps` dataclass for shared dependency injection
- Agent logging wrapper capturing prompt, output, timing, tokens, model metadata, status
- Output validation pattern with `@output_validator` and `ModelRetry`
- `UsageLimits` configuration for retry caps
- Test infrastructure with `TestModel`/`FunctionModel` patterns

### 4.5 API Structure

- Router-based organization with versioned prefix (`/api/`)
- Global exception handlers for structured error responses
- CORS middleware configured for frontend origin
- Request/response logging middleware
- Health check and status endpoints

### 4.6 Configuration System

- Environment variable-based configuration via Pydantic Settings
- Model selection (default model, fallback model)
- Rate limit configuration
- Database URL configuration (auto-detect SQLite vs PostgreSQL)
- Feature flags for optional capabilities

### 4.7 Development Environment

- Docker Compose with PostgreSQL service
- `.env.example` template with all configuration options
- Dev server convenience commands
- Test runner configuration

---

## 5. Technical Design

### 5.1 Database Models — SQLAlchemy 2.0 Async

All models use `mapped_column` with type annotations (SQLAlchemy 2.0 style). UUIDs are used for primary keys. Timestamps use `datetime` with UTC timezone.

```python
# backend/src/app/db/models.py

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
)


class Base(DeclarativeBase):
    """Base class for all models. Uses JSONB on PostgreSQL, JSON on SQLite."""
    type_annotation_map = {
        dict: JSONB,  # Falls back to JSON on SQLite via dialect inspection
    }


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> str:
    return str(uuid.uuid4())


# ──────────────────────────────────────────────
# User
# ──────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    auth_provider: Mapped[str] = mapped_column(String(50), default="local")
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    learner_profile: Mapped[Optional["LearnerProfile"]] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    course_instances: Mapped[list["CourseInstance"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    badges: Mapped[list["Badge"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    agent_logs: Mapped[list["AgentLog"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


# ──────────────────────────────────────────────
# LearnerProfile
# ──────────────────────────────────────────────
class LearnerProfile(Base):
    __tablename__ = "learner_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    profile_json: Mapped[dict] = mapped_column(nullable=False, default=dict)
    version: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    update_source: Mapped[str] = mapped_column(
        String(50), default="system"
    )  # Values: setup_course, activity_signal, user_edit, system

    # Relationships
    user: Mapped["User"] = relationship(back_populates="learner_profile")


# ──────────────────────────────────────────────
# CourseInstance
# ──────────────────────────────────────────────
class CourseInstance(Base):
    __tablename__ = "course_instances"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    source_type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # Values: predefined, user_created
    source_course_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    input_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    input_objectives: Mapped[dict] = mapped_column(
        nullable=False, default=dict
    )  # Stored as JSON array: {"objectives": ["obj1", "obj2"]}
    generated_course_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), default="draft"
    )  # Values: draft, generating, active, in_progress,
       # awaiting_assessment, assessment_ready, completed, archived
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="course_instances")
    lessons: Mapped[list["Lesson"]] = relationship(
        back_populates="course_instance", cascade="all, delete-orphan",
        order_by="Lesson.objective_index"
    )
    assessments: Mapped[list["Assessment"]] = relationship(
        back_populates="course_instance", cascade="all, delete-orphan"
    )
    badges: Mapped[list["Badge"]] = relationship(
        back_populates="course_instance", cascade="all, delete-orphan"
    )
    agent_logs: Mapped[list["AgentLog"]] = relationship(
        back_populates="course_instance", cascade="all, delete-orphan"
    )


# ──────────────────────────────────────────────
# Lesson
# ──────────────────────────────────────────────
class Lesson(Base):
    __tablename__ = "lessons"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    course_instance_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("course_instances.id", ondelete="CASCADE"), nullable=False
    )
    objective_index: Mapped[int] = mapped_column(Integer, nullable=False)
    lesson_plan_json: Mapped[Optional[dict]] = mapped_column(nullable=True)
    lesson_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Markdown
    visual_aids: Mapped[dict] = mapped_column(
        nullable=False, default=dict
    )  # Stored as JSON array: {"aids": [...]}
    status: Mapped[str] = mapped_column(
        String(20), default="locked"
    )  # Values: locked, unlocked, completed

    # Relationships
    course_instance: Mapped["CourseInstance"] = relationship(back_populates="lessons")
    activities: Mapped[list["Activity"]] = relationship(
        back_populates="lesson", cascade="all, delete-orphan"
    )
    agent_logs: Mapped[list["AgentLog"]] = relationship(
        back_populates="lesson", cascade="all, delete-orphan"
    )


# ──────────────────────────────────────────────
# Activity
# ──────────────────────────────────────────────
class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    lesson_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False
    )
    activity_spec_json: Mapped[Optional[dict]] = mapped_column(nullable=True)
    submissions: Mapped[dict] = mapped_column(
        nullable=False, default=dict
    )  # JSON array of submission objects: {"submissions": [{text, image_url, submitted_at}]}
    reviewer_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reviewer_feedback: Mapped[Optional[dict]] = mapped_column(nullable=True)  # Full review JSON
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # Values: pending, submitted, reviewed

    # Relationships
    lesson: Mapped["Lesson"] = relationship(back_populates="activities")
    agent_logs: Mapped[list["AgentLog"]] = relationship(
        back_populates="activity", cascade="all, delete-orphan"
    )


# ──────────────────────────────────────────────
# Assessment
# ──────────────────────────────────────────────
class Assessment(Base):
    __tablename__ = "assessments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    course_instance_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("course_instances.id", ondelete="CASCADE"), nullable=False
    )
    assessment_spec_json: Mapped[Optional[dict]] = mapped_column(nullable=True)
    submissions: Mapped[dict] = mapped_column(
        nullable=False, default=dict
    )  # JSON array of submission objects
    reviewer_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reviewer_feedback: Mapped[Optional[dict]] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # Values: pending, submitted, reviewed, passed, failed

    # Relationships
    course_instance: Mapped["CourseInstance"] = relationship(back_populates="assessments")
    agent_logs: Mapped[list["AgentLog"]] = relationship(
        back_populates="assessment", cascade="all, delete-orphan"
    )


# ──────────────────────────────────────────────
# Badge
# ──────────────────────────────────────────────
class Badge(Base):
    __tablename__ = "badges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    course_instance_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("course_instances.id", ondelete="CASCADE"), nullable=False
    )
    badge_type: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g., "course_completion"
    awarded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="badges")
    course_instance: Mapped["CourseInstance"] = relationship(back_populates="badges")


# ──────────────────────────────────────────────
# AgentLog
# ──────────────────────────────────────────────
class AgentLog(Base):
    __tablename__ = "agent_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    course_instance_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("course_instances.id", ondelete="CASCADE"), nullable=False
    )
    lesson_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True
    )
    activity_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("activities.id", ondelete="SET NULL"), nullable=True
    )
    assessment_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("assessments.id", ondelete="SET NULL"), nullable=True
    )
    agent_name: Mapped[str] = mapped_column(String(100), nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    output: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), default="running"
    )  # Values: running, success, error, retry
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    input_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_requests: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    model_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    redaction_flags: Mapped[dict] = mapped_column(
        nullable=False, default=dict
    )  # e.g., {"pii_masked": false, "tokens_stripped": true}
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="agent_logs")
    course_instance: Mapped["CourseInstance"] = relationship(back_populates="agent_logs")
    lesson: Mapped[Optional["Lesson"]] = relationship(back_populates="agent_logs")
    activity: Mapped[Optional["Activity"]] = relationship(back_populates="agent_logs")
    assessment: Mapped[Optional["Assessment"]] = relationship(back_populates="agent_logs")
```

### 5.2 Database Session Management

```python
# backend/src/app/db/session.py

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings


def _build_engine() -> AsyncEngine:
    """Create the async engine based on configured DATABASE_URL.

    Uses asyncpg for PostgreSQL, aiosqlite for SQLite.
    """
    connect_args = {}
    if settings.database_url.startswith("sqlite"):
        # SQLite needs check_same_thread=False for async
        connect_args = {"check_same_thread": False}

    return create_async_engine(
        settings.database_url,
        echo=settings.db_echo,
        connect_args=connect_args,
    )


engine = _build_engine()

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that provides a database session.

    Usage in routes:
        async def my_route(db: AsyncSession = Depends(get_db_session)):
            ...
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
```

### 5.3 PydanticAI Agent Framework Patterns

#### 5.3.1 PipelineDeps — Shared Dependency Injection

Every agent in the system receives the same `PipelineDeps` instance. This is the single point of dependency injection for all agent runs.

```python
# backend/src/app/agents/base.py

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Optional

from pydantic_ai import Agent, ModelRetry, RunContext, capture_run_messages
from pydantic_ai.usage import UsageLimits

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.db.models import AgentLog


@dataclass
class PipelineDeps:
    """Shared dependencies injected into every PydanticAI agent run.

    Constructed once per pipeline execution (e.g., one course generation)
    and passed to all agent.run() calls in that pipeline.

    Usage:
        deps = PipelineDeps(
            db_session=session,
            user_id="abc-123",
            course_instance_id="def-456",
        )
        result = await my_agent.run("prompt", deps=deps)
    """
    db_session: AsyncSession
    user_id: str
    course_instance_id: str
    learner_profile: Optional[dict] = None  # Populated from LearnerProfile.profile_json
    lesson_id: Optional[str] = None
    activity_id: Optional[str] = None
    assessment_id: Optional[str] = None
```

#### 5.3.2 Agent Logging Wrapper

A wrapper function that runs any PydanticAI agent and captures comprehensive log data to the `AgentLog` table. All future agents use this instead of calling `agent.run()` directly.

```python
# backend/src/app/agents/base.py (continued)

async def run_agent_with_logging(
    agent: Agent,
    prompt: str,
    deps: PipelineDeps,
    agent_name: str,
    *,
    usage_limits: UsageLimits | None = None,
    message_history: list | None = None,
) -> Any:
    """Run a PydanticAI agent with full logging to the AgentLog table.

    Captures:
    - prompt sent to the agent
    - output returned (serialized to JSON string)
    - timing (start, end, duration in ms)
    - token usage (input_tokens, output_tokens, total_requests)
    - model metadata (model_name)
    - status (success, error)

    Uses capture_run_messages to capture messages even if the run raises.

    Args:
        agent: The PydanticAI Agent instance to run.
        prompt: The prompt string to send.
        deps: PipelineDeps with db session and context IDs.
        agent_name: Human-readable name for the log (e.g., "course_describer").
        usage_limits: Optional UsageLimits to cap retries.
        message_history: Optional message history for multi-turn agents.

    Returns:
        The agent run result object.

    Raises:
        Re-raises any exception from the agent run after logging the error.
    """
    import json

    from app.db.models import AgentLog

    start_time = time.monotonic()
    log_entry = AgentLog(
        user_id=deps.user_id,
        course_instance_id=deps.course_instance_id,
        lesson_id=deps.lesson_id,
        activity_id=deps.activity_id,
        assessment_id=deps.assessment_id,
        agent_name=agent_name,
        prompt=prompt,
        status="running",
    )
    deps.db_session.add(log_entry)
    await deps.db_session.flush()  # Get the ID without committing

    try:
        with capture_run_messages() as messages:
            result = await agent.run(
                prompt,
                deps=deps,
                usage_limits=usage_limits,
                message_history=message_history,
            )

        elapsed_ms = int((time.monotonic() - start_time) * 1000)

        # Extract usage data
        usage = result.usage()

        # Serialize output
        output_data = result.output
        if hasattr(output_data, "model_dump"):
            output_str = json.dumps(output_data.model_dump(), default=str)
        else:
            output_str = json.dumps(output_data, default=str)

        # Update log entry
        log_entry.output = output_str
        log_entry.status = "success"
        log_entry.duration_ms = elapsed_ms
        log_entry.input_tokens = usage.input_tokens
        log_entry.output_tokens = usage.output_tokens
        log_entry.total_requests = usage.requests
        log_entry.model_name = result.response.model_name if result.response else None
        await deps.db_session.flush()

        return result

    except Exception as exc:
        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        log_entry.output = str(exc)
        log_entry.status = "error"
        log_entry.duration_ms = elapsed_ms
        await deps.db_session.flush()
        raise
```

#### 5.3.3 Output Validation Pattern

A documented pattern and example demonstrating how all agents should implement business-rule validation using `@output_validator` and `ModelRetry`. This is a reference implementation — actual validators are added per-agent in PRDs 2+.

```python
# backend/src/app/agents/base.py (continued)

# ──────────────────────────────────────────────
# Output Validator Pattern — Reference Implementation
# ──────────────────────────────────────────────
#
# Every agent that produces structured output should follow this pattern:
#
# 1. Define the output schema as a Pydantic BaseModel
# 2. Set it as the agent's output_type
# 3. Add @output_validator for business rules beyond schema validation
# 4. Raise ModelRetry("clear error message") on violations
#
# Example:
#
#   from pydantic import BaseModel
#
#   class LessonPlanOutput(BaseModel):
#       essential_questions: list[str]
#       activities: list[ActivitySpec]
#
#   lesson_planner = Agent(
#       "openai:gpt-4o",
#       deps_type=PipelineDeps,
#       output_type=LessonPlanOutput,
#       output_retries=2,
#   )
#
#   @lesson_planner.output_validator
#   async def validate_lesson_plan(
#       ctx: RunContext[PipelineDeps], output: LessonPlanOutput
#   ) -> LessonPlanOutput:
#       if not (2 <= len(output.essential_questions) <= 4):
#           raise ModelRetry(
#               f"Essential questions must be between 2 and 4, got {len(output.essential_questions)}. "
#               "Adjust the number of essential questions."
#           )
#       if not (3 <= len(output.activities) <= 6):
#           raise ModelRetry(
#               f"Activities must be between 3 and 6, got {len(output.activities)}. "
#               "Adjust the activity list."
#           )
#       return output


# ──────────────────────────────────────────────
# Demo Agent — Used for framework verification tests
# ──────────────────────────────────────────────

from pydantic import BaseModel, Field


class HealthCheckOutput(BaseModel):
    """Trivial output model used to verify the agent framework is wired correctly."""
    message: str = Field(description="A greeting or status message")
    items_count: int = Field(description="Number of items processed", ge=0, le=100)


# This agent exists solely for testing the framework patterns.
# It is NOT used in production flows.
demo_agent = Agent(
    "openai:gpt-4o",  # Overridden with TestModel in tests
    deps_type=PipelineDeps,
    output_type=HealthCheckOutput,
    output_retries=2,
    system_prompt="You are a test agent. Return a greeting message and a count of items.",
)


@demo_agent.output_validator
async def validate_demo_output(
    ctx: RunContext[PipelineDeps], output: HealthCheckOutput
) -> HealthCheckOutput:
    """Example output validator — demonstrates the pattern for all agents."""
    if output.items_count > 50:
        raise ModelRetry(
            f"items_count must be 50 or less for demo purposes, got {output.items_count}. "
            "Return a smaller number."
        )
    return output


# ──────────────────────────────────────────────
# Default UsageLimits
# ──────────────────────────────────────────────

DEFAULT_USAGE_LIMITS = UsageLimits(
    request_limit=5,       # Max LLM requests per agent run (includes retries)
    input_token_limit=50_000,
    output_token_limit=10_000,
)
```

#### 5.3.4 Test Infrastructure Patterns

```python
# backend/tests/conftest.py

"""
Shared test fixtures and safety configuration.

CRITICAL: models.ALLOW_MODEL_REQUESTS = False prevents any test from
accidentally hitting a real LLM API. All agent tests must use
TestModel or FunctionModel via agent.override().
"""

import pytest
import pytest_asyncio
from pydantic_ai import models
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.db.models import Base

# Block real API calls in ALL tests
models.ALLOW_MODEL_REQUESTS = False

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def db_engine():
    """Create a fresh in-memory SQLite engine for each test."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine):
    """Provide an async session for each test, rolled back after."""
    session_factory = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def pipeline_deps(db_session):
    """Provide a PipelineDeps instance with test defaults."""
    from app.agents.base import PipelineDeps

    return PipelineDeps(
        db_session=db_session,
        user_id="test-user-001",
        course_instance_id="test-course-001",
    )
```

### 5.4 Configuration System

```python
# backend/src/app/config.py

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application configuration loaded from environment variables.

    All settings have sensible defaults for local development.
    Production overrides via environment variables or .env file.
    """

    # ── Application ──────────────────────────────
    app_name: str = "1111 School API"
    app_version: str = "0.1.0"
    debug: bool = True
    environment: str = "development"  # development, staging, production

    # ── Server ───────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 8000
    workers: int = 1

    # ── Database ─────────────────────────────────
    database_url: str = "sqlite+aiosqlite:///./dev.db"
    db_echo: bool = False  # Log SQL statements

    # ── CORS ─────────────────────────────────────
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # ── AI Models ────────────────────────────────
    default_model: str = "openai:gpt-4o"
    fallback_model: str = "openai:gpt-4o-mini"
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    google_api_key: str = ""

    # ── Agent Limits ─────────────────────────────
    agent_request_limit: int = Field(default=5, description="Max LLM requests per agent run")
    agent_input_token_limit: int = Field(default=50_000, description="Max input tokens per agent run")
    agent_output_token_limit: int = Field(default=10_000, description="Max output tokens per agent run")

    # ── Feature Flags ────────────────────────────
    enable_logfire: bool = False
    enable_agent_logging: bool = True

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "case_sensitive": False}


settings = Settings()
```

### 5.5 FastAPI Application

```python
# backend/src/app/main.py

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.routers import health


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events."""
    # Startup
    if settings.enable_logfire:
        try:
            import logfire
            logfire.configure()
            logfire.instrument_fastapi(app)
        except ImportError:
            pass  # Logfire optional
    yield
    # Shutdown (close DB connections, etc.)
    from app.db.session import engine
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

# ── Middleware ────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────
app.include_router(health.router, prefix="/api", tags=["health"])

# Future PRDs will add routers here:
# app.include_router(courses.router, prefix="/api", tags=["courses"])    # PRD 2
# app.include_router(activities.router, prefix="/api", tags=["activities"])  # PRD 3
# app.include_router(progression.router, prefix="/api", tags=["progression"])  # PRD 4
# app.include_router(profile.router, prefix="/api", tags=["profile"])    # PRD 6
# app.include_router(assessments.router, prefix="/api", tags=["assessments"])  # PRD 8
# app.include_router(logs.router, prefix="/api", tags=["logs"])          # PRD 9
# app.include_router(catalog.router, prefix="/api", tags=["catalog"])    # PRD 10
# app.include_router(auth.router, prefix="/api", tags=["auth"])          # PRD 11


# ── Global Exception Handlers ────────────────────
from fastapi import Request
from fastapi.responses import JSONResponse


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(
        status_code=422,
        content={"detail": str(exc), "type": "validation_error"},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    # In production, log the full traceback but return a sanitized message
    if settings.debug:
        detail = str(exc)
    else:
        detail = "Internal server error"
    return JSONResponse(
        status_code=500,
        content={"detail": detail, "type": "internal_error"},
    )
```

### 5.6 Health Check Router

```python
# backend/src/app/api/routers/health.py

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_db_session

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    version: str
    environment: str
    timestamp: str
    database: str  # "connected" or "error: <message>"


class StatusResponse(BaseModel):
    app_name: str
    version: str
    environment: str
    debug: bool
    database_url_masked: str
    default_model: str
    enable_logfire: bool
    enable_agent_logging: bool


@router.get("/health", response_model=HealthResponse)
async def health_check(db: AsyncSession = Depends(get_db_session)):
    """Health check endpoint. Verifies the API is running and the database is reachable."""
    db_status = "connected"
    try:
        await db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"error: {e}"

    return HealthResponse(
        status="healthy" if db_status == "connected" else "degraded",
        version=settings.app_version,
        environment=settings.environment,
        timestamp=datetime.now(timezone.utc).isoformat(),
        database=db_status,
    )


@router.get("/status", response_model=StatusResponse)
async def status():
    """Detailed status endpoint. Returns configuration info (non-sensitive)."""
    # Mask the database URL to avoid leaking credentials
    db_url = settings.database_url
    if "@" in db_url:
        # postgresql://user:pass@host/db -> postgresql://***@host/db
        pre, post = db_url.split("@", 1)
        scheme = pre.split("://")[0] if "://" in pre else ""
        db_url = f"{scheme}://***@{post}"

    return StatusResponse(
        app_name=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
        debug=settings.debug,
        database_url_masked=db_url,
        default_model=settings.default_model,
        enable_logfire=settings.enable_logfire,
        enable_agent_logging=settings.enable_agent_logging,
    )
```

### 5.7 Alembic Configuration

```ini
# backend/alembic.ini

[alembic]
script_location = src/app/db/migrations
prepend_sys_path = src
sqlalchemy.url = sqlite+aiosqlite:///./dev.db

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

```python
# backend/src/app/db/migrations/env.py

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.config import settings
from app.db.models import Base

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (generates SQL script)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations in 'online' mode with async engine."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

### 5.8 Docker Compose — Development Database

```yaml
# backend/docker-compose.yml

services:
  db:
    image: postgres:16-alpine
    container_name: 1111-school-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: school_dev
      POSTGRES_USER: school
      POSTGRES_PASSWORD: school_dev_password
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U school -d school_dev"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  pgdata:
```

---

## 6. Database Schema

### 6.1 Entity-Relationship Summary

```
User (1) ──── (0..1) LearnerProfile
  |
  |──── (*) CourseInstance
  |           |
  |           |──── (*) Lesson
  |           |         |
  |           |         |──── (*) Activity
  |           |         |──── (*) AgentLog (lesson-scoped)
  |           |
  |           |──── (*) Assessment
  |           |         |──── (*) AgentLog (assessment-scoped)
  |           |
  |           |──── (*) Badge
  |           |──── (*) AgentLog (course-scoped)
  |
  |──── (*) Badge
  |──── (*) AgentLog
```

### 6.2 Status Enumerations

These are stored as strings in the database (not DB-level enums) for migration flexibility. Validation happens at the application layer.

| Entity | Field | Valid Values |
|--------|-------|-------------|
| CourseInstance | status | `draft`, `generating`, `active`, `in_progress`, `awaiting_assessment`, `assessment_ready`, `completed`, `archived` |
| Lesson | status | `locked`, `unlocked`, `completed` |
| Activity | status | `pending`, `submitted`, `reviewed` |
| Assessment | status | `pending`, `submitted`, `reviewed`, `passed`, `failed` |
| AgentLog | status | `running`, `success`, `error`, `retry` |
| LearnerProfile | update_source | `setup_course`, `activity_signal`, `user_edit`, `system` |
| CourseInstance | source_type | `predefined`, `user_created` |

### 6.3 JSON Column Schemas

These JSON columns store structured data. The schemas are documented here for consistency across the codebase. Pydantic models for serialization/deserialization will be created alongside each column's usage.

**CourseInstance.input_objectives**:
```json
{
  "objectives": ["Understand variables and types", "Write basic functions", "Use control flow"]
}
```

**Lesson.lesson_plan_json** (populated by lesson_planner agent, PRD 2):
```json
{
  "learning_objective": "...",
  "competency": "...",
  "enduring_understanding": "...",
  "essential_questions": ["...", "..."],
  "assessment_project": "...",
  "mastery_criteria": "...",
  "udl_accommodations": { "engagement": "...", "representation": "...", "action_expression": "..." },
  "activities": [{ "type": "...", "description": "...", "alignment": ["..."] }]
}
```

**Lesson.visual_aids** (populated by visual_aid agents, PRD 7):
```json
{
  "aids": [
    { "id": "va-001", "type": "mermaid", "title": "...", "asset": "...", "alt_text": "..." }
  ]
}
```

**Activity.submissions**:
```json
{
  "submissions": [
    { "text": "...", "image_url": null, "submitted_at": "2025-01-15T10:30:00Z" }
  ]
}
```

**Activity.reviewer_feedback** (populated by activity_reviewer agent, PRD 3):
```json
{
  "score": 85,
  "max_score": 100,
  "rationale": "...",
  "strengths": ["...", "..."],
  "improvements": ["...", "..."],
  "tips": ["...", "..."],
  "mastery_decision": "meets"
}
```

**AgentLog.redaction_flags**:
```json
{
  "pii_masked": false,
  "tokens_stripped": false,
  "reviewed_by": null
}
```

---

## 7. API Endpoints

### 7.1 Endpoints Delivered in This PRD

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/api/health` | Health check with DB connectivity test | `HealthResponse` (200) |
| `GET` | `/api/status` | Detailed configuration status (non-sensitive) | `StatusResponse` (200) |

### 7.2 Error Response Format

All error responses follow a consistent structure:

```json
{
  "detail": "Human-readable error message",
  "type": "validation_error | not_found | conflict | internal_error"
}
```

HTTP status codes used:
- `400` — Bad request (malformed input)
- `404` — Resource not found
- `409` — Conflict (invalid state transition)
- `422` — Validation error (Pydantic or business rule)
- `500` — Internal server error

### 7.3 Planned Router Stubs

These routers are created as empty files with placeholder comments. They are not wired into the application yet — each subsequent PRD activates them.

```python
# backend/src/app/api/routers/courses.py — PRD 2
# backend/src/app/api/routers/activities.py — PRD 3
# backend/src/app/api/routers/progression.py — PRD 4
# backend/src/app/api/routers/profile.py — PRD 6
# backend/src/app/api/routers/assessments.py — PRD 8
# backend/src/app/api/routers/logs.py — PRD 9
# backend/src/app/api/routers/catalog.py — PRD 10
# backend/src/app/api/routers/auth.py — PRD 11
```

Each stub contains:
```python
"""Router for <feature> — implemented in PRD <N>."""
from fastapi import APIRouter

router = APIRouter()
```

---

## 8. Configuration

### 8.1 Environment Variables

```bash
# backend/.env.example

# ── Application ────────────────────────────────
APP_NAME="1111 School API"
APP_VERSION="0.1.0"
DEBUG=true
ENVIRONMENT=development

# ── Server ─────────────────────────────────────
HOST=0.0.0.0
PORT=8000
WORKERS=1

# ── Database ───────────────────────────────────
# SQLite for local development (no Docker needed):
DATABASE_URL=sqlite+aiosqlite:///./dev.db
# PostgreSQL for Docker-based development:
# DATABASE_URL=postgresql+asyncpg://school:school_dev_password@localhost:5432/school_dev
DB_ECHO=false

# ── CORS ───────────────────────────────────────
CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]

# ── AI Models ──────────────────────────────────
DEFAULT_MODEL=openai:gpt-4o
FALLBACK_MODEL=openai:gpt-4o-mini
OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# GOOGLE_API_KEY=...

# ── Agent Limits ───────────────────────────────
AGENT_REQUEST_LIMIT=5
AGENT_INPUT_TOKEN_LIMIT=50000
AGENT_OUTPUT_TOKEN_LIMIT=10000

# ── Feature Flags ──────────────────────────────
ENABLE_LOGFIRE=false
ENABLE_AGENT_LOGGING=true
```

### 8.2 Development Commands

```bash
# Install dependencies
cd backend && uv sync

# Run development server (auto-reload)
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run with PostgreSQL (start Docker first)
docker compose up -d
DATABASE_URL=postgresql+asyncpg://school:school_dev_password@localhost:5432/school_dev \
  uv run uvicorn app.main:app --reload

# Database migrations
uv run alembic revision --autogenerate -m "description"
uv run alembic upgrade head
uv run alembic downgrade -1

# Run tests
uv run pytest
uv run pytest tests/unit/ -v
uv run pytest tests/integration/ -v

# Type checking and linting
uv run mypy src/
uv run ruff check src/ tests/
uv run ruff format src/ tests/
```

---

## 9. File / Folder Structure

```
backend/
├── pyproject.toml                     # uv project config, dependencies, tool settings
├── alembic.ini                        # Alembic migration configuration
├── docker-compose.yml                 # PostgreSQL for local development
├── .env.example                       # Environment variable template
├── .env                               # Local overrides (gitignored)
├── src/
│   └── app/
│       ├── __init__.py
│       ├── main.py                    # FastAPI application factory + middleware + routers
│       ├── config.py                  # Pydantic Settings configuration
│       ├── db/
│       │   ├── __init__.py
│       │   ├── models.py             # All 8 SQLAlchemy models
│       │   ├── session.py            # Async engine + session factory + get_db_session
│       │   └── migrations/
│       │       ├── env.py            # Alembic async migration environment
│       │       ├── script.py.mako    # Alembic migration template
│       │       └── versions/
│       │           └── 001_initial_schema.py  # Initial migration (all 8 tables)
│       ├── api/
│       │   ├── __init__.py
│       │   └── routers/
│       │       ├── __init__.py
│       │       ├── health.py         # /api/health and /api/status endpoints
│       │       ├── courses.py        # Stub — PRD 2
│       │       ├── activities.py     # Stub — PRD 3
│       │       ├── progression.py    # Stub — PRD 4
│       │       ├── profile.py        # Stub — PRD 6
│       │       ├── assessments.py    # Stub — PRD 8
│       │       ├── logs.py           # Stub — PRD 9
│       │       ├── catalog.py        # Stub — PRD 10
│       │       └── auth.py           # Stub — PRD 11
│       ├── agents/
│       │   ├── __init__.py
│       │   └── base.py              # PipelineDeps, run_agent_with_logging, demo_agent,
│       │                             # output validator pattern, DEFAULT_USAGE_LIMITS
│       └── schemas/
│           ├── __init__.py
│           └── health.py            # HealthResponse, StatusResponse (if extracted)
├── tests/
│   ├── __init__.py
│   ├── conftest.py                   # Shared fixtures, models.ALLOW_MODEL_REQUESTS = False
│   ├── unit/
│   │   ├── __init__.py
│   │   ├── test_models.py           # DB model instantiation and field validation
│   │   ├── test_config.py           # Configuration loading from env vars
│   │   ├── test_pipeline_deps.py    # PipelineDeps construction
│   │   ├── test_agent_logging.py    # Agent logging wrapper with TestModel
│   │   └── test_output_validator.py # Output validator pattern with ModelRetry
│   ├── integration/
│   │   ├── __init__.py
│   │   ├── test_health_api.py       # FastAPI TestClient health endpoint tests
│   │   ├── test_db_crud.py          # DB session lifecycle CRUD tests
│   │   └── test_migrations.py       # Alembic migration up/down on fresh DB
│   ├── e2e/
│   │   ├── __init__.py
│   │   └── test_server_startup.py   # Full server startup + health check
│   ├── evals/
│   │   └── __init__.py              # Placeholder for pydantic_evals (PRD 2+)
│   └── adw/
│       ├── prompts/
│       │   └── 01_health_check.md   # ADW: verify app loads, backend reachable
│       ├── results/                  # Test output (gitignored)
│       ├── baselines/                # Snapshot baselines for structural diffs
│       └── orchestrator.py           # Python runner for ADW tests
```

---

## 10. Acceptance Criteria

### 10.1 Project Setup
- [ ] `pyproject.toml` exists with all required dependencies
- [ ] `uv sync` installs all dependencies without errors
- [ ] `uv run uvicorn app.main:app` starts the server on port 8000
- [ ] Server responds to `GET /api/health` with 200 and valid JSON

### 10.2 Database
- [ ] All 8 entity tables can be created via `uv run alembic upgrade head`
- [ ] Tables can be rolled back via `uv run alembic downgrade -1`
- [ ] SQLite mode: server starts and serves health check with `DATABASE_URL=sqlite+aiosqlite:///./dev.db`
- [ ] PostgreSQL mode: server starts and serves health check with Docker Compose PostgreSQL
- [ ] All foreign key relationships are correctly defined (cascade deletes work)
- [ ] JSON columns accept arbitrary JSON on both SQLite and PostgreSQL

### 10.3 PydanticAI Framework
- [ ] `PipelineDeps` dataclass can be constructed with a real async session
- [ ] `run_agent_with_logging` executes a `TestModel`-backed agent and writes an `AgentLog` row
- [ ] The `AgentLog` row contains: agent_name, prompt, output, status, duration_ms, input_tokens, output_tokens, model_name
- [ ] `run_agent_with_logging` captures errors: if the agent raises, the `AgentLog` row has `status="error"` and the exception message in `output`
- [ ] `demo_agent` with its `@output_validator` raises `ModelRetry` when `items_count > 50`
- [ ] `models.ALLOW_MODEL_REQUESTS = False` is set in `tests/conftest.py`

### 10.4 API
- [ ] `GET /api/health` returns `{"status": "healthy", "version": "...", "environment": "...", "timestamp": "...", "database": "connected"}`
- [ ] `GET /api/status` returns non-sensitive configuration info with masked database URL
- [ ] CORS headers are present on cross-origin requests from `http://localhost:5173`
- [ ] Unhandled exceptions return structured JSON error, not raw stack traces (in non-debug mode)

### 10.5 Configuration
- [ ] `.env.example` documents all environment variables
- [ ] Settings load from environment variables (override defaults)
- [ ] Missing optional settings use defaults without crashing
- [ ] `DATABASE_URL` determines the database backend (SQLite vs PostgreSQL)

### 10.6 Development Environment
- [ ] `docker-compose.yml` starts PostgreSQL with health check
- [ ] `docker compose up -d` followed by migration followed by server start works end-to-end
- [ ] `uv run pytest` runs and passes all tests
- [ ] `uv run ruff check src/ tests/` passes with no errors
- [ ] `uv run mypy src/` passes with no errors

---

## 11. Verification

### 11.1 Unit Tests

**test_models.py** — DB model instantiation and field validation:
```python
# All 8 models can be instantiated with valid data
# Required fields raise on None
# Default values are applied (status, created_at, etc.)
# UUID generation works (id fields are populated)
# Relationship attributes exist (no AttributeError)
```

Test cases:
- `test_user_creation` — Create User with email, verify id generated, created_at set
- `test_user_requires_email` — User without email raises IntegrityError on flush
- `test_learner_profile_defaults` — LearnerProfile defaults: version=1, profile_json={}
- `test_course_instance_status_default` — CourseInstance.status defaults to "draft"
- `test_lesson_status_default` — Lesson.status defaults to "locked"
- `test_activity_attempt_count_default` — Activity.attempt_count defaults to 0
- `test_assessment_defaults` — Assessment.status defaults to "pending"
- `test_badge_creation` — Badge with type and awarded_at
- `test_agent_log_creation` — AgentLog with all required fields, nullable FKs allowed
- `test_agent_log_nullable_context` — AgentLog with lesson_id=None, activity_id=None is valid

**test_config.py** — Configuration loading:
```python
# Default settings load without any env vars
# DATABASE_URL can be overridden
# CORS_ORIGINS parsed as list
# Boolean flags parse correctly
# Model selection defaults work
```

Test cases:
- `test_default_settings` — Settings() loads with all defaults
- `test_database_url_override` — Setting `DATABASE_URL` env var changes the value
- `test_cors_origins_list` — CORS origins parsed as a list of strings
- `test_debug_flag` — DEBUG=false sets settings.debug to False

**test_pipeline_deps.py** — PipelineDeps construction:
```python
# PipelineDeps with required fields constructs successfully
# Optional fields default to None
# Can set learner_profile, lesson_id, etc.
```

Test cases:
- `test_pipeline_deps_minimal` — Construct with db_session, user_id, course_instance_id only
- `test_pipeline_deps_full` — Construct with all fields including optionals
- `test_pipeline_deps_optional_defaults` — learner_profile, lesson_id, etc. default to None

**test_agent_logging.py** — Agent logging wrapper with TestModel:
```python
# Uses TestModel to run demo_agent through run_agent_with_logging
# Verifies AgentLog row created with all fields populated
# Verifies error path creates log with status="error"
```

Test cases:
- `test_logging_captures_success` — Run demo_agent with TestModel, verify AgentLog row: status="success", prompt set, output set, duration_ms > 0, input_tokens set, output_tokens set, model_name set
- `test_logging_captures_error` — Force an error (e.g., bad deps), verify AgentLog row: status="error", output contains error message
- `test_logging_captures_agent_name` — Verify agent_name field matches the name passed to `run_agent_with_logging`
- `test_logging_captures_context_ids` — Verify user_id, course_instance_id, lesson_id propagated from PipelineDeps to AgentLog

**test_output_validator.py** — Output validation pattern:
```python
# Verifies ModelRetry raised on invalid output
# Verifies valid output passes through
```

Test cases:
- `test_demo_validator_rejects_high_count` — HealthCheckOutput with items_count=51 triggers ModelRetry
- `test_demo_validator_accepts_valid` — HealthCheckOutput with items_count=10 passes through
- `test_model_retry_message` — ModelRetry exception contains a clear correction message

### 11.2 Integration Tests

**test_health_api.py** — FastAPI TestClient tests:
```python
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_health_endpoint_returns_200():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ("healthy", "degraded")
        assert "version" in data
        assert "timestamp" in data
        assert "database" in data


@pytest.mark.asyncio
async def test_status_endpoint_returns_config():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/status")
        assert response.status_code == 200
        data = response.json()
        assert data["app_name"] == "1111 School API"
        assert "database_url_masked" in data
        # Verify credentials are masked
        assert "password" not in data["database_url_masked"]


@pytest.mark.asyncio
async def test_cors_headers_present():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.options(
            "/api/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert "access-control-allow-origin" in response.headers


@pytest.mark.asyncio
async def test_unknown_route_returns_404():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/nonexistent")
        assert response.status_code == 404
```

**test_db_crud.py** — Database CRUD lifecycle:
```python
# Create a User, then a CourseInstance, then Lessons, Activities, AgentLogs
# Read them back and verify relationships
# Update a field and verify
# Delete cascade: deleting a User removes all related entities
```

Test cases:
- `test_create_and_read_user` — Insert User, query by id, verify fields
- `test_create_course_with_lessons` — Insert CourseInstance with 3 Lessons, query course, verify lessons relationship
- `test_create_activity_linked_to_lesson` — Insert Activity with lesson_id FK, verify relationship
- `test_cascade_delete_user` — Delete User, verify CourseInstances, Lessons, Activities, AgentLogs all deleted
- `test_cascade_delete_course` — Delete CourseInstance, verify Lessons and Activities deleted but User remains
- `test_update_course_status` — Update CourseInstance.status from "draft" to "generating", verify updated_at changes
- `test_agent_log_with_nullable_refs` — Create AgentLog with lesson_id=None, activity_id=None (course-level log)

**test_migrations.py** — Alembic migration on fresh DB:
```python
# Apply all migrations to a fresh SQLite database
# Verify all 8 tables exist
# Downgrade and verify tables removed
```

Test cases:
- `test_upgrade_creates_all_tables` — Run `alembic upgrade head`, verify tables: users, learner_profiles, course_instances, lessons, activities, assessments, badges, agent_logs
- `test_downgrade_removes_tables` — After upgrade, run `alembic downgrade base`, verify tables removed
- `test_migration_is_idempotent` — Run upgrade twice, no error

### 11.3 E2E Tests

**test_server_startup.py** — Full server startup + health check:
```python
# Start uvicorn as a subprocess
# Hit /api/health with httpx
# Verify 200 response
# Verify CORS headers on cross-origin request
# Shut down server
```

Test cases:
- `test_full_server_health_check` — Start server, GET `/api/health`, verify 200 with "healthy" status
- `test_full_server_cors` — Start server, send OPTIONS with `Origin: http://localhost:5173`, verify CORS headers

### 11.4 ADW Test — `01_health_check.py`

#### ADW Implementation Pattern

ADW tests are **single-file `uv` scripts** using [PEP 723 inline script metadata](https://peps.python.org/pep-0723/). Each test is a self-contained `.py` file that can be run directly with `uv run`:

```bash
# Run a single ADW test
uv run tests/adw/01_health_check.py

# Run all ADW tests
uv run tests/adw/run_all.py
```

**Script structure** — every ADW test follows this pattern:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""ADW Test: Health Check — verify backend, frontend, and CORS are operational."""

import json
import shutil
import subprocess
import sys
from pathlib import Path

PROMPT = """\
# ADW Test: Health Check

You are a QA tester for the 1111 School learning platform.
The frontend is at http://localhost:5173 and the backend at http://localhost:8000.
Use agent-browser to automate the browser and Bash for API checks.

## Test Steps

1. **Backend health check**:
   - Run: `curl -s http://localhost:8000/api/health | python3 -m json.tool`
   - Verify the response contains `"status": "healthy"` and `"database": "connected"`

2. **Backend status check**:
   - Run: `curl -s http://localhost:8000/api/status | python3 -m json.tool`
   - Verify the response contains `"app_name"` and `"version"`
   - Verify no credentials or API keys appear in the response

3. **Frontend loads**:
   - Run: `agent-browser open http://localhost:5173`
   - Run: `agent-browser snapshot -i`
   - Verify interactive elements are present (not a blank page or error)
   - Verify no JavaScript console errors: `agent-browser console`

4. **CORS functional**:
   - Run: `curl -s -I -X OPTIONS http://localhost:8000/api/health -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: GET"`
   - Verify `access-control-allow-origin` header is present

5. **Take screenshot**:
   - Run: `agent-browser screenshot --annotate ./test-results/01_health_check.png`

## Report

Output a JSON object:
{
  "test": "01_health_check",
  "passed": true/false,
  "checks": [
    {"name": "backend_health", "passed": true/false, "detail": "..."},
    {"name": "backend_status", "passed": true/false, "detail": "..."},
    {"name": "frontend_loads", "passed": true/false, "detail": "..."},
    {"name": "cors_functional", "passed": true/false, "detail": "..."}
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

## 12. Definition of Done

All of the following must be true before this PRD is considered complete:

1. **Project runs**: `cd backend && uv sync && uv run uvicorn app.main:app` starts without errors
2. **Health check works**: `curl http://localhost:8000/api/health` returns 200 with `"status": "healthy"`
3. **Database migrations work**: `uv run alembic upgrade head` creates all 8 tables; `uv run alembic downgrade base` removes them
4. **Dual database support**: Server works with both SQLite (`DATABASE_URL=sqlite+aiosqlite:///./dev.db`) and PostgreSQL (via Docker Compose)
5. **Agent framework verified**: `run_agent_with_logging` with `TestModel` writes a complete `AgentLog` row with all metadata fields populated
6. **Output validator verified**: `demo_agent`'s `@output_validator` correctly raises `ModelRetry` on invalid input
7. **Test safety**: `models.ALLOW_MODEL_REQUESTS = False` prevents accidental real API calls in tests
8. **All tests pass**: `uv run pytest` passes all unit, integration, and E2E tests
9. **Code quality**: `uv run ruff check src/ tests/` and `uv run mypy src/` pass with no errors
10. **Configuration documented**: `.env.example` contains all environment variables with comments
11. **Docker works**: `docker compose up -d && uv run alembic upgrade head && uv run uvicorn app.main:app` works end-to-end
12. **Router stubs exist**: All 8 future router files exist as stubs with placeholder comments
13. **ADW test authored**: `tests/adw/prompts/01_health_check.md` exists and is runnable

---

## Appendix A: Dependencies (`pyproject.toml`)

```toml
[project]
name = "school-backend"
version = "0.1.0"
description = "1111 School - Generative Learning Platform Backend"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.34.0",
    "sqlalchemy[asyncio]>=2.0.36",
    "alembic>=1.14.0",
    "aiosqlite>=0.20.0",
    "asyncpg>=0.30.0",
    "pydantic>=2.10.0",
    "pydantic-settings>=2.7.0",
    "pydantic-ai>=0.0.36",
    "pydantic-graph>=0.0.36",
    "httpx>=0.28.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.24.0",
    "ruff>=0.8.0",
    "mypy>=1.13.0",
]
observability = [
    "logfire>=2.0.0",
    "opentelemetry-api>=1.28.0",
    "opentelemetry-sdk>=1.28.0",
]
evals = [
    "pydantic-evals>=0.0.36",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
python_files = ["test_*.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]

[tool.ruff]
target-version = "py312"
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM", "ASYNC"]

[tool.mypy]
python_version = "3.12"
strict = true
plugins = ["pydantic.mypy"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.backends"
```

---

## Appendix B: Alembic Migration Template

```mako
# backend/src/app/db/migrations/script.py.mako

"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

# revision identifiers, used by Alembic.
revision: str = ${repr(up_revision)}
down_revision: Union[str, None] = ${repr(down_revision)}
branch_labels: Union[str, Sequence[str], None] = ${repr(branch_labels)}
depends_on: Union[str, Sequence[str], None] = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
```

---

## Appendix C: Key Design Decisions

### C.1 Why string-based status enums instead of database-level ENUMs?

Database-level ENUMs (PostgreSQL `ENUM` type) require migration to add new values. Since the course state machine may evolve (PRD 4 adds states, PRD 8 adds assessment states), using `String` columns with application-level validation provides flexibility without migration overhead. A Pydantic validator or explicit check in business logic enforces valid values.

### C.2 Why UUID strings instead of integer auto-increment?

UUIDs allow ID generation at the application layer without a database round-trip, which simplifies async batch operations (e.g., creating a course with 5 lessons in one operation). String(36) storage is slightly less efficient than native UUID columns but works identically across SQLite and PostgreSQL.

### C.3 Why JSON columns instead of normalized tables for submissions, visual_aids, etc.?

Several fields (submissions, visual_aids, lesson_plan_json, reviewer_feedback) contain variable-structure data that is always read and written as a whole unit. JSON columns avoid join complexity and match the Pydantic serialization pattern. PostgreSQL's JSONB provides indexing if needed later; SQLite's JSON support is sufficient for dev/test.

### C.4 Why a demo_agent instead of testing framework patterns in isolation?

The `demo_agent` with its `HealthCheckOutput` model and `@output_validator` serves as an integration test for the entire framework stack: agent construction, dependency injection, output validation, and logging. Testing these patterns in isolation would not catch wiring issues. The demo agent is small enough to not be a maintenance burden and provides a working reference for all future agent implementations.

### C.5 Why `@agent.instructions` over `@agent.system_prompt`?

Per PydanticAI documentation, `@agent.instructions` is re-evaluated on every run, including when `message_history` is passed. `@agent.system_prompt` is only evaluated once. Since all agents will eventually receive dynamic learner profile data (PRD 6), establishing the `@agent.instructions` pattern from the start avoids a migration later. This PRD's demo_agent uses `system_prompt` (static) since it has no dynamic data, but the documented pattern in the code comments specifies `@agent.instructions` for all production agents.
