# 1111 School — PRD Decomposition Plan

## Context

The master PRD describes a generative learning platform with 9 specialized AI agents, 8 database entities, 10 UX screens, a course state machine, and both predefined and user-generated course flows. The existing codebase is a client-only React 19 SPA that calls Google Gemini directly from the browser with localStorage persistence — no backend, no database, no auth.

The gap between current state and the full PRD is enormous. This document breaks the master PRD into 11 smaller PRDs that can be implemented incrementally, with a clear MVP boundary after PRD 5.

**Source PRD**: `/Users/dylanisaac/Downloads/PRD — 1111 School (Generative Learning Platform).md`
**Existing codebase**: `/Users/dylanisaac/Projects/External Projects/school`

---

## Technology Stack

### Backend
| Component | Technology | Notes |
|-----------|-----------|-------|
| Language | Python 3.12+ | Use `uv` for all package management, never bare `pip` or `python` |
| Framework | FastAPI | Async-native, Pydantic-integrated, SSE support |
| Agent Framework | PydanticAI | Structured output, dependency injection, built-in retry/validation |
| Orchestration | pydantic_graph | FSM for multi-agent pipelines, typed nodes/edges, state persistence |
| Database | PostgreSQL (prod), SQLite (dev/test) | Via SQLAlchemy async |
| ORM | SQLAlchemy 2.0 async + Alembic | async sessions, migration management |
| Evaluation | pydantic_evals | Dataset/Case/Evaluator pattern for agent quality testing |
| Observability | Pydantic Logfire (optional) or OpenTelemetry | Auto-instrumented spans for all agent runs |
| Task runner | pytest + pytest-asyncio | `anyio` backend for async test execution |
| Server | uvicorn | ASGI server, run via `uv run uvicorn` |

### Frontend (Existing — Preserved)
| Component | Technology | Notes |
|-----------|-----------|-------|
| Framework | React 19 + TypeScript | Existing SPA |
| Build | Vite 7.x | Dev server on port 5173 |
| Styling | Tailwind CSS 3.x + Shadcn/ui | Radix primitives, glassmorphism design |
| State | Zustand 5.x | Migrates from localStorage to API-backed |
| Animation | Framer Motion 12.x | Existing transitions preserved |
| Markdown | react-markdown 10.x | Lesson content rendering |
| Icons | Lucide React | Existing icon set |
| E2E Testing | agent-browser + Claude Code ADWs | AI-driven browser testing (see ADW section) |

### Development Environment
| Tool | Purpose |
|------|---------|
| `uv` | Python package management and script execution |
| Docker Compose | PostgreSQL for local dev |
| `agent-browser` | AI-optimized headless browser CLI (`npm install -g agent-browser`) |
| Claude Code (`-p`) | Programmable headless agent for ADW test orchestration |
| `httpx` | Async HTTP client for API integration tests |

---

## Testing & Verification Strategy

Every PRD includes three verification layers:
1. **Unit/integration tests** (fast, mocked, run on every commit) — pytest + TestModel
2. **E2E API tests** (slower, hit live LLM services, CI-gated) — httpx + pydantic_evals
3. **E2E browser tests via ADWs** (AI agents navigate the real UI) — agent-browser + Claude Code headless

### Backend Testing Patterns (PydanticAI-specific)

**Agent Unit Tests** — Use `TestModel` and `FunctionModel` to mock LLM responses:
```python
from pydantic_ai.models.test import TestModel
from pydantic_ai import models

# Block real API calls in test suite
models.ALLOW_MODEL_REQUESTS = False

# TestModel auto-generates valid structured output matching the schema
with agent.override(model=TestModel(custom_output_args={...}), deps=mock_deps):
    result = await agent.run("test prompt")

# FunctionModel for intelligent mocking (inspect messages, return conditional responses)
with agent.override(model=FunctionModel(my_mock_fn)):
    result = await agent.run("test prompt")
```

**Output Validator Tests** — Test business rule validation independently:
```python
# Test that ModelRetry is raised for out-of-bounds activity count
with pytest.raises(ModelRetry, match="between 3 and 6 activities"):
    validate_lesson_plan(ctx, invalid_plan)
```

**Graph Workflow Tests** — Use `Graph.iter()` for step-by-step verification:
```python
async with my_graph.iter(StartNode(), state=state) as graph_run:
    node_sequence = []
    async for node in graph_run:
        node_sequence.append(type(node).__name__)
    assert node_sequence == ['DescribeCourse', 'PlanLesson', 'WriteLesson', 'End']
```

**Message Inspection** — Use `capture_run_messages` to verify prompts and tool calls:
```python
with capture_run_messages() as messages:
    result = await agent.run("test")
# Assert specific tool calls, retry messages, etc. in `messages`
```

**Agent Evaluation Suites** — Use `pydantic_evals` for quality regression:
```python
dataset = Dataset(cases=[
    Case(name="basic_course", inputs={...}, evaluators=[
        IsInstance(type_name='CourseDescriptionOutput'),
        LLMJudge(rubric="Description centers on the focused objective"),
    ])
])
report = await dataset.evaluate(course_describer_task)
```

### ADW Browser Testing (AI Developer Workflows)

Instead of brittle scripted E2E tests, browser verification uses **AI Developer Workflows (ADWs)** — autonomous Claude Code agents that navigate the real UI via `agent-browser`, reason about what they see, and make semantic assertions.

**Why ADWs over traditional E2E:**
- **Resilient to UI changes**: AI agents find elements by semantic meaning, not brittle CSS selectors
- **Semantic assertions**: Can verify "does this lesson make sense for Python basics?" not just "is this div visible?"
- **Self-recovering**: Agents can handle unexpected states, popups, loading delays
- **Single source of truth**: The same agent-browser refs (`@e1`, `@e2`) the AI uses are the accessibility tree — testing IS accessibility auditing
- **Richer reporting**: Agent produces natural language test reports with reasoning

**Core Pattern — agent-browser + Claude Code `-p`:**

```python
import subprocess
import json

def run_adw_test(test_prompt: str, max_turns: int = 25) -> dict:
    """Run an ADW test using Claude Code in headless mode with agent-browser."""
    result = subprocess.run(
        [
            "claude", "-p", test_prompt,
            "--output-format", "json",
            "--allowedTools", "Bash,Read",
            "--max-turns", str(max_turns),
            "--model", "claude-sonnet-4-6",
        ],
        capture_output=True, text=True,
        cwd="/path/to/project"
    )
    return json.loads(result.stdout)
```

**Example ADW test — Course Creation Flow:**

```python
result = run_adw_test("""
You are a QA tester for the 1111 School learning platform.
The app is running at http://localhost:5173 and the backend at http://localhost:8000.
Use agent-browser to automate the browser.

TEST: Course creation and lesson display

Steps:
1. `agent-browser open http://localhost:5173`
2. `agent-browser snapshot -i` to see what's available
3. Find the course description input and fill it with "Introduction to Python Programming"
4. Add 3 learning objectives: "Understand variables and types", "Write basic functions", "Use control flow statements"
5. Click the Generate Course button
6. Wait for generation to complete (watch for lesson content to appear, use `agent-browser wait` and re-snapshot periodically)
7. Take a snapshot of the generated course

VERIFY and report pass/fail for each:
- [ ] At least 3 lessons were generated (check the left nav or lesson list)
- [ ] Each lesson has a visible title
- [ ] The first lesson is accessible/unlocked
- [ ] The lesson content contains structured sections (headings, examples)
- [ ] An activity section is visible for the first lesson
- [ ] Take an annotated screenshot: `agent-browser screenshot --annotate ./test-results/course-creation.png`

Output a JSON object: {"test": "course_creation", "passed": true/false, "checks": [...], "notes": "..."}
""")
```

**agent-browser Workflow Inside ADW:**
```bash
# 1. Navigate to the app
agent-browser open http://localhost:5173

# 2. Snapshot interactive elements (compact, AI-friendly output ~200-400 tokens)
agent-browser snapshot -i
# Output:
# @e1 [textbox] "Course Description"
# @e2 [button] "Add Objective"
# @e3 [button] "Generate Course"

# 3. Interact using refs (deterministic, no CSS selector fragility)
agent-browser fill @e1 "Introduction to Python Programming"
agent-browser click @e2

# 4. Re-snapshot to see new state
agent-browser snapshot -i

# 5. Assert using get/is commands
agent-browser get text @e5           # Get lesson title text
agent-browser is visible @e6         # Check if element visible
agent-browser get count "[data-testid='lesson']"  # Count lessons

# 6. Annotated screenshot for visual record
agent-browser screenshot --annotate ./test-results/step-3.png

# 7. Structural diff against baseline
agent-browser diff snapshot --baseline ./baselines/course-created.txt
```

**ADW Test Orchestrator — Python script for running all E2E tests:**

```python
import subprocess
import json
import sys
from pathlib import Path

TESTS_DIR = Path("tests/adw/prompts")
RESULTS_DIR = Path("tests/adw/results")

def run_all_adw_tests():
    """Orchestrate all ADW browser tests."""
    results = []

    for prompt_file in sorted(TESTS_DIR.glob("*.md")):
        prompt = prompt_file.read_text()
        print(f"Running ADW test: {prompt_file.stem}")

        output = subprocess.run(
            [
                "claude", "-p", prompt,
                "--output-format", "json",
                "--allowedTools", "Bash,Read",
                "--max-turns", "30",
                "--model", "claude-sonnet-4-6",
            ],
            capture_output=True, text=True
        )

        result = json.loads(output.stdout)
        results.append({"test": prompt_file.stem, "result": result})

        # Save individual result
        (RESULTS_DIR / f"{prompt_file.stem}.json").write_text(
            json.dumps(result, indent=2)
        )

    # Summary
    passed = sum(1 for r in results if r["result"].get("passed"))
    print(f"\nADW Tests: {passed}/{len(results)} passed")

    return all(r["result"].get("passed") for r in results)

if __name__ == "__main__":
    sys.exit(0 if run_all_adw_tests() else 1)
```

**ADW Test Prompt Files** — Stored as `.md` files in `tests/adw/prompts/`:

```
tests/
  adw/
    prompts/
      01_health_check.md         # Verify app loads, backend reachable
      02_course_creation.md      # Create a course, verify lessons
      03_lesson_navigation.md    # Navigate between lessons, check lock states
      04_activity_submission.md  # Submit activity, verify feedback
      05_course_progression.md   # Full course lifecycle
      06_profile_editing.md      # Edit learner profile (PRD 6)
      07_assessment_flow.md      # Complete assessment, verify badge (PRD 8)
      08_agent_log_viewer.md     # Inspect agent logs (PRD 9)
      09_course_catalog.md       # Browse and select courses (PRD 10)
      10_auth_flow.md            # Register, login, logout (PRD 11)
      11_multi_user.md           # Data isolation between users (PRD 11)
      12_accessibility.md        # WCAG checks via snapshot tree analysis
    results/                     # JSON results + screenshots
    baselines/                   # Snapshot baselines for diff testing
    orchestrator.py              # Main runner script
```

### Test Organization
```
tests/
  unit/
    agents/         # TestModel-based agent tests
    validators/     # Output validator business rule tests
    models/         # Pydantic model serialization tests
    state/          # State machine transition tests
  integration/
    api/            # httpx tests against running FastAPI
    graph/          # pydantic_graph workflow tests with mocked agents
    db/             # SQLAlchemy model + migration tests
  e2e/
    api/            # Live LLM API tests (slow, expensive, CI-gated)
  evals/
    agents/         # pydantic_evals datasets per agent
  adw/
    prompts/        # ADW test prompt files (.md)
    results/        # Test results (JSON + screenshots)
    baselines/      # Snapshot baselines for structural diffs
    orchestrator.py # Python runner for all ADW tests
```

---

## Research Context — PydanticAI Reference

Research was conducted by querying the PydanticAI documentation NotebookLM instance. AI implementors should use this as a starting point for finding implementation patterns.

### NotebookLM Instance

| Field | Value |
|-------|-------|
| Notebook ID | `95f80e0d-e9a8-4d47-8060-f5df46aaa3dc` |
| Title | PydanticAI Docs |
| Sources | 145 documents |
| CLI tool | `nlm` (Dylan's fork: `github.com/dylan-isaac/nlm`) |
| Auth | `dylan@enablement.engineering` (authuser=1) via Helium |

### How to Query

```bash
# List notebooks
nlm ls

# Ask a question (use --timeout 180 for complex queries)
nlm generate-chat 95f80e0d-e9a8-4d47-8060-f5df46aaa3dc 'Your question here'

# If auth expires (gRPC error code 13 or 16)
nlm auth -all
# Then retry the query

# Get full response if truncated
nlm last --tab-id <TAB_ID>

# Interactive chat session
nlm chat 95f80e0d-e9a8-4d47-8060-f5df46aaa3dc
```

### Key Findings from Research

These are the PydanticAI patterns most relevant to this project. Implementors should query the NotebookLM instance for detailed examples and code.

**1. Structured Output with `output_type`**
- Set `output_type` to a Pydantic `BaseModel` on the `Agent`. PydanticAI auto-generates JSON schema and registers it as a tool.
- Invalid LLM output triggers automatic `RetryPromptPart` with validation errors sent back to the model.
- Cap retries with `output_retries` on the Agent or `UsageLimits(request_limit=N)` on the run.
- Query: *"How does output_type work with nested Pydantic BaseModels"*

**2. Business Rule Validation with `@output_validator`**
- Decorate a function with `@agent.output_validator` for custom validation beyond schema.
- Raise `ModelRetry("error message")` to send correction feedback to the LLM.
- Can be sync or async. Receives `RunContext` for dependency-aware validation.
- Query: *"How do I use output validators for custom business logic validation"*

**3. Dependency Injection with `deps_type`**
- Define a `@dataclass` with shared resources (DB, logger, profile). Set as `deps_type` on Agent.
- Access via `ctx.deps` in tools, system prompts, and output validators.
- Pass the same `deps` instance to all agent `run()` calls in the pipeline.
- Query: *"How do I implement dependency injection in PydanticAI agents"*

**4. Agent Orchestration with `pydantic_graph`**
- Define `@dataclass` nodes that subclass `BaseNode[StateType]`.
- Edges are defined by return type hints: `async def run(...) -> NextNode | End[OutputType]`.
- Use `GraphRunContext[StateType]` to access/mutate shared state.
- State persistence via `FileStatePersistence` for crash recovery.
- Query: *"Tell me about pydantic_graph for building complex stateful multi-agent workflows"*

**5. Dynamic System Prompts with `@agent.instructions`**
- Use `@agent.instructions` (not `@agent.system_prompt`) for prompts that should be re-evaluated on every run, including when `message_history` is passed.
- The function receives `RunContext` for injecting dependency data (learner profile, etc.).
- Query: *"How do I use dynamic system prompts that change per run based on dependency data"*

**6. Agent Logging and Observability**
- `result.all_messages()` / `result.new_messages()` return full message history including retries.
- `result.usage()` returns `RunUsage` with `input_tokens`, `output_tokens`, `requests`, `tool_calls`.
- `capture_run_messages()` context manager captures messages even if the run raises an exception.
- `result.all_messages_json()` for easy serialization.
- Model metadata: `result.response.model_name`, `result.timestamp()`.
- Query: *"How do I implement comprehensive logging and observability for PydanticAI agents"*

**7. Testing with TestModel and FunctionModel**
- `TestModel` auto-generates valid structured data matching the output schema. Use `custom_output_args` for specific values.
- `FunctionModel` takes a function `(messages, info) -> ModelResponse` for intelligent mocking.
- `Agent.override(model=..., deps=...)` injects test doubles without modifying agent code.
- Set `models.ALLOW_MODEL_REQUESTS = False` globally to prevent accidental real API calls.
- Query: *"Show me how to use TestModel and FunctionModel for unit testing PydanticAI agents"*

**8. Graph Testing with `Graph.iter()` and `GraphRun.next()`**
- `Graph.iter()` returns an async iterable yielding each node as it executes — use to verify sequence.
- `GraphRun.next(node)` for manual step-by-step execution with state injection mid-flight.
- Combine with `agent.override(model=TestModel())` inside graph nodes.
- Query: *"How do I test pydantic_graph workflows"*

**9. Evaluation with `pydantic_evals`**
- `Dataset` groups `Case` objects with `inputs`, `expected_output`, and `evaluators`.
- Built-in evaluators: `Contains`, `IsInstance`, `EqualsExpected`, `Equals`.
- `LLMJudge` uses an LLM to score subjective quality against a rubric (assertion and/or 0-1 score).
- Deterministic evaluators run first; `LLMJudge` only runs if fast checks pass (saves cost).
- Cases run concurrently by default.
- Query: *"Show me pydantic_evals for running evaluation suites with Dataset, Case, and evaluators"*

**10. Browser E2E Testing with agent-browser**
- Install: `npm install -g agent-browser && agent-browser install`
- Core workflow: `agent-browser open <url>` -> `agent-browser snapshot -i` (get refs) -> `agent-browser click @e1` / `agent-browser fill @e2 "text"` -> re-snapshot
- Refs (`@e1`, `@e2`) are deterministic pointers to accessibility tree elements — compact, AI-friendly (~200-400 tokens vs ~3000-5000 for DOM)
- Key commands: `snapshot -i` (interactive elements), `screenshot --annotate`, `get text @ref`, `is visible @ref`, `wait --text "..."`, `diff snapshot --baseline`
- Sessions for multi-user testing: `agent-browser --session user-a open ...`
- State inspection: `agent-browser cookies`, `agent-browser storage local`, `agent-browser console`
- Docs: https://agent-browser.dev/

**11. Claude Code Headless Mode for ADW Test Orchestration**
- `-p` flag runs Claude Code non-interactively: `claude -p "prompt" --output-format json`
- `--allowedTools "Bash,Read"` restricts the agent to specific tools
- `--max-turns N` caps agentic iterations to prevent runaway tests
- `--model claude-sonnet-4-6` for cost-effective test agents
- `--output-format json` returns structured `{result, session_id, usage}` for test harness parsing
- `--continue` / `--resume <session_id>` for multi-phase tests
- ADW pattern: Python orchestrator script invokes `claude -p` via `subprocess.run()` for each test
- Docs: https://code.claude.com/docs/en/headless

**12. FastAPI Integration & Streaming**
- `AGUIAdapter.dispatch_request(request, agent=agent)` for one-line SSE endpoint.
- Manual streaming: `async with agent.run_stream(prompt) as result:` then `async for chunk in result.stream_text(delta=True):`.
- `StreamingResponse(event_generator(), media_type="text/event-stream")` for FastAPI.
- For structured output streaming: `result.stream_output()` instead of `stream_text()`.
- Query: *"How do I integrate PydanticAI agents with FastAPI for streaming"*

**13. Agent Chaining Patterns**
- **Programmatic hand-off**: Run agents sequentially in application code, pass structured output from one to the next.
- **Agent delegation**: Parent agent calls delegate agent from within a tool function, pass `ctx.usage` for aggregated tracking.
- **Message history**: Pass `result.new_messages()` as `message_history` to next agent for conversation continuity.
- Message format is model-agnostic — can chain agents across different providers.
- Query: *"How do I build a multi-agent pipeline with PydanticAI"*

---

## Decomposition Strategy

**Principle 1: Foundation before features.** The backend infrastructure and agent framework must exist before any agents can be built.

**Principle 2: Agents before UI.** Each agent PRD delivers working, testable API endpoints. Frontend integration happens in a dedicated PRD after the core pipeline proves out.

**Principle 3: Core loop first.** The MVP is the tightest possible loop: generate a course, present lessons, accept activity submissions, give feedback, unlock next lesson. Everything else (profiles, visuals, assessments, auth) enhances this core loop.

**Principle 4: Each PRD ships working software.** No PRD is purely "setup" — each delivers something testable and demonstrable, even if only via API.

**Principle 5: Every PRD has verification.** Unit tests with mocked LLMs run on every commit. E2E tests with live LLMs and/or browser automation run on CI or manually before merge.

## MVP Boundary

After PRDs 1-5, the system supports:

- Backend with PydanticAI agent pipeline
- Course generation from description + objectives (3 agents)
- Activity creation and scoring with feedback (2 agents)
- Course progression with lesson unlock logic
- Working React frontend connected via API with streaming
- Agent logging (backend, no UI yet)

This is 5 of 9 agents, full course lifecycle, and a working end-to-end application. A user can create a course, learn through it, and complete it.

## Dependency Graph

```
PRD 1: Backend Foundation
  |
  |--- PRD 2: Course Generation Pipeline
  |       |
  |       |--- PRD 3: Activity & Feedback System
  |               |
  |               |--- PRD 4: Course Progression Engine
  |                       |
  |                       |--- PRD 5: API Integration & Frontend Migration
  |                               |
  |                               |  ======= MVP COMPLETE =======
  |                               |
  |                               |--- PRD 6: Learner Profile & Personalization
  |                               |       |
  |                               |       |--- PRD 7: Visual Aid System
  |                               |
  |                               |--- PRD 8: Assessment & Course Completion
  |                               |
  |                               |--- PRD 9: Agent Log & Transparency UI
  |                               |
  |                               |--- PRD 10: Course Discovery & Catalog
  |
  |--- PRD 11: Authentication & Security (can start after PRD 1, integrates with all)
```

PRDs 6-10 are independent of each other and can be parallelized. PRD 11 can begin any time after PRD 1 but should integrate after PRD 5.

---

## The 11 PRDs

---

### PRD 1: Backend Foundation & Infrastructure

**Phase**: Foundation
**Depends on**: Nothing
**Agents**: None (framework only)

**Scope**:
- Python project scaffolding (FastAPI + uv, project structure)
- Database setup (SQLAlchemy async + Alembic migrations)
- All core DB models: User, LearnerProfile, CourseInstance, Lesson, Activity, Assessment, Badge, AgentLog
- PydanticAI agent framework patterns:
  - `PipelineDeps` dataclass for shared dependency injection
  - Agent logging wrapper (captures prompt, output, timing, tokens, model metadata, status via `capture_run_messages` + `result.usage()` + `result.response.model_name`)
  - Output validation pattern (schema + `@output_validator` for business rules + `ModelRetry`)
  - `UsageLimits` configuration for retry caps
- API structure: routers, middleware, CORS, error handling
- Configuration system (model selection, rate limits, environment)
- Development environment (Docker Compose for DB, env template, dev server)
- Health check and status endpoints

**Key Decisions**:
- Database: PostgreSQL (production), SQLite (dev/test)
- ORM: SQLAlchemy async with SQLModel or raw SQLAlchemy
- Migration: Alembic
- Agent framework: PydanticAI with pydantic_graph for orchestration
- API protocol: REST + SSE for streaming

**Delivers**: A runnable backend with empty routers, seeded database, and reusable agent infrastructure. Can run `uv run uvicorn` and hit health endpoints.

**Size**: Medium (infrastructure-heavy, no business logic)

#### Verification

**Unit Tests**:
- DB model instantiation and field validation for all 8 entities
- Alembic migration up/down cycle (create tables, verify schema, rollback)
- `PipelineDeps` dataclass construction with mock DB session and logger
- Agent logging wrapper captures all required fields (prompt, output, timing, tokens, model, status) — use `TestModel` with a trivial agent
- Output validator pattern: verify `ModelRetry` raised with correct message on invalid input
- Configuration loading from env vars and defaults

**Integration Tests**:
- FastAPI TestClient (`httpx.AsyncClient`): health endpoint returns 200
- DB session lifecycle: create, read, update, delete a CourseInstance
- Alembic migrations apply cleanly to a fresh SQLite database

**E2E Tests**:
- Start the full server (`uv run uvicorn`), hit `/health` from an external `httpx` client
- Verify CORS headers on cross-origin request

**ADW Test** (`01_health_check.md`):
- Claude Code agent uses `agent-browser open http://localhost:5173` to verify the frontend loads
- Agent takes snapshot, verifies interactive elements are present (not an error page)
- Agent hits `http://localhost:8000/health` via `curl` to verify backend reachable
- Reports: app loads, backend healthy, CORS functional

---

### PRD 2: Course Generation Pipeline

**Phase**: Core Pipeline
**Depends on**: PRD 1
**Agents**: course_describer (A), lesson_planner (B), lesson_writer (C)

**Scope**:
- Pydantic I/O models for all 3 agents (from master PRD Section 7.2 A-C):
  - `CourseDescriptionOutput` (focusedObjective, courseDescription, personalizationRationale)
  - `LessonPlanOutput` (learningObjective, competency, enduringUnderstanding, essentialQuestions, assessmentProject, masteryCriteria, udlAccommodations, activities)
  - `LessonContentOutput` (lessonTitle, lessonBody, keyTakeaways, suggestedActivity)
- Agent implementations with:
  - System prompts (static for MVP, dynamic with profile later in PRD 6)
  - `output_type` set to the Pydantic models above
  - `@output_validator` for business rule validation (activity count 3-6, word count bounds, rubric-to-mastery mapping, essential question count 2-4, etc.)
  - `output_retries` configuration
- `pydantic_graph` orchestration:
  - `CourseGenerationState` dataclass (shared state across nodes)
  - `DescribeCourseNode` -> `PlanLessonNode` -> `WriteLessonNode` -> `End`
  - Loop over objectives: describe -> plan -> write per objective
  - Error handling: structured error on double validation failure
- Agent log recording at each step
- API endpoint: `POST /api/courses/generate` (accepts description + objectives, returns course)
- DB persistence: CourseInstance + Lessons created and stored

**Acceptance Criteria** (from master PRD):
- course_describer: 60-140 word description, focused on selected objective, 2-5 personalization rationale items
- lesson_planner: Valid lesson plan with 2-4 essential questions, 3-6 rubric checks, 3-6 activities, single assessment artifact, all alignment rules
- lesson_writer: Structured lesson body with required sections, 3-6 takeaways, valid suggested activity

**Delivers**: Hit the API with a course description + objectives, get back a fully generated course with lessons. Testable via curl/Postman.

**Size**: Large (3 agents, orchestration graph, extensive validation)

#### Verification

**Unit Tests — Agent I/O Models**:
- `CourseDescriptionOutput` rejects missing fields, wrong types, extra keys
- `LessonPlanOutput` validates: essentialQuestions length 2-4, rubricChecks length 3-6, activities length 3-6, webbDOK 1-4, bloomsLevel enum values
- `LessonContentOutput` validates: suggestedActivity.type enum, keyTakeaways non-empty

**Unit Tests — Output Validators**:
- course_describer validator: rejects description < 60 words or > 140 words (raises `ModelRetry`)
- lesson_planner validator: rejects if any activity has empty alignment arrays, if rubric checks don't map to assessment dimensions
- lesson_writer validator: rejects if lessonBody missing required sections (Objective, Why it matters, Steps, Example, Recap)

**Unit Tests — Agents (TestModel)**:
- Each agent produces valid output with `TestModel(custom_output_args={...})`
- Each agent correctly accesses `ctx.deps` (PipelineDeps with mock DB and logger)
- Agent with intentionally invalid `custom_output_args` triggers retry behavior

**Integration Tests — Graph Orchestration**:
- Run `CourseGenerationGraph` with all 3 agents overridden to `TestModel`
- Use `Graph.iter()` to verify node execution sequence: `DescribeCourse -> PlanLesson -> WriteLesson -> End`
- Verify shared state is correctly mutated at each step (description populated after node 1, plan after node 2, etc.)
- Inject a validation failure mid-graph using `GraphRun.next()` + state manipulation; verify retry branching

**Integration Tests — API**:
- `POST /api/courses/generate` with valid input returns 200 and valid course JSON (agents mocked)
- `POST /api/courses/generate` with empty objectives returns 422
- Verify CourseInstance and Lesson rows created in test DB after generation

**E2E Tests — Live LLM** (CI-gated, uses real API):
- Generate a course for "Introduction to Python" with 3 objectives using a live model
- Validate all 3 agents produce schema-valid output
- Verify word count bounds, activity counts, rubric alignment on real output
- Record token usage and latency for baseline metrics

**Evaluation Suite** (`pydantic_evals`):
- Dataset of 5 course topics (Python basics, cooking, photography, project management, music theory)
- Per-agent evaluators:
  - course_describer: `Contains(value=focused_objective)`, `LLMJudge(rubric="Description centers on the focused objective and mentions a concrete outcome")`
  - lesson_planner: Custom evaluator for activity-to-rubric traceability, `IsInstance` for output type
  - lesson_writer: `LLMJudge(rubric="Lesson has a clear learning arc with objective, explanation, worked example, and recap")`

**ADW Test** (`02_course_creation.md`):
- Agent navigates to the app, enters "Introduction to Python Programming" with 3 objectives
- Clicks Generate, waits for generation (re-snapshots periodically until lessons appear)
- Verifies: at least 3 lessons visible, each with title, structured content with headings
- Takes annotated screenshot of generated course for visual record
- Saves snapshot baseline for future structural diff comparisons

---

### PRD 3: Activity & Feedback System

**Phase**: Core Pipeline
**Depends on**: PRD 2
**Agents**: activity_creator (D), activity_reviewer (E)

**Scope**:
- Pydantic I/O models (from master PRD Section 7.2 D-E):
  - `ActivitySpecOutput` (activityId, activityType, instructions, prompt, submissionFormat, scoringRubric, hints)
  - `ActivityReviewOutput` (score, maxScore, rationale, strengths, improvements, tips, masteryDecision)
- activity_creator agent:
  - Converts lesson_writer's `suggestedActivity` into full activity spec
  - Rubric maps to mastery criteria
  - 2-5 hints that scaffold without giving answers
  - Image-specific requirements when applicable
- activity_reviewer agent:
  - Scores text submissions against rubric (0-100)
  - masteryDecision consistency: not_yet (0-69), meets (70-89), exceeds (90-100)
  - Rubric-referenced evaluation (at least 2 rubric items in rationale)
  - 2-5 strengths, 2-5 improvements, 2-6 tips
- Integration into course generation pipeline:
  - After lesson_writer, run activity_creator to produce the full activity
  - Store Activity entity linked to Lesson
- Submission handling:
  - `POST /api/activities/{id}/submit` (text submission for MVP, image later)
  - Run activity_reviewer on submission
  - Store submission + review results
- Lesson unlock logic:
  - On activity completion (any masteryDecision), unlock next lesson
  - Store attempt count and scores

**Delivers**: Submit an activity response, get scored feedback with strengths/improvements/tips. Next lesson unlocks.

**Size**: Medium (2 agents, simpler than PRD 2)

#### Verification

**Unit Tests — Agent I/O Models**:
- `ActivitySpecOutput` validates: activityType enum, submissionFormat coherence (short_response -> text:true/image:false), scoringRubric length 3-6, hints length 2-5
- `ActivityReviewOutput` validates: score 0-100, maxScore always 100, masteryDecision consistent with score ranges

**Unit Tests — Output Validators**:
- activity_creator validator: rejects if rubric items don't map to any mastery criteria item
- activity_reviewer validator: rejects if masteryDecision "meets" but score < 70 or > 89
- activity_reviewer validator: rejects if strengths or improvements arrays empty

**Unit Tests — Agents (TestModel)**:
- activity_creator with `TestModel(custom_output_args={...})` produces valid spec
- activity_reviewer with `FunctionModel` that returns controlled scores to test boundary conditions (69 -> not_yet, 70 -> meets, 90 -> exceeds)

**Integration Tests — Submission Flow**:
- `POST /api/activities/{id}/submit` with text body -> returns ActivityReviewOutput (agent mocked)
- Verify Activity row updated with submission content, score, attempt count
- Verify next Lesson's status changes from "locked" to "unlocked" after submission
- Submit to already-completed activity -> verify attempt count increments

**E2E Tests — Live LLM**:
- Generate a course (reuse PRD 2 E2E), then submit a thoughtful text response to the first activity
- Verify reviewer produces rubric-referenced feedback with correct masteryDecision
- Submit an obviously wrong/empty response -> verify score < 70, not_yet decision, actionable improvements

**Evaluation Suite**:
- Dataset of submission quality levels: excellent, adequate, poor, off-topic, empty
- activity_reviewer evaluators:
  - Custom: score within expected range per quality level
  - `LLMJudge(rubric="Feedback is specific, constructive, and references at least 2 rubric criteria")`

**ADW Test** (`04_activity_submission.md`):
- Agent navigates to a generated course's first lesson activity
- Reads the activity prompt and instructions via snapshot
- Types a thoughtful response relevant to the activity prompt
- Submits and waits for feedback to appear
- Verifies: score is displayed, feedback sections visible (strengths, improvements, tips)
- Verifies: feedback is substantive (not generic — agent reads the text and reasons about quality)
- Submits deliberately poor response on a second attempt, verifies lower score and not_yet decision
- Takes annotated screenshots at each step

---

### PRD 4: Course Progression Engine

**Phase**: Core Pipeline
**Depends on**: PRD 3
**Agents**: None (pure state management)

**Scope**:
- Course state machine implementation:
  - States: Draft, Generating, Active, InProgress, AwaitingAssessment, AssessmentReady, Completed, Archived
  - Valid transitions with guards
- Lesson state management:
  - locked / unlocked / completed per lesson
  - First lesson unlocked by default
  - Unlock rules: previous activity completed -> next lesson unlocked
- Progress tracking:
  - Lesson viewed timestamp
  - Activity submitted + score + feedback + attempt count
  - Course-level progress percentage
  - Time tracking per lesson/activity
- Course persistence:
  - Save/load/resume a course instance
  - List user's courses with progress summary
  - Delete a course instance
- API endpoints:
  - `GET /api/courses` (list user's courses)
  - `GET /api/courses/{id}` (full course with progress)
  - `GET /api/courses/{id}/progress` (progress summary)
  - `PATCH /api/courses/{id}/state` (state transitions)
  - `POST /api/lessons/{id}/viewed` (mark viewed)
- Content editing (v1 baseline):
  - `POST /api/lessons/{id}/regenerate` (re-run lesson_writer, limited attempts)
  - "More examples" / "Simpler explanation" variants

**Delivers**: Full lifecycle management — create, progress through, complete, and resume courses. All state tracked and queryable.

**Size**: Medium (no agents, but significant state logic)

#### Verification

**Unit Tests — State Machine**:
- All valid transitions succeed: Draft->Generating, Generating->Active, Active->InProgress, etc.
- All invalid transitions raise: Draft->Completed, Active->Draft, Completed->InProgress
- Guard conditions: can't transition to AwaitingAssessment unless all lessons completed

**Unit Tests — Lesson State**:
- First lesson starts unlocked, all others locked
- Completing activity N unlocks lesson N+1
- Completing activity on last lesson doesn't crash (no next lesson to unlock)
- Already-unlocked lesson stays unlocked on repeated activity submission

**Unit Tests — Progress Calculation**:
- 0 lessons completed = 0%
- 2 of 4 lessons completed = 50%
- All lessons completed = 100% (or adjusted if assessment counts)
- Progress includes attempt counts and scores

**Integration Tests — API**:
- `GET /api/courses` returns empty list for new user
- Generate a course -> `GET /api/courses` returns 1 course with progress 0%
- `POST /api/lessons/{id}/viewed` -> verify timestamp recorded
- `PATCH /api/courses/{id}/state` with invalid transition returns 409 Conflict
- `DELETE /api/courses/{id}` removes course and all associated lessons/activities
- Full progression: generate -> view lesson 1 -> submit activity 1 -> verify lesson 2 unlocked -> verify progress updated

**E2E Tests — Full Lifecycle (API)**:
- Create course -> progress through all lessons -> verify final progress 100%
- Resume course after simulated restart (new API client, same course ID)
- Regenerate a lesson (`POST /api/lessons/{id}/regenerate`) -> verify new content, same position in progression

**ADW Test** (`03_lesson_navigation.md` + `05_course_progression.md`):
- Agent opens a course, snapshots the left nav to verify lesson lock/unlock states
- Verifies: lesson 1 is navigable (unlocked), lessons 2+ show locked indicators
- Completes activity for lesson 1, re-snapshots, verifies lesson 2 now unlocked
- Navigates to lesson 2, verifies different content loaded
- Checks progress indicator updates (percentage or visual bar)
- Full lifecycle test: progresses through every lesson, verifying unlock cascade
- After final lesson, verifies course shows complete state

---

### PRD 5: API Integration & Frontend Migration

**Phase**: Integration (MVP Complete)
**Depends on**: PRDs 2, 3, 4
**Agents**: None (frontend work)

**Scope**:
- Replace `GenAIService.ts` with API client module:
  - Course generation -> `POST /api/courses/generate`
  - Activity submission -> `POST /api/activities/{id}/submit`
  - Course CRUD -> REST endpoints from PRD 4
- SSE streaming for course generation:
  - Backend: SSE endpoint that streams generation progress (which agent is running, partial results)
  - Frontend: EventSource client that updates UI progressively as lessons generate
  - Pattern: Use `AGUIAdapter.dispatch_request()` or manual `run_stream` + `StreamingResponse(media_type="text/event-stream")`
- Zustand store migration:
  - Remove localStorage-only patterns
  - Add API-backed state management
  - Maintain optimistic UI where appropriate
  - Keep local cache for offline-friendly reads
- Error handling:
  - Generation failure -> "Retry generation" button
  - Submission failure -> retry with backoff
  - Network errors -> graceful degradation
- Loading states:
  - Skeleton screens during generation
  - Progress indicator showing which lesson is generating
  - Activity submission pending state
- Minimal backend changes:
  - CORS configuration for frontend origin
  - SSE endpoint wrapper around pydantic_graph execution

**Delivers**: The existing React UI works end-to-end with the Python backend. A user can create a course, read lessons, submit activities, get feedback, and progress through to completion. **This is the MVP.**

**Size**: Medium (no new features, pure integration)

#### Verification

**Unit Tests — Frontend**:
- API client module: mock `fetch`, verify correct URLs, headers, body serialization
- Zustand store: verify state transitions on API response (loading -> success, loading -> error)
- SSE client: mock EventSource, verify progressive state updates

**Integration Tests — Backend SSE**:
- `httpx` client connects to SSE endpoint, receives events as course generates (agents mocked)
- Verify event format: `data: {"agent": "lesson_planner", "lesson": 1, "status": "complete"}\n\n`
- Verify SSE stream terminates cleanly on generation completion

**ADW Test — MVP Happy Path** (`05_course_progression.md`):
- Full ADW covering the complete MVP user journey in one autonomous run:
  1. Agent opens `http://localhost:5173`, snapshots to orient
  2. Enters course description + objectives, clicks Generate
  3. Waits for generation (monitors SSE progress indicators via re-snapshots)
  4. Reads lesson 1 content, verifies structure (headings, examples, Markdown rendered)
  5. Navigates to activity, reads prompt, writes and submits a response
  6. Verifies feedback appears with score, strengths, improvements
  7. Verifies lesson 2 unlocks in nav
  8. Navigates to lesson 2, verifies different content
  9. Takes annotated screenshots at each step
  10. Reports pass/fail for each checkpoint with reasoning
- This is the most critical ADW — it validates the entire MVP works end-to-end

**ADW Test — Error Recovery**:
- Separate agent test where backend is intentionally stopped mid-generation
- Agent verifies error message appears, retries, confirms recovery after backend restart

**ADW Test — Course Persistence**:
- Agent creates and partially completes a course
- Agent reloads the page (`agent-browser open` again)
- Verifies course list shows the course with correct progress
- Resumes the course, verifies correct lesson is active

---

### PRD 6: Learner Profile & Personalization

**Phase**: Enhancement
**Depends on**: PRD 5 (MVP)
**Agents**: None new (modifies all existing agents' system prompts)

**Scope**:
- Learner Profile schema (from master PRD Section 4.3):
  - displayName, learningGoals[], interests[], experienceLevel, preferredLearningStyle, udlPreferences (Engagement/Representation/Action-Expression), constraints, badgeInventory[], courseHistory[], skillSignals[], tonePreference
  - Profile versioning with change history
  - updateSource tracking (setup_course, activity_signal, user_edit)
- Setup Course flow:
  - First-time user -> automatic enrollment in Setup Course
  - Setup Course teaches: how lessons/activities work, how personalization works, what agent log is
  - Collects signals: learning goals, experience level, preferences, accessibility needs, interests, preferred response modality
  - Completion generates initial Learner Profile draft
  - User reviews and edits profile before proceeding
- Continuous profile updates:
  - After each activity review: update skillSignals based on score/feedback
  - After course completion: update courseHistory, experienceLevel
  - System-generated updates visible to user ("Updated based on your last activity")
- Dynamic system prompt injection:
  - Convert all agents from static to dynamic prompts using `@agent.instructions` (not `@agent.system_prompt` — instructions are re-evaluated on every run including when message_history is passed)
  - Inject relevant profile signals into each agent's context
  - course_describer uses interests + experience for personalization rationale
  - lesson_writer adapts examples/difficulty to profile
  - activity_creator/reviewer factor in modality preferences
- Profile UI:
  - View/edit profile screen
  - Change history display
  - Badge inventory display
- API endpoints:
  - `GET /api/profile` (current profile)
  - `PATCH /api/profile` (user edit)
  - `GET /api/profile/history` (change log)

**Delivers**: Personalized learning experience that adapts to the learner across all agent outputs.

**Size**: Large (touches every agent, significant UI, new flow)

#### Verification

**Unit Tests — Profile Model**:
- LearnerProfile validates all field types, enums, nested structures
- Profile versioning: update creates new version, old version preserved
- updateSource correctly tagged (setup_course, activity_signal, user_edit)

**Unit Tests — Dynamic Prompts**:
- Each agent's `@agent.instructions` function returns string containing profile signals
- With "beginner" profile: verify prompt includes simplified language markers
- With "advanced" profile: verify prompt includes depth/complexity markers
- With UDL preferences: verify prompt includes accessibility accommodations

**Unit Tests — Profile Update Logic**:
- After activity score < 70: skillSignals updated with gap
- After activity score > 90: skillSignals updated with strength
- After course completion: courseHistory appended, experienceLevel adjusted

**Integration Tests — API**:
- `GET /api/profile` returns default profile for new user
- `PATCH /api/profile` updates fields and creates history entry
- `GET /api/profile/history` returns ordered change log
- Complete Setup Course -> verify profile populated with collected signals

**Integration Tests — Personalization Impact**:
- Generate same course with "beginner" vs "advanced" profile (agents mocked with `FunctionModel`)
- Verify `FunctionModel` receives different system prompts based on profile

**ADW Test** (`06_profile_editing.md`):
- Agent opens app as a "new user" (clean state)
- Verifies redirect to Setup Course onboarding flow
- Completes onboarding: answers learning goals, experience level, preferences
- Waits for profile to be generated, reviews it
- Edits a field (changes an interest), saves
- Navigates to course catalog, creates a new course
- Semantically verifies: does the generated course description reference the interest from the profile? (AI reasoning, not string matching)
- Returns to profile, makes 2 more edits, navigates to history page
- Verifies: 3 change entries visible with timestamps
- Takes annotated screenshots of profile view and history

---

### PRD 7: Visual Aid System

**Phase**: Enhancement
**Depends on**: PRD 6 (needs profile for accessibility-aware visuals)
**Agents**: visual_aid_sniffer (F), visual_aid_creator (G)

**Scope**:
- Pydantic I/O models (from master PRD Section 7.2 F-G):
  - `VisualAidAssessment` (needsVisualAids, visualAids[{title, description, placementHint}])
  - `VisualAidAsset` (assetType: svg|png|mermaid, asset, altText)
- visual_aid_sniffer agent:
  - Analyzes lesson body + UDL accommodations + learner profile
  - Determines if informative (not decorative) graphics are needed
  - If yes: 1-4 visual aid specs with placement hints referencing lesson headings
  - UDL + learner profile grounded decisions
- visual_aid_creator agent:
  - Generates SVG or Mermaid (preferred) or PNG (exception)
  - Self-contained assets, no external dependencies
  - 1-3 sentence meaningful alt text
  - Accessibility-aware: simplified layout, clear labels for learners with needs
- Pipeline integration:
  - After lesson_writer, run visual_aid_sniffer
  - If visuals needed, run visual_aid_creator for each
  - Insert `{{VISUAL_AID:<id>}}` placeholders into lesson body
- Frontend rendering:
  - Mermaid.js renderer for mermaid assets
  - Inline SVG for svg assets
  - Image tag with alt text for png assets
  - Placeholder replacement in Markdown rendering pipeline

**Delivers**: Lessons enriched with generated diagrams, flowcharts, and visual aids with proper alt text.

**Size**: Medium (2 agents, rendering integration)

#### Verification

**Unit Tests — Agent I/O Models**:
- `VisualAidAssessment`: if needsVisualAids="no" then visualAids must be empty array
- `VisualAidAssessment`: if needsVisualAids="yes" then visualAids length 1-4
- `VisualAidAsset`: assetType enum validation, altText 1-3 sentences

**Unit Tests — Output Validators**:
- Sniffer: rejects if placementHint doesn't reference a recognizable heading/section
- Creator: rejects if assetType="mermaid" but asset is invalid Mermaid syntax (basic regex/parse check)
- Creator: rejects if assetType="svg" but asset is not valid XML

**Unit Tests — Agents (TestModel)**:
- Sniffer with lesson body containing a complex process -> returns needsVisualAids="yes"
- Creator with `custom_output_args` containing valid Mermaid -> validates correctly

**Integration Tests — Pipeline**:
- Run full generation pipeline with visual aid nodes included (agents mocked)
- Verify lesson body contains `{{VISUAL_AID:<id>}}` placeholders after pipeline completes
- Verify VisualAid DB records created and linked to lesson

**E2E Tests — Live LLM**:
- Generate a course on a visual topic (e.g., "Data Structures") -> verify sniffer returns "yes" for at least one lesson
- Verify generated Mermaid/SVG assets render without errors in a test harness
- Verify alt text is meaningful (not "image of..." or empty)

**ADW Test** (integrated into `02_course_creation.md` extension):
- After course generation, agent navigates through each lesson
- Snapshots each lesson page, looks for visual aid elements (SVG, Mermaid diagrams)
- For lessons with visuals: verifies the diagram is visible (not broken image placeholder)
- Uses `agent-browser get attr` to check alt text is present and meaningful (not empty or "image")
- Runs `agent-browser snapshot` (full accessibility tree) to verify alt text is in the a11y tree
- Takes annotated screenshots of lessons with visual aids for visual record
- Structural diff: compares lesson with visual aids against baseline

---

### PRD 8: Assessment & Course Completion

**Phase**: Enhancement
**Depends on**: PRD 5 (MVP)
**Agents**: assessment_creator (H), assessment_reviewer (I)

**Scope**:
- Pydantic I/O models (from master PRD Section 7.2 H-I):
  - `AssessmentSpecOutput` (assessmentTitle, items[{objective, type, prompt, rubric}], submissionRules)
  - `AssessmentReviewOutput` (overallScore, maxScore, objectiveScores[{objective, score, maxScore, feedback}], passDecision, nextSteps)
- assessment_creator agent:
  - Generated after all lessons complete (triggers on AwaitingAssessment state)
  - Covers 100% of learning objectives
  - Items capped at min(objectives.length, 6)
  - Uses activity reviewer signals (gaps, strengths) to target weak areas
  - 3-6 gradeable rubric criteria per item
- assessment_reviewer agent:
  - Scores each objective independently (0-100)
  - passDecision: pass (70-100) / fail (0-69)
  - Rubric-referenced evaluation
  - Actionable next steps for any objective < 70
- Course completion flow:
  - All lessons complete -> state: AwaitingAssessment
  - assessment_creator runs -> state: AssessmentReady
  - User submits assessment -> assessment_reviewer scores
  - If pass: state: Completed, award badge
  - If fail: show next steps, allow retry
- Badge system:
  - Badge entity (type, awardedAt, courseInstanceId)
  - Badge added to user profile on course completion
  - Badge display in profile and course overview
- API endpoints:
  - `POST /api/courses/{id}/assessment/generate`
  - `POST /api/courses/{id}/assessment/submit`
  - `GET /api/courses/{id}/assessment`
  - `GET /api/badges`
- Assessment UI:
  - Assessment screen with items
  - Per-item submission (text and/or image)
  - Results screen with per-objective scores and feedback
  - Badge award animation

**Delivers**: Full course completion with summative assessment, per-objective scoring, and badge awards.

**Size**: Large (2 agents, completion flow, badge system, significant UI)

#### Verification

**Unit Tests — Agent I/O Models**:
- `AssessmentSpecOutput`: items count = min(objectives.length, 6), all objectives covered
- `AssessmentReviewOutput`: overallScore 0-100, passDecision consistent (pass=70-100, fail=0-69)
- `AssessmentReviewOutput`: objectiveScores covers every objective in spec

**Unit Tests — Output Validators**:
- assessment_creator: rejects if an objective from input is missing from items
- assessment_creator: rejects if items > 6
- assessment_reviewer: rejects if passDecision "pass" but overallScore < 70
- assessment_reviewer: rejects if weak objective (score < 70) has no corresponding nextStep

**Unit Tests — Badge Logic**:
- Pass assessment -> badge created with correct type and timestamp
- Fail assessment -> no badge created
- Badge appears in user's badgeInventory after creation

**Integration Tests — Completion Flow**:
- Complete all lessons -> `POST /api/courses/{id}/assessment/generate` -> verify assessment stored (agents mocked)
- `POST /api/courses/{id}/assessment/submit` -> verify review stored, badge created (if pass)
- Attempt assessment generation when lessons not complete -> returns 409
- Course state transitions: InProgress -> AwaitingAssessment -> AssessmentReady -> Completed

**E2E Tests — Live LLM**:
- Full course lifecycle: generate -> complete all activities -> generate assessment -> verify all objectives covered
- Submit thoughtful assessment responses -> verify pass with score > 70 and badge awarded
- Submit weak responses -> verify fail with actionable next steps per weak objective

**ADW Test** (`07_assessment_flow.md`):
- Agent completes all lessons in a pre-generated course (or generates fresh)
- Verifies: assessment section/button appears after final lesson completed
- Generates assessment, waits for it to load
- Reads each assessment item, writes substantive responses to each
- Submits assessment, waits for results
- Verifies: results screen shows per-objective scores with visual indicators
- Verifies: overall score and pass/fail decision visible
- If pass: looks for badge display (in results and in profile page)
- If fail: verifies retry option and actionable next steps displayed
- Semantic check: are the next steps relevant to the weak objectives? (AI reasoning)
- Annotated screenshots of assessment, results, and badge

---

### PRD 9: Agent Log & Transparency UI

**Phase**: Polish
**Depends on**: PRD 5 (MVP, backend logging already exists)
**Agents**: None (UI only, backend logging from PRD 1)

**Scope**:
- Agent Log UI:
  - Developer-tool aesthetic: structured, scannable, collapsible sections
  - Per course, per lesson/activity/assessment filtering
  - For each log entry display:
    - Agent name
    - Prompt sent (monospace, collapsible)
    - Output returned (monospace, collapsible, JSON formatted)
    - Timestamps (start, end)
    - Duration
    - Model name and version
    - Token usage (input/output)
    - Status (success/error/retry)
    - Validation errors (if any retries occurred)
  - Filtering: by agent name, by lesson, by status, date range
  - Search within prompts/outputs
- Sensitive data redaction:
  - Strip access tokens, passwords from displayed logs
  - PII masking (configurable policy)
  - Redaction applied at display time, raw stored for admin audit
- API endpoints:
  - `GET /api/courses/{id}/logs` (with filter params)
  - `GET /api/logs/{id}` (single log detail)

**Delivers**: Full transparency — users can inspect exactly what each agent was asked and what it produced.

**Size**: Small-Medium (UI-focused, backend already done)

#### Verification

**Unit Tests — Redaction**:
- Redaction function strips API keys, tokens, password patterns from text
- Redaction preserves non-sensitive content unchanged
- PII masking applies to email patterns when policy enabled

**Integration Tests — API**:
- Generate a course -> `GET /api/courses/{id}/logs` returns log entries for all agent runs
- Filter by agent name -> only matching entries returned
- Filter by status "error" -> only error entries returned
- Single log detail includes all required fields (prompt, output, timestamps, model, tokens, duration)

**ADW Test** (`08_agent_log_viewer.md`):
- Agent navigates to Agent Log page for a generated course
- Snapshots to verify log entries are listed (agent names, timestamps visible)
- Expands a log entry by clicking, verifies prompt and output sections appear
- Reads the displayed prompt text — verifies it's plausible (not empty, not garbled)
- Uses agent-browser filter controls to filter by "lesson_planner"
- Re-snapshots, verifies only lesson_planner entries remain
- **Security check**: agent reads all visible text on the page, confirms no API keys, tokens, or credentials are displayed
- Collapses sections, verifies they collapse correctly (re-snapshot)
- Annotated screenshot of expanded log entry

---

### PRD 10: Course Discovery & Predefined Courses

**Phase**: Polish
**Depends on**: PRD 5 (MVP)
**Agents**: None

**Scope**:
- Predefined course system:
  - Course JSON schema: `{courseId, version, name, description, learningObjectives[], tags[], estimatedHours}`
  - Load from `/app/courses/<course_id>/course.json`
  - Version tracking for predefined courses
  - Admin can update course JSON and increment version
- Course catalog UI:
  - Browse predefined courses with descriptions, tags, estimated time
  - Search and filter by tag/topic
  - "Start Course" triggers generation pipeline with predefined data + learner profile
- Custom course creation flow:
  - Input: brief description + learning objectives
  - Validation: non-empty, reasonable objective count
  - Preview before generation
  - Stores user input in CourseInstance (sourceType: user_created)
- Course cards:
  - Show progress for in-progress courses
  - Completed indicator + badge for finished courses
  - Resume vs. start new distinction
- API endpoints:
  - `GET /api/catalog` (predefined courses)
  - `GET /api/catalog/{id}` (single predefined course detail)
  - `POST /api/courses/create` (from user input, separate from generate)

**Delivers**: Users can browse a catalog and pick courses, or create their own from scratch.

**Size**: Medium (no agents, significant UI)

#### Verification

**Unit Tests — Course JSON Loader**:
- Valid course.json loads and validates against schema
- Invalid JSON (missing objectives, wrong types) raises validation error
- Version field is present and parsed correctly

**Integration Tests — API**:
- Seed 3 predefined courses -> `GET /api/catalog` returns all 3
- `GET /api/catalog/{id}` returns full course detail
- Filter by tag -> only matching courses returned
- `POST /api/courses/create` with valid input -> creates CourseInstance with sourceType "user_created"
- `POST /api/courses/create` with empty description -> returns 422

**ADW Test** (`09_course_catalog.md`):
- Agent navigates to course catalog page
- Snapshots, verifies predefined courses displayed with names, descriptions, tags
- Uses agent-browser to search for a course by keyword (fill search input, submit)
- Verifies filtered results make sense (semantic — do the results match the search term?)
- Clicks "Start Course" on a predefined course, verifies generation begins (progress indicator)
- Navigates back, creates a custom course via the custom creation flow
- Verifies preview screen shows before generation
- Navigates to course list, verifies in-progress courses show progress indicators
- Verifies completed courses show badge indicators (if any completed courses exist)
- Annotated screenshots of catalog, search results, and course cards

---

### PRD 11: Authentication & Security

**Phase**: Production
**Depends on**: PRD 1 (can develop in parallel, integrate after PRD 5)
**Agents**: None

**Scope**:
- Authentication:
  - Email/password registration and login
  - OAuth option (Google, optional)
  - Session management with secure tokens (httpOnly cookies or JWT)
  - Session persistence across app restarts
  - Logout
- User management:
  - User entity already in DB from PRD 1
  - Link all entities (CourseInstance, LearnerProfile, etc.) to authenticated user
  - Multi-user data isolation
- Security:
  - Encrypt sensitive fields at rest (profile, submissions)
  - Image uploads to secure object storage with expiring signed URLs
  - No raw auth tokens in localStorage
  - CSRF protection
  - Rate limiting per user
- Agent Log redaction:
  - Remove access tokens, passwords from stored logs
  - Optional PII masking per policy
- Data privacy:
  - "Delete my data" endpoint: removes user profile + generated content + uploads
  - Minimal audit retention if legally required
- API key management:
  - Server-side LLM API key management (no more client-side Gemini key)
  - Per-user usage tracking and limits
- API endpoints:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `DELETE /api/auth/account` (delete my data)

**Delivers**: Production-ready multi-user system with proper auth, encryption, and data privacy.

**Size**: Large (cross-cutting, touches all endpoints)

#### Verification

**Unit Tests — Auth Logic**:
- Password hashing: verify hash differs from plaintext, verify correct password matches
- Token generation: verify JWT contains expected claims (user_id, exp)
- Token validation: expired token rejected, tampered token rejected
- Rate limiter: verify request blocked after threshold

**Unit Tests — Data Isolation**:
- User A's courses not returned in User B's course list query
- User A cannot access User B's activity submissions

**Integration Tests — API**:
- Register new user -> login -> verify session token returned
- Access protected endpoint without token -> 401
- Access protected endpoint with valid token -> 200
- Logout -> verify token invalidated
- `DELETE /api/auth/account` -> verify all user data removed (courses, profile, activities, logs)
- Register with duplicate email -> 409

**Integration Tests — Security**:
- CORS: request from allowed origin -> passes, disallowed origin -> blocked
- CSRF: POST without CSRF token -> 403 (if CSRF enabled)
- Rate limit: send N+1 requests within window -> last request returns 429

**ADW Test — Auth Flow** (`10_auth_flow.md`):
- Agent opens app, verifies redirect to login/register page
- Fills registration form (email, password), submits
- Verifies redirect to Setup Course or main app
- Logs out, verifies redirect to login
- Logs back in with same credentials, verifies courses are persisted
- Annotated screenshots at each auth step

**ADW Test — Multi-User Isolation** (`11_multi_user.md`):
- Uses agent-browser sessions to simulate two users:
  ```
  agent-browser --session user-a open http://localhost:5173
  # Register User A, create a course
  agent-browser --session user-b open http://localhost:5173
  # Register User B, verify empty course list
  ```
- Verifies: User B cannot see User A's courses
- Verifies: User B's profile is independent of User A's

**ADW Test — Security Audit** (`12_security_audit.md` — specialized prompt):
- Agent checks localStorage/sessionStorage via `agent-browser storage local` for API keys or tokens
- Agent inspects cookies via `agent-browser cookies` for httpOnly/Secure flags
- Agent attempts XSS: enters `<script>alert('xss')</script>` as course description, verifies it renders as escaped text (not executing)
- Agent reads console messages via `agent-browser console` for any leaked credentials
- Reports security findings with severity ratings

**ADW Test — Accessibility Audit** (`12_accessibility.md`):
- Agent navigates through key pages (catalog, course view, activity, profile)
- On each page: runs `agent-browser snapshot` (full accessibility tree, not just interactive)
- Reasons about the accessibility tree: proper heading hierarchy? Form labels present? ARIA roles correct?
- Verifies: all interactive elements have accessible names (visible in snapshot refs)
- Verifies: visual aids have alt text (checks @e refs for images/SVGs)
- Verifies: focus order makes sense (tab through using `agent-browser press Tab` repeatedly, check focus moves logically)
- This is where the ADW pattern truly shines — the snapshot IS the accessibility tree

---

## Agent Coverage Summary

| Agent | PRD | Phase |
|-------|-----|-------|
| course_describer (A) | PRD 2 | Core Pipeline |
| lesson_planner (B) | PRD 2 | Core Pipeline |
| lesson_writer (C) | PRD 2 | Core Pipeline |
| activity_creator (D) | PRD 3 | Core Pipeline |
| activity_reviewer (E) | PRD 3 | Core Pipeline |
| visual_aid_sniffer (F) | PRD 7 | Enhancement |
| visual_aid_creator (G) | PRD 7 | Enhancement |
| assessment_creator (H) | PRD 8 | Enhancement |
| assessment_reviewer (I) | PRD 8 | Enhancement |

MVP ships with 5 of 9 agents (A-E). The remaining 4 agents (F-I) are in PRDs 7-8.

## Key Architectural Decisions

**Backend**: Python + FastAPI + PydanticAI. The current React frontend is preserved; the migration replaces client-side Gemini calls with server API calls.

**Orchestration**: `pydantic_graph` finite state machine. Each agent is a node with typed edges. Shared state passes structured data between nodes. State persistence enables crash recovery for long-running generation.

**Agent pattern**: Each agent is a PydanticAI `Agent` with `output_type` set to a strict Pydantic model, `@output_validator` for business rules, and `@agent.instructions` for dynamic personalization. Shared `PipelineDeps` provides DB, logger, and profile access.

**Logging**: Every agent run records prompt, output, timing, tokens, model, status to AgentLog. Uses `capture_run_messages` to capture data even on failure. UI for viewing comes in PRD 9; the recording infrastructure is in PRD 1.

**Frontend strategy**: Keep the existing React 19 + Vite + Tailwind + Shadcn stack. Swap the data layer (GenAIService -> API client, localStorage -> API-backed Zustand). Add SSE streaming for generation progress.

**Auth strategy**: Deferred to PRD 11. During development (PRDs 1-10), the system operates in single-user mode with a stubbed user. Auth wraps around everything at the end.

**Testing strategy**: Every agent is tested at 3 levels: (1) unit with `TestModel`/`FunctionModel`, (2) integration with mocked agents in graph, (3) E2E with live LLM. Browser E2E tests use **AI Developer Workflows (ADWs)** — Claude Code agents in headless mode (`-p` flag) that navigate the real UI via `agent-browser`, reason about what they see, and make semantic assertions. This replaces brittle scripted Playwright tests with intelligent, self-recovering test agents. `pydantic_evals` datasets provide regression suites for agent quality. ADW test prompts are stored as `.md` files and orchestrated by a Python runner.

## What's NOT in These PRDs (Future / v2)

Per the master PRD's "Non-goals (v1)" and "Iteration Notes":
- Real-time collaboration / multi-learner classrooms
- Marketplace / payment for courses
- External LMS gradebook sync
- Drag/drop lesson authoring studio
- Adaptive sequencing based on performance
- Remediation micro-lessons
- Agent runtime service layer / job queueing
- Open source packaging and contributor docs
- Provider abstraction for model vendor independence
- Analytics dashboards and drift detection
