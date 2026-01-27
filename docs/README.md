# 1111 School Documentation

Technical documentation for the AI-powered personalized learning platform.

## Vision & Strategy

This demo is evolving toward the [Curriculum Individualizer Product Vision](https://docs.google.com/document/d/1Y1TeJMVMaHSw2mUpDA_eBa647vLyk97B3IUCGIQcjcc/edit?tab=t.0#heading=h.yjpzq5z0qjrp)—an agentic system that generates standards-aligned, individualized learning experiences for every student.

**External References:**
- [Curriculum Individualizer Vision](https://docs.google.com/document/d/1Y1TeJMVMaHSw2mUpDA_eBa647vLyk97B3IUCGIQcjcc/edit?tab=t.0#heading=h.yjpzq5z0qjrp) - Full product specification
- [Student Archetypes](https://docs.google.com/spreadsheets/d/1XnRspdFq-qtGOUynWqZdvv6GjOgAEYSlwAwJZdZeXTA/edit?gid=0#gid=0) - Real student profiles for validation
- [Glass Box AI Philosophy](https://dylanisa.ac/definitions/glass-box/) - Transparency principles for AI reasoning

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

### Strategy & Vision

| Document | Description |
|----------|-------------|
| [Evolution Roadmap](./evolution-roadmap.md) | Path from demo → Curriculum Individualizer, individual-first approach |
| [Pedagogical Framework](./pedagogical-framework.md) | UDL + Student Archetypes + Glass Box reasoning—the "how" of individualization |

### Technical Implementation

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
