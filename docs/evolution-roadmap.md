# Evolution Roadmap: Demo → Curriculum Individualizer

This document outlines the strategic path from the current 1111 School demo application to the full [Curriculum Individualizer Product Vision](https://docs.google.com/document/d/1Y1TeJMVMaHSw2mUpDA_eBa647vLyk97B3IUCGIQcjcc/edit?tab=t.0#heading=h.yjpzq5z0qjrp).

**Reference Documents:**
- [Curriculum Individualizer Product Vision](https://docs.google.com/document/d/1Y1TeJMVMaHSw2mUpDA_eBa647vLyk97B3IUCGIQcjcc/edit?tab=t.0#heading=h.yjpzq5z0qjrp) - Full product specification
- [Student Archetypes Data](https://docs.google.com/spreadsheets/d/1XnRspdFq-qtGOUynWqZdvv6GjOgAEYSlwAwJZdZeXTA/edit?gid=0#gid=0) - Real student profiles for validation
- [Glass Box AI Philosophy](https://dylanisa.ac/definitions/glass-box/) - Transparency principles for AI reasoning
- [Pedagogical Framework](./pedagogical-framework.md) - UDL + Archetypes + Glass Box deep dive

---

## Core Philosophy

**Core Insight**: Rather than jumping to multi-tenant classrooms, we build the individualization engine first for a single learner. This validates the pedagogical approach before adding organizational complexity.

### The Three Pillars

| Pillar | Role | Document |
|--------|------|----------|
| **Universal Design for Learning (UDL)** | The framework—what levers exist for differentiation | [Pedagogical Framework](./pedagogical-framework.md#layer-1-universal-design-for-learning-udl) |
| **Student Archetypes** | The lens—who we're designing for, how we measure differentiation | [Pedagogical Framework](./pedagogical-framework.md#layer-2-student-archetypes) |
| **Glass Box Reasoning** | The transparency mechanism—visible, auditable AI decision-making | [Pedagogical Framework](./pedagogical-framework.md#layer-3-glass-box-reasoning) |

**Key Thesis**: Advanced LLMs can reason through rich qualitative context about learners (not just rules like "IF reading_level < 6 THEN simplify") and produce meaningfully differentiated content. Glass Box principles make this reasoning trustworthy and improvable.

---

## Current State Analysis

### What Exists

```
┌─────────────────────────────────────────────────────┐
│                 1111 School Demo                     │
├─────────────────────────────────────────────────────┤
│  User → Chat → Course Generation → Lesson Learning  │
│                                                      │
│  • Single user, self-directed learning              │
│  • Conversational course creation                   │
│  • AI-generated lessons with activities             │
│  • Basic comprehension scoring (pass/fail at 70%)   │
│  • Remedial content if struggling                   │
│  • Client-side only (localStorage + Gemini API)     │
└─────────────────────────────────────────────────────┘
```

### Existing Assets That Map to Vision

| Demo Component | Vision Equivalent | Reusability |
|----------------|-------------------|-------------|
| `GenAIService.generateCourse()` | Base Lesson Generation | High - needs refactoring |
| `GenAIService.generateNextLesson()` | Adaptive lesson generation | High - has difficulty adjustment |
| `GenAIService.assessActivity()` | Performance analysis | Medium - needs richer metrics |
| Activity system (MC, Short, Drawing) | Product differentiation | High - add more types |
| Comprehension scoring | Learning analytics | Low - needs expansion |
| Zustand store patterns | State management | Medium - inform backend design |

### Critical Gaps

1. **No learner profile** - System doesn't know who's learning
2. **No standards alignment** - Content isn't validated against curricula
3. **No pedagogical frameworks** - UDL/Tomlinson not encoded
4. **No validation pipeline** - Generated content isn't quality-checked
5. **Single content path** - Everyone gets the same lesson, not individualized

---

## Evolution Strategy: Individual-First

### Why Individual Before Classroom?

The vision's core value proposition is **individualization**, not multi-tenancy. Multi-tenancy is an operational concern; individualization is the pedagogical innovation.

By building for one learner first:
- We validate that AI can meaningfully differentiate content
- We prove the pedagogical frameworks (UDL, Tomlinson) work in practice
- We create a tight feedback loop for iteration
- We avoid premature infrastructure complexity

The classroom scales horizontally: if individualization works for 1 learner, it works for 30.

```
Individual-First Approach:

Phase 1: "I am my own student"
  → Single user creates their learner profile
  → System individualizes content to that profile
  → User experiences differentiated learning firsthand

Phase 2: "I am a teacher with one student"
  → Separate teacher/student modes (same user)
  → Teacher inputs objectives, student consumes lessons
  → Proves the teacher→student workflow

Phase 3: "I am a teacher with a class"
  → Multiple student profiles
  → Batch individualization
  → Review dashboard for comparing versions

Phase 4: "Real teachers, real students"
  → Multi-user authentication
  → SIS integration
  → Full PiTER automation
```

---

## Phase 1: Self-Aware Learner + Archetype Foundation

**Goal**: The system knows WHO is learning, classifies them into an archetype, and adapts accordingly with visible reasoning.

> **Deep Dive**: See [Pedagogical Framework](./pedagogical-framework.md) for complete archetype profiles, UDL mapping, and Glass Box reasoning trace templates.

### The Need × Ambition Matrix

Students are characterized along two primary axes derived from [real student data](https://docs.google.com/spreadsheets/d/1XnRspdFq-qtGOUynWqZdvv6GjOgAEYSlwAwJZdZeXTA/edit?gid=0#gid=0):

```
                            AMBITION
                 Low                      High
              ┌────────────────────────────────────┐
         Low  │  Glinda                 │  Ross    │
              │  (Coasting)             │  Joseph  │
              │  • Needs relevance      │(Thriving)│
    NEED      │    hook                 │  • Ready │
              │                         │   for    │
              │                         │   depth  │
              ├────────────────────────────────────┤
              │  Gerryana    │  Rial    │  Wilmay  │
         High │  (At Risk)   │  Rick    │(Striving)│
              │  • Heavy     │(Emerging)│  • High  │
              │    scaffolding          │   support│
              │  • Confidence│  • Needs │   + high │
              │    building  │  belonging│  challenge
              └────────────────────────────────────┘
```

### New Data Model

```typescript
// Learner profile - combines archetype classification with individual context
interface LearnerProfile {
  id: string;

  // Archetype classification (primary differentiation axes)
  archetype: {
    need: 'very-low' | 'low' | 'medium' | 'high' | 'very-high';
    ambition: 'very-low' | 'low' | 'medium' | 'high' | 'very-high';
  };

  // Quantitative factors
  age: number;
  gradeLevel: string;
  englishFluency: 'emerging' | 'proficient-1' | 'proficient-2' | 'fluent';
  nativeLanguages: string[];
  physicalDisabilities: string[];
  mentalDisabilities: string[];
  neurodiversity: string | null;

  // Qualitative factors (for relevant examples, engagement hooks)
  interests: string[];
  familyStatus: string;
  socioeconomicStatus: string;

  // The rich qualitative notes - "Lagniappe"
  // e.g., "Will step back because she doesn't think she fits in this space"
  // e.g., "considering the environmental impact of generative AI..."
  lagniappe: string | null;

  // UDL: Accessibility accommodations
  accommodations: {
    largeText?: boolean;
    highContrast?: boolean;
    reducedMotion?: boolean;
    audioDescriptions?: boolean;
    extendedTime?: boolean;
  };

  // UDL: Expression preferences
  preferredActivityTypes: ('multiple-choice' | 'short-response' | 'drawing' | 'verbal' | 'matching')[];
}
```

### User Experience Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    New User Onboarding                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Welcome! Let's personalize your learning experience.    │
│                                                              │
│  2. Reading comfort level:                                  │
│     [Simple words] [Some complex] [Advanced vocabulary]     │
│                                                              │
│  3. How do you learn best? (select all that apply)          │
│     [📊 Charts/diagrams] [🎧 Listening] [📖 Reading]        │
│     [🖐️ Hands-on activities]                                │
│                                                              │
│  4. Learning pace preference:                               │
│     [Take it slow] [Balanced] [Challenge me]                │
│                                                              │
│  5. What are you interested in? (helps with examples)       │
│     [Sports] [Music] [Gaming] [Nature] [Technology] [+Add]  │
│                                                              │
│  6. Any accessibility needs?                                │
│     [Larger text] [High contrast] [Reduced animations]      │
│                                                              │
│                    [Start Learning →]                        │
└─────────────────────────────────────────────────────────────┘
```

### GenAI Service Changes

**Before** (current):
```typescript
generateNextLesson(course, completedLessons, comprehensionScore)
// Returns: Generic lesson content
```

**After** (individualized):
```typescript
generateIndividualizedLesson(
  course: Course,
  lessonRoadmap: LessonRoadmap,
  learnerProfile: LearnerProfile,
  performanceHistory: PerformanceRecord[]
)
// Returns: Content adapted to learner's reading level, style, interests
```

### UDL-Based Individualization

Each lesson adapts across UDL's three principles, guided by archetype:

| Archetype Pattern | Engagement Priority | Representation Priority | Expression Priority |
|-------------------|---------------------|------------------------|---------------------|
| High Need / Low Ambition | **Critical**: Hook through interests | Heavy scaffolding | Low-stakes formats |
| High Need / High Ambition | Channel ambition, show pathways | Scaffold without patronizing | Multiple options |
| Low Need / High Ambition | Autonomy, depth, challenge | Can handle complexity | Open-ended, creative |
| Very High Need / Medium Ambition | Belonging, "you fit here" | Gentle entry, build up | Safe to fail |

### Glass Box Reasoning Traces

Every differentiated lesson includes a reasoning trace (see [full template](./pedagogical-framework.md#differentiation-reasoning-trace-template)):

```markdown
## Differentiation Reasoning Trace (Example: Rial)

### Student Context Understanding
- **Archetype**: Very High Need / Medium Ambition
- **Key factors**: Raised by grandparents, Very Low SES
- **Lagniappe**: "Will step back because she doesn't think she fits in this space"
- **Confidence**: High

### UDL Analysis
**Engagement**: Challenge = low sense of belonging → Strategy = emphasize diverse voices in tech
**Representation**: No learning disabilities indicated → Standard scaffolding, concrete-to-abstract
**Expression**: Risk of disengagement if asked to perform → Offer private reflection first

### Quantitative Metrics
| Metric | Base | Individualized | Delta |
|--------|------|----------------|-------|
| Word count | 847 | 712 | -135 |
| Images | 2 | 4 | +2 |
| Scaffolding questions | 3 | 6 | +3 |

### Teacher Review Points
- [ ] Is belonging framing appropriate for Rial specifically?
- [ ] Should we push more challenge given Medium Ambition?
```

### Prompt Engineering for Individualization

```markdown
# Lesson Differentiation Task

You are an expert educator applying Universal Design for Learning (UDL) principles
to differentiate a lesson for a specific student.

## Your Framework (UDL)
1. **Engagement** (the "why") - How will you recruit and sustain this learner's interest?
2. **Representation** (the "what") - How will you present information accessibly?
3. **Action/Expression** (the "how") - How will they demonstrate understanding?

## Glass Box Requirement
You MUST show your reasoning. For every adaptation, explain:
- What challenge you identified
- What strategy you chose
- What alternatives you considered
- Your confidence level (high/medium/low)

## Student Profile
{{studentProfile as YAML}}

## Lagniappe (Important Qualitative Context)
{{lagniappe or "No additional notes provided"}}

## Base Lesson
{{baseLesson}}

## Output Format
1. Individualized lesson content
2. Complete reasoning trace (see template)
3. Quantitative metrics comparison
4. Teacher review points for medium/low confidence decisions
```

### Implementation Tasks

1. **Add LearnerProfile to types.ts** - Include archetype classification and lagniappe field
2. **Create ProfileSetupView component** - Onboarding wizard capturing Need/Ambition + qualitative context
3. **Extend useAppStore** - Add `learnerProfile` to persisted state
4. **Refactor GenAIService** - New `differentiateLesson()` method with Glass Box output
5. **Create ReasoningTraceView component** - Display the LLM's differentiation reasoning
6. **Update lesson rendering** - Apply accessibility preferences (text size, contrast, motion)
7. **Add quantitative metrics extraction** - Word count, reading level, image count, etc.

### Success Criteria

- [ ] User can create and edit their learner profile with archetype classification
- [ ] Generated lessons demonstrably differ based on archetype quadrant
- [ ] Lagniappe (qualitative notes) demonstrably influences output
- [ ] Every differentiated lesson includes a reasoning trace
- [ ] Reasoning traces show confidence levels and alternatives considered
- [ ] Quantitative metrics are captured and displayed
- [ ] Accessibility preferences are applied to UI

### Experimental Validation

To prove the system works, run these comparisons:

1. **Same lesson, different archetypes** - Generate for High Need/Low Ambition vs Low Need/High Ambition. Outputs should measurably differ.
2. **Same archetype, with/without Lagniappe** - Does "Will step back because she doesn't fit" change the output beyond what quantitative data predicts?
3. **Reasoning coherence** - Do the stated rationales match the actual changes made?

---

## Phase 2: Standards-Aligned Generation

**Goal**: Every lesson maps to educational standards, providing structure and accountability.

### Standards Data Model

```typescript
interface Standard {
  id: string;
  code: string;           // e.g., "LA.CS.K-2.1"
  state: string;          // e.g., "Louisiana"
  subject: string;        // e.g., "Computer Science"
  gradeLevel: string;     // e.g., "K-2"
  description: string;    // Full standard text
  keywords: string[];     // For matching
}

interface StandardsAlignment {
  standardId: string;
  coverage: 'full' | 'partial' | 'introduced';
  evidence: string;       // How the lesson addresses this standard
}

interface Lesson {
  // ... existing fields
  standardsAlignment: StandardsAlignment[];
}
```

### Standards Library

Start with one state, one subject: **Louisiana Computer Science Standards**

```
/src/data/standards/
  louisiana-cs.json       # K-12 CS standards
  index.ts                # Standards query utilities
```

### Validation Service

```typescript
// src/services/ValidationService.ts

interface ValidationResult {
  passed: boolean;
  score: number;          // 0-100
  issues: ValidationIssue[];
  suggestions: string[];
}

interface ValidationIssue {
  type: 'standards' | 'readability' | 'udl' | 'safety';
  severity: 'error' | 'warning';
  message: string;
  autoFixable: boolean;
}

class ValidationService {
  // Check if lesson covers required standards
  async validateStandardsAlignment(
    lesson: Lesson,
    requiredStandards: Standard[]
  ): Promise<ValidationResult>;

  // Check if content matches learner's reading level
  async validateReadingLevel(
    lesson: Lesson,
    targetLevel: string
  ): Promise<ValidationResult>;

  // Check for UDL compliance (multiple means)
  async validateUDLCompliance(
    lesson: Lesson
  ): Promise<ValidationResult>;

  // Check content is age-appropriate and safe
  async validateContentSafety(
    lesson: Lesson,
    ageRange: string
  ): Promise<ValidationResult>;

  // Run all validations
  async validateLesson(
    lesson: Lesson,
    learnerProfile: LearnerProfile,
    standards: Standard[]
  ): Promise<{
    overall: ValidationResult;
    details: Record<string, ValidationResult>;
  }>;
}
```

### Closed-Loop Validation

```
Generate Lesson
      ↓
  Validate ←──────────────┐
      ↓                   │
  Pass? ─── No ───→ Auto-Fix
      │                   │
     Yes                  │
      ↓                   │
  Return Lesson ←─────────┘
```

```typescript
async generateValidatedLesson(
  objective: string,
  learnerProfile: LearnerProfile,
  standards: Standard[]
): Promise<Lesson> {
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const lesson = await this.generateIndividualizedLesson(
      objective,
      learnerProfile,
      attempt > 0 ? previousIssues : undefined  // Include issues for retry
    );

    const validation = await this.validationService.validateLesson(
      lesson,
      learnerProfile,
      standards
    );

    if (validation.overall.passed) {
      return { ...lesson, validationReport: validation };
    }

    previousIssues = validation.overall.issues;
  }

  throw new Error('Could not generate valid lesson after max attempts');
}
```

### Implementation Tasks

1. **Create standards JSON** - Louisiana CS standards as structured data
2. **Build ValidationService** - Standards, readability, UDL, safety checks
3. **Add validation to generation flow** - Closed-loop with auto-fix
4. **Show validation report in UI** - Green checks for what passed

### Success Criteria

- [ ] Standards library loaded and queryable
- [ ] Generated lessons include `standardsAlignment` field
- [ ] Validation runs automatically on generation
- [ ] Failed validations trigger regeneration with guidance
- [ ] User can see which standards a lesson covers

---

## Phase 3: Teacher Mode (Same User, Two Hats)

**Goal**: Prove the teacher→student workflow before adding real multi-user.

### Concept: Mode Switching

```
┌─────────────────────────────────────────────────────────────┐
│                      Mode Selector                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   [👨‍🏫 Teacher Mode]              [📚 Student Mode]          │
│                                                              │
│   Create lessons and review       Learn from generated       │
│   generated content               lessons                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Teacher Mode Features

1. **Objective Input** - Natural language + optional standards selection
2. **Student Profile Management** - Create/edit learner profiles (start with just one)
3. **Lesson Preview** - See base lesson + individualized version side-by-side
4. **Approval Workflow** - Approve / Request Changes / Regenerate
5. **Performance Review** - See how "student" did on activities

### Student Mode Features

1. **Lesson Queue** - Approved lessons ready to learn
2. **Individualized Content** - Content adapted to their profile
3. **Activity Completion** - Same as current, with richer progress tracking
4. **Performance History** - Track mastery over time

### Data Model Additions

```typescript
interface LessonAssignment {
  id: string;
  lessonId: string;
  studentProfileId: string;
  status: 'pending-review' | 'approved' | 'in-progress' | 'completed';
  assignedAt: Date;
  approvedAt?: Date;
  completedAt?: Date;
  performance?: PerformanceRecord;
}

interface PerformanceRecord {
  lessonId: string;
  timeSpent: number;         // seconds
  activitiesAttempted: number;
  activitiesPassed: number;
  comprehensionScore: number;
  struggledConcepts: string[];
  masteredConcepts: string[];
}
```

### Teacher Review Interface

```
┌─────────────────────────────────────────────────────────────┐
│  Lesson Review: Introduction to Hardware                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Standards Coverage                                          │
│  ✓ LA.CS.K-2.1 - Identify hardware components               │
│  ✓ LA.CS.K-2.2 - Describe hardware functions                │
│                                                              │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │    Base Lesson      │  │  Individualized     │          │
│  │                     │  │  (for: Alex)        │          │
│  │  A computer has     │  │  A computer is like │          │
│  │  several hardware   │  │  a soccer team!     │          │
│  │  components...      │  │  Each player has    │          │
│  │                     │  │  a special job...   │          │
│  └─────────────────────┘  └─────────────────────┘          │
│                                                              │
│  Validation Report                                           │
│  ✓ Standards alignment: 100%                                │
│  ✓ Reading level: Elementary (matches profile)              │
│  ✓ UDL compliance: Multiple means present                   │
│  ✓ Content safety: Appropriate for ages 5-7                 │
│                                                              │
│  [✗ Reject]  [↻ Regenerate]  [✓ Approve & Assign]          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Tasks

1. **Add mode to app state** - `appMode: 'teacher' | 'student'`
2. **Create TeacherDashboard** - Objective input, profile management, lesson review
3. **Create LessonReviewView** - Side-by-side comparison with validation
4. **Add approval workflow** - Status tracking for lessons
5. **Track performance metrics** - Richer than current comprehension score

### Success Criteria

- [ ] User can switch between teacher and student modes
- [ ] Teacher mode allows creating objectives and reviewing lessons
- [ ] Student mode shows only approved lessons
- [ ] Performance data flows back to teacher view
- [ ] Full workflow: Create → Generate → Review → Approve → Learn → Review Performance

---

## Phase 4: Multiple Student Profiles

**Goal**: Generate individualized versions for multiple learner profiles simultaneously.

### Batch Individualization

```typescript
async generateIndividualizedLessons(
  baseLesson: Lesson,
  studentProfiles: LearnerProfile[]
): Promise<Map<string, Lesson>> {
  // Generate in parallel for efficiency
  const individualizedLessons = await Promise.all(
    studentProfiles.map(profile =>
      this.individualizeLesson(baseLesson, profile)
    )
  );

  return new Map(
    individualizedLessons.map((lesson, i) =>
      [studentProfiles[i].id, lesson]
    )
  );
}
```

### Comparison View

```
┌─────────────────────────────────────────────────────────────┐
│  Individualized Versions: Introduction to Hardware          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ Alex (below) │ │ Jordan (at)  │ │ Sam (above)  │        │
│  │              │ │              │ │              │        │
│  │ Simple words │ │ Grade-level  │ │ Advanced     │        │
│  │ Sports       │ │ Mixed        │ │ Technical    │        │
│  │ examples     │ │ examples     │ │ examples     │        │
│  │              │ │              │ │              │        │
│  │ [Preview]    │ │ [Preview]    │ │ [Preview]    │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│                                                              │
│  [Approve All]  [Review Individually]                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Class Progress Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  Class Progress: Computer Hardware Unit                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Overall: ████████░░ 80% complete                           │
│                                                              │
│  Student      Lesson 1   Lesson 2   Lesson 3   Avg Score    │
│  ─────────────────────────────────────────────────────────  │
│  Alex         ✓ 85%      ✓ 72%      ◐ ...      78%         │
│  Jordan       ✓ 90%      ✓ 88%      ✓ 92%      90%         │
│  Sam          ✓ 95%      ✓ 91%      ✗ 65%      84%         │
│                                                              │
│  ⚠️ Alert: Sam struggling with Lesson 3 (input devices)     │
│     → System generated remedial content                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Tasks

1. **Support multiple learner profiles** - Array in store
2. **Batch generation endpoint** - Generate all versions from one base
3. **Comparison view component** - Side-by-side profile versions
4. **Class progress dashboard** - Aggregate performance view
5. **Alerts system** - Flag struggling students

### Success Criteria

- [ ] Create and manage multiple student profiles
- [ ] Generate individualized versions for all profiles at once
- [ ] Compare versions side-by-side
- [ ] Track progress across all profiles
- [ ] Identify patterns (e.g., "3 students struggling with same concept")

---

## Phase 5: Backend & Real Multi-User

**Goal**: Move to server-side processing, real authentication, and production infrastructure.

This phase is where we transition from "demo that proves the concept" to "product that serves real users." The individualization engine built in Phases 1-4 remains the same; we're adding operational infrastructure.

### Architecture Shift

```
Before (Client-Side):
┌─────────────────────────────────────────┐
│              Browser                     │
│  ┌─────────────────────────────────┐   │
│  │  React App                       │   │
│  │  ├── GenAIService → Gemini API  │   │
│  │  ├── ValidationService          │   │
│  │  └── localStorage               │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘

After (Server-Side):
┌─────────────────┐     ┌─────────────────────────────────┐
│    Browser      │     │           Backend               │
│  ┌───────────┐  │     │  ┌─────────────────────────┐   │
│  │ React App │◄─┼─────┼─►│  API Server             │   │
│  └───────────┘  │     │  │  ├── GenAIService       │   │
└─────────────────┘     │  │  ├── ValidationService  │   │
                        │  │  └── Agent Orchestrator │   │
                        │  └───────────┬─────────────┘   │
                        │              │                  │
                        │  ┌───────────▼─────────────┐   │
                        │  │  PostgreSQL              │   │
                        │  │  ├── Users               │   │
                        │  │  ├── Courses             │   │
                        │  │  ├── Lessons             │   │
                        │  │  └── Performance         │   │
                        │  └─────────────────────────┘   │
                        └─────────────────────────────────┘
```

### Key Components

1. **Authentication** - Teacher/Student roles, school-based tenancy
2. **API Server** - REST or GraphQL endpoints
3. **Database** - PostgreSQL with proper schema
4. **SIS Integration** - Clever/ClassLink for student data import
5. **Background Jobs** - Scheduled lesson generation (PiTER)
6. **FERPA Compliance** - Data isolation, audit logs, encryption

### This is where the vision document's technical architecture fully applies

- Agent orchestration with specialized agents
- PiTER framework for out-of-loop operation
- SIS integration for real student data
- LMS integrations (Canvas, Google Classroom)

---

## Summary: The Bridge

```
┌─────────────────────────────────────────────────────────────┐
│                    EVOLUTION PATH                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  CURRENT DEMO                                                │
│  └── Single user, chat-based course creation                │
│                                                              │
│        ↓ Phase 1: Self-Aware Learner                        │
│                                                              │
│  INDIVIDUALIZED DEMO                                         │
│  └── Single user with profile, adapted content              │
│                                                              │
│        ↓ Phase 2: Standards-Aligned                         │
│                                                              │
│  VALIDATED DEMO                                              │
│  └── Standards library, validation pipeline                 │
│                                                              │
│        ↓ Phase 3: Teacher Mode                              │
│                                                              │
│  DUAL-MODE DEMO                                              │
│  └── Same user as teacher + student, approval workflow      │
│                                                              │
│        ↓ Phase 4: Multiple Profiles                         │
│                                                              │
│  CLASSROOM SIMULATION                                        │
│  └── Multiple student profiles, batch generation            │
│                                                              │
│        ↓ Phase 5: Backend & Multi-User                      │
│                                                              │
│  PRODUCTION PRODUCT                                          │
│  └── Real users, SIS integration, PiTER automation          │
│                                                              │
│        ↓ Vision Document Phases 2-5                         │
│                                                              │
│  FULL CURRICULUM INDIVIDUALIZER                              │
│  └── District-wide, continuous adaptation, LMS integration  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

The key insight is that **Phases 1-4 can all be built client-side**, allowing rapid iteration on the core individualization engine without backend infrastructure overhead. Only Phase 5 requires the architectural shift to server-side processing.

This means we can validate the entire pedagogical approach—UDL compliance, Tomlinson differentiation, standards alignment, adaptive content—with a single developer on a client-side app before investing in production infrastructure.

---

## Recommended Starting Point

**Phase 1: Self-Aware Learner + Archetype Foundation** is the highest-leverage next step because:

1. It validates the core thesis: LLMs can reason through qualitative context to differentiate
2. It requires no architectural changes (just new types + prompt engineering)
3. It creates tangible "before/after" comparisons using real [student archetypes](https://docs.google.com/spreadsheets/d/1XnRspdFq-qtGOUynWqZdvv6GjOgAEYSlwAwJZdZeXTA/edit?gid=0#gid=0)
4. [Glass Box](https://dylanisa.ac/definitions/glass-box/) reasoning makes the system trustworthy from day one
5. Everything else builds on having learner profiles and visible reasoning

**First implementation tasks:**
1. Add `LearnerProfile` type with archetype classification and lagniappe
2. Create profile setup wizard capturing Need × Ambition + qualitative context
3. Build `differentiateLesson()` method with Glass Box output structure
4. Create reasoning trace viewer component
5. Run validation: same lesson for Gerryana (High Need/Low Ambition) vs Ross (Low Need/High Ambition) - prove differentiation is meaningful

**Further Reading:**
- [Pedagogical Framework](./pedagogical-framework.md) - Complete UDL + Archetypes + Glass Box specification
- [Glass Box AI Philosophy](https://dylanisa.ac/definitions/glass-box/) - Transparency principles
- [Student Archetypes Data](https://docs.google.com/spreadsheets/d/1XnRspdFq-qtGOUynWqZdvv6GjOgAEYSlwAwJZdZeXTA/edit?gid=0#gid=0) - Real profiles for testing
