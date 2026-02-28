# Tech Debt and Deferred Decisions

Tracked shortcuts, known gaps, and decisions to revisit.

---

## Architectural TODOs

### Migrate agents to PydanticAI `deps` + `@agent.system_prompt` decorator
Currently, learner profile and other dynamic context are injected into the user prompt as a
formatted string. PydanticAI supports a `deps` parameter and `@agent.system_prompt` decorator
that would move profile data into the system prompt (higher instruction-following weight) and
set us up for tool use (tools receive `deps` as context).

**Why deferred:** The current approach works and is simpler. We'll need `deps` when we add tool
use, so this is a natural refactor at that point.

### Make assessment generation async
The architecture doc says all long-running LLM workflows should use the async background task
pattern (return immediately, stream progress). Assessment generation currently blocks the HTTP
request for a single agent call (~5-10s).

**Why deferred:** It's one LLM call today, so the latency is tolerable. But the pattern should
be consistent, and assessment generation may grow (verification steps, multi-call pipelines).
Apply the same async pattern as course generation.

### Store full lesson plan metadata on Lesson record
The lesson planner returns a `LessonPlanOutput` with `lesson_title`, `key_concepts`,
`lesson_outline`, `mastery_criteria`, and `suggested_activity`. Currently only the written
`lesson_content` (from the writer) is stored on the Lesson record. The plan output is used to
drive downstream agents and then discarded.

**What to store:** Add a `lesson_plan` JSONB column to the Lesson model containing the full plan
output. At minimum, `lesson_title` should be a first-class column — it's needed for UI navigation
and richer SSE catchup events.

**Why deferred:** The generation pipeline works end-to-end without it. This is a data model
migration + generation code change.

### Add `activity_type` to `activity_created` SSE event
The `activity_created` SSE broadcast currently only includes `objective_index` and `activity_id`.
The API contract specifies an `activity_type` field. The data is available from the
`ActivitySpecOutput` — just needs to be included in the broadcast.

---

## Decisions to Revisit

### Silent transition error swallowing
In several places (activity submission, assessment submission), automatic state transitions are
wrapped in bare `except Exception: pass`. The rationale: the primary operation (grading) succeeded,
so don't fail the request over a side-effect transition. The user can manually advance via
`PATCH /courses/{id}/state`.

**Risk:** Courses can get stuck in intermediate states with no error surfaced to the user.
**Consider:** At minimum, log a warning. Possibly surface a `"warnings"` field in the response
so the client knows a transition was skipped.

### Submissions JSONB default inconsistency
Activity submissions default to `[]` (empty list). Assessment submissions default to `None`
(nullable). These should be consistent — either both default to `[]` or both are nullable.

---

## Infrastructure Gaps

### No startup sweep for stuck `generating` courses
If the server crashes during generation, courses are left in `generating` state permanently.
There is no lifespan hook to detect and transition these to `generation_failed` on startup.

### Predefined course JSON uses camelCase
Catalog JSON files follow frontend camelCase conventions (`courseId`, `learningObjectives`,
`estimatedHours`). The catalog loader manually maps these to snake_case. If we rebuild the catalog,
consider using snake_case natively or adding a Pydantic model with aliases.
