# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

1111 School is an AI-powered personalized learning platform built with React, TypeScript, and Google Gemini API. Users create custom courses through conversational AI, then progress through generated lessons with interactive activities.

## Commands

```bash
npm run dev      # Start dev server (localhost:5173)
npm run build    # TypeScript check + Vite production build
npm run lint     # ESLint analysis
npm run preview  # Preview production build locally
```

## Architecture

### State Management
- **Zustand store** (`src/store/useAppStore.ts`) - Single source of truth for all app state
- App flows through states: `CHAT` → `COURSE_GENERATION` → `LEARNING` (or `COURSES`/`SETTINGS`)
- Persisted to localStorage under key `1111-school-storage`

### AI Services
- **GenAIService** (`src/services/GenAIService.ts`) - Handles all Gemini API interactions:
  - Conversation continuation for course planning
  - Course/lesson/activity generation
  - Response grading and remedial content
- **visualGenerator** (`src/services/visualGenerator.ts`) - Image generation with model selection (flash for speed, pro for quality)

### Component Structure
- **Views** (`src/components/`) - Top-level screens: `ChatView`, `CourseView`, `CoursesView`, `SettingsView`
- **Activities** (`src/components/activities/`) - Interactive lesson activities: `MultipleChoiceActivity`, `ShortResponseActivity`, `DrawingActivity`
- **UI** (`src/components/ui/`) - Shadcn/ui primitives (button, card, input, etc.)

### Types
All TypeScript interfaces in `src/types.ts`: `Course`, `Lesson`, `Activity`, `ChatMessage`, `SavedCourse`, `UserSettings`

## Key Patterns

### Imports
```typescript
import { useAppStore } from '@/store/useAppStore';
import { GenAIService } from '@/services/GenAIService';
import { cn } from '@/lib/utils';
```

### Styling
- Tailwind CSS with CSS variables for theming
- `cn()` utility for conditional class merging
- Dark mode via `dark:` prefix classes

### Adding New Activity Types
1. Add type to `ActivityType` union in `types.ts`
2. Create component in `src/components/activities/`
3. Add case to `ActivityRenderer.tsx`

## Deployment

Automatic via GitHub Actions on push to `main` → builds and deploys to GitHub Pages at `https://1111philo.github.io/school/`
