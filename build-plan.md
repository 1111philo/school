# 1111 School — Build Plan

Goal: validate the product with the internal team as fast as possible. Each phase ends with
something testable by a real person.

---

## Phase 1: Generation Pipeline + Content Quality

**Validates**: Does the content pipeline produce quality output across the full arc — lessons,
activities, and assessments? Or does it feel like slop?

**What gets built**:

1. **Project skeleton** — FastAPI app, PostgreSQL via Docker Compose, Alembic migrations, all 7
   database models, `get_current_user` stub returning a dev user
2. **LLM abstraction** — `generate_structured()` function, provider-agnostic, configured via
   environment variable
3. **Generation pipeline** — The for-loop: for each objective, plan → write → create activity.
   Sequential async calls, no graph library. Persists lessons + activities to DB as they're
   generated.
4. **Activity review** — `POST /api/activities/{id}/submit` runs the reviewer function, returns
   scored feedback, persists the review
5. **Assessment generation + review** — Generate assessment items after all lessons complete, score
   submissions, determine pass/fail
6. **Prompt engineering** — This is the real work of Phase 1. Iterate on system prompts until
   output quality is consistently good. Test across diverse topics (technical, creative,
   professional). Tune rubric generation, feedback specificity, assessment coverage.
7. **Minimal API** — Just enough endpoints to exercise the pipeline: create course, trigger
   generation, list courses, get course detail, submit activity, generate/submit assessment

**How to test it**: Could be CLI scripts, curl, or a bare-bones test UI. The point is reading
generated content and evaluating quality, not polishing a frontend. The team should generate 10-20
courses across different topics and evaluate:
- Do lessons teach coherently, or do they read like summarized Wikipedia?
- Do activities challenge appropriately for the stated objective?
- Is feedback specific and actionable, or generic praise/criticism?
- Do assessments cover the right things? Is pass/fail calibrated?

**Done when**: The team reads generated courses and says "this teaches" not "this is slop."

---

## Phase 2: Full UI Loop

**Validates**: Does the end-to-end UX flow work? Can someone sit down, create a course, learn
from it, and complete it without getting confused?

**What gets built**:

1. **Course catalog page** — Predefined courses as JSON files on disk, loaded at startup, searchable
   and filterable. "Create Your Own" CTA.
2. **Custom course creation** — Two-step form: input description + objectives, preview + confirm
3. **Generation progress** — SSE streaming from the backend, vertical stepper UI showing pipeline
   stages and lesson count
4. **Lesson reader** — Markdown rendering of lesson content, linear navigation
5. **Activity submission UI** — Display instructions/prompt/hints, text input, submit, display
   scored feedback with strengths/improvements/tips
6. **Lesson unlock flow** — Any submission unlocks next lesson, progress tracked visually
7. **Assessment flow** — Assessment screen after all lessons, results screen with per-objective
   scores, pass/fail with retry option
8. **My Courses page** — Card grid of user's courses, resume from where you left off

**How to test it**: Internal team members each go through 2-3 complete course cycles. Watch for:
- Where do people hesitate or get confused?
- Is the generation wait time acceptable? Does SSE progress help?
- Does the activity → feedback → unlock flow feel natural?
- Does assessment feel like a meaningful capstone or a chore?
- What's missing from the flow that makes it feel incomplete?

**Done when**: Someone can go from catalog → course creation → all lessons → assessment → completion
without asking "what do I do next?"

---

## Phase 3: Learner Profile + Personalization

**Validates**: Does profile-aware generation feel meaningfully different from generic output? Is
the personalization worth the complexity?

**What gets built**:

1. **Profile form** — Simple form at `/profile`: display name, experience level, learning goals,
   interests, learning style, tone preference. No 3-lesson onboarding course — just a form.
2. **Profile-aware generation** — All LLM functions receive the learner profile and incorporate it
   into system prompts. Two people generating the same course should get noticeably different
   content.
3. **Automatic profile updates** — Activity scores update skill signals (gaps and strengths).
   Course completions update history.
4. **First-run prompt** — On first visit, prompt the user to fill out their profile before
   creating a course (but don't block them).

**How to test it**: Create two profiles with different experience levels and learning styles.
Generate the same course with each. Compare side-by-side:
- Is the content meaningfully different, or just superficially reworded?
- Does an "advanced" profile get harder content, or the same content with bigger words?
- Does tone preference actually change the voice?
- Do skill signals from activities influence future generation?

**Done when**: The team agrees that personalization produces genuinely different (and better-fit)
content, not just cosmetic variation.

---

## What's Not in Any Phase

These are real features that wait until the core is validated:

| Feature | Why It Waits |
|---|---|
| Real authentication | Stubbed user is fine for internal validation |
| Badges / gamification | Additive, doesn't affect core learning loop |
| Visual aids (SVG/Mermaid) | High effort, high failure rate, not foundational |
| Agent log transparency UI | Debug tool, not learner-facing |
| Chat-based course creation | Form-based is simpler; conversational UX is a separate bet |
| Content moderation | Required before real users, not before internal testing |
| Deployment / CI/CD | Local dev is fine for validation |
| Image submissions | Text-only covers the core feedback loop |
| Course archive/unarchive | Simple delete is enough |

---

## Dependencies Between Phases

```
Phase 1 ──→ Phase 2 ──→ Phase 3
```

Strictly sequential. Phase 2 needs the working pipeline from Phase 1. Phase 3 needs the working
UI from Phase 2 to observe personalization differences in context.

However, within each phase, frontend and backend work can run in parallel once the API contract
is defined (relevant in Phase 2).

---

## Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Generation quality is bad | Nothing else matters | Phase 1 focuses entirely on this. Iterate prompts before building UI. |
| LLM provider rate limits / cost | Can't generate enough courses to test | Start with a cost-efficient model for iteration, use the best model for final quality checks |
| SSE streaming is complex to implement | Phase 2 delays | Can fall back to polling with a spinner; SSE is better UX but not blocking |
| Personalization is imperceptible | Phase 3 doesn't validate | Design an A/B comparison (same course, two profiles) as the test protocol |
| Assessment pass/fail feels arbitrary | Undermines completion arc | Tune prompts so scoring rationale is transparent and rubric-referenced |
