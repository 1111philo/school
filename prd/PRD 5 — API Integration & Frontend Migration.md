---
title: "PRD 5 — API Integration & Frontend Migration"
phase: Integration (MVP Complete)
depends-on:
  - PRD 2 — Course Generation Pipeline
  - PRD 3 — Activity & Feedback System
  - PRD 4 — Course Progression Engine
agents: None (frontend work + minimal backend SSE)
size: Medium
status: Draft
---

# PRD 5 — API Integration & Frontend Migration

## Overview

This PRD bridges the existing React 19 SPA with the Python backend built in PRDs 1-4. The current frontend calls Google Gemini directly from the browser via `GenAIService.ts` and persists all state to localStorage via Zustand's `persist` middleware. After this PRD, the frontend communicates exclusively with the FastAPI backend over REST + SSE, the Zustand store is API-backed with local caching, and the user can create a course, read lessons, submit activities, receive feedback, and progress through to completion — end to end.

This is the final PRD before the MVP boundary. Completing it means a user can experience the full core learning loop through the real UI.

## Goals

1. **Replace all client-side LLM calls** with backend API calls. No Google Gemini SDK in the browser. No API key stored client-side.
2. **Stream course generation progress** via SSE so the UI shows which agent is running and updates progressively as lessons are generated.
3. **Migrate Zustand from localStorage-only to API-backed state** while preserving optimistic UI and local caching for reads.
4. **Graceful error handling and loading states** across all async operations: generation, submission, course loading.
5. **CORS configuration** so the Vite dev server (port 5173) and production frontend can reach the FastAPI backend (port 8000).

## Non-Goals

- **No new UI screens or features.** This PRD rewires existing screens to use the backend. The visual design, layout, and interaction patterns stay the same.
- **No authentication.** The system remains single-user. Auth wraps around everything in PRD 11.
- **No visual aid rendering changes.** The `visualGenerator.ts` service is removed (visual generation moves server-side in PRD 7). Lessons without visuals render normally.
- **No chat-based course creation flow migration.** The existing `ChatView` conversational flow (`continueConversation`) is replaced by a simpler course creation form that posts a description + objectives to the backend. The conversational UX is a v2 enhancement.
- **No offline mode.** Local caching improves perceived performance but the app requires a network connection for all writes.

## Scope

### 1. API Client Module

Replace `src/services/GenAIService.ts` and `src/services/visualGenerator.ts` with a single `src/services/apiClient.ts` module.

### 2. SSE Streaming for Course Generation

Backend SSE endpoint + frontend EventSource client for real-time generation progress.

### 3. Zustand Store Migration

Rewrite `src/store/useAppStore.ts` to use API-backed state management instead of localStorage + direct GenAI calls.

### 4. Error Handling & Loading States

Systematic error handling, retry logic, and loading UI across all async flows.

### 5. CORS & Backend Configuration

Minimal backend changes to support frontend integration.

### 6. Cleanup

Remove dead code, unused dependencies, and the client-side API key settings flow.

---

## Technical Design

### 1. API Client (`src/services/apiClient.ts`)

A thin, typed HTTP client wrapping `fetch`. No external HTTP library needed — the browser's `fetch` API is sufficient.

#### Base Configuration

```typescript
// src/services/apiClient.ts

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface ApiError {
  detail: string;
  status: number;
}

class ApiClientError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiClientError';
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      detail = body.detail || detail;
    } catch {
      // response body not JSON
    }
    throw new ApiClientError(response.status, detail);
  }

  // Handle 204 No Content
  if (response.status === 204) return undefined as T;

  return response.json();
}
```

#### Endpoint Methods

Each method maps 1:1 to a backend endpoint from PRDs 2-4.

```typescript
// --- Course Generation (PRD 2) ---

export interface GenerateCourseRequest {
  description: string;
  objectives: string[];
}

// Returns the SSE stream URL — actual generation uses SSE (see section 2).
// This POST initiates generation and returns a course ID for tracking.
export async function generateCourse(
  input: GenerateCourseRequest
): Promise<{ courseId: string }> {
  return request('/api/courses/generate', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// --- Course CRUD (PRD 4) ---

export interface CourseSummary {
  id: string;
  title: string;
  description: string;
  state: string;
  createdAt: string;
  progress: number;
  totalLessons: number;
  completedLessons: number;
}

export interface CourseDetail {
  id: string;
  title: string;
  description: string;
  state: string;
  roadmap: LessonRoadmap[];
  lessons: LessonDetail[];
  progress: number;
  totalLessons: number;
  completedLessons: number;
}

export interface LessonRoadmap {
  id: string;
  title: string;
  description: string;
  order: number;
}

export interface LessonDetail {
  id: string;
  title: string;
  content: string;
  visualExplanation?: string;
  activity: ActivitySpec;
  state: 'locked' | 'unlocked' | 'completed';
  comprehensionScore?: number;
  attempts: number;
}

export interface ActivitySpec {
  id: string;
  type: string;
  instructions: string;
  prompt: string;
  config: Record<string, unknown>;
  passingScore: number;
}

export async function listCourses(): Promise<CourseSummary[]> {
  return request('/api/courses');
}

export async function getCourse(courseId: string): Promise<CourseDetail> {
  return request(`/api/courses/${courseId}`);
}

export async function deleteCourse(courseId: string): Promise<void> {
  return request(`/api/courses/${courseId}`, { method: 'DELETE' });
}

export async function getCourseProgress(
  courseId: string
): Promise<{ progress: number; completedLessons: number; totalLessons: number }> {
  return request(`/api/courses/${courseId}/progress`);
}

export async function markLessonViewed(lessonId: string): Promise<void> {
  return request(`/api/lessons/${lessonId}/viewed`, { method: 'POST' });
}

// --- Activity Submission (PRD 3) ---

export interface SubmitActivityRequest {
  response: string;          // text response for short-response / multiple-choice answer
  responseImage?: string;    // base64 for drawing activities (future)
}

export interface ActivityReviewResponse {
  score: number;
  maxScore: number;
  rationale: string;
  strengths: string[];
  improvements: string[];
  tips: string[];
  masteryDecision: 'not_yet' | 'meets' | 'exceeds';
  nextLessonUnlocked: boolean;
}

export async function submitActivity(
  activityId: string,
  submission: SubmitActivityRequest
): Promise<ActivityReviewResponse> {
  return request(`/api/activities/${activityId}/submit`, {
    method: 'POST',
    body: JSON.stringify(submission),
  });
}

// --- Course State Transitions (PRD 4) ---

export async function transitionCourseState(
  courseId: string,
  targetState: string
): Promise<void> {
  return request(`/api/courses/${courseId}/state`, {
    method: 'PATCH',
    body: JSON.stringify({ state: targetState }),
  });
}

// --- Lesson Regeneration (PRD 4) ---

export async function regenerateLesson(
  lessonId: string,
  variant?: 'more_examples' | 'simpler'
): Promise<LessonDetail> {
  return request(`/api/lessons/${lessonId}/regenerate`, {
    method: 'POST',
    body: JSON.stringify({ variant }),
  });
}

// --- Health Check ---

export async function healthCheck(): Promise<{ status: string }> {
  return request('/api/health');
}
```

#### Migration Mapping

| Current (GenAIService method) | New (apiClient function) | Notes |
|-------------------------------|--------------------------|-------|
| `continueConversation()` | Removed | Chat-based flow replaced by direct course creation form |
| `generateCourse()` | `generateCourse()` + SSE stream | Two-phase: POST initiates, SSE streams progress |
| `generateNextLesson()` | Handled server-side | Backend generates next lesson on activity completion via progression engine |
| `generateRemedialActivity()` | Handled server-side | Backend generates remedial activity on failed submission |
| `assessActivity()` | `submitActivity()` | Server runs `activity_reviewer` agent |
| `tuneLesson()` | `regenerateLesson()` | Server re-runs `lesson_writer` with variant param |

Files to delete after migration:
- `src/services/GenAIService.ts`
- `src/services/visualGenerator.ts`

Dependencies to remove from `package.json`:
- `@google/genai`

---

### 2. SSE Streaming for Course Generation

#### Backend SSE Endpoint

The backend exposes an SSE endpoint that wraps the `pydantic_graph` course generation pipeline. Each graph node emits an event as it starts and completes.

```
GET /api/courses/{courseId}/generation-stream
```

This endpoint is opened by the frontend after the `POST /api/courses/generate` call returns the `courseId`. The backend holds the connection open and pushes events as the pipeline executes.

**Event Format:**

```
event: agent_start
data: {"agent": "course_describer", "step": 1, "totalSteps": 3, "message": "Analyzing your course description..."}

event: agent_complete
data: {"agent": "course_describer", "step": 1, "totalSteps": 3}

event: agent_start
data: {"agent": "lesson_planner", "step": 2, "totalSteps": 3, "lessonIndex": 0, "message": "Planning lesson 1..."}

event: lesson_ready
data: {"lessonIndex": 0, "lesson": { ...partial LessonDetail... }}

event: agent_start
data: {"agent": "lesson_writer", "step": 3, "totalSteps": 3, "lessonIndex": 0, "message": "Writing lesson 1 content..."}

event: lesson_ready
data: {"lessonIndex": 0, "lesson": { ...full LessonDetail... }}

event: generation_complete
data: {"courseId": "...", "totalLessons": 3}

event: error
data: {"message": "Generation failed: ...", "retryable": true}
```

**Backend Implementation Pattern:**

```python
# backend/app/api/routes/courses.py (SSE endpoint addition)

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import json

router = APIRouter()

@router.get("/api/courses/{course_id}/generation-stream")
async def generation_stream(course_id: str):
    async def event_generator():
        # Get the running generation pipeline for this course
        pipeline = await get_generation_pipeline(course_id)

        async for event in pipeline.events():
            yield f"event: {event.type}\ndata: {json.dumps(event.data)}\n\n"

        yield f"event: generation_complete\ndata: {json.dumps({'courseId': course_id})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )
```

Alternatively, if using `AGUIAdapter` from PydanticAI:

```python
from pydantic_ai.agent_gui import AGUIAdapter

@router.post("/api/courses/generate-stream")
async def generate_course_stream(request: GenerateCourseRequest):
    return AGUIAdapter.dispatch_request(request, agent=course_generation_agent)
```

The choice between manual `StreamingResponse` and `AGUIAdapter` depends on the level of control needed over event formatting. For MVP, manual streaming gives clearer control over the event schema.

#### Frontend SSE Client

```typescript
// src/services/sseClient.ts

export interface GenerationEvent {
  type: 'agent_start' | 'agent_complete' | 'lesson_ready' | 'generation_complete' | 'error';
  data: Record<string, unknown>;
}

export type GenerationEventHandler = (event: GenerationEvent) => void;

export function connectGenerationStream(
  courseId: string,
  onEvent: GenerationEventHandler,
  onError?: (error: Event) => void
): () => void {
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const url = `${apiBase}/api/courses/${courseId}/generation-stream`;
  const eventSource = new EventSource(url);

  const eventTypes = [
    'agent_start',
    'agent_complete',
    'lesson_ready',
    'generation_complete',
    'error',
  ] as const;

  for (const eventType of eventTypes) {
    eventSource.addEventListener(eventType, (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        onEvent({ type: eventType, data });
      } catch (err) {
        console.error(`Failed to parse SSE event (${eventType}):`, err);
      }
    });
  }

  eventSource.onerror = (e) => {
    if (onError) {
      onError(e);
    } else {
      console.error('SSE connection error:', e);
    }
    eventSource.close();
  };

  // Return cleanup function
  return () => {
    eventSource.close();
  };
}
```

#### Generation Progress UI

Replace the current spinner in `App.tsx` (the `COURSE_GENERATION` state) with a multi-step progress indicator:

```typescript
// src/components/GenerationProgress.tsx

interface GenerationProgressProps {
  currentAgent: string | null;
  currentStep: number;
  totalSteps: number;
  lessonsReady: number;
  totalLessons: number | null;
  message: string;
  error: string | null;
  onRetry: () => void;
}
```

The component displays:
1. A vertical stepper showing agent pipeline stages (Describing Course -> Planning Lessons -> Writing Content).
2. The currently active step with an animated indicator.
3. A count of lessons generated so far (e.g., "2 of 4 lessons ready").
4. A status message from the current agent.
5. On error: the error message + a "Retry Generation" button.

---

### 3. Zustand Store Migration

The store migration restructures `useAppStore` from a monolithic store that directly invokes `GenAIService` into one that delegates to `apiClient` and manages loading/error states explicitly.

#### Current Store Shape vs. New Store Shape

```typescript
// CURRENT (src/store/useAppStore.ts)
interface AppStore {
  appState: AppState;
  activeChatSession: ChatSession | null;    // REMOVE: chat flow replaced
  savedCourses: SavedCourse[];              // REPLACE: API-backed
  currentCourseId: string | null;
  currentCourse: Course | null;             // REPLACE: API-backed
  currentLessonIndex: number;
  logs: LogEntry[];                         // REMOVE: logs move to backend
  isGenerating: boolean;
  settings: UserSettings;                   // SIMPLIFY: no more apiKey
  // ... actions that call GenAIService
}

// NEW (src/store/useAppStore.ts)
interface AppStore {
  // --- Navigation ---
  appState: AppState;  // 'COURSES' | 'COURSE_CREATION' | 'COURSE_GENERATION' | 'LEARNING' | 'SETTINGS'

  // --- Course List (cached from API) ---
  courses: CourseSummary[];
  coursesLoading: boolean;
  coursesError: string | null;

  // --- Active Course (cached from API) ---
  currentCourseId: string | null;
  currentCourse: CourseDetail | null;
  currentCourseLoading: boolean;
  currentCourseError: string | null;
  currentLessonIndex: number;

  // --- Generation Progress ---
  generationCourseId: string | null;
  generationProgress: {
    currentAgent: string | null;
    currentStep: number;
    totalSteps: number;
    lessonsReady: number;
    totalLessons: number | null;
    message: string;
  };
  generationError: string | null;

  // --- Activity Submission ---
  submissionLoading: boolean;
  submissionError: string | null;
  lastReview: ActivityReviewResponse | null;

  // --- Settings ---
  settings: {
    userName: string;
  };

  // --- Actions ---
  fetchCourses: () => Promise<void>;
  fetchCourse: (courseId: string) => Promise<void>;
  startCourseGeneration: (description: string, objectives: string[]) => Promise<void>;
  deleteCourse: (courseId: string) => Promise<void>;
  submitActivity: (activityId: string, response: string) => Promise<void>;
  setCurrentLessonIndex: (index: number) => void;
  setAppState: (state: AppState) => void;
  updateSettings: (settings: Partial<{ userName: string }>) => void;
  clearSubmissionState: () => void;
  retryGeneration: () => Promise<void>;
}
```

#### State Transition Changes

| Current State | New State | Notes |
|--------------|-----------|-------|
| `CHAT` | `COURSE_CREATION` | Renamed. No longer a chat — it's a form with description + objectives inputs. |
| `COURSE_GENERATION` | `COURSE_GENERATION` | Same name, but now driven by SSE events instead of a single Promise. |
| `LEARNING` | `LEARNING` | Same. Course data fetched from API instead of localStorage. |
| `COURSES` | `COURSES` | Same. Course list fetched from API. |
| `SETTINGS` | `SETTINGS` | Simplified. No API key field. Only userName. |

#### Persistence Strategy

The new store uses `persist` middleware with a minimal footprint — only caching what's needed for fast startup:

```typescript
persist(
  storeCreator,
  {
    name: '1111-school-storage',
    partialize: (state) => ({
      settings: state.settings,
      // Cache course list for instant display on reload
      courses: state.courses,
      // Cache current course for resume-on-reload
      currentCourseId: state.currentCourseId,
      currentCourse: state.currentCourse,
      currentLessonIndex: state.currentLessonIndex,
    }),
  }
)
```

On app startup, the store:
1. Hydrates from localStorage (instant display of cached data).
2. Fires `fetchCourses()` in the background to refresh from the API.
3. If `currentCourseId` is set, fires `fetchCourse(currentCourseId)` to refresh.

This gives the user an instant UI on reload while ensuring data is fresh from the server.

#### Key Action Implementations

**`startCourseGeneration`** — replaces `generateCourse`:

```typescript
startCourseGeneration: async (description, objectives) => {
  set({
    appState: 'COURSE_GENERATION',
    generationError: null,
    generationProgress: {
      currentAgent: null,
      currentStep: 0,
      totalSteps: 0,
      lessonsReady: 0,
      totalLessons: null,
      message: 'Starting course generation...',
    },
  });

  try {
    // 1. Initiate generation
    const { courseId } = await apiClient.generateCourse({ description, objectives });
    set({ generationCourseId: courseId });

    // 2. Connect SSE stream
    const disconnect = connectGenerationStream(
      courseId,
      (event) => {
        const state = get();
        switch (event.type) {
          case 'agent_start':
            set({
              generationProgress: {
                ...state.generationProgress,
                currentAgent: event.data.agent as string,
                currentStep: event.data.step as number,
                totalSteps: event.data.totalSteps as number,
                message: event.data.message as string,
              },
            });
            break;

          case 'lesson_ready':
            set({
              generationProgress: {
                ...state.generationProgress,
                lessonsReady: state.generationProgress.lessonsReady + 1,
              },
            });
            break;

          case 'generation_complete':
            set({
              generationProgress: {
                ...state.generationProgress,
                totalLessons: event.data.totalLessons as number,
                message: 'Course ready!',
              },
            });
            // Fetch the complete course and transition to LEARNING
            get().fetchCourse(courseId).then(() => {
              set({
                appState: 'LEARNING',
                currentLessonIndex: 0,
                generationCourseId: null,
              });
            });
            disconnect();
            break;

          case 'error':
            set({
              generationError: event.data.message as string,
            });
            disconnect();
            break;
        }
      },
      () => {
        set({ generationError: 'Lost connection to server. Please retry.' });
      }
    );
  } catch (error) {
    set({
      generationError: error instanceof Error ? error.message : 'Generation failed',
    });
  }
},
```

**`submitActivity`** — replaces the inline `GenAIService.assessActivity` + `completeLesson` + `generateNextLesson` chain:

```typescript
submitActivity: async (activityId, response) => {
  set({ submissionLoading: true, submissionError: null, lastReview: null });

  try {
    const review = await apiClient.submitActivity(activityId, { response });
    set({ lastReview: review, submissionLoading: false });

    // If next lesson was unlocked, refresh the course to get updated lesson states
    if (review.nextLessonUnlocked) {
      const courseId = get().currentCourseId;
      if (courseId) {
        await get().fetchCourse(courseId);
      }
    }
  } catch (error) {
    set({
      submissionError: error instanceof Error ? error.message : 'Submission failed',
      submissionLoading: false,
    });
  }
},
```

**`fetchCourses`** — new, replaces reading from localStorage:

```typescript
fetchCourses: async () => {
  set({ coursesLoading: true, coursesError: null });
  try {
    const courses = await apiClient.listCourses();
    set({ courses, coursesLoading: false });
  } catch (error) {
    set({
      coursesError: error instanceof Error ? error.message : 'Failed to load courses',
      coursesLoading: false,
    });
  }
},
```

---

### 4. Error Handling

#### Retry Strategy

| Operation | Retry Behavior | Max Retries | Backoff |
|-----------|---------------|-------------|---------|
| Course generation | Manual retry button (user-initiated) | Unlimited | N/A |
| Activity submission | Automatic retry with exponential backoff | 3 | 1s, 2s, 4s |
| Course list fetch | Automatic retry on mount | 2 | 1s, 2s |
| Course detail fetch | Automatic retry on mount | 2 | 1s, 2s |
| SSE connection loss | Auto-reconnect with backoff | 5 | 1s, 2s, 4s, 8s, 16s |

#### Retry Utility

```typescript
// src/services/retry.ts

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number; onRetry?: (attempt: number, error: Error) => void } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, onRetry } = options;
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        onRetry?.(attempt + 1, lastError);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}
```

#### Error Display Patterns

- **Inline errors**: Activity submission failures show beneath the submit button with a retry link.
- **Toast/banner errors**: Network failures show a dismissible banner at the top of the screen.
- **Full-screen errors**: Generation failures show in the generation progress component with a prominent retry button.
- **Stale data indicator**: When a background refresh fails but cached data exists, show a subtle "Last updated X minutes ago" indicator rather than replacing the UI with an error.

#### Graceful Degradation

If the backend is unreachable:
1. Cached course list and current course remain visible (read from localStorage).
2. All write operations (generate, submit, delete) show error messages.
3. The app does not crash or show a blank screen.

---

### 5. CORS Configuration

Add CORS middleware to the FastAPI app to allow requests from the frontend origin.

```python
# backend/app/main.py (addition)

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",    # Vite dev server
        "http://localhost:4173",    # Vite preview
        "https://1111.school",      # Production (future)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

For SSE endpoints, ensure the response includes CORS headers. FastAPI's CORSMiddleware handles this automatically for `StreamingResponse`.

Vite dev server proxy (alternative to CORS for development):

```typescript
// vite.config.ts (optional, if CORS is problematic in dev)
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
```

Using a Vite proxy eliminates CORS issues entirely during development and is the recommended approach. If the proxy is used, `API_BASE` defaults to `''` (empty string, same origin) in development.

---

## Migration Plan

The migration is ordered to minimize risk. Each step leaves the app in a working state (even if partially degraded).

### Step 1: Add API Client and SSE Client (no behavioral change)

**Files created:**
- `src/services/apiClient.ts`
- `src/services/sseClient.ts`
- `src/services/retry.ts`

**Files modified:** None.

**Verification:** TypeScript compiles. API client types align with backend response schemas from PRDs 2-4.

---

### Step 2: Add CORS and SSE Endpoint to Backend

**Files modified:**
- `backend/app/main.py` — add CORSMiddleware
- `backend/app/api/routes/courses.py` — add `GET /api/courses/{id}/generation-stream` SSE endpoint

**Verification:** Backend starts. `curl -N http://localhost:8000/api/courses/test/generation-stream` returns SSE event headers.

---

### Step 3: Migrate Zustand Store

Replace the entire store in one atomic change. The old store shape and the new store shape are incompatible (different property names, different action signatures), so incremental migration within the store is not practical.

**Files modified:**
- `src/store/useAppStore.ts` — full rewrite

**Key changes:**
1. Remove `GenAIService` import and all direct LLM calls.
2. Import `apiClient` and `sseClient`.
3. Replace `savedCourses: SavedCourse[]` with `courses: CourseSummary[]`.
4. Replace `currentCourse: Course | null` with `currentCourse: CourseDetail | null`.
5. Remove `activeChatSession` and all chat-related state.
6. Remove `logs` array (logs are server-side now).
7. Add loading/error states for each async operation.
8. Update `persist` partialize to cache the new shape.
9. Remove `settings.apiKey` — no longer needed.

**Verification:** Store compiles. All state transitions produce expected shapes (verified by component type checking in Step 4).

---

### Step 4: Update Components

Modify each component to work with the new store shape.

#### `App.tsx`

- Remove the `settings.apiKey` check. Instead, check `settings.userName` only.
- Replace the `COURSE_GENERATION` inline spinner with `<GenerationProgress />`.
- Map `CHAT` state to `COURSE_CREATION` (render new `CourseCreationView`).

#### `ChatView.tsx` -> `CourseCreationView.tsx`

Rename and rewrite. The conversational chat flow is replaced by a simple form:
- Text input for course description.
- Multi-input for learning objectives (add/remove).
- "Generate Course" button that calls `startCourseGeneration(description, objectives)`.
- Preserves the glassmorphism design language of the existing UI.

The old `ChatView` is deleted.

#### `CoursesView.tsx`

- On mount: call `fetchCourses()`.
- Show skeleton cards while `coursesLoading` is true.
- Show error banner if `coursesError` is set.
- Map `CourseSummary` (from API) to course cards instead of `SavedCourse` (from localStorage).
- `loadCourse(id)` becomes: set `currentCourseId`, call `fetchCourse(id)`, transition to `LEARNING`.
- `deleteCourse(id)` calls the API, then refreshes the list.

#### `CourseView.tsx`

- Source lesson data from `currentCourse.lessons[index]` (API-backed `CourseDetail` instead of localStorage `Course`).
- Activity completion calls `submitActivity(activityId, response)` instead of inline scoring.
- After submission: display `lastReview` (score, strengths, improvements, tips, mastery decision).
- "Next Lesson" button: increment `currentLessonIndex` (next lesson is already unlocked server-side after submission).
- Remove `generateNextLesson` and `retryLesson` calls — the backend handles lesson generation and remediation.
- Show loading spinner during `submissionLoading`.
- Show error message if `submissionError` is set.

#### `ActivityRenderer.tsx` and Activity Components

- `MultipleChoiceActivity`: On submit, call parent's `onComplete(selectedAnswers)` which maps to `submitActivity`.
- `ShortResponseActivity`: On submit, call parent's `onComplete(textResponse)`.
- `DrawingActivity`: On submit, call parent's `onComplete(base64Image)`.
- Remove all inline scoring logic from activity components. The backend scores everything.

#### `SettingsView.tsx`

- Remove the API Key input field.
- Keep the userName input.
- Remove the "Clear All Data" button that wipes localStorage (data lives on server now).
- Add a "Sign Out" placeholder for PRD 11.

#### `LogViewer.tsx`

- Remove or stub out. Logs are server-side and get a dedicated UI in PRD 9.
- For MVP: remove the log viewer from the navigation. It will return in PRD 9 with proper API backing.

#### `Layout.tsx`

- Update navigation items: remove "Logs" if present, keep "Courses", "Settings".
- Add "New Course" button that navigates to `COURSE_CREATION`.

#### New: `GenerationProgress.tsx`

- Reads `generationProgress` and `generationError` from the store.
- Renders the multi-step progress UI described in Section 2.
- "Retry" button calls `retryGeneration()`.

---

### Step 5: Cleanup

**Files deleted:**
- `src/services/GenAIService.ts`
- `src/services/visualGenerator.ts`

**Dependencies removed:**
- `@google/genai` from `package.json`

**Verification:** `npm run build` succeeds with zero TypeScript errors. No imports reference deleted files.

---

### Step 6: Vite Configuration Update

```typescript
// vite.config.ts (updated)
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/school/' : '/',
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  define: {
    // Make API URL available to the app
    'import.meta.env.VITE_API_URL': JSON.stringify(
      mode === 'production' ? '' : ''
    ),
  },
}));
```

With the Vite proxy, `VITE_API_URL` is empty in development (requests go to same origin, proxied to backend). In production, it can be set to the backend URL via environment variable.

---

## Acceptance Criteria

### Functional

1. **Course creation**: User enters a description and objectives, clicks Generate, and a course is created on the backend.
2. **Generation streaming**: During generation, the UI shows which agent is running and updates as each lesson becomes ready. The UI never shows a static spinner for more than 2 seconds without a status update.
3. **Course list**: Courses page shows all courses from the backend with correct progress percentages. Refreshing the page preserves the list.
4. **Lesson reading**: Clicking a course loads lesson content from the backend. Markdown renders correctly with headings, code blocks, and lists.
5. **Activity submission**: Submitting an activity sends the response to the backend and displays the review (score, strengths, improvements, tips, mastery decision).
6. **Lesson unlock**: After submitting an activity, the next lesson becomes unlocked in the roadmap sidebar.
7. **Course progression**: A user can progress through all lessons in a course, submitting activities and unlocking subsequent lessons.
8. **Course persistence**: Reloading the page preserves the course list, current course position, and progress.
9. **Course deletion**: Deleting a course removes it from the list and the backend.
10. **Error recovery**: If generation fails, the user sees an error message and can retry. If submission fails, the user sees an error and can resubmit.

### Non-Functional

11. **No client-side API keys**: The browser never stores or sends LLM API keys. The `@google/genai` package is removed.
12. **CORS**: The frontend on `localhost:5173` can reach the backend on `localhost:8000` without CORS errors.
13. **TypeScript**: The codebase compiles with zero TypeScript errors after migration.
14. **Build**: `npm run build` produces a working production bundle.
15. **Performance**: Course list renders within 200ms from cache, refreshes in the background. Activity submission round-trip is under 10 seconds (backend LLM latency dependent).

---

## Verification

### Unit Tests — API Client

- Mock `fetch` with `vi.fn()` or `msw` (Mock Service Worker).
- `generateCourse()`: verify POST to `/api/courses/generate` with correct body, returns `{ courseId }`.
- `listCourses()`: verify GET to `/api/courses`, returns array of `CourseSummary`.
- `getCourse()`: verify GET to `/api/courses/{id}`, returns `CourseDetail`.
- `submitActivity()`: verify POST to `/api/activities/{id}/submit` with response body, returns `ActivityReviewResponse`.
- `deleteCourse()`: verify DELETE to `/api/courses/{id}`.
- Error case: 500 response throws `ApiClientError` with correct status and detail.
- Error case: network failure throws with meaningful message.
- Retry utility: verify exponential backoff timing and max retry limit.

### Unit Tests — Zustand Store

- `fetchCourses()`: sets `coursesLoading` true, on success sets `courses` and `coursesLoading` false, on error sets `coursesError`.
- `fetchCourse()`: sets `currentCourseLoading` true, on success sets `currentCourse` and `currentCourseLoading` false.
- `startCourseGeneration()`: transitions `appState` to `COURSE_GENERATION`, sets `generationProgress` on SSE events, transitions to `LEARNING` on `generation_complete`.
- `submitActivity()`: sets `submissionLoading`, on success sets `lastReview`, on error sets `submissionError`.
- `deleteCourse()`: removes course from `courses` array optimistically, calls API, reverts on failure.
- State persistence: after `set()`, verify localStorage contains cached data matching `partialize` config.

### Unit Tests — SSE Client

- Mock `EventSource` constructor.
- Verify `connectGenerationStream` creates EventSource with correct URL.
- Simulate `agent_start` event: verify `onEvent` called with parsed data.
- Simulate `lesson_ready` event: verify `onEvent` called with lesson data.
- Simulate `generation_complete` event: verify `onEvent` called.
- Simulate `error` event on EventSource: verify `onError` called and connection closed.
- Verify cleanup function closes EventSource.

### Integration Tests — Backend SSE

- Use `httpx.AsyncClient` with `stream()` to connect to SSE endpoint.
- Trigger course generation with mocked agents (TestModel).
- Verify events arrive in expected order: `agent_start` -> `agent_complete` -> `lesson_ready` -> ... -> `generation_complete`.
- Verify event format: each line starts with `event:` or `data:`, double newline between events.
- Verify SSE stream terminates after `generation_complete`.
- Verify error event sent if generation pipeline raises.

### ADW Implementation Pattern

ADW tests are **single-file `uv` scripts** using [PEP 723 inline script metadata](https://peps.python.org/pep-0723/). Each test is a self-contained `.py` file that can be run directly with `uv run`:

```bash
# Run a single ADW test
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
"""ADW Test: Course Progression — MVP happy path end-to-end."""

import json
import shutil
import subprocess
import sys
from pathlib import Path

PROMPT = """\
<the existing ADW prompt content goes here — see test prompts below>
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

### ADW Test — `05_course_progression.md` (MVP Happy Path)

Full autonomous browser test covering the complete MVP user journey:

1. Agent opens `http://localhost:5173`, takes snapshot to orient.
2. Navigates to course creation, enters description "Introduction to Python Programming" and 3 objectives.
3. Clicks Generate, monitors generation progress (re-snapshots periodically until lessons appear).
4. Verifies generation progress UI shows agent stages.
5. After generation completes, reads lesson 1 content. Verifies Markdown renders with headings and examples.
6. Navigates to lesson 1 activity, reads the prompt, writes and submits a response.
7. Verifies feedback appears: score, strengths, improvements, tips.
8. Verifies lesson 2 is now unlocked in the roadmap sidebar.
9. Navigates to lesson 2, verifies different content loaded.
10. Takes annotated screenshots at each step.
11. Reports pass/fail for each checkpoint.

### ADW Test — Error Recovery

1. Agent starts course generation.
2. Mid-generation, the test orchestrator stops the backend.
3. Agent verifies error message appears in the UI.
4. Test orchestrator restarts the backend.
5. Agent clicks "Retry Generation".
6. Agent verifies generation resumes and completes.

### ADW Test — Course Persistence

1. Agent creates a course and completes lesson 1.
2. Agent notes the progress percentage.
3. Agent reloads the page (`agent-browser open http://localhost:5173`).
4. Agent navigates to course list, verifies the course appears with correct progress.
5. Agent clicks into the course, verifies it resumes at lesson 2 (not lesson 1).

---

## Definition of Done

All of the following must be true:

- [ ] `src/services/GenAIService.ts` and `src/services/visualGenerator.ts` are deleted.
- [ ] `@google/genai` is removed from `package.json`.
- [ ] No TypeScript file imports `GenAIService` or `@google/genai`.
- [ ] `src/services/apiClient.ts` exists with typed methods for all endpoints from PRDs 2-4.
- [ ] `src/services/sseClient.ts` exists with EventSource client for generation streaming.
- [ ] `src/store/useAppStore.ts` uses `apiClient` for all data fetching and mutations.
- [ ] The Zustand store no longer contains direct LLM call logic.
- [ ] All components compile against the new store shape with zero TypeScript errors.
- [ ] `npm run build` succeeds.
- [ ] The `COURSE_GENERATION` view shows a multi-step progress indicator driven by SSE events.
- [ ] The `COURSES` view loads course list from the API and shows skeleton loading states.
- [ ] Activity submission sends data to the backend and displays the returned review.
- [ ] Lesson unlock is driven by the backend response, not client-side logic.
- [ ] Error states are displayed for generation failure, submission failure, and network errors.
- [ ] CORS is configured on the backend for `localhost:5173`.
- [ ] Unit tests pass for API client, SSE client, and Zustand store (mocked).
- [ ] Integration tests pass for backend SSE endpoint (httpx + mocked agents).
- [ ] ADW test `05_course_progression.md` passes end-to-end.
- [ ] A user can create a course, read lessons, submit activities, receive feedback, and progress through all lessons using the real UI connected to the real backend.
