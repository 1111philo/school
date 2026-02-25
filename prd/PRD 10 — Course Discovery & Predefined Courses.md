---
prd: 10
title: "Course Discovery & Predefined Courses"
phase: Polish
status: draft
depends_on: [5]
agents: []
estimated_size: Medium
stack: [Python 3.12+, uv, FastAPI, SQLAlchemy async, React 19, TypeScript, Shadcn/ui]
---

# PRD 10 — Course Discovery & Predefined Courses

## Overview

This PRD introduces the course discovery surface: a catalog of predefined courses that users can browse, search, and start, alongside a structured custom course creation flow. Before this PRD, the only way to create a course is through the raw generation endpoint (`POST /api/courses/generate`) with a freeform description and objectives. After this PRD, users have two clear entry points — pick a curated course from the catalog or build their own — both leading into the same generation pipeline established in PRDs 2-5.

Predefined courses are defined as static JSON files on disk, versioned independently of the database. The catalog API reads these files at startup (and on refresh), validates them against a strict schema, and serves them to the frontend. When a user starts a predefined course, the system creates a `CourseInstance` linked to the source course and feeds the predefined description + objectives into the generation pipeline, merging with the learner profile (if PRD 6 is present) for personalization.

Custom course creation gets a dedicated flow separate from "generate" — the user provides a description and objectives, previews their input, and explicitly confirms before generation begins. This creates a `CourseInstance` with `sourceType: user_created`.

Course cards provide a unified view of all the user's courses (predefined and custom, in-progress and completed), with progress indicators, resume/start distinction, and completion badges.

**No agents are introduced in this PRD.** All work is catalog infrastructure, API endpoints, and UI.

---

## Goals

1. Give users a low-friction way to start learning — browse predefined courses and click "Start Course" rather than inventing a description and objectives from scratch.
2. Provide a structured, validated schema for predefined courses so course authors (admins) can add new courses by dropping a JSON file in the right directory.
3. Make custom course creation intentional — validate input, show a preview, and let the user confirm before triggering the (expensive) generation pipeline.
4. Surface course progress across all courses in a unified card-based view so users can resume where they left off or see what they have completed.
5. Support search and tag-based filtering so the catalog scales beyond a handful of courses.

---

## Non-Goals

- Course marketplace or payment integration.
- User-submitted courses visible to other users (all custom courses are private).
- Course recommendation engine or AI-powered course suggestions.
- Admin UI for editing predefined course JSON (admins edit files on disk directly).
- Course rating or review system.
- Importing courses from external formats (SCORM, xAPI, LTI).

---

## Scope

### Predefined Course System

**Course JSON files** live on disk at `/app/courses/<course_id>/course.json`. Each file is a self-contained course definition validated against a strict Pydantic schema. The backend loads all valid course files at startup and exposes them through the catalog API.

**Version tracking**: Each course JSON includes a `version` field (semver string). When an admin updates a course JSON and increments the version, existing `CourseInstance` records retain a reference to the version they were generated from. The catalog always serves the latest version.

### Course Catalog UI

A browsable, searchable catalog page showing all predefined courses. Users can filter by tag, search by keyword (matches against name, description, and tags), and view course details before starting.

### Custom Course Creation Flow

A dedicated flow for users who want to create their own course. Separate from the raw generate endpoint — this flow validates input, shows a preview, and stores the user's intent in a `CourseInstance` with `sourceType: user_created` before triggering generation.

### Course Cards

A unified card component used in both the catalog and the user's course list ("My Courses"). Cards show progress for in-progress courses, a completion badge for finished courses, and clearly distinguish between "Resume" and "Start" actions.

---

## Technical Design

### Course JSON Schema

Predefined courses are defined as JSON files at `/app/courses/<course_id>/course.json`.

**Schema**:

```json
{
  "courseId": "intro-python",
  "version": "1.0.0",
  "name": "Introduction to Python Programming",
  "description": "Learn the fundamentals of Python programming from variables and data types through functions and control flow. Build practical scripts that solve real problems.",
  "learningObjectives": [
    "Understand variables, data types, and basic operations",
    "Write functions with parameters and return values",
    "Use control flow statements (if/elif/else, for, while)",
    "Work with lists, dictionaries, and string manipulation",
    "Read and write files using Python's built-in I/O"
  ],
  "tags": ["programming", "python", "beginner", "computer-science"],
  "estimatedHours": 8
}
```

**Pydantic Validation Model** (`app/schemas/catalog.py`):

```python
from pydantic import BaseModel, Field, field_validator
import re

class PredefinedCourse(BaseModel):
    """Schema for a predefined course JSON file."""
    course_id: str = Field(
        ...,
        alias="courseId",
        pattern=r"^[a-z0-9][a-z0-9-]*[a-z0-9]$",
        min_length=3,
        max_length=64,
        description="URL-safe identifier matching the directory name"
    )
    version: str = Field(
        ...,
        description="Semver version string"
    )
    name: str = Field(
        ...,
        min_length=3,
        max_length=120,
        description="Human-readable course title"
    )
    description: str = Field(
        ...,
        min_length=20,
        max_length=500,
        description="Course description shown in catalog"
    )
    learning_objectives: list[str] = Field(
        ...,
        alias="learningObjectives",
        min_length=2,
        max_length=10,
        description="Learning objectives for the course"
    )
    tags: list[str] = Field(
        default_factory=list,
        max_length=20,
        description="Tags for filtering and discovery"
    )
    estimated_hours: float = Field(
        ...,
        alias="estimatedHours",
        gt=0,
        le=100,
        description="Estimated hours to complete"
    )

    @field_validator("version")
    @classmethod
    def validate_semver(cls, v: str) -> str:
        if not re.match(r"^\d+\.\d+\.\d+$", v):
            raise ValueError(
                f"Version must be semver format (e.g. '1.0.0'), got '{v}'"
            )
        return v

    @field_validator("learning_objectives")
    @classmethod
    def validate_objectives(cls, v: list[str]) -> list[str]:
        for i, obj in enumerate(v):
            stripped = obj.strip()
            if len(stripped) < 10:
                raise ValueError(
                    f"Objective {i} is too short ({len(stripped)} chars). "
                    "Each objective must be at least 10 characters."
                )
            if len(stripped) > 200:
                raise ValueError(
                    f"Objective {i} is too long ({len(stripped)} chars). "
                    "Each objective must be at most 200 characters."
                )
        return v

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: list[str]) -> list[str]:
        for tag in v:
            if not re.match(r"^[a-z0-9-]+$", tag):
                raise ValueError(
                    f"Tag '{tag}' must be lowercase alphanumeric with hyphens only"
                )
        return v

    model_config = {"populate_by_name": True}
```

**Example course files** (shipped with the application):

`/app/courses/intro-python/course.json`:
```json
{
  "courseId": "intro-python",
  "version": "1.0.0",
  "name": "Introduction to Python Programming",
  "description": "Learn the fundamentals of Python programming from variables and data types through functions and control flow. Build practical scripts that solve real problems.",
  "learningObjectives": [
    "Understand variables, data types, and basic operations",
    "Write functions with parameters and return values",
    "Use control flow statements (if/elif/else, for, while)",
    "Work with lists, dictionaries, and string manipulation",
    "Read and write files using Python's built-in I/O"
  ],
  "tags": ["programming", "python", "beginner", "computer-science"],
  "estimatedHours": 8
}
```

`/app/courses/project-management-fundamentals/course.json`:
```json
{
  "courseId": "project-management-fundamentals",
  "version": "1.0.0",
  "name": "Project Management Fundamentals",
  "description": "Master the core concepts of project management including scope definition, scheduling, risk assessment, and stakeholder communication. Apply frameworks to real project scenarios.",
  "learningObjectives": [
    "Define project scope and create a work breakdown structure",
    "Build and manage project schedules with milestones",
    "Identify and mitigate project risks systematically",
    "Communicate effectively with stakeholders at all levels"
  ],
  "tags": ["project-management", "leadership", "business", "intermediate"],
  "estimatedHours": 6
}
```

`/app/courses/digital-photography/course.json`:
```json
{
  "courseId": "digital-photography",
  "version": "1.0.0",
  "name": "Digital Photography Essentials",
  "description": "Understand exposure, composition, and lighting to take compelling photographs with any camera. Move beyond auto mode and develop your visual eye.",
  "learningObjectives": [
    "Control exposure using aperture, shutter speed, and ISO",
    "Apply composition principles including rule of thirds and leading lines",
    "Work with natural and artificial lighting effectively"
  ],
  "tags": ["photography", "creative", "beginner", "visual-arts"],
  "estimatedHours": 5
}
```

### Catalog System

**Course Loader** (`app/services/catalog.py`):

The catalog service loads course JSON files from disk, validates them, and provides lookup/search/filter operations. Courses are loaded at application startup and cached in memory. A reload mechanism allows refreshing without restart.

```python
from pathlib import Path
from app.schemas.catalog import PredefinedCourse

class CatalogService:
    """Loads and serves predefined courses from disk."""

    def __init__(self, courses_dir: Path = Path("/app/courses")):
        self.courses_dir = courses_dir
        self._courses: dict[str, PredefinedCourse] = {}
        self._load_errors: dict[str, str] = {}

    def load(self) -> None:
        """Load all course.json files from the courses directory."""
        self._courses.clear()
        self._load_errors.clear()
        if not self.courses_dir.exists():
            return
        for course_dir in sorted(self.courses_dir.iterdir()):
            if not course_dir.is_dir():
                continue
            json_path = course_dir / "course.json"
            if not json_path.exists():
                continue
            try:
                raw = json_path.read_text(encoding="utf-8")
                course = PredefinedCourse.model_validate_json(raw)
                # Verify directory name matches courseId
                if course.course_id != course_dir.name:
                    raise ValueError(
                        f"courseId '{course.course_id}' does not match "
                        f"directory name '{course_dir.name}'"
                    )
                self._courses[course.course_id] = course
            except Exception as e:
                self._load_errors[course_dir.name] = str(e)

    def list_all(self) -> list[PredefinedCourse]:
        """Return all valid predefined courses."""
        return list(self._courses.values())

    def get(self, course_id: str) -> PredefinedCourse | None:
        """Return a single predefined course by ID."""
        return self._courses.get(course_id)

    def search(self, query: str) -> list[PredefinedCourse]:
        """Search courses by keyword (matches name, description, tags)."""
        q = query.lower()
        results = []
        for course in self._courses.values():
            if (
                q in course.name.lower()
                or q in course.description.lower()
                or any(q in tag for tag in course.tags)
            ):
                results.append(course)
        return results

    def filter_by_tag(self, tag: str) -> list[PredefinedCourse]:
        """Filter courses by a single tag."""
        tag = tag.lower()
        return [c for c in self._courses.values() if tag in c.tags]

    def get_all_tags(self) -> list[str]:
        """Return all unique tags across all courses, sorted."""
        tags: set[str] = set()
        for course in self._courses.values():
            tags.update(course.tags)
        return sorted(tags)

    def reload(self) -> None:
        """Reload courses from disk (e.g., after admin updates)."""
        self.load()

    @property
    def load_errors(self) -> dict[str, str]:
        """Directories that failed to load, with error messages."""
        return dict(self._load_errors)
```

**Startup integration** (`app/main.py`):

```python
from contextlib import asynccontextmanager
from app.services.catalog import CatalogService

catalog_service = CatalogService()

@asynccontextmanager
async def lifespan(app: FastAPI):
    catalog_service.load()
    if catalog_service.load_errors:
        for dir_name, error in catalog_service.load_errors.items():
            logger.warning(f"Failed to load course '{dir_name}': {error}")
    logger.info(f"Loaded {len(catalog_service.list_all())} predefined courses")
    yield
```

### Custom Course Creation

Custom course creation uses a dedicated endpoint (`POST /api/courses/create`) that is separate from the generation endpoint (`POST /api/courses/generate`). The create endpoint validates user input, stores it as a `CourseInstance` with `sourceType: user_created` and `status: draft`, and returns the instance ID. The frontend then triggers generation as a separate step, allowing a preview/confirmation flow.

**Input schema** (`app/schemas/course_create.py`):

```python
from pydantic import BaseModel, Field, field_validator

class CourseCreateInput(BaseModel):
    """User input for creating a custom course."""
    description: str = Field(
        ...,
        min_length=10,
        max_length=500,
        description="Brief description of the course topic and focus"
    )
    learning_objectives: list[str] = Field(
        ...,
        min_length=1,
        max_length=8,
        description="Learning objectives for the course"
    )

    @field_validator("learning_objectives")
    @classmethod
    def validate_objectives(cls, v: list[str]) -> list[str]:
        for i, obj in enumerate(v):
            stripped = obj.strip()
            if len(stripped) < 10:
                raise ValueError(
                    f"Objective {i+1} is too short. "
                    "Each objective must be at least 10 characters."
                )
            if len(stripped) > 200:
                raise ValueError(
                    f"Objective {i+1} is too long. "
                    "Each objective must be at most 200 characters."
                )
        return [obj.strip() for obj in v]


class CourseCreateResponse(BaseModel):
    """Response after creating a custom course (before generation)."""
    course_instance_id: str
    source_type: str  # "user_created"
    status: str  # "draft"
    description: str
    learning_objectives: list[str]
```

**CourseInstance model additions** (extends PRD 1 model):

The `CourseInstance` DB model already has `source_type` and `source_course_id` fields from PRD 1. This PRD ensures:
- `source_type` is an enum: `predefined | user_created`
- `source_course_id` is populated when `source_type = predefined` (references the `courseId` from the JSON)
- `source_course_version` is populated when `source_type = predefined` (records which version was used)
- `input_description` and `input_objectives` store the user's raw input for `user_created` courses

---

## API Endpoints

### `GET /api/catalog`

List all predefined courses in the catalog.

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tag` | string | No | Filter by tag (exact match) |
| `q` | string | No | Search keyword (matches name, description, tags) |

**Response** (`200 OK`):
```json
{
  "courses": [
    {
      "courseId": "intro-python",
      "version": "1.0.0",
      "name": "Introduction to Python Programming",
      "description": "Learn the fundamentals of Python programming...",
      "learningObjectives": [
        "Understand variables, data types, and basic operations",
        "Write functions with parameters and return values",
        "Use control flow statements (if/elif/else, for, while)",
        "Work with lists, dictionaries, and string manipulation",
        "Read and write files using Python's built-in I/O"
      ],
      "tags": ["programming", "python", "beginner", "computer-science"],
      "estimatedHours": 8
    }
  ],
  "tags": ["beginner", "business", "computer-science", "creative", ...],
  "total": 3
}
```

The `tags` field returns all unique tags across all courses, enabling the frontend to render filter chips without a separate request.

**Error Responses**:
- `200` with empty `courses` array if no matches

---

### `GET /api/catalog/{course_id}`

Get a single predefined course by ID.

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `course_id` | string | The predefined course ID |

**Response** (`200 OK`):
```json
{
  "courseId": "intro-python",
  "version": "1.0.0",
  "name": "Introduction to Python Programming",
  "description": "Learn the fundamentals of Python programming...",
  "learningObjectives": [
    "Understand variables, data types, and basic operations",
    "Write functions with parameters and return values",
    "Use control flow statements (if/elif/else, for, while)",
    "Work with lists, dictionaries, and string manipulation",
    "Read and write files using Python's built-in I/O"
  ],
  "tags": ["programming", "python", "beginner", "computer-science"],
  "estimatedHours": 8
}
```

**Error Responses**:
- `404 Not Found`: Course ID does not exist in the catalog

---

### `POST /api/courses/create`

Create a new course instance from user input. This does NOT trigger generation — it creates a `CourseInstance` in `draft` status with the user's description and objectives. The frontend shows a preview, and the user explicitly triggers generation via the existing `POST /api/courses/generate` endpoint (from PRD 2) using the returned `course_instance_id`.

**Request Body**:
```json
{
  "description": "Learn the basics of cooking healthy meals at home",
  "learningObjectives": [
    "Understand nutrition basics and meal planning",
    "Master fundamental knife skills and cooking techniques",
    "Prepare a complete healthy meal from scratch"
  ]
}
```

**Response** (`201 Created`):
```json
{
  "courseInstanceId": "uuid-here",
  "sourceType": "user_created",
  "status": "draft",
  "description": "Learn the basics of cooking healthy meals at home",
  "learningObjectives": [
    "Understand nutrition basics and meal planning",
    "Master fundamental knife skills and cooking techniques",
    "Prepare a complete healthy meal from scratch"
  ]
}
```

**Error Responses**:
- `422 Unprocessable Entity`: Invalid input (empty description, too few/many objectives, objectives too short/long)

**Validation Rules**:
- `description`: 10-500 characters, non-empty after trimming
- `learning_objectives`: 1-8 items, each 10-200 characters after trimming

---

### `POST /api/catalog/{course_id}/start`

Start a predefined course. Creates a `CourseInstance` with `sourceType: predefined` and immediately triggers the generation pipeline using the predefined course data combined with the user's learner profile (if available from PRD 6).

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `course_id` | string | The predefined course ID to start |

**Response** (`201 Created`):
```json
{
  "courseInstanceId": "uuid-here",
  "sourceType": "predefined",
  "sourceCourseId": "intro-python",
  "sourceCourseVersion": "1.0.0",
  "status": "generating"
}
```

This endpoint combines create + generate into one step for predefined courses because there is no user input to preview — the course definition is already complete.

**Error Responses**:
- `404 Not Found`: Course ID does not exist in the catalog
- `409 Conflict`: User already has an active (non-archived) instance of this course

---

## UI Specs

### Course Catalog Page (`/catalog`)

**Layout**: Full-width page accessible from the main navigation.

**Header Section**:
- Page title: "Course Catalog"
- Subtitle: "Browse courses or create your own"
- Search input field (Shadcn `Input` with search icon, placeholder: "Search courses...")
- Tag filter chips below search (Shadcn `Badge` components, clickable toggles)
  - All unique tags rendered as horizontally scrollable chips
  - Active tag highlighted with filled variant, inactive with outline variant
  - Clicking a tag filters the grid; clicking again removes the filter
  - Multiple tags can be active (OR logic: show courses matching any active tag)

**Course Grid**:
- Responsive grid: 1 column on mobile, 2 on tablet, 3 on desktop
- Each item is a `CourseCard` component (see below)
- Empty state when no matches: "No courses match your search. Try different keywords or create your own course."

**Create Custom Course CTA**:
- Prominent card or button at the top of the grid (or end of grid)
- Label: "Create Your Own Course"
- Icon: Plus icon from Lucide
- Clicking navigates to the custom course creation flow

**Data Fetching**:
- `GET /api/catalog` on mount with optional `q` and `tag` query params
- Debounced search (300ms) on keystroke in search field
- Tag filter appended as query param, triggers refetch

---

### CourseCard Component

Used in both the catalog page (predefined courses) and the "My Courses" page (all user courses).

**Catalog Variant** (predefined course, user has NOT started it):

```
+-----------------------------------------------+
|  [Tag] [Tag]                                   |
|                                                 |
|  Introduction to Python Programming             |
|                                                 |
|  Learn the fundamentals of Python programming   |
|  from variables and data types through...       |
|                                                 |
|  5 objectives  ·  ~8 hours                      |
|                                                 |
|  [ Start Course ]                               |
+-----------------------------------------------+
```

- Shadcn `Card` with `CardHeader`, `CardContent`, `CardFooter`
- Tags rendered as small `Badge` components (outline variant) in the header
- Course name as `CardTitle` (semibold, text-lg)
- Description truncated to 2-3 lines with ellipsis overflow
- Metadata line: objective count + estimated hours
- Primary action button: "Start Course" (Shadcn `Button`, default variant)

**In-Progress Variant** (user has an active course instance):

```
+-----------------------------------------------+
|  [Tag] [Tag]                    In Progress     |
|                                                 |
|  Introduction to Python Programming             |
|                                                 |
|  Learn the fundamentals of Python programming   |
|  from variables and data types through...       |
|                                                 |
|  ████████░░░░░░░░░░░░  40%                      |
|  2 of 5 lessons completed                       |
|                                                 |
|  [ Resume Course ]                              |
+-----------------------------------------------+
```

- Status badge in top-right: "In Progress" (Shadcn `Badge`, secondary variant)
- Progress bar (Shadcn `Progress` component) showing lesson completion percentage
- Progress text: "X of Y lessons completed"
- Action button: "Resume Course" (navigates to the current active lesson)

**Completed Variant** (user has completed the course):

```
+-----------------------------------------------+
|  [Tag] [Tag]                    ✓ Completed     |
|                                                 |
|  Introduction to Python Programming             |
|                                                 |
|  Learn the fundamentals of Python programming   |
|  from variables and data types through...       |
|                                                 |
|  ████████████████████  100%                     |
|  5 of 5 lessons completed  ·  Badge earned      |
|                                                 |
|  [ View Course ]    [ Start New ]               |
+-----------------------------------------------+
```

- Status badge: "Completed" with checkmark (Shadcn `Badge`, success/green variant)
- Full progress bar
- Badge indicator if a badge was earned (from PRD 8, if implemented)
- Two actions: "View Course" (read-only review) and "Start New" (fresh instance)

---

### Custom Course Creation Flow (`/courses/create`)

**Step 1 — Input**:

```
+-----------------------------------------------+
|  Create Your Own Course                         |
|                                                 |
|  What do you want to learn?                     |
|  +-------------------------------------------+ |
|  | Brief description of your course topic... | |
|  +-------------------------------------------+ |
|                                                 |
|  Learning Objectives                            |
|  What should you be able to do after this       |
|  course?                                        |
|                                                 |
|  1. [_______________________________________]   |
|  2. [_______________________________________]   |
|  3. [_______________________________________]   |
|  + Add another objective                        |
|                                                 |
|  [ Preview Course ]                             |
+-----------------------------------------------+
```

- Shadcn `Textarea` for description (with character count, min 10 / max 500)
- Dynamic objective inputs (Shadcn `Input`), minimum 1, maximum 8
- "Add another objective" button (disabled at 8)
- Remove button (X icon) on each objective (disabled when only 1 remains)
- Client-side validation: shows inline errors for empty fields, too-short objectives
- "Preview Course" button disabled until all validation passes

**Step 2 — Preview**:

```
+-----------------------------------------------+
|  Preview Your Course                            |
|                                                 |
|  Course Description                             |
|  Learn the basics of cooking healthy meals      |
|  at home with seasonal ingredients.             |
|                                                 |
|  Learning Objectives (3)                        |
|  1. Understand nutrition basics and meal        |
|     planning                                    |
|  2. Master fundamental knife skills and         |
|     cooking techniques                          |
|  3. Prepare a complete healthy meal from        |
|     scratch                                     |
|                                                 |
|  This will generate approximately 3 lessons     |
|  with activities and feedback.                  |
|                                                 |
|  [ Back to Edit ]    [ Generate Course ]        |
+-----------------------------------------------+
```

- Read-only display of the user's input
- Informational note about what generation will produce (lesson count = objective count)
- "Back to Edit" returns to Step 1 with input preserved (client-side state)
- "Generate Course" calls `POST /api/courses/create` then immediately triggers `POST /api/courses/generate` with the returned `courseInstanceId`

**Step 3 — Generating** (reuses existing generation UI from PRD 5):

- After clicking "Generate Course", redirect to the course page with the generation progress indicator (SSE streaming from PRD 5)
- Shows which lesson is currently generating

---

### My Courses Page (`/courses`)

Displays all of the current user's course instances in a card grid using the `CourseCard` component.

**Layout**:
- Page title: "My Courses"
- Tab bar or segmented control: "All" | "In Progress" | "Completed"
- Course card grid (same responsive layout as catalog)
- Empty state per tab:
  - "All": "You haven't started any courses yet. Browse the catalog to get started."
  - "In Progress": "No courses in progress."
  - "Completed": "No completed courses yet. Keep learning!"
- "Browse Catalog" link/button in empty states

**Sorting**: Most recently updated first (so the course the user is actively working on appears first).

**Data Fetching**: `GET /api/courses` (existing from PRD 4) with additional response fields for card rendering (source course name, progress percentage, badge status).

---

## Acceptance Criteria

### Predefined Course System

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-1 | Valid `course.json` files load at startup and are served by `GET /api/catalog` | Integration test |
| AC-2 | Invalid `course.json` files (missing fields, wrong types, bad semver) are rejected with logged errors and do not appear in catalog | Unit test |
| AC-3 | Directory name must match `courseId` in JSON; mismatch is a load error | Unit test |
| AC-4 | `CatalogService.reload()` picks up new/updated course files without server restart | Integration test |
| AC-5 | Starting a predefined course creates a `CourseInstance` with `sourceType: predefined`, `sourceCourseId`, and `sourceCourseVersion` | Integration test |

### Course Catalog UI

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-6 | Catalog page displays all predefined courses with name, description, tags, estimated hours | ADW test |
| AC-7 | Search filters courses by keyword (matches name, description, tags) with debounced input | ADW test |
| AC-8 | Tag chips filter the grid; multiple tags use OR logic | ADW test |
| AC-9 | "Start Course" on a predefined course creates instance and triggers generation | ADW test |
| AC-10 | Empty search results show a helpful message | ADW test |

### Custom Course Creation

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-11 | `POST /api/courses/create` with valid input returns 201 with `courseInstanceId` and `status: draft` | Integration test |
| AC-12 | `POST /api/courses/create` with empty description returns 422 | Integration test |
| AC-13 | `POST /api/courses/create` with 0 or >8 objectives returns 422 | Integration test |
| AC-14 | Preview step shows the user's input before generation is triggered | ADW test |
| AC-15 | Custom course `CourseInstance` has `sourceType: user_created` | Integration test |

### Course Cards

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-16 | In-progress courses show a progress bar with correct lesson completion percentage | ADW test |
| AC-17 | Completed courses show a completion badge/indicator | ADW test |
| AC-18 | In-progress courses show "Resume Course" action (navigates to current lesson) | ADW test |
| AC-19 | Completed courses show "View Course" and "Start New" actions | ADW test |
| AC-20 | Course cards sort by most recently updated | Integration test |

---

## Verification

### Unit Tests

**Course JSON Loader Validation** (`tests/unit/catalog/test_course_schema.py`):

```python
import pytest
from app.schemas.catalog import PredefinedCourse

class TestPredefinedCourseSchema:
    """Test course JSON validation against the PredefinedCourse schema."""

    def test_valid_course_loads(self, valid_course_json: str):
        """A well-formed course.json passes validation."""
        course = PredefinedCourse.model_validate_json(valid_course_json)
        assert course.course_id == "intro-python"
        assert course.version == "1.0.0"
        assert len(course.learning_objectives) == 5

    def test_missing_required_field_rejected(self):
        """course.json missing 'name' raises ValidationError."""
        raw = '{"courseId": "test", "version": "1.0.0", "description": "A test course for validation", "learningObjectives": ["Learn something important"], "estimatedHours": 5}'
        with pytest.raises(Exception, match="name"):
            PredefinedCourse.model_validate_json(raw)

    def test_invalid_semver_rejected(self):
        """Version string not matching X.Y.Z is rejected."""
        raw = '{"courseId": "test-course", "version": "1.0", "name": "Test", "description": "A test course for validation", "learningObjectives": ["Learn something important"], "estimatedHours": 5}'
        with pytest.raises(Exception, match="semver"):
            PredefinedCourse.model_validate_json(raw)

    def test_too_few_objectives_rejected(self):
        """Fewer than 2 objectives is rejected."""
        raw = '{"courseId": "test-course", "version": "1.0.0", "name": "Test", "description": "A test course for validation", "learningObjectives": ["Only one objective here"], "estimatedHours": 5}'
        with pytest.raises(Exception):
            PredefinedCourse.model_validate_json(raw)

    def test_too_many_objectives_rejected(self):
        """More than 10 objectives is rejected."""
        objectives = [f"Objective number {i} for testing" for i in range(11)]
        import json
        raw = json.dumps({
            "courseId": "test-course",
            "version": "1.0.0",
            "name": "Test",
            "description": "A test course for validation",
            "learningObjectives": objectives,
            "estimatedHours": 5
        })
        with pytest.raises(Exception):
            PredefinedCourse.model_validate_json(raw)

    def test_short_objective_rejected(self):
        """Objectives shorter than 10 characters are rejected."""
        raw = '{"courseId": "test-course", "version": "1.0.0", "name": "Test", "description": "A test course for validation", "learningObjectives": ["Short", "Another reasonable objective here"], "estimatedHours": 5}'
        with pytest.raises(Exception, match="too short"):
            PredefinedCourse.model_validate_json(raw)

    def test_invalid_course_id_rejected(self):
        """courseId with uppercase or special chars is rejected."""
        raw = '{"courseId": "My Course!", "version": "1.0.0", "name": "Test", "description": "A test course for validation", "learningObjectives": ["Learn something important", "Learn another thing"], "estimatedHours": 5}'
        with pytest.raises(Exception):
            PredefinedCourse.model_validate_json(raw)

    def test_invalid_tag_format_rejected(self):
        """Tags with uppercase or spaces are rejected."""
        raw = '{"courseId": "test-course", "version": "1.0.0", "name": "Test", "description": "A test course for validation", "learningObjectives": ["Learn something important", "Learn another thing"], "tags": ["Good Tag"], "estimatedHours": 5}'
        with pytest.raises(Exception, match="lowercase"):
            PredefinedCourse.model_validate_json(raw)

    def test_zero_estimated_hours_rejected(self):
        """estimatedHours must be > 0."""
        raw = '{"courseId": "test-course", "version": "1.0.0", "name": "Test", "description": "A test course for validation", "learningObjectives": ["Learn something important", "Learn another thing"], "estimatedHours": 0}'
        with pytest.raises(Exception):
            PredefinedCourse.model_validate_json(raw)

    def test_version_parsing(self):
        """Valid semver versions are accepted."""
        for v in ["1.0.0", "2.3.1", "10.20.30"]:
            raw = f'{{"courseId": "test-course", "version": "{v}", "name": "Test Course Name", "description": "A test course for version validation", "learningObjectives": ["Learn something important", "Learn another thing"], "estimatedHours": 5}}'
            course = PredefinedCourse.model_validate_json(raw)
            assert course.version == v
```

**Catalog Service** (`tests/unit/catalog/test_catalog_service.py`):

```python
class TestCatalogService:
    """Test the CatalogService loader and query methods."""

    def test_loads_valid_courses_from_directory(self, tmp_courses_dir):
        """Valid course.json files are loaded into the catalog."""
        service = CatalogService(courses_dir=tmp_courses_dir)
        service.load()
        assert len(service.list_all()) == 3  # 3 seed courses

    def test_skips_invalid_courses_with_error(self, tmp_courses_dir_with_invalid):
        """Invalid course.json files are skipped with logged errors."""
        service = CatalogService(courses_dir=tmp_courses_dir_with_invalid)
        service.load()
        assert len(service.load_errors) > 0
        # Valid courses still load
        assert len(service.list_all()) > 0

    def test_directory_name_mismatch_rejected(self, tmp_courses_dir_mismatch):
        """Course where directory name != courseId is rejected."""
        service = CatalogService(courses_dir=tmp_courses_dir_mismatch)
        service.load()
        assert "wrong-dir-name" in service.load_errors

    def test_search_by_keyword(self, loaded_catalog_service):
        """Search matches against name, description, and tags."""
        results = loaded_catalog_service.search("python")
        assert len(results) >= 1
        assert results[0].course_id == "intro-python"

    def test_filter_by_tag(self, loaded_catalog_service):
        """Filter returns only courses with the specified tag."""
        results = loaded_catalog_service.filter_by_tag("beginner")
        assert all("beginner" in c.tags for c in results)

    def test_get_all_tags(self, loaded_catalog_service):
        """Returns sorted unique tags across all courses."""
        tags = loaded_catalog_service.get_all_tags()
        assert tags == sorted(set(tags))
        assert len(tags) > 0

    def test_get_nonexistent_course_returns_none(self, loaded_catalog_service):
        """get() returns None for unknown course ID."""
        assert loaded_catalog_service.get("nonexistent") is None

    def test_reload_picks_up_new_courses(self, tmp_courses_dir):
        """After adding a new course file and calling reload(), it appears."""
        service = CatalogService(courses_dir=tmp_courses_dir)
        service.load()
        initial_count = len(service.list_all())
        # Add a new course directory and file
        new_dir = tmp_courses_dir / "new-course"
        new_dir.mkdir()
        (new_dir / "course.json").write_text(VALID_NEW_COURSE_JSON)
        service.reload()
        assert len(service.list_all()) == initial_count + 1
```

**Custom Course Input Validation** (`tests/unit/catalog/test_course_create.py`):

```python
class TestCourseCreateInput:
    """Test custom course creation input validation."""

    def test_valid_input_accepted(self):
        inp = CourseCreateInput(
            description="Learn the basics of cooking healthy meals",
            learning_objectives=[
                "Understand nutrition basics and meal planning",
                "Master fundamental knife skills",
            ]
        )
        assert len(inp.learning_objectives) == 2

    def test_empty_description_rejected(self):
        with pytest.raises(Exception):
            CourseCreateInput(
                description="",
                learning_objectives=["Learn something important here"]
            )

    def test_too_short_description_rejected(self):
        with pytest.raises(Exception):
            CourseCreateInput(
                description="Short",
                learning_objectives=["Learn something important here"]
            )

    def test_zero_objectives_rejected(self):
        with pytest.raises(Exception):
            CourseCreateInput(
                description="A valid description for the course",
                learning_objectives=[]
            )

    def test_too_many_objectives_rejected(self):
        with pytest.raises(Exception):
            CourseCreateInput(
                description="A valid description for the course",
                learning_objectives=[f"Objective number {i} text here" for i in range(9)]
            )

    def test_short_objective_rejected(self):
        with pytest.raises(Exception):
            CourseCreateInput(
                description="A valid description for the course",
                learning_objectives=["Too short"]
            )

    def test_objectives_are_trimmed(self):
        inp = CourseCreateInput(
            description="A valid description for the course",
            learning_objectives=["  Learn something important here  "]
        )
        assert inp.learning_objectives[0] == "Learn something important here"
```

### Integration Tests

**Catalog API** (`tests/integration/api/test_catalog_api.py`):

```python
class TestCatalogAPI:
    """Integration tests for catalog endpoints with seeded courses."""

    async def test_get_catalog_returns_all_courses(self, client, seeded_catalog):
        """GET /api/catalog returns all seeded predefined courses."""
        resp = await client.get("/api/catalog")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3
        assert len(data["courses"]) == 3
        assert len(data["tags"]) > 0

    async def test_get_catalog_filter_by_tag(self, client, seeded_catalog):
        """GET /api/catalog?tag=beginner returns only beginner courses."""
        resp = await client.get("/api/catalog", params={"tag": "beginner"})
        assert resp.status_code == 200
        for course in resp.json()["courses"]:
            assert "beginner" in course["tags"]

    async def test_get_catalog_search(self, client, seeded_catalog):
        """GET /api/catalog?q=python returns matching courses."""
        resp = await client.get("/api/catalog", params={"q": "python"})
        assert resp.status_code == 200
        assert any(
            "python" in c["name"].lower() or "python" in c["description"].lower()
            for c in resp.json()["courses"]
        )

    async def test_get_catalog_detail(self, client, seeded_catalog):
        """GET /api/catalog/intro-python returns full course detail."""
        resp = await client.get("/api/catalog/intro-python")
        assert resp.status_code == 200
        assert resp.json()["courseId"] == "intro-python"

    async def test_get_catalog_detail_not_found(self, client, seeded_catalog):
        """GET /api/catalog/nonexistent returns 404."""
        resp = await client.get("/api/catalog/nonexistent")
        assert resp.status_code == 404

    async def test_create_custom_course(self, client):
        """POST /api/courses/create stores a draft CourseInstance."""
        resp = await client.post("/api/courses/create", json={
            "description": "Learn the basics of cooking healthy meals at home",
            "learningObjectives": [
                "Understand nutrition basics and meal planning",
                "Master fundamental knife skills and cooking techniques",
            ]
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["sourceType"] == "user_created"
        assert data["status"] == "draft"
        assert data["courseInstanceId"]

    async def test_create_custom_course_empty_description(self, client):
        """POST /api/courses/create with empty description returns 422."""
        resp = await client.post("/api/courses/create", json={
            "description": "",
            "learningObjectives": ["Learn something important here"]
        })
        assert resp.status_code == 422

    async def test_start_predefined_course(self, client, seeded_catalog):
        """POST /api/catalog/intro-python/start creates instance and triggers generation."""
        resp = await client.post("/api/catalog/intro-python/start")
        assert resp.status_code == 201
        data = resp.json()
        assert data["sourceType"] == "predefined"
        assert data["sourceCourseId"] == "intro-python"
        assert data["sourceCourseVersion"] == "1.0.0"
        assert data["status"] == "generating"

    async def test_start_nonexistent_course_returns_404(self, client, seeded_catalog):
        """POST /api/catalog/nonexistent/start returns 404."""
        resp = await client.post("/api/catalog/nonexistent/start")
        assert resp.status_code == 404

    async def test_course_cards_show_progress(self, client, course_with_progress):
        """GET /api/courses returns progress data for in-progress courses."""
        resp = await client.get("/api/courses")
        assert resp.status_code == 200
        courses = resp.json()["courses"]
        in_progress = [c for c in courses if c["status"] == "in_progress"]
        assert len(in_progress) > 0
        assert "progressPercent" in in_progress[0]
        assert "completedLessons" in in_progress[0]
        assert "totalLessons" in in_progress[0]
```

### ADW Implementation Pattern

ADW tests are **single-file `uv` scripts** using [PEP 723 inline script metadata](https://peps.python.org/pep-0723/). Each test is a self-contained `.py` file that can be run directly with `uv run`:

```bash
# Run a single ADW test
uv run tests/adw/09_course_catalog.py

# Run all ADW tests
uv run tests/adw/run_all.py
```

**Script structure** — every ADW test follows this pattern:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""ADW Test: Course Catalog — discovery, search, filtering, and course creation."""

import json
import shutil
import subprocess
import sys
from pathlib import Path

PROMPT = """\
You are a QA tester for the 1111 School learning platform.
The app is running at http://localhost:5173 and the backend at http://localhost:8000.
Use agent-browser to automate the browser.

TEST: Course Discovery & Catalog

## Prerequisites
Ensure the backend has seeded predefined courses in /app/courses/.

## Steps

### 1. Browse Catalog
1. `agent-browser open http://localhost:5173/catalog`
2. `agent-browser snapshot -i` to see catalog page
3. Verify predefined courses are displayed as cards

VERIFY:
- [ ] At least 2 predefined courses visible with names and descriptions
- [ ] Each course card shows tags, estimated hours
- [ ] "Create Your Own Course" option is visible

### 2. Search Courses
1. Find the search input field
2. `agent-browser fill @search_ref "python"`
3. Wait briefly for debounced search, then re-snapshot
4. Verify filtered results

VERIFY:
- [ ] Search results contain only courses matching "python" (in name, description, or tags)
- [ ] Non-matching courses are NOT visible
- [ ] Results make semantic sense (not random)

### 3. Filter by Tag
1. Clear search, re-snapshot to see all courses
2. Click a tag chip (e.g., "beginner")
3. Re-snapshot

VERIFY:
- [ ] Only courses with the "beginner" tag are shown
- [ ] Tag chip is visually highlighted as active

### 4. Start Predefined Course
1. Click "Start Course" on a predefined course (e.g., Introduction to Python)
2. Wait for generation to begin (progress indicator should appear)
3. Snapshot the generation state

VERIFY:
- [ ] Generation progress indicator is visible
- [ ] User is redirected to course page or generation view
- [ ] No error messages displayed

### 5. Create Custom Course
1. Navigate back to catalog
2. Click "Create Your Own Course"
3. Fill in description: "Learn the fundamentals of web accessibility"
4. Add 3 objectives:
   - "Understand WCAG 2.1 guidelines and conformance levels"
   - "Audit web pages for common accessibility issues"
   - "Implement accessible forms, navigation, and media"
5. Click "Preview Course"

VERIFY:
- [ ] Preview screen shows the entered description and all 3 objectives
- [ ] Lesson count estimate is shown (should be approximately 3)
- [ ] "Back to Edit" and "Generate Course" buttons are visible

6. Click "Generate Course"
7. Wait for generation to begin

VERIFY:
- [ ] Generation starts (progress indicator visible)
- [ ] Course instance was created (visible in course list)

### 6. Verify Course Cards
1. Navigate to My Courses page (/courses)
2. Snapshot the course list

VERIFY:
- [ ] In-progress courses show a progress bar with percentage
- [ ] The predefined course started in step 4 appears
- [ ] The custom course created in step 5 appears
- [ ] "Resume Course" button visible on in-progress courses
- [ ] If any completed courses exist, they show a completion indicator

### 7. Screenshots
- `agent-browser screenshot --annotate ./test-results/09_catalog_browse.png`
- `agent-browser screenshot --annotate ./test-results/09_catalog_search.png`
- `agent-browser screenshot --annotate ./test-results/09_custom_create.png`
- `agent-browser screenshot --annotate ./test-results/09_course_cards.png`

Output a JSON object:
{"test": "course_catalog", "passed": true/false, "checks": [...], "notes": "..."}
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

The prompt content is embedded in the `PROMPT` variable in the script above. For reference, the original prompt file is `tests/adw/prompts/09_course_catalog.md`.

---

## Definition of Done

- [ ] **Course JSON schema** is defined as a Pydantic model with full validation (semver, courseId format, objective count/length, tag format, estimated hours range).
- [ ] **Catalog service** loads all valid course.json files from `/app/courses/` at startup, rejects invalid files with logged errors, and supports reload without restart.
- [ ] **Three seed courses** ship with the application (e.g., intro-python, project-management-fundamentals, digital-photography).
- [ ] **`GET /api/catalog`** returns all predefined courses with search (`q`) and tag filter support, plus the full unique tag list.
- [ ] **`GET /api/catalog/{id}`** returns a single predefined course or 404.
- [ ] **`POST /api/catalog/{id}/start`** creates a `CourseInstance` with `sourceType: predefined` and triggers the generation pipeline.
- [ ] **`POST /api/courses/create`** validates user input and creates a draft `CourseInstance` with `sourceType: user_created`.
- [ ] **Catalog page** renders a searchable, filterable grid of predefined course cards with "Start Course" action.
- [ ] **Custom creation flow** has input, preview, and generate steps with client-side and server-side validation.
- [ ] **CourseCard component** renders three variants (catalog, in-progress, completed) with appropriate progress indicators and actions.
- [ ] **My Courses page** shows all user course instances sorted by most recently updated, with tab filtering (All / In Progress / Completed).
- [ ] **Unit tests pass**: course JSON loader validation (valid + all invalid variants), version parsing, catalog service search/filter/reload, custom course input validation.
- [ ] **Integration tests pass**: seed courses via GET catalog, filter by tag, search by keyword, create custom course, start predefined course, verify 404/422 error cases.
- [ ] **ADW test (`09_course_catalog.md`) passes**: browse catalog, search, filter by tag, start predefined course, create custom course with preview, verify course cards show progress.
- [ ] **No regressions** in existing PRD 1-5 tests (course generation, activity submission, progression, frontend integration).
