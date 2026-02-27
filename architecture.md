# 1111 School — Architecture

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Backend | FastAPI (Python 3.12+) | Async throughout |
| ORM | SQLAlchemy 2.0 async | `mapped_column` style |
| Migrations | Alembic | Async support |
| Validation | Pydantic (core) | No pydantic_graph, no Logfire, no pydantic_evals |
| LLM framework | PydanticAI | Structured output, provider abstraction, tool use when needed |
| LLM provider | Anthropic (Claude) | Default; swappable via PydanticAI's model parameter |
| Database | PostgreSQL everywhere | SQLite only for fast unit tests |
| Frontend | React 19 + TypeScript | Existing SPA, preserved |
| State mgmt | Zustand | API-backed with localStorage cache |
| Styling | Shadcn/ui + Tailwind | Existing design system |

---

## Key Architectural Decisions

### LLM calls are functions, not agents

The original PRDs define 9 "specialized AI agents." They're not agents — they don't use tools,
don't have memory across invocations, and don't make autonomous decisions. They're structured LLM
calls.

Each "agent" is a PydanticAI Agent instance — lightweight, stateless, no framework overhead:

```python
from pydantic_ai import Agent

lesson_planner = Agent(
    "anthropic:claude-sonnet-4-6",
    output_type=LessonPlanOutput,
    system_prompt="...",
)

result = await lesson_planner.run(prompt, deps=deps)
```

- Takes typed input, returns typed output (Pydantic models)
- System prompt constructed from input + learner profile (via `@agent.system_prompt` decorator)
- Output parsed and validated against Pydantic schema by PydanticAI
- Retry on validation failure (up to 2 attempts, built into PydanticAI)
- Provider-agnostic: swap `"anthropic:claude-sonnet-4-6"` for `"openai:gpt-4o"` or
  `"google-gla:gemini-2.0-flash"` — no code changes
- Tool use available when needed (e.g., future: web search for examples, retrieval)

No graph library. The generation pipeline is sequential — plan, write, create activity —
repeated per objective. That's a for-loop.

### Provider-agnostic via PydanticAI

PydanticAI handles the LLM abstraction layer:

- Supports Anthropic, OpenAI, Google Gemini, and others via a unified interface
- Structured output with Pydantic model validation built in
- Token tracking via `result.usage()` for cost monitoring
- Model selection via string identifier — change the model, not the code
- Default to Claude (Anthropic) for development; swap providers by changing config

### User scoping from day one

Every database query is scoped by `user_id`, even while auth is stubbed. This means:

- A `get_current_user()` dependency exists from the first commit (returns a hardcoded dev user
  initially, swapped for real auth later)
- Every repository/query method takes or infers `user_id`
- No retrofit needed when real auth lands

### PostgreSQL everywhere

SQLite-in-dev / Postgres-in-prod is an anti-pattern. JSON handling, type strictness, enum behavior,
concurrent writes, and migration behavior all differ. Use PostgreSQL for development (Docker
Compose), PostgreSQL for production. SQLite only for fast, isolated unit tests where DB behavior
differences don't matter.

### No over-abstraction

- No dependency injection dataclasses for simple function arguments
- No FSM library for course state — a dict of valid transitions and guard functions
- No agent logging wrapper classes — a decorator or simple function
- No base agent pattern to inherit from — each LLM function stands alone

---

## Data Model (7 Entities)

```
User
  ├── LearnerProfile (one-to-one)
  ├── CourseInstance (one-to-many)
  │     ├── Lesson (one-to-many, ordered by objective_index)
  │     │     └── Activity (one-to-many)
  │     └── Assessment (one-to-many)
  └── AgentLog (one-to-many)
```

### User
| Field | Type | Notes |
|---|---|---|
| id | UUID (String 36) | PK |
| email | String(255) | unique, not null |
| password_hash | String | nullable (for future OAuth) |
| created_at | DateTime(tz) | |
| last_login_at | DateTime(tz) | nullable |

### LearnerProfile
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID FK → User | unique |
| display_name | String | nullable |
| experience_level | String | nullable |
| learning_goals | JSONB | list of strings |
| interests | JSONB | list of strings |
| learning_style | String | nullable |
| tone_preference | String | nullable |
| skill_signals | JSONB | `{strengths: [], gaps: []}` |
| version | Integer | default 1 |
| updated_at | DateTime(tz) | auto-update |

### CourseInstance
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID FK → User | not null |
| source_type | String(20) | `predefined` or `custom` |
| source_course_id | String(100) | nullable, for predefined |
| input_description | Text | |
| input_objectives | JSONB | list of strings |
| generated_description | Text | nullable |
| status | String(30) | see state machine below |
| created_at | DateTime(tz) | |
| updated_at | DateTime(tz) | |

### Lesson
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| course_instance_id | UUID FK | not null |
| objective_index | Integer | position in course |
| lesson_content | Text | Markdown |
| status | String(20) | `locked` / `unlocked` / `completed` |
| created_at | DateTime(tz) | |

### Activity
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| lesson_id | UUID FK | not null |
| activity_spec | JSONB | instructions, prompt, rubric, hints |
| submissions | JSONB | array of `{text, submitted_at}` |
| latest_score | Float | nullable |
| latest_feedback | JSONB | nullable |
| mastery_decision | String | `not_yet` / `meets` / `exceeds` |
| attempt_count | Integer | default 0 |

### Assessment
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| course_instance_id | UUID FK | not null |
| assessment_spec | JSONB | items covering all objectives |
| submissions | JSONB | array of responses |
| score | Float | nullable |
| passed | Boolean | nullable |
| feedback | JSONB | per-objective scores and feedback |
| status | String(20) | `pending` / `submitted` / `reviewed` |

### AgentLog
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID FK | not null |
| course_instance_id | UUID FK | not null |
| agent_name | String(100) | which function was called |
| prompt | Text | system + user prompt sent |
| output | Text | raw LLM response |
| status | String(20) | `success` / `error` |
| duration_ms | Integer | nullable |
| input_tokens | Integer | nullable |
| output_tokens | Integer | nullable |
| model_name | String(100) | nullable |
| created_at | DateTime(tz) | |

---

## Course State Machine

```
draft → generating → active → in_progress → awaiting_assessment → assessment_ready → completed
```

| Transition | Guard |
|---|---|
| draft → generating | has objectives |
| generating → active | all lessons + activities generated |
| active → in_progress | first lesson viewed |
| in_progress → awaiting_assessment | all lessons completed |
| awaiting_assessment → assessment_ready | assessment generated |
| assessment_ready → completed | assessment passed |
| assessment_ready → assessment_ready | assessment failed (retry) |

Implemented as a dict of `{(from, to): guard_fn}`, not a library.

---

## API Shape

### Core Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/courses` | Create a course (draft) |
| POST | `/api/courses/{id}/generate` | Trigger generation pipeline |
| GET | `/api/courses` | List user's courses |
| GET | `/api/courses/{id}` | Full course with lessons, activities, progress |
| PATCH | `/api/courses/{id}/state` | State transition |
| DELETE | `/api/courses/{id}` | Delete with cascade |
| POST | `/api/activities/{id}/submit` | Submit activity response, get scored feedback |
| POST | `/api/assessments/{course_id}/generate` | Generate assessment |
| POST | `/api/assessments/{id}/submit` | Submit assessment, get results |
| GET | `/api/catalog` | List predefined courses |
| POST | `/api/catalog/{id}/start` | Start a predefined course |
| GET | `/api/profile` | Get learner profile |
| PUT | `/api/profile` | Update learner profile |
| GET | `/api/health` | Health check |

### SSE

`GET /api/courses/{id}/generation-stream` — real-time generation progress events.

---

## LLM Agents

Six PydanticAI agents replacing nine from the original PRDs (course_describer folded into
lesson_planner):

| Agent | Input | Output | When Called |
|---|---|---|---|
| `lesson_planner` | objective, course description, profile | lesson plan (structure, key concepts, activity seed) | During generation, per objective |
| `lesson_writer` | lesson plan, profile | Markdown content + key takeaways | During generation, per objective |
| `activity_creator` | activity seed, objective, mastery criteria | full activity spec (instructions, prompt, rubric, hints) | During generation, per objective |
| `activity_reviewer` | submission text, rubric, objective | score, feedback, mastery decision | On activity submission |
| `assessment_creator` | all objectives, activity scores, profile | assessment items covering all objectives | When all lessons completed |
| `assessment_reviewer` | submissions, assessment spec, objectives | per-objective scores, pass/fail, feedback | On assessment submission |

Each agent:
- Is a `pydantic_ai.Agent` instance with a typed `output_type` (Pydantic model)
- Uses `@agent.system_prompt` to dynamically incorporate learner profile
- Validates output and retries on parse failure (up to 2x, built into PydanticAI)
- Logs the call to AgentLog (agent name, prompt, output, usage, duration)

---

## Project Structure

```
backend/
  src/app/
    main.py              # FastAPI app, lifespan, CORS, routers
    config.py            # Settings (pydantic-settings)
    db/
      models.py          # SQLAlchemy entities (7 tables)
      session.py         # Engine, session factory, get_db_session
      migrations/        # Alembic
    agents/
      lesson_planner.py  # PydanticAI Agent + system prompt
      lesson_writer.py
      activity_creator.py
      activity_reviewer.py
      assessment.py      # creator + reviewer agents
      logging.py         # Agent call logging to AgentLog table
    schemas/             # Pydantic I/O models
      lesson.py
      activity.py
      assessment.py
      profile.py
      course.py
    services/
      generation.py      # Orchestrates the generation pipeline (the for-loop)
      progression.py     # State machine + progress tracking
      catalog.py         # Predefined course loading
    routers/
      courses.py
      activities.py
      assessments.py
      catalog.py
      profile.py
      health.py
    auth/
      dependencies.py    # get_current_user (stubbed initially)
frontend/
  src/
    # Existing React 19 SPA structure preserved
```
