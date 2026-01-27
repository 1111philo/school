# State Management Documentation

This document provides comprehensive documentation for the state management layer of the 1111 School application, built with [Zustand](https://github.com/pmndrs/zustand).

## Table of Contents

- [Overview](#overview)
- [Store Setup and Persistence](#store-setup-and-persistence)
- [State Slices](#state-slices)
- [Actions and Methods](#actions-and-methods)
- [TypeScript Types and Interfaces](#typescript-types-and-interfaces)
- [State Flow Diagrams](#state-flow-diagrams)
- [Component Integration](#component-integration)
- [Persistence Details](#persistence-details)

---

## Overview

The application uses Zustand for state management, providing a lightweight yet powerful solution for managing global application state. The store is defined in `/src/store/useAppStore.ts` and integrates with the `persist` middleware for automatic localStorage persistence.

### Key Features

- Single store pattern with multiple state slices
- Automatic persistence to localStorage
- Async action support for API calls
- TypeScript-first design with full type safety

---

## Store Setup and Persistence

### Store Creation

The store is created using Zustand's `create` function wrapped with the `persist` middleware:

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAppStore = create<AppStore>()(
    persist(
        (set, get) => ({
            // State and actions defined here
        }),
        {
            name: '1111-school-storage',
            partialize: (state) => ({
                settings: state.settings,
                savedCourses: state.savedCourses.map(course => ({
                    ...course,
                    chatHistory: course.chatHistory?.slice(-10) || []
                }))
            })
        }
    )
);
```

### Persistence Configuration

| Property | Value | Description |
|----------|-------|-------------|
| `name` | `'1111-school-storage'` | localStorage key used for persistence |
| `partialize` | Custom function | Selects which state slices to persist |

#### What Gets Persisted

- `settings` - User settings (API key, username)
- `savedCourses` - All saved courses with limited chat history (last 10 messages per course)

#### What Does NOT Get Persisted

- `appState` - Current application view state
- `activeChatSession` - Active chat session data
- `currentCourseId` - Currently selected course ID
- `currentCourse` - Current course object (loaded from savedCourses)
- `currentLessonIndex` - Current lesson position
- `logs` - Debug/action logs
- `isGenerating` - Loading state flag

---

## State Slices

### Core State Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `appState` | `AppState` | `'COURSES'` | Current application view/mode |
| `activeChatSession` | `ChatSession \| null` | `null` | Active conversation for course creation |
| `savedCourses` | `SavedCourse[]` | `[]` | All saved courses with progress |
| `currentCourseId` | `string \| null` | `null` | ID of currently active course |
| `currentCourse` | `Course \| null` | `null` | Full course object being studied |
| `currentLessonIndex` | `number` | `0` | Index of current lesson in course |
| `logs` | `LogEntry[]` | `[]` | AI reasoning and action logs |
| `isGenerating` | `boolean` | `false` | Flag for async generation operations |
| `settings` | `UserSettings` | `{ apiKey: '', userName: '' }` | User configuration |

### State Slice Details

#### 1. Application State (`appState`)

Controls which view/mode the application displays:

```typescript
type AppState = 'CHAT' | 'COURSE_GENERATION' | 'LEARNING' | 'COURSES' | 'SETTINGS';
```

- `'COURSES'` - Course library/dashboard view
- `'CHAT'` - Chat interface for course creation
- `'COURSE_GENERATION'` - Loading state during course generation
- `'LEARNING'` - Active lesson/course learning view
- `'SETTINGS'` - Settings configuration view

#### 2. Chat Session (`activeChatSession`)

Manages the conversation used to create a new course:

```typescript
interface ChatSession {
    id: string;
    messages: ChatMessage[];
    startedAt: number;
}
```

#### 3. Course Management (`savedCourses`, `currentCourse`, `currentCourseId`)

Tracks all saved courses and the currently active course for learning.

#### 4. Learning Progress (`currentLessonIndex`)

Tracks which lesson the user is currently on within a course.

#### 5. Debug Logs (`logs`)

Stores AI reasoning and actions for transparency:

```typescript
interface LogEntry {
    id: string;
    timestamp: number;
    action: string;
    reasoning: string;
}
```

#### 6. Loading State (`isGenerating`)

Boolean flag that prevents duplicate API calls during async operations.

#### 7. User Settings (`settings`)

```typescript
interface UserSettings {
    apiKey: string;
    userName: string;
}
```

---

## Actions and Methods

### Chat Actions

#### `startNewChat()`

Initializes a new chat session with a welcome message.

```typescript
startNewChat: () => set({
    activeChatSession: {
        id: Math.random().toString(36).substring(7),
        messages: [{
            id: 'welcome',
            role: 'assistant',
            content: "Hello! I'm your personal AI tutor...",
            timestamp: Date.now()
        }],
        startedAt: Date.now()
    },
    appState: 'CHAT'
})
```

#### `addMessage(message: ChatMessage)`

Adds a message to the active chat session.

```typescript
addMessage: (message) => set((state) => {
    if (!state.activeChatSession) return {};
    return {
        activeChatSession: {
            ...state.activeChatSession,
            messages: [...state.activeChatSession.messages, message]
        }
    };
})
```

#### `sendMessage(content: string): Promise<void>`

Sends a user message and gets an AI response. Handles:
- Adding user message to chat
- Setting `isGenerating` to true
- Calling GenAI service for response
- Adding AI response to chat
- Error handling with user-friendly messages

### Course Actions

#### `generateCourse(): Promise<void>`

Generates a complete course from the chat conversation:

1. Sets `isGenerating: true` and `appState: 'COURSE_GENERATION'`
2. Calls GenAI service to generate course structure
3. Generates visual for first lesson (if applicable)
4. Creates `SavedCourse` object with metadata
5. Updates state with new course and transitions to `'LEARNING'` view

#### `saveCourse(course: Course)`

Placeholder for saving course updates (currently empty implementation).

#### `loadCourse(courseId: string)`

Loads a saved course for learning:

```typescript
loadCourse: (courseId: string) => {
    const { savedCourses } = get();
    const savedCourse = savedCourses.find(c => c.id === courseId);

    if (savedCourse) {
        set({
            currentCourseId: courseId,
            currentCourse: savedCourse.course,
            currentLessonIndex: savedCourse.completedLessons,
            appState: 'LEARNING'
        });
        // Updates lastAccessedAt timestamp
    }
}
```

#### `deleteCourse(courseId: string)`

Removes a course from saved courses:

```typescript
deleteCourse: (courseId: string) => {
    set((state) => ({
        savedCourses: state.savedCourses.filter(c => c.id !== courseId)
    }));
}
```

### Lesson Actions

#### `generateNextLesson(comprehensionScore: number): Promise<void>`

Generates the next lesson based on previous performance:

1. Validates course exists and not already generating
2. Gets next lesson from roadmap
3. Calls GenAI to generate lesson content
4. Generates visual explanation if prompt exists
5. Adds lesson to course and updates saved courses

#### `retryLesson(lessonId: string, previousScore: number): Promise<void>`

Generates a remedial activity for a failed lesson:

1. Finds the lesson that needs retry
2. Increments attempt counter
3. Calls GenAI to generate alternative activity
4. Updates lesson with new activity

#### `completeLesson(lessonId: string, comprehensionScore: number)`

Marks a lesson as complete and updates progress:

```typescript
completeLesson: (lessonId: string, comprehensionScore: number) => {
    set((state) => {
        // Mark lesson complete with score
        // Calculate new progress percentage (capped at 100%)
        // Increment currentLessonIndex
        // Update savedCourses with new progress
    });
}
```

#### `setCurrentLessonIndex(index: number)`

Navigates to a specific lesson (validated within bounds):

```typescript
setCurrentLessonIndex: (index: number) => {
    set((state) => {
        if (!state.currentCourse) return {};
        const validIndex = Math.max(0, Math.min(index, state.currentCourse.roadmap.length - 1));
        return { currentLessonIndex: validIndex };
    });
}
```

### Utility Actions

#### `setAppState(state: AppState)`

Directly sets the application view state.

#### `addLog(action: string, reasoning: string)`

Adds an entry to the debug log:

```typescript
addLog: (action, reasoning) => set((state) => ({
    logs: [...state.logs, {
        id: Math.random().toString(36).substring(7),
        timestamp: Date.now(),
        action,
        reasoning
    }]
}))
```

#### `updateSettings(settings: Partial<UserSettings>)`

Merges new settings with existing:

```typescript
updateSettings: (newSettings) => set((state) => ({
    settings: { ...state.settings, ...newSettings }
}))
```

#### `resetProgress()`

Resets learning progress while preserving saved courses and settings:

```typescript
resetProgress: () => set({
    appState: 'COURSES',
    activeChatSession: null,
    currentCourseId: null,
    currentCourse: null,
    currentLessonIndex: 0,
    logs: []
})
```

#### `clearAllData()`

Complete reset including localStorage deletion and page reload:

```typescript
clearAllData: () => {
    localStorage.removeItem('1111-school-storage');
    set({
        appState: 'COURSES',
        activeChatSession: null,
        savedCourses: [],
        currentCourseId: null,
        currentCourse: null,
        currentLessonIndex: 0,
        logs: [],
        settings: { apiKey: '', userName: '' }
    });
    window.location.reload();
}
```

---

## TypeScript Types and Interfaces

### Core Types

#### `AppState`

```typescript
export type AppState = 'CHAT' | 'COURSE_GENERATION' | 'LEARNING' | 'COURSES' | 'SETTINGS';
```

#### `UserSettings`

```typescript
export interface UserSettings {
    apiKey: string;
    userName: string;
}
```

### Chat Types

#### `ChatMessage`

```typescript
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}
```

#### `ChatSession`

```typescript
export interface ChatSession {
    id: string;
    messages: ChatMessage[];
    startedAt: number;
}
```

### Course Types

#### `Course`

```typescript
export interface Course {
    id: string;
    title: string;
    description: string;
    roadmap: LessonRoadmap[];  // Overview of all planned lessons
    lessons: Lesson[];         // Only contains generated lessons
}
```

#### `SavedCourse`

```typescript
export interface SavedCourse {
    id: string;
    title: string;
    description: string;
    createdAt: number;
    lastAccessedAt: number;
    progress: number;          // 0-100 percentage
    totalLessons: number;
    completedLessons: number;
    course: Course;
    chatHistory: ChatMessage[];
}
```

#### `LessonRoadmap`

```typescript
export interface LessonRoadmap {
    id: string;
    title: string;
    description: string;
    order: number;
}
```

### Lesson Types

#### `Lesson`

```typescript
export interface Lesson {
    id: string;
    title: string;
    content: string;
    visualExplanation?: string;    // Path to generated image
    activity: LessonActivity;
    isCompleted: boolean;
    comprehensionScore?: number;
    generatedAt?: number;
    isGenerated: boolean;
    attempts?: number;
}
```

#### `LessonActivity`

```typescript
export interface LessonActivity {
    type: 'multiple-choice' | 'drag-drop' | 'fill-blank' | 'quiz' | 'short-response' | 'drawing';
    config: MultipleChoiceConfig | DragDropConfig | FillBlankConfig | QuizConfig | ShortResponseConfig | DrawingConfig;
    passingScore: number;
    attemptNumber?: number;
}
```

### Activity Configuration Types

#### `MultipleChoiceConfig`

```typescript
export interface MultipleChoiceConfig {
    questions: {
        question: string;
        options: string[];
        correctIndex: number;
        explanation: string;
    }[];
}
```

#### `DragDropConfig`

```typescript
export interface DragDropConfig {
    instruction: string;
    items: string[];
    correctOrder?: number[];              // For ordering tasks
    pairs?: { left: string; right: string }[];  // For matching tasks
}
```

#### `FillBlankConfig`

```typescript
export interface FillBlankConfig {
    text: string;           // Text with __blank__ markers
    answers: string[];      // Correct answers for each blank
    caseSensitive?: boolean;
}
```

#### `QuizConfig`

```typescript
export interface QuizConfig {
    questions: {
        question: string;
        type: 'multiple-choice' | 'true-false' | 'short-answer';
        options?: string[];
        correctAnswer: string | number;
        explanation: string;
    }[];
}
```

#### `ShortResponseConfig`

```typescript
export interface ShortResponseConfig {
    question: string;
    rubric?: string;    // AI grading guidance
}
```

#### `DrawingConfig`

```typescript
export interface DrawingConfig {
    prompt: string;                  // What to draw
    referenceDescription?: string;   // Expected result description
}
```

### Logging Type

#### `LogEntry`

```typescript
export interface LogEntry {
    id: string;
    timestamp: number;
    action: string;
    reasoning: string;
}
```

---

## State Flow Diagrams

### Application State Transitions

```
                    +-------------+
                    |   COURSES   |<-----------------+
                    +-------------+                  |
                          |                          |
          startNewChat()  |  loadCourse()            | resetProgress()
                          v                          |
                    +-------------+                  |
                    |    CHAT     |------------------+
                    +-------------+
                          |
            generateCourse()
                          v
                    +------------------+
                    | COURSE_GENERATION |
                    +------------------+
                          |
              (success)   |   (failure)
                          v       |
                    +-------------+
                    |  LEARNING   |<--+
                    +-------------+   |
                          |           |
    completeLesson()      |           | loadCourse()
    generateNextLesson()  +-----------+

                    +-------------+
                    |  SETTINGS   |  (accessible from any state)
                    +-------------+
```

### Course Creation Flow

```
1. User starts at COURSES view
2. User clicks "New Course" -> startNewChat()
3. App transitions to CHAT state
4. User describes desired course in chat
5. sendMessage() handles each message exchange
6. User clicks "Generate Course" -> generateCourse()
7. App transitions to COURSE_GENERATION state
8. GenAI creates course structure and first lesson
9. Visual is generated for first lesson
10. SavedCourse is created and added to savedCourses
11. App transitions to LEARNING state
12. currentCourse and currentCourseId are set
```

### Learning Flow

```
1. User views lesson content and visual
2. User completes activity
3. Activity is scored
4. If score >= passingScore:
   - completeLesson() marks lesson complete
   - generateNextLesson() creates next lesson content
   - currentLessonIndex increments
5. If score < passingScore:
   - retryLesson() generates remedial activity
   - User attempts new activity
6. Process repeats until course complete
```

### Data Persistence Flow

```
State Change
     |
     v
Zustand Middleware
     |
     v
partialize() filters state
     |
     v
Only settings + savedCourses persisted
     |
     v
JSON.stringify()
     |
     v
localStorage.setItem('1111-school-storage', ...)

---

On App Load:
     |
     v
localStorage.getItem('1111-school-storage')
     |
     v
JSON.parse()
     |
     v
Merge with default state
     |
     v
Store initialized
```

---

## Component Integration

### Subscribing to State

Components can subscribe to the entire store or specific slices:

```typescript
// Subscribe to entire store (not recommended for performance)
const store = useAppStore();

// Subscribe to specific values (recommended)
const appState = useAppStore(state => state.appState);
const currentCourse = useAppStore(state => state.currentCourse);
const isGenerating = useAppStore(state => state.isGenerating);
```

### Accessing Actions

Actions can be accessed via selector or destructuring:

```typescript
// Via selector (creates stable reference)
const sendMessage = useAppStore(state => state.sendMessage);
const generateCourse = useAppStore(state => state.generateCourse);

// Destructure multiple actions
const { startNewChat, loadCourse, deleteCourse } = useAppStore();
```

### Example Component Usage

```typescript
import { useAppStore } from '../store/useAppStore';

function CourseList() {
    // Subscribe to specific state
    const savedCourses = useAppStore(state => state.savedCourses);
    const loadCourse = useAppStore(state => state.loadCourse);
    const deleteCourse = useAppStore(state => state.deleteCourse);

    return (
        <div>
            {savedCourses.map(course => (
                <div key={course.id}>
                    <h3>{course.title}</h3>
                    <p>Progress: {course.progress}%</p>
                    <button onClick={() => loadCourse(course.id)}>
                        Continue
                    </button>
                    <button onClick={() => deleteCourse(course.id)}>
                        Delete
                    </button>
                </div>
            ))}
        </div>
    );
}
```

### Conditional Rendering Based on State

```typescript
function App() {
    const appState = useAppStore(state => state.appState);

    switch (appState) {
        case 'COURSES':
            return <CourseLibrary />;
        case 'CHAT':
            return <ChatInterface />;
        case 'COURSE_GENERATION':
            return <LoadingScreen />;
        case 'LEARNING':
            return <LessonView />;
        case 'SETTINGS':
            return <SettingsPanel />;
        default:
            return <CourseLibrary />;
    }
}
```

---

## Persistence Details

### localStorage Key

- **Key**: `'1111-school-storage'`
- **Format**: JSON string

### Persisted Data Structure

```typescript
{
    settings: {
        apiKey: string,
        userName: string
    },
    savedCourses: SavedCourse[]  // With chat history limited to 10 messages each
}
```

### Space Optimization

The persistence layer includes optimization to prevent localStorage overflow:

1. **Chat History Limiting**: Each saved course's chat history is truncated to the last 10 messages
2. **Selective Persistence**: Only essential data (settings, saved courses) is persisted
3. **Transient State Excluded**: Loading states, logs, and current session data are not persisted

### Manual Data Clearing

To clear all persisted data programmatically:

```typescript
const clearAllData = useAppStore(state => state.clearAllData);
clearAllData(); // Removes localStorage entry and reloads page
```

Or directly via browser:

```javascript
localStorage.removeItem('1111-school-storage');
```

---

## Best Practices

1. **Use Selectors**: Always use selectors to subscribe to specific state slices to prevent unnecessary re-renders
2. **Check `isGenerating`**: Before triggering async actions, check `isGenerating` to prevent duplicate calls
3. **Handle Errors**: All async actions include error handling that logs errors and provides user feedback
4. **Validate State**: Actions that modify course data validate that `currentCourse` exists before proceeding
5. **Use TypeScript**: The store is fully typed - leverage TypeScript for type safety
