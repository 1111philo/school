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
| SSE | sse-starlette | Server-Sent Events for generation progress |
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

Each "agent" is a PydanticAI Agent instance — lightweight, stateless, no framework overhead.
The model is **not** baked into the Agent constructor; it's passed at runtime so the provider
can be swapped via config without touching agent code:

```python
from pydantic_ai import Agent

lesson_planner = Agent(
    output_type=LessonPlanOutput,
    retries=2,
    system_prompt="...",
)

# Model resolved at call time from settings
result = await lesson_planner.run(prompt, model=settings.default_model)
```

- Takes typed input, returns typed output (Pydantic models)
- Static system prompt at construction; dynamic context (learner profile, objective) in user prompt
- Output parsed and validated against Pydantic schema by PydanticAI
- Retry on validation failure (up to 2 attempts, built into PydanticAI)
- Provider-agnostic: swap `"anthropic:claude-sonnet-4-6"` for `"openai:gpt-4o"` or
  `"google-gla:gemini-2.0-flash"` — no code changes
- Tool use available when needed (e.g., future: web search for examples, retrieval)

All agents share a lightweight execution helper (`run_agent`) that handles timing, token tracking,
and logging to the AgentLog table. An `AgentContext` dataclass carries the DB session, user ID, and
course ID through agent calls. This is minimal shared infrastructure — not a framework, just DRY.

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

- A `get_current_user()` FastAPI dependency exists from the first commit (returns a hardcoded dev
  user initially, swapped for real auth later)
- The auth dependency eagerly loads the learner profile, making it available to all endpoints
  without additional queries
- Every repository/query method takes or infers `user_id`
- No retrofit needed when real auth lands

### PostgreSQL everywhere

SQLite-in-dev / Postgres-in-prod is an anti-pattern. JSON handling, type strictness, enum behavior,
concurrent writes, and migration behavior all differ. Use PostgreSQL for development (Docker
Compose), PostgreSQL for production. SQLite only for fast, isolated unit tests where DB behavior
differences don't matter.

### Keep it simple, but don't repeat yourself

- No FSM library for course state — a dict of valid transitions and guard names
- No base agent class hierarchy — a shared helper function for the common execution pattern
- No dependency injection framework — a dataclass for agent context
- But: extract shared patterns when they eliminate real duplication (e.g., the agent logging/timing
  wrapper appears 6 times — that warrants a shared function)

### JSONB mutation tracking

SQLAlchemy does not auto-detect in-place mutations to JSONB columns (e.g., appending to a list).
Any code that mutates a JSONB field must either reassign with a copy or call
`flag_modified(instance, "field_name")` to ensure the change is persisted.

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
| input_description | Text | nullable |
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
| lesson_content | Text | nullable; Markdown, populated during generation |
| status | String(20) | `locked` / `unlocked` / `completed` |
| created_at | DateTime(tz) | |

### Activity
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| lesson_id | UUID FK | not null |
| activity_spec | JSONB | nullable; instructions, prompt, rubric, hints |
| submissions | JSONB | array of `{text, submitted_at}`, default `[]` |
| latest_score | Float | nullable |
| latest_feedback | JSONB | nullable |
| mastery_decision | String | nullable; `not_yet` / `meets` / `exceeds` |
| attempt_count | Integer | default 0 |

### Assessment
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| course_instance_id | UUID FK | not null |
| assessment_spec | JSONB | nullable; items covering all objectives |
| submissions | JSONB | nullable |
| score | Float | nullable |
| passed | Boolean | nullable |
| feedback | JSONB | nullable; per-objective scores and feedback |
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
| status | String(20) | `running` (default) / `success` / `error` |
| duration_ms | Integer | nullable |
| input_tokens | Integer | nullable |
| output_tokens | Integer | nullable |
| model_name | String(100) | nullable |
| created_at | DateTime(tz) | |

---

## Course State Machine

```
draft → generating → active → in_progress → awaiting_assessment → generating_assessment → assessment_ready → completed
                 ↘ generation_failed (retry → generating)
```

| Transition | Guard |
|---|---|
| draft → generating | has objectives |
| generating → active | all lessons + activities generated |
| generating → generation_failed | generation error (automatic) |
| generation_failed → generating | retry (user-initiated) |
| active → in_progress | always (auto after generation) |
| in_progress → awaiting_assessment | all lessons completed |
| awaiting_assessment → generating_assessment | always |
| generating_assessment → assessment_ready | assessment generated |
| generating_assessment → awaiting_assessment | failure/zombie rollback |
| assessment_ready → generating_assessment | retry (user-initiated) |
| assessment_ready → completed | assessment passed |

Implemented as a dict of `{(from_state, to_state): guard_name}` with a dispatcher function that
evaluates the named guard condition. Not a library.

---

## API Shape

Full request/response contracts for every endpoint are in **[api-contracts.md](api-contracts.md)**.

### Core Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/courses` | Create a course (draft) |
| POST | `/api/courses/{id}/generate` | Trigger generation (returns immediately, runs in background) |
| GET | `/api/courses/{id}/generation-stream` | SSE stream of generation progress events |
| GET | `/api/courses` | List user's courses |
| GET | `/api/courses/{id}` | Full course with lessons, activities, progress |
| PATCH | `/api/courses/{id}/state` | State transition |
| DELETE | `/api/courses/{id}` | Delete with cascade |
| POST | `/api/activities/{id}/submit` | Submit activity response, get scored feedback |
| POST | `/api/assessments/{course_id}/generate` | Generate assessment (returns immediately, runs in background) |
| POST | `/api/assessments/{id}/submit` | Submit assessment, get results |
| GET | `/api/catalog` | List predefined courses |
| POST | `/api/catalog/{id}/start` | Start a predefined course |
| GET | `/api/profile` | Get learner profile |
| PUT | `/api/profile` | Update learner profile |
| GET | `/api/health` | Health check |

### Async Generation (Required)

LLM generation is long-running (~1-2 minutes for a full course). **Generation must never block an
HTTP request.** The pattern:

1. `POST /api/courses/{id}/generate` validates the request, transitions the course to `generating`,
   spawns a background task, and **returns immediately** with `{"id": ..., "status": "generating"}`.
2. The background task runs the generation pipeline (plan → write → create activity per objective),
   writing each lesson to the DB as it completes.
3. The client tracks progress via one of two mechanisms:
   - **SSE stream** — `GET /api/courses/{id}/generation-stream` pushes events as each step
     completes (`lesson_planned`, `lesson_written`, `activity_created`, `generation_complete`,
     `generation_error`).
   - **Polling** — `GET /api/courses/{id}` returns the current course state including any lessons
     generated so far. The client polls until `status` leaves `generating`.
4. On success, the background task transitions the course to `in_progress`. On failure, it
   transitions to `generation_failed` and records the error.

All long-running LLM workflows — including assessment generation — should follow this pattern.

#### Background Task Lifecycle

Background tasks run outside the HTTP request lifecycle and need their own infrastructure:

- **Session management** — Background tasks cannot share the request's DB session (it's committed
  and closed when the response returns). They must create and manage their own database sessions
  with independent commit/rollback boundaries.
- **Progress broadcasting** — An in-process pub/sub mechanism connects background tasks to SSE
  clients. Tasks publish events; SSE endpoints subscribe to a per-course event stream. All state
  is in-memory (lost on restart — acceptable for POC, replaced by Redis pub/sub at scale).
- **Conflict detection** — Only one generation task can run per course at a time. The system
  tracks active tasks and returns 409 if a duplicate is requested.
- **Cleanup** — Task tracking state is automatically cleaned up when the task completes. SSE
  subscriber queues are cleaned up when clients disconnect.

#### SSE Event Format

```
event: lesson_planned
data: {"objective_index": 0, "lesson_title": "..."}

event: lesson_written
data: {"objective_index": 0}

event: activity_created
data: {"objective_index": 0, "activity_id": "..."}

event: generation_complete
data: {"course_id": "...", "lesson_count": 5}

event: generation_error
data: {"objective_index": 2, "error": "LLM call failed after retries"}
```

**Client pattern — REST first, SSE second:** The frontend fetches `GET /api/courses/{id}` on page
load to get the full committed state and renders immediately. SSE is only connected if the course
is still in `generating` status. This means already-completed courses render instantly with no SSE
overhead, and mid-generation reconnects show all committed progress before subscribing to live
updates.

**Reconnection / catchup:** When a client connects to the SSE stream, the server sends catchup
events for all three stages (`lesson_planned`, `lesson_written`, `activity_created`) for lessons
already in the DB, then streams live events. If generation is already complete, the server sends
catchup + `generation_complete` and closes the stream.

**Keepalive:** The SSE stream sends a comment-based keepalive every 5 seconds to prevent
proxy/load balancer timeouts. The keepalive also checks whether the generation task has finished
(guards against a race where the task completes between subscribe and first event).

**Zombie detection:** If a server restart kills an in-flight generation task, the course gets stuck
in `generating` with no active background task. The `GET /api/courses/{id}` endpoint auto-heals
this: if the course status is `generating` but no task is running, it transitions to
`generation_failed` so the client sees the correct state immediately.

#### Error Handling and Incremental Recovery

Generation is designed for **partial failure and incremental retry**:

- If a single objective fails, the pipeline logs the error, broadcasts `generation_error`, and
  continues with remaining objectives.
- The generation task **commits after each objective** (not at the end). This is critical —
  without per-objective commits, other sessions (REST fetches, SSE catchup queries) cannot see
  intermediate progress. Broadcasts must also happen **after** the commit so that any subscriber
  re-querying the DB sees the committed data.
- If the course ends with some lessons generated and some failed, it transitions to
  `generation_failed` (if zero lessons) or `in_progress` (if at least one lesson).
- **On retry** (`generation_failed → generating`), the pipeline checks which objectives already
  have a complete lesson + activity in the DB and skips them. Only missing or incomplete
  objectives are regenerated. This means a retry after 3/5 objectives succeeded only costs 2
  objectives worth of LLM calls.
- Finer-grained recovery is also supported: if a lesson was written but its activity creation
  failed, the retry re-uses the existing lesson content and only re-runs activity creation.

This incremental approach should be a design principle for all generation workflows — always
persist progress as early as possible, and always check for existing work before regenerating.

#### Scaling Beyond the POC

The in-process approach works well for a single server instance handling ~100 concurrent users —
LLM calls are async I/O, not CPU-bound, so the event loop stays responsive. However, it does not
survive server restarts (in-flight generations are lost) and cannot distribute across multiple
backend instances.

When scaling requires it, the next step is a **task queue** (e.g., ARQ + Redis, or Celery):
- `POST /generate` enqueues a job and returns immediately
- A worker pool processes generation jobs independently of the web server
- Jobs survive restarts, can be retried, and distribute across instances
- SSE endpoint reads progress from Redis pub/sub instead of in-process state

This is a drop-in replacement — the API contract (return immediately, stream progress, poll for
state) stays identical. The only change is where the work executes.

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
- Uses a static system prompt; dynamic context (learner profile, objectives) is in the user prompt
- Validates output and retries on parse failure (up to 2x, built into PydanticAI)
- Logs the call to AgentLog (agent name, prompt, output, usage, duration) via shared `run_agent`

---

## Project Structure

```
backend/
  src/app/
    main.py                # FastAPI app, lifespan, CORS, routers
    config.py              # Settings (pydantic-settings, reads .env)
    db/
      models.py            # SQLAlchemy entities (7 tables)
      session.py           # Engine, session factory, get_db_session, get_background_session
      migrations/          # Alembic
    agents/
      lesson_planner.py    # PydanticAI Agent + runner function
      lesson_writer.py
      activity_creator.py
      activity_reviewer.py
      assessment.py        # creator + reviewer agents
      logging.py           # AgentContext, AgentTimer, run_agent helper, log_agent_call
    schemas/               # Pydantic I/O models
      lesson.py
      activity.py
      assessment.py
      profile.py
      course.py
    services/
      generation.py        # Generation pipeline (sync + background variants)
      generation_tracker.py # In-process task registry + SSE pub/sub
      progression.py       # State machine + progress tracking
      catalog.py           # Predefined course loading
    routers/
      courses.py           # Includes SSE generation-stream endpoint
      activities.py
      assessments.py
      catalog.py
      profile.py
      health.py
    auth/
      dependencies.py      # get_current_user (stubbed initially, eagerly loads profile)
frontend/
  src/
    # Existing React 19 SPA structure preserved
```

---

## Containerization & Deployment

### The core problem

The dev setup requires Python, uv, Node, npm, and PostgreSQL. That's reasonable for developers,
but too much friction for teammates who just want to review the product. And deploying to the
cloud requires packaging all of this into something runnable. Docker solves both.

### One image, two serving modes

The key design decision: **a single Docker image that contains the built frontend and the
backend**. FastAPI serves both the API and the pre-built static files. There is no nginx, no
separate frontend container, no reverse proxy in front.

This works because the frontend is a static SPA. Once built (`npm run build` → `dist/`), it's
just HTML/JS/CSS files that need to be served. FastAPI can mount a `StaticFiles` directory
alongside its API routes:

- `/api/*` → handled by FastAPI routers (takes priority)
- `/*` → falls through to the static file mount, which serves `index.html` for all paths
  (client-side routing)

This is functionally identical to what nginx or Vite's preview server would do. The difference is
there's no additional process to configure, no port mapping between containers, and no proxy
rules to maintain.

### Why not separate containers?

A common pattern is backend + frontend + nginx in three containers. This adds complexity that
isn't justified here:

- **nginx as reverse proxy** — Solves a problem we don't have. FastAPI handles static files
  natively. Adding nginx means another config file, another container, another thing that can
  drift from dev behavior.
- **Separate frontend container** — The frontend is static files. A container that exists only to
  serve static files is an entire runtime for `serve -s dist/`. Embedding the files in the
  backend container eliminates the coordination.
- **Config drift** — Every additional layer between the client and the API is a place where
  behavior can differ between dev and prod. One process serving everything means the routing
  logic is the same code in both environments.

### Dev vs prod: same code, different serving

The only difference between dev and production is **who serves the frontend**:

| | Dev | Production |
|---|---|---|
| Frontend served by | Vite (HMR, hot reload) | FastAPI (static mount) |
| API served by | FastAPI (--reload) | FastAPI (uvicorn) |
| Frontend ↔ API | Vite proxy (`/api` → `:8000`) | Same process, no proxy needed |
| How to run | `npm run dev` | `docker compose up` |

The backend code is identical. There's no "production mode" flag, no conditional middleware, no
environment-specific routing. The static mount is additive: if `static/` exists, mount it. If
not (dev), don't. Vite's proxy and FastAPI's static mount produce the same result from the
browser's perspective.

This means:
- Developers use `npm run dev` with hot reload. Nothing changes.
- Reviewers use `docker compose up`. No Python, no Node, no uv — just Docker and an API key.
- Deployment is pushing the Docker image. Same artifact reviewers tested locally.

### The Dockerfile

Multi-stage build:

1. **Build stage** (Node) — installs frontend deps, runs `npm run build`, produces `dist/`
2. **Runtime stage** (Python) — installs backend deps with uv, copies built frontend assets into
   a `static/` directory, copies backend code. Entrypoint runs Alembic migrations then starts
   uvicorn.

The build stage is discarded — the final image has no Node, no npm, no `node_modules`. Just
Python, the backend code, and pre-built static files.

### Compose: database + app in one command

Docker Compose defines two services: PostgreSQL and the application. A reviewer or deployer runs
a single command with their API key, and both the database and the full application (API +
frontend) come up together. No local toolchain required — just Docker.

The application service depends on the database service, and its entrypoint runs migrations
before starting the server, so there's no manual setup step.

### What this enables

- **Sharing** — "Install Docker, run one command, open the browser." No environment setup beyond
  Docker itself and an API key.
- **Cloud deployment** — Push the image to a registry. Pull it on any VM, container service, or
  serverless platform. Set two env vars (`DATABASE_URL`, `ANTHROPIC_API_KEY`).
- **CI/CD** — Build the image in CI, run tests against it, push to registry on merge.
- **Consistency** — The image a coworker demos locally is the same artifact that runs in
  the cloud.

### What this doesn't solve

- **Managed database** — Compose runs PostgreSQL in a container, which is fine for demos but
  ephemeral. Production deployments should use a managed Postgres (RDS, Cloud SQL, etc.) and
  pass the connection string via `DATABASE_URL`.
- **HTTPS / domain** — The container serves HTTP. For production, put it behind a load balancer
  or cloud provider's HTTPS termination.
- **Horizontal scaling** — The in-process generation tracker (background tasks, SSE pub/sub) is
  single-instance. Multiple replicas would need Redis-backed pub/sub. See "Scaling Beyond the
  POC" above.
- **Auth** — Still stubbed. Containerization doesn't change this.
