---
title: "PRD 9 — Agent Log & Transparency UI"
project: 1111 School
prd_number: 9
phase: Polish
depends_on:
  - PRD 5 (MVP — API Integration & Frontend Migration)
  - PRD 1 (Backend Foundation — AgentLog model & recording infrastructure)
agents: none
size: Small-Medium
status: draft
created: 2026-02-24
---

# PRD 9 — Agent Log & Transparency UI

## Overview

The 1111 School platform uses 9 AI agents to generate courses, create activities, score submissions, build assessments, and produce visual aids. Every agent run is already logged to the `AgentLog` database table (established in PRD 1). This PRD delivers the **user-facing transparency layer**: a read-only log viewer that lets users inspect exactly what each agent was asked and what it produced.

The Agent Log Viewer follows a **developer-tool aesthetic** — structured, scannable, collapsible — because the audience is learners who want to understand the AI behind their learning experience. The Setup Course (PRD 6) teaches users what the agent log is and why it exists; this PRD delivers the UI they were told about.

Sensitive data (API keys, tokens, passwords, PII) must never be visible in the log viewer. Redaction is applied **at display time** on the API response layer, preserving raw data in the database for admin audit purposes.

---

## Goals

1. **Full transparency**: Users can see every prompt sent to every agent and every output returned, for any course they own.
2. **Scannable at a glance**: Log entries are compact by default (agent name, status, duration, timestamp) with expandable detail sections.
3. **Filterable and searchable**: Users can narrow logs by agent name, lesson/activity/assessment, status, and date range, and search within prompt/output text.
4. **Secure by default**: No API keys, access tokens, passwords, or PII are ever displayed. Redaction is reliable, tested, and configurable.
5. **Zero new backend logging work**: This PRD adds only read endpoints and display-time redaction. The `AgentLog` recording infrastructure from PRD 1 is used as-is.

---

## Non-Goals

- **Modifying or replaying agent runs** — the log viewer is read-only. Replay/re-run functionality is a future concern.
- **Real-time streaming of logs** — logs are viewed after-the-fact, not live-streamed during generation. Users watch generation progress via the SSE streaming UI (PRD 5).
- **Admin-level audit UI** — this PRD serves the learner. A separate admin dashboard with unredacted access is out of scope.
- **Log retention policies or archival** — storage management is a production concern for later.
- **Analytics or aggregation** — no dashboards, charts, or statistical views of agent performance. Raw log inspection only.
- **Agent Log recording changes** — the `AgentLog` model and the recording wrapper are PRD 1 deliverables. This PRD consumes them.

---

## Scope

### What Ships

| Component | Description |
|-----------|-------------|
| **API: Log list endpoint** | `GET /api/courses/{id}/logs` with filter query parameters |
| **API: Log detail endpoint** | `GET /api/logs/{id}` returning full log entry with all fields |
| **Redaction layer** | Server-side function that strips sensitive patterns before API response |
| **Log Viewer page** | React page accessible from course detail view |
| **Log entry cards** | Compact summary cards with expandable prompt/output sections |
| **Filter controls** | Agent name, lesson/activity/assessment, status, date range pickers |
| **Text search** | Search within prompt and output text across log entries |
| **Unit tests** | Redaction function coverage |
| **Integration tests** | API endpoint tests with filter combinations |
| **ADW test** | `08_agent_log_viewer.md` browser automation test |

### What Already Exists (from PRD 1)

- `AgentLog` SQLAlchemy model with all fields (id, userId, courseInstanceId, lessonId, activityId, assessmentId, agentName, prompt, output, status, startedAt, completedAt, durationMs, modelName, modelVersion, inputTokens, outputTokens, validationErrors, redactionFlags)
- Agent logging wrapper that records every agent run using `capture_run_messages()`, `result.usage()`, and `result.response.model_name`
- Database table with populated data from all agent runs across PRDs 2-8

---

## Technical Design

### Log Display

#### Data Model (PRD 1 Reference)

The `AgentLog` model from PRD 1 provides these fields for display:

```python
class AgentLog(Base):
    __tablename__ = "agent_logs"

    id: Mapped[uuid.UUID]
    user_id: Mapped[uuid.UUID]                    # FK -> users
    course_instance_id: Mapped[uuid.UUID]          # FK -> course_instances
    lesson_id: Mapped[uuid.UUID | None]            # nullable
    activity_id: Mapped[uuid.UUID | None]          # nullable
    assessment_id: Mapped[uuid.UUID | None]        # nullable
    agent_name: Mapped[str]                        # e.g., "course_describer", "lesson_planner"
    prompt: Mapped[str]                            # full prompt text (system + user messages)
    output: Mapped[str]                            # raw agent output (JSON string)
    status: Mapped[str]                            # "success" | "error" | "retry"
    started_at: Mapped[datetime]
    completed_at: Mapped[datetime | None]
    duration_ms: Mapped[int | None]
    model_name: Mapped[str]                        # e.g., "gpt-4o", "claude-sonnet-4-20250514"
    model_version: Mapped[str | None]              # provider-specific version string
    input_tokens: Mapped[int | None]
    output_tokens: Mapped[int | None]
    validation_errors: Mapped[str | None]          # JSON array of retry error messages
    redaction_flags: Mapped[str | None]            # JSON object of applied redaction policies
```

#### API Response Schemas

```python
from pydantic import BaseModel
from datetime import datetime

class AgentLogSummary(BaseModel):
    """Compact representation for log list view."""
    id: str
    agent_name: str
    status: str                          # "success" | "error" | "retry"
    started_at: datetime
    duration_ms: int | None
    model_name: str
    input_tokens: int | None
    output_tokens: int | None
    lesson_id: str | None
    activity_id: str | None
    assessment_id: str | None
    has_validation_errors: bool          # derived from validation_errors != null

class AgentLogDetail(BaseModel):
    """Full representation for single log view."""
    id: str
    agent_name: str
    prompt: str                          # redacted
    output: str                          # redacted, JSON-formatted
    status: str
    started_at: datetime
    completed_at: datetime | None
    duration_ms: int | None
    model_name: str
    model_version: str | None
    input_tokens: int | None
    output_tokens: int | None
    validation_errors: list[str] | None  # parsed from JSON
    lesson_id: str | None
    activity_id: str | None
    assessment_id: str | None
    redaction_applied: list[str]         # list of redaction rules that fired

class AgentLogListResponse(BaseModel):
    """Paginated list of log summaries."""
    items: list[AgentLogSummary]
    total: int
    page: int
    page_size: int
```

### Redaction

Redaction is applied **server-side in the API layer**, between database read and response serialization. Raw data is never modified in the database.

#### Redaction Architecture

```
Database (raw) -> SQLAlchemy query -> Redaction Layer -> Pydantic serialization -> JSON response
```

#### Redaction Rules

The redaction engine applies an ordered list of pattern-based rules to the `prompt` and `output` fields. Each rule produces a `redaction_applied` entry so the UI can indicate that redaction occurred.

| Rule ID | Pattern | Replacement | Description |
|---------|---------|-------------|-------------|
| `api_key` | `(sk-[a-zA-Z0-9]{20,})` | `[REDACTED:api_key]` | OpenAI-style API keys |
| `bearer_token` | `Bearer\s+[A-Za-z0-9\-._~+/]+=*` | `Bearer [REDACTED:token]` | Authorization bearer tokens |
| `generic_token` | `(token|api[_-]?key|secret|password|credential)["\s:=]+["']?[A-Za-z0-9\-._~+/]{16,}["']?` | `\1: [REDACTED:credential]` | Generic key-value credential patterns (case-insensitive) |
| `aws_key` | `(AKIA[0-9A-Z]{16})` | `[REDACTED:aws_key]` | AWS access key IDs |
| `connection_string` | `(postgres|mysql|mongodb|redis)://[^\s"']+` | `[REDACTED:connection_string]` | Database connection strings with embedded credentials |
| `base64_jwt` | `eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}` | `[REDACTED:jwt]` | JSON Web Tokens (base64-encoded header.payload.signature) |
| `pii_email` | `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}` | `[REDACTED:email]` | Email addresses (when PII policy enabled) |
| `pii_phone` | `(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}` | `[REDACTED:phone]` | US phone numbers (when PII policy enabled) |

#### Redaction Implementation

```python
import re
from dataclasses import dataclass, field

@dataclass
class RedactionRule:
    rule_id: str
    pattern: re.Pattern
    replacement: str
    requires_pii_policy: bool = False

@dataclass
class RedactionResult:
    text: str
    rules_applied: list[str] = field(default_factory=list)

class RedactionEngine:
    """Applies ordered redaction rules to text content.

    Sensitive credential patterns are always redacted.
    PII patterns (email, phone) are redacted only when pii_policy is enabled.
    """

    def __init__(self, pii_policy_enabled: bool = True):
        self.rules = self._build_rules()
        self.pii_policy_enabled = pii_policy_enabled

    def _build_rules(self) -> list[RedactionRule]:
        return [
            RedactionRule("api_key", re.compile(r"sk-[a-zA-Z0-9]{20,}"), "[REDACTED:api_key]"),
            RedactionRule("bearer_token", re.compile(r"Bearer\s+[A-Za-z0-9\-._~+/]+=*"), "Bearer [REDACTED:token]"),
            RedactionRule(
                "generic_token",
                re.compile(
                    r'(token|api[_\-]?key|secret|password|credential)(["\s:=]+["\']?)[A-Za-z0-9\-._~+/]{16,}["\']?',
                    re.IGNORECASE,
                ),
                r"\1\2[REDACTED:credential]",
            ),
            RedactionRule("aws_key", re.compile(r"AKIA[0-9A-Z]{16}"), "[REDACTED:aws_key]"),
            RedactionRule(
                "connection_string",
                re.compile(r"(postgres|mysql|mongodb|redis)://[^\s\"']+"),
                "[REDACTED:connection_string]",
            ),
            RedactionRule(
                "base64_jwt",
                re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"),
                "[REDACTED:jwt]",
            ),
            RedactionRule(
                "pii_email",
                re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"),
                "[REDACTED:email]",
                requires_pii_policy=True,
            ),
            RedactionRule(
                "pii_phone",
                re.compile(r"(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}"),
                "[REDACTED:phone]",
                requires_pii_policy=True,
            ),
        ]

    def redact(self, text: str) -> RedactionResult:
        rules_applied: list[str] = []
        result = text
        for rule in self.rules:
            if rule.requires_pii_policy and not self.pii_policy_enabled:
                continue
            if rule.pattern.search(result):
                result = rule.pattern.sub(rule.replacement, result)
                rules_applied.append(rule.rule_id)
        return RedactionResult(text=result, rules_applied=rules_applied)
```

#### Redaction Configuration

Redaction policy is configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_LOG_PII_REDACTION` | `true` | Enable PII masking (email, phone) |
| `AGENT_LOG_CUSTOM_PATTERNS` | `""` | Additional regex patterns (JSON array of `{pattern, replacement}`) |

### Filtering

#### Query Parameters for `GET /api/courses/{id}/logs`

| Parameter | Type | Description |
|-----------|------|-------------|
| `agent_name` | `string` (optional) | Filter by agent name. Exact match. One of: `course_describer`, `lesson_planner`, `lesson_writer`, `activity_creator`, `activity_reviewer`, `visual_aid_sniffer`, `visual_aid_creator`, `assessment_creator`, `assessment_reviewer` |
| `lesson_id` | `uuid` (optional) | Filter logs related to a specific lesson |
| `activity_id` | `uuid` (optional) | Filter logs related to a specific activity |
| `assessment_id` | `uuid` (optional) | Filter logs related to a specific assessment |
| `status` | `string` (optional) | Filter by status: `success`, `error`, `retry` |
| `date_from` | `datetime` (optional) | Start of date range (inclusive) |
| `date_to` | `datetime` (optional) | End of date range (inclusive) |
| `search` | `string` (optional) | Full-text search within prompt and output fields (applied after redaction) |
| `page` | `int` (default: 1) | Page number for pagination |
| `page_size` | `int` (default: 25, max: 100) | Items per page |
| `sort` | `string` (default: `-started_at`) | Sort field. Prefix `-` for descending. Options: `started_at`, `duration_ms`, `agent_name` |

#### Search Implementation

Text search uses SQL `LIKE` for SQLite (dev) and `ILIKE` for PostgreSQL (prod). The search term is applied to both `prompt` and `output` columns with OR logic. Search is performed **on redacted content** — the redaction engine runs first, then search filters the redacted text. This prevents search from surfacing sensitive data that would otherwise be hidden.

```python
# Pseudocode for search filtering
redacted_prompt = redaction_engine.redact(log.prompt).text
redacted_output = redaction_engine.redact(log.output).text
if search_term.lower() in redacted_prompt.lower() or search_term.lower() in redacted_output.lower():
    include_in_results = True
```

**Note**: For performance, search filtering happens in Python after the initial database query (which applies all other filters). If log volume becomes large enough to warrant it, a future optimization would be to add a `redacted_prompt` / `redacted_output` column populated by a background job, enabling database-level search. This is explicitly out of scope for this PRD.

---

## API Endpoints

### `GET /api/courses/{course_id}/logs`

Returns a paginated, filtered list of agent log summaries for a course.

**Path Parameters**:
- `course_id` (uuid, required) — The course instance ID

**Query Parameters**: See Filtering section above.

**Response**: `200 OK`
```json
{
  "items": [
    {
      "id": "a1b2c3d4-...",
      "agent_name": "lesson_planner",
      "status": "success",
      "started_at": "2026-02-24T10:30:00Z",
      "duration_ms": 4523,
      "model_name": "gpt-4o",
      "input_tokens": 1250,
      "output_tokens": 890,
      "lesson_id": "e5f6g7h8-...",
      "activity_id": null,
      "assessment_id": null,
      "has_validation_errors": false
    }
  ],
  "total": 47,
  "page": 1,
  "page_size": 25
}
```

**Error Responses**:
- `404 Not Found` — Course does not exist or does not belong to the current user
- `422 Unprocessable Entity` — Invalid filter parameter values

### `GET /api/logs/{log_id}`

Returns the full detail of a single agent log entry, including redacted prompt and output.

**Path Parameters**:
- `log_id` (uuid, required) — The agent log entry ID

**Response**: `200 OK`
```json
{
  "id": "a1b2c3d4-...",
  "agent_name": "lesson_planner",
  "prompt": "You are a lesson planner for an educational platform...\n\nCourse: Introduction to Python\nObjective: Understand variables and types\n\nGenerate a lesson plan...",
  "output": "{\n  \"learningObjective\": \"Understand variables and types in Python\",\n  \"competency\": \"Can declare, assign, and use variables...\",\n  \"essentialQuestions\": [\n    \"What is a variable and why do we need them?\",\n    \"How do different data types affect computation?\"\n  ],\n  ...\n}",
  "status": "success",
  "started_at": "2026-02-24T10:30:00Z",
  "completed_at": "2026-02-24T10:30:04.523Z",
  "duration_ms": 4523,
  "model_name": "gpt-4o",
  "model_version": "2026-01-15",
  "input_tokens": 1250,
  "output_tokens": 890,
  "validation_errors": null,
  "lesson_id": "e5f6g7h8-...",
  "activity_id": null,
  "assessment_id": null,
  "redaction_applied": []
}
```

**Error Responses**:
- `404 Not Found` — Log entry does not exist or does not belong to the current user's course

**Redaction Example** — When sensitive data is detected:
```json
{
  "prompt": "...using API key [REDACTED:api_key] to authenticate...",
  "output": "...connection string: [REDACTED:connection_string]...",
  "redaction_applied": ["api_key", "connection_string"]
}
```

---

## UI Specs

### Navigation

The Agent Log is accessible from the **Course Detail** view. A tab or nav link labeled "Agent Log" (with a `Terminal` or `ScrollText` Lucide icon) appears in the course navigation alongside Lessons, Activities, and Assessment.

Route: `/courses/{courseId}/logs`

### Page Layout — Log Viewer

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Course: Introduction to Python Programming                             │
│  ┌──────────┬───────────┬────────────┬────────────┐                     │
│  │ Lessons  │ Activities│ Assessment │ Agent Log  │  ← active tab       │
│  └──────────┴───────────┴────────────┴────────────┘                     │
│                                                                         │
│  ┌─── Filter Bar ────────────────────────────────────────────────────┐  │
│  │ Agent: [All Agents      ▼]  Status: [All ▼]  Lesson: [All ▼]    │  │
│  │ Date: [From       ] → [To         ]  🔍 [Search prompts/outputs] │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  Showing 47 log entries                                     Page 1 of 2 │
│                                                                         │
│  ┌─── Log Entry Card (collapsed) ────────────────────────────────────┐  │
│  │ ● lesson_planner      ✓ success    4.5s    1,250 → 890 tokens    │  │
│  │   Lesson 1: Variables and Types      Feb 24, 2026 10:30:00 AM    │  │
│  │   Model: gpt-4o                                          [▼]     │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─── Log Entry Card (expanded) ─────────────────────────────────────┐  │
│  │ ● course_describer    ✓ success    2.1s    850 → 420 tokens      │  │
│  │   Course Description                 Feb 24, 2026 10:29:55 AM    │  │
│  │   Model: gpt-4o (2026-01-15)                             [▲]     │  │
│  │                                                                   │  │
│  │   ┌── Prompt ──────────────────────────────────────── [collapse] ─┐  │
│  │   │ You are a course description specialist for an educational   │  │
│  │   │ platform. Given a course topic and learning objectives,      │  │
│  │   │ produce a focused course description...                      │  │
│  │   │                                                              │  │
│  │   │ Topic: Introduction to Python Programming                    │  │
│  │   │ Objectives:                                                  │  │
│  │   │ - Understand variables and types                             │  │
│  │   │ - Write basic functions                                      │  │
│  │   │ - Use control flow statements                                │  │
│  │   └──────────────────────────────────────────────────────────────┘  │
│  │                                                                   │  │
│  │   ┌── Output (JSON) ──────────────────────────────── [collapse] ─┐  │
│  │   │ {                                                            │  │
│  │   │   "focusedObjective": "Understand variables and types",      │  │
│  │   │   "courseDescription": "This course introduces you to the    │  │
│  │   │     fundamental building blocks of Python programming...",    │  │
│  │   │   "personalizationRationale": [                              │  │
│  │   │     "Concrete examples using real-world data",               │  │
│  │   │     "Progressive complexity from literals to expressions"    │  │
│  │   │   ]                                                          │  │
│  │   │ }                                                            │  │
│  │   └──────────────────────────────────────────────────────────────┘  │
│  │                                                                   │  │
│  │   Timing: 10:29:55.000 → 10:29:57.123 (2,123ms)                  │  │
│  │   Tokens: 850 input / 420 output (1,270 total)                    │  │
│  │   Validation: No errors                                           │  │
│  │   Redaction: None applied                                         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─── Log Entry Card (error, expanded) ──────────────────────────────┐  │
│  │ ● lesson_writer       ✗ retry      6.8s    1,800 → 1,100 tokens  │  │
│  │   Lesson 3: Control Flow            Feb 24, 2026 10:31:12 AM     │  │
│  │   Model: gpt-4o                                          [▲]     │  │
│  │                                                                   │  │
│  │   ┌── Prompt ──────────────────────────────────────── [collapse] ─┐  │
│  │   │ ...                                                          │  │
│  │   └──────────────────────────────────────────────────────────────┘  │
│  │                                                                   │  │
│  │   ┌── Output (JSON) ──────────────────────────────── [collapse] ─┐  │
│  │   │ ...                                                          │  │
│  │   └──────────────────────────────────────────────────────────────┘  │
│  │                                                                   │  │
│  │   ┌── Validation Errors ──────────────────────── amber border ───┐  │
│  │   │ ⚠ Attempt 1: "lessonBody missing required section: Recap.   │  │
│  │   │   Expected sections: Objective, Why it matters, Steps,       │  │
│  │   │   Example, Recap"                                            │  │
│  │   │ ✓ Attempt 2: Passed validation                               │  │
│  │   └──────────────────────────────────────────────────────────────┘  │
│  │                                                                   │  │
│  │   Timing: 10:31:12.000 → 10:31:18.823 (6,823ms)                  │  │
│  │   Tokens: 1,800 input / 1,100 output (2,900 total)               │  │
│  │   Redaction: None applied                                         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  [← Previous]                                          [Next →]         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Specifications

#### Filter Bar

- **Agent dropdown**: Populated from the distinct `agent_name` values in the current course's logs. Shows count per agent (e.g., "lesson_planner (3)").
- **Status dropdown**: All / Success / Error / Retry. Uses colored dot indicators matching the log entry cards.
- **Lesson dropdown**: Populated from the course's lessons by title. Selecting a lesson filters to logs where `lesson_id` matches. Includes "Course-level" option for logs with no lesson_id (e.g., course_describer).
- **Date range**: Two date pickers (from/to). Defaults to showing all dates. Uses Shadcn `DatePicker` component.
- **Search input**: Debounced text input (300ms). Searches within redacted prompt and output text. Shows "Searching..." indicator during debounce. Clear button (X) to reset.
- **Active filter pills**: Applied filters appear as dismissible pills below the filter bar. "Clear all" link resets everything.

#### Log Entry Card (Collapsed)

Each collapsed card is a single row showing:

| Element | Style | Content |
|---------|-------|---------|
| Status dot | `w-2 h-2 rounded-full` — green (success), red (error), amber (retry) | Visual status indicator |
| Agent name | `font-mono text-sm font-medium` | e.g., "lesson_planner" |
| Status badge | Shadcn `Badge` variant — default (success), destructive (error), outline (retry) | "success" / "error" / "retry" |
| Duration | `text-sm text-muted-foreground` | e.g., "4.5s" (formatted from duration_ms) |
| Token usage | `text-sm text-muted-foreground font-mono` | e.g., "1,250 → 890 tokens" |
| Context label | `text-sm text-muted-foreground` | Lesson/activity/assessment title (resolved from ID) |
| Timestamp | `text-sm text-muted-foreground` | Formatted `started_at` |
| Model name | `text-xs text-muted-foreground` | e.g., "gpt-4o" |
| Expand toggle | Chevron icon button | Toggles expanded view |

Clicking anywhere on the card (or the chevron) toggles expansion.

#### Log Entry Card (Expanded)

When expanded, the card grows to reveal:

1. **Prompt section**: Collapsible block with monospace font (`font-mono text-sm`), dark background (`bg-muted`), rounded corners. Labeled "Prompt" with a collapse toggle. Content is the redacted `prompt` field, preserving whitespace and line breaks.

2. **Output section**: Collapsible block with monospace font. Labeled "Output (JSON)". Content is the redacted `output` field, JSON-formatted with syntax highlighting. Uses a lightweight JSON syntax highlighter (or Shadcn's `code` styling with manual coloring). If the output is not valid JSON, display as plain monospace text.

3. **Timing detail**: Shows `started_at → completed_at (duration_ms)` in human-readable format.

4. **Token detail**: Shows `input_tokens input / output_tokens output (total total)` with number formatting.

5. **Validation errors** (conditional): Only shown when `validation_errors` is non-null. Displayed in an amber-bordered callout box. Each error is listed with attempt number. If the final status is "success", the last entry shows "Passed validation" with a check mark.

6. **Redaction notice** (conditional): Only shown when `redaction_applied` is non-empty. Small info banner: "Redaction applied: api_key, email" — communicating that some content was masked.

#### Prompt and Output Sections — Interaction

- Both sections start **collapsed** when the card is expanded (two-level collapsing: card level and section level).
- Click the section header to expand/collapse.
- When expanded, content has max-height with scrollable overflow (`max-h-96 overflow-y-auto`).
- Copy button in the top-right corner of each section copies the full redacted text to clipboard.

#### Empty States

- **No logs for this course**: "No agent logs yet. Generate a course to see agent activity here." with an illustration or icon.
- **No results for current filters**: "No logs match your filters." with a "Clear filters" button.
- **Loading**: Skeleton cards (3-5 shimmer rectangles matching card dimensions).

#### Pagination

Standard pagination at the bottom of the list:
- Previous / Next buttons (disabled at boundaries)
- Page indicator: "Page 1 of 2"
- Optionally: page size selector (25, 50, 100)

### Styling

The Agent Log Viewer uses the **developer-tool aesthetic** specified in the master PRD:

- **Monospace fonts** for all prompt/output/JSON content (`font-mono`)
- **Dark code blocks** — `bg-zinc-900 text-zinc-100` for prompt/output sections on light theme, `bg-zinc-950 text-zinc-100` on dark theme
- **Muted metadata** — timestamps, durations, token counts in `text-muted-foreground`
- **Status colors** — green/red/amber dots and badges for success/error/retry
- **Compact density** — minimal padding on collapsed cards, generous padding on expanded sections
- **Glassmorphism** — matches existing Shadcn/ui design language for cards and containers
- **Accessible** — all interactive elements have accessible names, color is never the sole indicator (text labels accompany dots), keyboard navigation for expand/collapse

### Responsive Behavior

- **Desktop (>1024px)**: Full layout as wireframed above. Filter bar is a single row.
- **Tablet (768-1024px)**: Filter bar wraps to two rows (agent/status/lesson on row 1, date/search on row 2).
- **Mobile (<768px)**: Filter bar is a collapsible "Filters" button that opens a drawer. Token counts hidden from collapsed cards (visible in expanded view only). Prompt/output sections use full width with horizontal scroll for long lines.

---

## Acceptance Criteria

### Functional

1. **Log list loads**: Navigating to `/courses/{courseId}/logs` displays all agent log entries for that course, ordered by `started_at` descending.
2. **Log entries show correct data**: Each collapsed card displays agent name, status, duration, token usage, context label, timestamp, and model name — all matching the database record.
3. **Expand/collapse works**: Clicking a card toggles the expanded view. Clicking prompt/output headers toggles those sections independently.
4. **Filter by agent name**: Selecting an agent from the dropdown shows only entries for that agent. Count updates.
5. **Filter by status**: Selecting "error" shows only entries with `status = "error"`.
6. **Filter by lesson**: Selecting a lesson shows only entries linked to that lesson (by `lesson_id`).
7. **Filter by date range**: Setting from/to dates filters entries to that range (inclusive).
8. **Search**: Typing a search term filters entries whose redacted prompt or output contains the term (case-insensitive).
9. **Combined filters**: Multiple filters compose with AND logic. E.g., agent_name=lesson_planner AND status=error.
10. **Pagination**: When entries exceed page_size, pagination controls appear and work correctly.
11. **Single log detail**: Fetching `/api/logs/{id}` returns all fields for the specified log entry.
12. **Validation errors display**: Log entries with validation errors show the errors in an amber callout with attempt numbers.
13. **Copy to clipboard**: Copy buttons on prompt/output sections copy the full redacted text.

### Redaction

14. **API keys never displayed**: Any OpenAI-style key (sk-...) in prompt or output is replaced with `[REDACTED:api_key]`.
15. **Bearer tokens never displayed**: Authorization headers are redacted.
16. **Generic credentials never displayed**: Key-value patterns matching token/api_key/secret/password are redacted.
17. **JWTs never displayed**: Base64-encoded JWT tokens are redacted.
18. **Connection strings never displayed**: Database URIs with embedded credentials are redacted.
19. **PII redacted by default**: Email addresses and phone numbers are redacted when PII policy is enabled (default: enabled).
20. **PII redaction configurable**: Setting `AGENT_LOG_PII_REDACTION=false` disables email/phone redaction while keeping credential redaction active.
21. **Redaction notice shown**: When redaction is applied, the UI displays which rules fired.
22. **Non-sensitive content preserved**: Redaction does not alter content that doesn't match any pattern. Lesson text, JSON structure, and educational content pass through unchanged.

### Security

23. **User isolation**: Users can only view logs for courses they own. Attempting to access another user's course logs returns 404.
24. **Raw data preserved**: Redaction is display-time only. Database records are unmodified.
25. **Search respects redaction**: Searching for "sk-" does not return results even if raw data contains API keys, because search runs on redacted content.

---

## Verification

### Unit Tests

**Redaction Engine**:

| Test | Input | Expected |
|------|-------|----------|
| Strips OpenAI API key | `"Using key sk-abc123def456ghi789jkl012"` | `"Using key [REDACTED:api_key]"` |
| Strips bearer token | `"Authorization: Bearer eyJhbGc..."` | `"Authorization: Bearer [REDACTED:token]"` |
| Strips generic token | `"api_key: abcdef1234567890abcdef"` | `"api_key: [REDACTED:credential]"` |
| Strips password value | `"password = mySecretPass12345678"` | `"password = [REDACTED:credential]"` |
| Strips AWS key | `"AKIAIOSFODNN7EXAMPLE1"` | `"[REDACTED:aws_key]"` |
| Strips connection string | `"postgres://user:pass@host/db"` | `"[REDACTED:connection_string]"` |
| Strips JWT | `"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123def456"` | `"[REDACTED:jwt]"` |
| Strips email (PII on) | `"Contact user@example.com for help"` | `"Contact [REDACTED:email] for help"` |
| Preserves email (PII off) | `"Contact user@example.com for help"` (PII disabled) | `"Contact user@example.com for help"` |
| Strips phone (PII on) | `"Call (555) 123-4567"` | `"Call [REDACTED:phone]"` |
| Preserves normal text | `"Generate a lesson about Python variables"` | `"Generate a lesson about Python variables"` (unchanged) |
| Preserves JSON structure | `'{"objective": "Learn Python", "sections": 5}'` | Same (unchanged) |
| Multiple patterns | `"key: sk-abc123... token: Bearer xyz..."` | Both redacted, `rules_applied` contains both |
| Returns rules_applied | Any input with matches | `RedactionResult.rules_applied` lists rule IDs that fired |

**API Response Schemas**:

| Test | Description |
|------|-------------|
| AgentLogSummary validates | All required fields present and typed correctly |
| AgentLogDetail validates | Full schema including nullable fields |
| has_validation_errors derived | True when validation_errors is not None/empty |

### Integration Tests

| Test | Method | Expected |
|------|--------|----------|
| List logs for course | `GET /api/courses/{id}/logs` after generating a course | Returns entries for all agent runs (course_describer, lesson_planner, lesson_writer, activity_creator at minimum) |
| Filter by agent name | `GET /api/courses/{id}/logs?agent_name=lesson_planner` | Only lesson_planner entries returned |
| Filter by status | `GET /api/courses/{id}/logs?status=success` | Only success entries returned |
| Filter by lesson | `GET /api/courses/{id}/logs?lesson_id={id}` | Only entries for that lesson |
| Filter by date range | `GET /api/courses/{id}/logs?date_from=...&date_to=...` | Only entries within range |
| Combined filters | `GET /api/courses/{id}/logs?agent_name=lesson_writer&status=error` | Intersection of both filters |
| Search | `GET /api/courses/{id}/logs?search=Python` | Entries whose redacted prompt or output contains "Python" |
| Pagination | `GET /api/courses/{id}/logs?page=2&page_size=5` | Second page of 5 results |
| Single log detail | `GET /api/logs/{id}` | Full detail with all fields populated |
| Detail has all fields | `GET /api/logs/{id}` | Response includes prompt, output, timestamps, model info, tokens, duration |
| Redaction in list | `GET /api/courses/{id}/logs` with seeded sensitive data | No API keys or tokens visible in any response field |
| Redaction in detail | `GET /api/logs/{id}` with seeded sensitive data | prompt and output fields are redacted, redaction_applied lists rules |
| 404 for wrong user | `GET /api/courses/{other_user_course}/logs` | 404 Not Found |
| 404 for nonexistent log | `GET /api/logs/{nonexistent_id}` | 404 Not Found |
| Empty course logs | `GET /api/courses/{new_course}/logs` | `{"items": [], "total": 0, ...}` |

### ADW Implementation Pattern

ADW tests are **single-file `uv` scripts** using [PEP 723 inline script metadata](https://peps.python.org/pep-0723/). Each test is a self-contained `.py` file that can be run directly with `uv run`:

```bash
# Run a single ADW test
uv run tests/adw/08_agent_log_viewer.py

# Run all ADW tests
uv run tests/adw/run_all.py
```

**Script structure** — every ADW test follows this pattern:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""ADW Test: Agent Log Viewer — display, interaction, filtering, and security."""

import json
import shutil
import subprocess
import sys
from pathlib import Path

PROMPT = """\
You are a QA tester for the 1111 School learning platform.
The app is running at http://localhost:5173 and the backend at http://localhost:8000.
Use agent-browser to automate the browser.

PREREQUISITE: A course has already been generated (use a pre-seeded course or
generate one first via the course creation flow).

TEST: Agent Log Viewer — display, interaction, filtering, and security

Steps:

1. `agent-browser open http://localhost:5173`
2. Navigate to a course that has been generated (look for course list, click one)
3. Find and click the "Agent Log" tab/link in the course navigation
4. `agent-browser snapshot -i` — verify log entries are listed

VERIFY — Log entries visible:
- [ ] At least 3 log entries are displayed (course_describer + lesson_planner + lesson_writer minimum)
- [ ] Each entry shows: agent name, status indicator, duration, timestamp
- [ ] Entries are ordered by timestamp (most recent first)

5. Click on a log entry to expand it
6. `agent-browser snapshot -i` — verify expanded content

VERIFY — Expanded entry:
- [ ] Prompt section is visible with a "Prompt" label
- [ ] Output section is visible with an "Output" label
- [ ] Prompt text is displayed in monospace font (check for code-like styling)
- [ ] Output appears to be JSON-formatted
- [ ] Timing information is displayed (start, end, duration)
- [ ] Token counts are displayed (input, output)
- [ ] Model name is displayed

7. Expand the Prompt section, read the prompt text
- [ ] Prompt is plausible for the agent type (not empty, not garbled, contains educational language)

8. Expand the Output section, read the output text
- [ ] Output is plausible JSON matching the agent's expected output schema

9. Use the Agent filter dropdown, select "lesson_planner"
10. `agent-browser snapshot -i` — verify filtering

VERIFY — Filtering:
- [ ] Only entries with agent_name "lesson_planner" are visible
- [ ] Other agents (course_describer, lesson_writer) are NOT visible
- [ ] Entry count updated to reflect filtered results

11. Clear the agent filter, then filter by status "success"
- [ ] Only successful entries shown

12. Clear all filters

SECURITY CHECK:
13. Read ALL visible text on the page (expand several entries, including prompt and output sections)
14. Search for patterns: "sk-", "Bearer ", "api_key", "password", "token"

- [ ] CRITICAL: No API keys (sk-...) are visible anywhere on the page
- [ ] CRITICAL: No bearer tokens are visible
- [ ] CRITICAL: No passwords or credential values are visible
- [ ] If any [REDACTED:...] markers are present, that is CORRECT behavior

15. Collapse expanded entries, verify they collapse properly
16. `agent-browser snapshot -i` — verify collapsed state returns to compact view

17. `agent-browser screenshot --annotate ./test-results/08-agent-log-expanded.png`
18. `agent-browser screenshot --annotate ./test-results/08-agent-log-filtered.png`

Output a JSON object:
{
  "test": "agent_log_viewer",
  "passed": true/false,
  "checks": [
    {"name": "entries_visible", "passed": true/false, "notes": "..."},
    {"name": "expand_collapse", "passed": true/false, "notes": "..."},
    {"name": "prompt_displayed", "passed": true/false, "notes": "..."},
    {"name": "output_displayed", "passed": true/false, "notes": "..."},
    {"name": "filtering_works", "passed": true/false, "notes": "..."},
    {"name": "no_api_keys_visible", "passed": true/false, "notes": "..."},
    {"name": "no_tokens_visible", "passed": true/false, "notes": "..."},
    {"name": "no_credentials_visible", "passed": true/false, "notes": "..."}
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

### ADW Test (`08_agent_log_viewer.md`)

The prompt content is embedded in the `PROMPT` variable in the script above. For reference, the original prompt file is `tests/adw/prompts/08_agent_log_viewer.md`.

---

## Definition of Done

- [ ] `GET /api/courses/{id}/logs` endpoint implemented with all filter parameters, pagination, and sorting
- [ ] `GET /api/logs/{id}` endpoint implemented returning full redacted log detail
- [ ] `RedactionEngine` implemented with all 8 pattern rules (6 credential + 2 PII)
- [ ] Redaction applied server-side before API response serialization
- [ ] PII redaction configurable via `AGENT_LOG_PII_REDACTION` environment variable
- [ ] Agent Log Viewer React page implemented at `/courses/{courseId}/logs`
- [ ] Log entry cards with collapsed (summary) and expanded (full detail) states
- [ ] Prompt and output sections are collapsible, monospace, with copy-to-clipboard
- [ ] JSON output is syntax-highlighted or formatted with indentation
- [ ] Validation errors displayed in amber callout when present
- [ ] Redaction notice displayed when redaction rules fired
- [ ] Filter bar: agent name, status, lesson, date range, search — all functional
- [ ] Active filter pills with dismiss and "clear all"
- [ ] Pagination with Previous/Next controls
- [ ] Empty states for no logs and no filter matches
- [ ] Loading skeleton states
- [ ] Responsive layout for desktop, tablet, and mobile
- [ ] All unit tests passing (redaction engine: 14+ test cases)
- [ ] All integration tests passing (API: 14+ test cases)
- [ ] ADW test `08_agent_log_viewer.md` passing (display, interaction, filtering, security)
- [ ] No API keys, tokens, passwords, or PII (when policy enabled) visible in any API response
- [ ] Keyboard accessible: expand/collapse via Enter/Space, tab navigation through cards and controls
- [ ] Code reviewed and merged to main branch
