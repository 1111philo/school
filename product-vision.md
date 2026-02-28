# 1111 School — Product Vision

## What Is This

A generative learning platform. You tell it what you want to learn, it builds you a personalized
course — lessons, practice activities, and a final assessment — then adapts future content based on
your learner profile.

Two ways in: browse a catalog of predefined courses, or describe what you want to learn and let the
system generate one from scratch.

---

## The Core Loop

```
Browse/Create → Generate Course → Read Lessons → Practice Activities → Get Feedback → Assess → Complete
```

Every course follows the same arc:

1. **Course Creation** — Pick from the catalog or describe your own topic + learning objectives
2. **Generation** — The system produces lessons (one per objective), each with a practice activity
3. **Learning** — Read a lesson, do the activity, get scored feedback, unlock the next lesson
4. **Assessment** — After all lessons, a summative assessment covers every objective
5. **Completion** — Pass the assessment and you're done. Fail and you retry or revisit lessons.

The profile makes each pass through this loop better — your experience level, goals, learning
style, and past performance shape what gets generated.

---

## Screens & Flows

### Course Catalog (`/catalog`)

The landing page. A searchable, filterable grid of predefined course cards.

- **Search**: keyword input, debounced
- **Filters**: tag chips (OR logic, multiple active)
- **Course cards**: title, description snippet, objective count, tags
- **Actions**: "Start Course" (predefined) or "Create Your Own Course" (custom)
- **Empty state**: "No courses match. Try different keywords or create your own."

### Custom Course Creation (`/courses/create`)

A simple two-step form (not a chat interface):

**Step 1 — Input**:
- Text area for course description (10-500 chars)
- Dynamic list of learning objectives (1-8), add/remove
- Validation before proceeding

**Step 2 — Preview & Confirm**:
- Read-only display of description + objectives
- "This will generate approximately N lessons"
- "Back to Edit" or "Generate Course"

Both paths (catalog start and custom creation) feed into the same generation pipeline.

### Generation Progress (`/courses/{id}/generate`)

The generation page must feel **immediately responsive**. When a user lands on it — whether
mid-generation, after completion, or on a page refresh — the current state renders instantly from
a REST fetch. There is no blank loading screen waiting for a stream event.

**Core principle: the database is the source of truth, not the event stream.** The backend commits
progress after each objective, so a REST fetch always returns the latest completed state. SSE
provides live updates on top of that, but never replaces it.

- Vertical stepper: one row per objective, each with sub-steps (planning, writing, creating activity)
- On page load: REST fetch populates completed objectives with checkmarks immediately
- If still generating: SSE connects for live progressive updates
- The next incomplete objective after the last completed one shows an active spinner (inferred —
  generation is sequential, so this is always knowable even without an explicit SSE event)
- Completed courses show "Course Ready" with a "Start Learning" button — no SSE connection at all
- Interrupted/failed generation: clear message + "Retry Generation" button
- Error per objective: displayed inline without blocking other objectives

The UX goal: a user who refreshes the page mid-generation should see all prior progress instantly
and watch the current objective progress in real time. A user arriving after generation should
never wait for anything.

### Lesson View

- Markdown-rendered lesson content (headings, code blocks, lists, examples)
- Required sections per lesson: Objective, Why It Matters, Steps, Example, Recap
- Each lesson has exactly one activity attached
- Linear progression: complete the activity to unlock the next lesson

### Activity Submission & Feedback

**Submission**:
- Instructions + prompt displayed above the input
- Hints available (2-5 scaffolding hints, guide without giving answers)
- Text area for the response
- Submit button → loading state while the reviewer scores

**Feedback** (displayed after submission):
- Score (0-100) with mastery decision: not_yet (0-69), meets (70-89), exceeds (90+)
- Rationale referencing specific rubric items
- Strengths (2-5 concrete observations)
- Improvements (2-5 actionable targets)
- Tips (2-6 next steps)

**Progression rule**: Any submission unlocks the next lesson, regardless of score. You can
resubmit to improve, but you're never blocked. The philosophy is encouragement, not gating.

### Assessment (`/courses/{id}/assessment`)

Triggered after all lessons are completed:

- Assessment items generated to cover 100% of learning objectives
- Each item shows: which objective it tests, a prompt, and a text input
- Submit all items together
- Results show per-objective scores (color-coded) with rubric-referenced feedback
- **Pass** (≥70): course marked complete
- **Fail** (<70): "Retry Assessment" or "Review Lessons", with specific guidance on weak areas

### Learner Profile (`/profile`)

A simple form (not a 3-lesson onboarding course) collecting:

- Display name
- Experience level
- Learning goals
- Interests
- Preferred learning style
- Tone preference (encouraging, Socratic, direct, etc.)

These fields flow into every generation call. Two learners creating the same course should get
meaningfully different content.

Profile updates happen:
- **Manually**: user edits fields anytime
- **Automatically**: activity scores update skill signals (score < 70 = gap, score ≥ 90 = strength)
- **On completion**: course history appended, experience level may adjust

### My Courses (`/courses`)

Card grid of all the user's courses:
- Tabs: All / In Progress / Completed
- Each card shows: title, progress bar, lesson count, status
- Resume from where you left off

---

## Accessibility

Accessibility is a first-class concern, not a retrofit. These requirements apply to every screen
from the first build.

### Semantics & Screen Readers
- Semantic HTML throughout: proper heading hierarchy (h1-h3), landmark regions (nav, main, aside),
  lists for list content
- All interactive elements have accessible names (labels, aria-labels where needed)
- Lesson content rendered from Markdown must produce semantic headings, not styled divs
- Status changes (lesson unlocked, feedback received, generation complete) announced via
  aria-live regions

### Keyboard Navigation
- Full keyboard operability: every action reachable without a mouse
- Visible focus indicators on all interactive elements (inputs, buttons, cards, nav items)
- Left-nav lesson list navigable with arrow keys
- Tab order follows logical reading order
- Modal/overlay interactions trap focus and return it on close

### Visual
- WCAG 2.1 AA contrast ratios in all color themes
- No color-only indicators — pair with icons, labels, or patterns (e.g., locked/unlocked lessons
  use icons + text, not just color)
- Support reduced motion (respect `prefers-reduced-motion` OS setting, disable animations)
- Adjustable base font size
- Comfortable line height and max line length for long-form lesson content

### Forms & Inputs
- All form fields have visible labels (not placeholder-only)
- Error messages associated with their fields via aria-describedby
- Activity submission and course creation forms usable entirely via keyboard
- Loading/submitting states communicated to assistive technology

### Content
- Generated lesson content should use clear language and define jargon
- Feedback (strengths, improvements, tips) structured as lists, not walls of text
- Assessment results use semantic structure (not just color-coded bars)

---

## What's Deferred

These are real features but not part of the initial validation:

| Feature | Why Deferred |
|---|---|
| Badge system | Additive reward mechanic, not core to learning loop |
| Visual aids (SVG/Mermaid generation) | High effort, high LLM failure rate, not foundational |
| Agent transparency UI (log viewer) | Debug tool, not learner-facing priority |
| 3-lesson onboarding setup course | Replaced by a simple profile form for validation |
| Archive/unarchive courses | Low-priority state management, boolean delete is enough |
| Chat-based course creation | Form-based is simpler to validate; conversational UX is a v2 bet |
| OAuth / social login | Email/password stub is sufficient for internal validation |
| Image-based submissions | Text-only for now |

---

## Success Criteria for Validation

The internal team should be able to answer:

1. **Generation quality**: Do the lessons teach? Do activities challenge appropriately? Do
   assessments measure the right things? Or does it feel like slop?
2. **UX flow**: Is the generate → learn → practice → assess arc intuitive? Where do people get
   stuck or confused?
3. **Personalization**: Does profile-aware content feel meaningfully different from generic output?
   Is it worth the complexity?
