# Frontend UI Layer Documentation

This document provides comprehensive documentation for the React frontend view layer of the 1111 School application, an AI-powered personalized learning platform.

## Table of Contents

1. [Overview](#overview)
2. [View-Based Routing System](#view-based-routing-system)
3. [Layout Component](#layout-component)
4. [View Components](#view-components)
   - [ChatView](#chatview)
   - [CoursesView](#coursesview)
   - [CourseView](#courseview)
   - [SettingsView](#settingsview)
   - [LogViewer](#logviewer)
5. [State Management Integration](#state-management-integration)
6. [UI Patterns and Styling](#ui-patterns-and-styling)
7. [Component Lifecycle](#component-lifecycle)

---

## Overview

The application uses a state-driven view routing system managed by Zustand. Instead of traditional URL-based routing (e.g., React Router), the app state determines which view component is rendered. This approach simplifies navigation and keeps the entire application state centralized.

### Application States

The `AppState` type defines five possible application states:

```typescript
type AppState = 'CHAT' | 'COURSE_GENERATION' | 'LEARNING' | 'COURSES' | 'SETTINGS';
```

Each state maps to a specific view or UI state:

| AppState | View Component | Description |
|----------|---------------|-------------|
| `COURSES` | `CoursesView` | Dashboard showing all saved courses |
| `CHAT` | `ChatView` | Conversation interface for course creation |
| `COURSE_GENERATION` | Loading spinner | Transitional state while generating course |
| `LEARNING` | `CourseView` | Active lesson view with roadmap sidebar |
| `SETTINGS` | `SettingsView` | API key and user configuration |

---

## View-Based Routing System

### App.tsx - The View Router

The `App.tsx` file serves as the central view router. It reads the `appState` from the Zustand store and conditionally renders the appropriate component.

```typescript
// /src/App.tsx
function App() {
  const { appState, settings } = useAppStore();

  // Force settings view if no API key configured
  useEffect(() => {
    if (!settings.apiKey || !settings.userName) {
      useAppStore.getState().setAppState('SETTINGS');
    }
  }, [settings.apiKey, settings.userName]);

  const renderContent = () => {
    // Force settings if no API key
    if (!settings.apiKey || !settings.userName) {
      return <SettingsView />;
    }

    switch (appState) {
      case 'CHAT':
        return <ChatView />;
      case 'COURSE_GENERATION':
        return (
          <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full"
            />
            <p className="text-xl font-medium text-muted-foreground animate-pulse">
              Designing your personalized curriculum...
            </p>
          </div>
        );
      case 'LEARNING':
        return <CourseView />;
      case 'SETTINGS':
        return <SettingsView />;
      case 'COURSES':
      default:
        return <CoursesView />;
    }
  };

  return (
    <Layout>
      {renderContent()}
    </Layout>
  );
}
```

### Key Routing Behaviors

1. **Settings Gate**: Users without an API key are forced to the `SettingsView` regardless of `appState`
2. **Default State**: The `COURSES` state is the default fallback
3. **Transitional States**: `COURSE_GENERATION` shows inline loading UI rather than a separate component

---

## Layout Component

**File:** `/src/components/Layout.tsx`

The `Layout` component provides the application shell, including the header, navigation, and the `LogViewer` overlay.

### Props

```typescript
interface LayoutProps {
  children: ReactNode;
}
```

### Structure

```typescript
export function Layout({ children }: LayoutProps) {
  const { appState, setAppState, startNewChat } = useAppStore();

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      {/* Background gradient overlay */}
      <div className="fixed inset-0 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none z-0" />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Sticky header with navigation */}
        <header className="p-4 flex justify-between items-center border-b border-border/40 backdrop-blur-sm bg-background/50 sticky top-0 z-40">
          <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
            1111 School
          </h1>
          <div className="flex items-center gap-2">
            {/* Conditional navigation buttons */}
          </div>
        </header>

        <main className="flex-1 container mx-auto p-4 md:p-8 max-w-7xl">
          {children}
        </main>

        {/* Fixed-position log viewer */}
        <LogViewer />
      </div>
    </div>
  );
}
```

### Navigation Behavior

The header navigation is context-aware:
- **Courses button**: Hidden when already on `COURSES` view
- **New Chat button**: Hidden when on `CHAT` view; triggers `startNewChat()` action
- **Settings button**: Always visible

### Visual Features

- Gradient text for branding
- Semi-transparent backdrop blur header
- Fixed background gradient overlay
- Responsive container with max-width constraint

---

## View Components

### ChatView

**File:** `/src/components/ChatView.tsx`

The chat interface where users describe their learning goals. After sufficient conversation, they can generate a personalized course.

#### State Management

```typescript
const { activeChatSession, sendMessage, generateCourse, isGenerating } = useAppStore();
const [input, setInput] = useState('');
const messagesEndRef = useRef<HTMLDivElement>(null);
```

#### Key Features

1. **Message Display**: Animated message bubbles with different styles for user/assistant
2. **Auto-scroll**: Automatically scrolls to newest messages
3. **Loading Indicator**: Animated bouncing dots during response generation
4. **Course Generation Button**: Floating button appears after 4+ messages

#### Message Animation

Uses Framer Motion for smooth message transitions:

```typescript
<AnimatePresence mode="popLayout">
  {activeChatSession?.messages.map((msg) => (
    <motion.div
      key={msg.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      {/* Message content */}
    </motion.div>
  ))}
</AnimatePresence>
```

#### Typing Indicator

A bouncing dots animation shows when the AI is generating a response:

```typescript
{isGenerating && (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
    <div className="bg-muted/50 backdrop-blur-sm border border-border/40 rounded-2xl px-4 py-3">
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {[0, 0.2, 0.4].map((delay, i) => (
            <motion.div
              key={i}
              className="w-2 h-2 bg-primary rounded-full"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, delay }}
            />
          ))}
        </div>
        <span className="text-sm text-muted-foreground">Thinking...</span>
      </div>
    </div>
  </motion.div>
)}
```

#### Generate Course Button

Appears as a floating action button when conversation reaches 4 messages:

```typescript
const canGenerateCourse = (activeChatSession?.messages.length || 0) >= 4;

{canGenerateCourse && (
  <motion.div
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    className="fixed bottom-24 right-8"
  >
    <Button onClick={generateCourse} disabled={isGenerating}>
      <Sparkles className="w-5 h-5 mr-2" />
      Generate Course
    </Button>
  </motion.div>
)}
```

---

### CoursesView

**File:** `/src/components/CoursesView.tsx`

The course dashboard displays all saved courses with progress tracking.

#### Store Integration

```typescript
const { savedCourses, loadCourse, deleteCourse, startNewChat } = useAppStore();
```

#### Layout

- Header with course count and "New Course" button
- Empty state with call-to-action when no courses exist
- Responsive grid (1-3 columns based on viewport)

#### Course Card Features

Each course card displays:
- Title and description (with line clamping)
- Animated progress bar
- Completion stats (X of Y lessons)
- Created/last accessed timestamps
- Start/Continue and Delete actions

#### Progress Bar Animation

```typescript
<motion.div
  className="h-full bg-gradient-to-r from-primary to-primary/60"
  initial={{ width: 0 }}
  animate={{ width: `${course.progress}%` }}
  transition={{ duration: 0.5, delay: idx * 0.1 + 0.2 }}
/>
```

#### Empty State

```typescript
{savedCourses.length === 0 ? (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center justify-center h-[50vh] text-center"
  >
    <BookOpen className="w-16 h-16 text-muted-foreground/50 mb-4" />
    <h2 className="text-xl font-semibold text-muted-foreground mb-2">No courses yet</h2>
    <p className="text-muted-foreground mb-6">
      Start a conversation with our AI to create your first personalized course
    </p>
    <Button onClick={startNewChat} size="lg">
      <Plus className="w-5 h-5 mr-2" />
      Start New Course
    </Button>
  </motion.div>
) : (/* Course grid */)}
```

---

### CourseView

**File:** `/src/components/CourseView.tsx`

The main learning interface with lesson content, activities, and a course roadmap sidebar.

#### Store Integration

```typescript
const {
  currentCourse,
  currentLessonIndex,
  completeLesson,
  generateNextLesson,
  retryLesson,
  addLog,
  setAppState,
  setCurrentLessonIndex,
  isGenerating
} = useAppStore();
```

#### Local State

```typescript
const [activityScore, setActivityScore] = useState<number | null>(null);
const [activityFeedback, setActivityFeedback] = useState<string | null>(null);
const [showActivityResult, setShowActivityResult] = useState(false);
```

#### Layout Structure

Two-column grid layout (sidebar + main content):

```
+-------------------+----------------------------------+
|  Course Roadmap   |        Lesson Content            |
|  (1/4 width)      |        (3/4 width)               |
|                   |                                  |
|  - Lesson 1 [x]   |  # Lesson Title                  |
|  - Lesson 2 [*]   |                                  |
|  - Lesson 3 [ ]   |  Content markdown...             |
|  - ...            |                                  |
|                   |  [Visual Explanation Image]      |
|                   |                                  |
|                   |  ## Activity Section             |
|                   |  [Interactive Activity]          |
+-------------------+----------------------------------+
```

#### Roadmap Sidebar

Displays all lessons in the course roadmap with status indicators:

```typescript
{currentCourse.roadmap.map((roadmapItem, index) => {
  const lesson = currentCourse.lessons.find(l => l.id === roadmapItem.id);
  const isGenerated = lesson?.isGenerated || false;
  const isCompleted = lesson?.isCompleted || false;
  const isCurrent = index === currentLessonIndex;

  return (
    <button
      onClick={() => setCurrentLessonIndex(index)}
      className={/* conditional styling */}
    >
      {isCompleted ? (
        <CheckCircle className="w-4 h-4 text-green-500" />
      ) : isCurrent && isGenerating && !isGenerated ? (
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
      ) : (
        <Circle className="w-4 h-4" />
      )}
      {/* Lesson title and description */}
    </button>
  );
})}
```

#### Activity Flow

1. User completes activity via `ActivityRenderer` component
2. `handleActivityComplete` receives score and optional feedback
3. If score >= `passingScore`: marks lesson complete, generates next lesson
4. If score < `passingScore`: offers retry with remedial activity

```typescript
const handleActivityComplete = async (score: number, feedback?: string) => {
  setActivityScore(score);
  if (feedback) setActivityFeedback(feedback);
  setShowActivityResult(true);

  const passed = score >= passingScore;

  if (passed) {
    completeLesson(activeLesson.id, score);
    addLog('Lesson Completed', `Scored ${score}/100 on ${activeLesson.title}`);
    if (!isLastLesson) {
      await generateNextLesson(score);
    }
  } else {
    addLog('Activity Failed', `Scored ${score}/100 (needed ${passingScore}). Generating remedial activity.`);
  }
};
```

#### State Reset on Lesson Change

```typescript
useEffect(() => {
  setActivityScore(null);
  setActivityFeedback(null);
  setShowActivityResult(false);
}, [currentLessonIndex]);
```

---

### SettingsView

**File:** `/src/components/SettingsView.tsx`

Configuration screen for API key and user preferences.

#### Store Integration

```typescript
const { settings, updateSettings, setAppState } = useAppStore();
const [apiKey, setApiKey] = useState(settings.apiKey);
const [userName, setUserName] = useState(settings.userName);
```

#### Form Structure

- **API Key Input**: Password-masked input for Gemini API key
- **User Name Input**: Plain text input for personalization
- **Cancel Button**: Only shown if settings already exist (allows returning to courses)
- **Save Button**: Disabled until both fields have values

#### Save Handler

```typescript
const handleSave = () => {
  updateSettings({ apiKey, userName });
  if (apiKey && userName) {
    setAppState('COURSES');
  }
};
```

#### Danger Zone

Includes a destructive action to reset all application data:

```typescript
<Button
  variant="destructive"
  onClick={() => {
    if (window.confirm('Are you sure you want to delete all your data? This cannot be undone.')) {
      useAppStore.getState().clearAllData();
    }
  }}
>
  Reset All Data
</Button>
```

---

### LogViewer

**File:** `/src/components/LogViewer.tsx`

A slide-out panel displaying AI reasoning logs for transparency.

#### Store Integration

```typescript
const logs = useAppStore((state) => state.logs);
const sortedLogs = [...logs].reverse(); // Newest first
```

#### UI Pattern

Uses a Sheet (slide-out drawer) component:

```typescript
<Sheet>
  <SheetTrigger asChild>
    <Button variant="outline" size="icon" className="fixed bottom-4 right-4 z-50 bg-background/50 backdrop-blur-sm">
      <FileText className="h-4 w-4" />
    </Button>
  </SheetTrigger>
  <SheetContent className="w-[400px] sm:w-[540px]">
    <SheetHeader>
      <SheetTitle>GenAI Reasoning Logs</SheetTitle>
    </SheetHeader>
    <ScrollArea className="h-[calc(100vh-100px)] mt-4 pr-4">
      {/* Log entries */}
    </ScrollArea>
  </SheetContent>
</Sheet>
```

#### Log Entry Display

Each log shows:
- Action name (bold)
- Timestamp (right-aligned)
- Reasoning text (muted)

```typescript
{sortedLogs.map((log) => (
  <div key={log.id} className="p-4 rounded-lg border bg-muted/50">
    <div className="flex justify-between items-center mb-2">
      <span className="font-semibold text-sm">{log.action}</span>
      <span className="text-xs text-muted-foreground">
        {new Date(log.timestamp).toLocaleTimeString()}
      </span>
    </div>
    <p className="text-sm text-muted-foreground">{log.reasoning}</p>
  </div>
))}
```

---

## State Management Integration

### Zustand Store Structure

The application uses Zustand with persistence middleware. Key state slices:

```typescript
interface AppStore {
  // Navigation
  appState: AppState;

  // Chat
  activeChatSession: ChatSession | null;

  // Courses
  savedCourses: SavedCourse[];
  currentCourseId: string | null;
  currentCourse: Course | null;
  currentLessonIndex: number;

  // UI State
  logs: LogEntry[];
  isGenerating: boolean;

  // User Config
  settings: UserSettings;

  // Actions
  setAppState: (state: AppState) => void;
  startNewChat: () => void;
  sendMessage: (content: string) => Promise<void>;
  generateCourse: () => Promise<void>;
  loadCourse: (courseId: string) => void;
  // ... more actions
}
```

### Persistence Configuration

Only essential data is persisted to localStorage:

```typescript
persist(
  (set, get) => ({/* store implementation */}),
  {
    name: '1111-school-storage',
    partialize: (state) => ({
      settings: state.settings,
      savedCourses: state.savedCourses.map(course => ({
        ...course,
        chatHistory: course.chatHistory?.slice(-10) || [] // Limit history
      }))
    })
  }
)
```

### Store Usage Patterns

1. **Direct State Access**: `const { appState } = useAppStore()`
2. **Selector Pattern**: `const logs = useAppStore((state) => state.logs)`
3. **Action Access**: `const { setAppState, startNewChat } = useAppStore()`
4. **External Access**: `useAppStore.getState().clearAllData()` (for callbacks)

---

## UI Patterns and Styling

### Animation Patterns

The application uses Framer Motion for animations:

| Pattern | Usage | Example |
|---------|-------|---------|
| Fade + Slide | Message entry | `initial={{ opacity: 0, y: 20 }}` |
| Scale | Button appearance | `initial={{ scale: 0 }}` |
| Infinite rotation | Loading spinner | `animate={{ rotate: 360 }}` |
| Staggered delay | List items | `transition={{ delay: idx * 0.1 }}` |
| Bounce | Typing indicator | `animate={{ y: [0, -8, 0] }}` |

### Styling Approach

Uses Tailwind CSS with a design system (likely shadcn/ui):

- **Glass morphism**: `bg-background/50 backdrop-blur-sm`
- **Gradient text**: `bg-clip-text text-transparent bg-gradient-to-r`
- **Soft borders**: `border-border/40`, `border-primary/10`
- **Hover states**: `hover:border-primary/30 transition-all`
- **Dark mode support**: `dark:prose-invert`

### Component Library

Uses shadcn/ui components:
- `Button` - Various variants (default, ghost, outline, destructive)
- `Card` - Content containers with header/content sections
- `Input` - Form inputs
- `Label` - Form labels
- `Sheet` - Slide-out drawers
- `ScrollArea` - Scrollable containers

### Responsive Design

- Container max-width: `max-w-7xl`
- Grid breakpoints: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- Padding adjustments: `p-4 md:p-8`
- Width adjustments: `w-[400px] sm:w-[540px]`

---

## Component Lifecycle

### Initialization Flow

```
App Mount
    |
    v
Check settings.apiKey && settings.userName
    |
    +--[Missing]--> setAppState('SETTINGS') --> SettingsView
    |
    +--[Present]--> Render based on appState
```

### Course Creation Flow

```
CoursesView --> "New Course" button
    |
    v
startNewChat() --> appState = 'CHAT'
    |
    v
ChatView --> User sends messages
    |
    v
4+ messages --> "Generate Course" button appears
    |
    v
generateCourse() --> appState = 'COURSE_GENERATION'
    |
    v
Loading spinner (inline in App.tsx)
    |
    v
Course generated --> appState = 'LEARNING'
    |
    v
CourseView
```

### Lesson Completion Flow

```
CourseView --> Activity submitted
    |
    v
handleActivityComplete(score, feedback)
    |
    +--[score >= passingScore]
    |       |
    |       v
    |   completeLesson() --> updates currentLessonIndex
    |       |
    |       +--[more lessons]--> generateNextLesson()
    |       |
    |       +--[last lesson]--> "Course Complete" message
    |
    +--[score < passingScore]
            |
            v
        Show failure result --> "Try New Activity" button
            |
            v
        retryLesson() --> generates remedial activity
```

### State Reset Patterns

- **Lesson change**: Resets `activityScore`, `activityFeedback`, `showActivityResult`
- **New chat**: Clears `activeChatSession`, creates fresh session with welcome message
- **Clear all data**: Resets entire store, clears localStorage, reloads page

---

## Data Types Reference

### Core Types Used by Views

```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ChatSession {
  id: string;
  messages: ChatMessage[];
  startedAt: number;
}

interface Course {
  id: string;
  title: string;
  description: string;
  roadmap: LessonRoadmap[];
  lessons: Lesson[];
}

interface SavedCourse {
  id: string;
  title: string;
  description: string;
  createdAt: number;
  lastAccessedAt: number;
  progress: number;
  totalLessons: number;
  completedLessons: number;
  course: Course;
  chatHistory: ChatMessage[];
}

interface Lesson {
  id: string;
  title: string;
  content: string;
  visualExplanation?: string;
  activity: LessonActivity;
  isCompleted: boolean;
  comprehensionScore?: number;
  isGenerated: boolean;
  attempts?: number;
}

interface LogEntry {
  id: string;
  timestamp: number;
  action: string;
  reasoning: string;
}

interface UserSettings {
  apiKey: string;
  userName: string;
}
```

---

## Summary

The 1111 School frontend implements a clean state-driven architecture where:

1. **Zustand** manages all application state with persistence
2. **App.tsx** acts as a view router based on `appState`
3. **Layout** provides consistent navigation and the LogViewer overlay
4. **Views** are self-contained components that read from and dispatch actions to the store
5. **Framer Motion** provides smooth animations throughout
6. **shadcn/ui + Tailwind** deliver a polished, accessible UI

The architecture prioritizes simplicity over flexibility - there are no nested routes or URL-based navigation, making the application state easy to reason about and debug via the LogViewer.
