# 1111 School Documentation

Technical documentation for the AI-powered personalized learning platform.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Views Layer                       │   │
│  │  ChatView │ CourseView │ CoursesView │ SettingsView │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 Activities Layer                     │   │
│  │  MultipleChoice │ ShortResponse │ Drawing           │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                UI Primitives Layer                   │   │
│  │  Button │ Card │ Input │ Sheet │ ScrollArea         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   State Management                           │
│                    Zustand Store                             │
│         (appState, courses, lessons, settings)              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     AI Services                              │
│  ┌────────────────────┐  ┌────────────────────┐            │
│  │   GenAIService     │  │  visualGenerator   │            │
│  │  - Conversations   │  │  - Image gen       │            │
│  │  - Course gen      │  │  - SVG fallback    │            │
│  │  - Lesson gen      │  └────────────────────┘            │
│  │  - Grading         │                                     │
│  └────────────────────┘                                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Google Gemini API                         │
│         gemini-2.0-flash-lite │ gemini-2.5-flash-image      │
└─────────────────────────────────────────────────────────────┘
```

## Documentation Index

| Document | Description |
|----------|-------------|
| [Frontend Views](./frontend-views.md) | View components, routing system, Layout, animations |
| [Activities](./activities.md) | Interactive lesson activities, grading flow, adding new types |
| [State Management](./state-management.md) | Zustand store, persistence, TypeScript types, state flows |
| [AI Services](./ai-services.md) | GenAIService, visual generation, prompt engineering |
| [UI Primitives](./ui-primitives.md) | Shadcn/ui components, Tailwind config, theming |

## Quick Reference

### Application States

```
CHAT → COURSE_GENERATION → LEARNING
  ↑                            │
  └──────── COURSES ←──────────┘
              ↓
          SETTINGS
```

### Key Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | Route dispatcher based on appState |
| `src/store/useAppStore.ts` | Central state management |
| `src/services/GenAIService.ts` | All Gemini API interactions |
| `src/types.ts` | TypeScript interfaces |

### Data Flow

1. User interacts with **View** component
2. View calls **Store** action
3. Store may call **GenAIService** for AI operations
4. GenAIService returns data to Store
5. Store updates state
6. React re-renders affected **Views**
