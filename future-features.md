# 1111 School — Future Features

Everything that's real but not part of the POC validation. Organized by theme, roughly prioritized
within each section.

---

## Authentication & Security

- **Real authentication** — Email/password with bcrypt hashing, session management via httpOnly
  cookies, email verification
- **OAuth / social login** — Google OAuth, account linking
- **CSRF protection** — Token-based CSRF for state-changing requests
- **Field encryption at rest** — AES-256-GCM for sensitive profile and submission data
- **Rate limiting** — Per-user and system-wide limits on API calls and LLM usage
- **Per-request cost bounding** — Cap objectives per request, daily LLM budget limits
- **Data export / GDPR portability** — User can export their data
- **Account deletion** — Full "delete my data" with cascade
- **COPPA / FERPA compliance** — Age verification, parental consent, student record handling
  (requires legal review — may change data architecture)
- **2FA, RBAC, SSO** — Multi-factor auth, role-based access, single sign-on

## Content Safety

- **Content moderation** — Safety classifier + topic blocklist before course generation
- **Prompt injection defenses** — Input fencing, instruction hierarchy markers
- **Output safety filtering** — Post-generation safety check on LLM-produced content
- **System prompt protection** — Prevent exposure of system prompts via agent logs or error messages

## Onboarding

- **3-lesson setup course** — Teaches the platform while collecting profile signals (replaces the
  simple form once validated)
- **Profile review screen** — Post-onboarding review and confirmation of assembled profile
- **First-run guided tour** — Contextual hints for first-time users

## Visual Aids

- **Visual aid sniffer agent** — Analyzes lessons for opportunities to insert informative graphics
- **Visual aid creator agent** — Generates SVG, Mermaid, or PNG assets with meaningful alt text
- **Placement system** — Stable placeholders (`{{VISUAL_AID:<id>}}`) inserted into lesson Markdown,
  rendered by the frontend
- **Mermaid rendering** — Frontend component for rendering Mermaid diagrams inline

## Badges & Gamification

- **Badge entity + award flow** — Badge awarded on course completion
- **Badge display on profile** — Grid of earned badges with course titles and dates
- **Badge award animation** — Overlay with scaling badge icon and confetti
- **Achievement system** — Streaks, milestones, course count badges

## Agent Transparency

- **Agent log viewer UI** — Per-course log viewer with filtering by lesson/activity/assessment
- **Prompt + output display** — Collapsible sections, monospace for JSON
- **PII redaction engine** — Regex-based redaction at display time (API keys, JWTs, emails, names)
- **Search and filtering** — Filter by agent name, status, date range

## Content Editing & Regeneration

- **Lesson regeneration** — User can regenerate a lesson (limited attempts)
- **"More examples" / "Simpler explanation"** — Variant regeneration with modified prompts
- **Predefined course versioning** — Admin updates JSON, system tracks version changes

## Image Submissions

- **Image upload for activities** — Photo, screenshot, diagram, handwritten work
- **Image upload for assessments** — Assessment items that accept image evidence
- **Secure image storage** — Object storage with expiring signed URLs
- **Image-aware review** — Activity and assessment reviewers that evaluate visual evidence

## Theming & Visual Design

- **Dark mode / light mode** — Both themes with system-preference default and user override
- **Theme persistence** — Store preference per user/device
- **Adjustable reading mode** — Font size, line spacing controls

## Analytics & Telemetry

- **Event tracking** — signup, login, course_selected, lesson_viewed, activity_submitted (score
  bucket only), assessment pass/fail, regeneration_requested, agent_failure
- **Success metrics dashboard** — Activation %, completion rate, time-to-first-lesson, 7-day
  retention
- **Personalization rating** — In-app rating after course completion to measure perceived value
- **Cost monitoring** — Per-user and per-course LLM token usage and cost tracking

## Architecture & Infrastructure

- **Deployment strategy** — Cloud provider, CI/CD pipeline, environment promotion (dev → staging →
  prod), infrastructure-as-code
- **Prompt/schema versioning** — Treat prompts and schemas as versioned artifacts, store version
  metadata on every generated artifact and log entry
- **Dual output storage** — Persist both raw LLM output and validated/parsed output for audit
- **Fallback generation** — Simplified prompt template with reduced personalization when primary
  generation fails
- **Agent instrumentation** — Latency, error rate, retry count, validation failure reasons, token
  usage per call
- **Generated artifact caching** — Cache generated content per user + course version to reduce
  latency and cost
- **Replay support (dev mode)** — Rerun generation using the same prompt version + inputs to
  reproduce outputs

## Learner Profile (Advanced)

- **UDL preferences** — Engagement, Representation, Action-Expression accommodations per learner
- **Skill signals with history** — Detailed strength/gap/misconception tracking with evidence trail
- **Profile change history UI** — Timestamped log of all profile changes with source (user edit,
  activity signal, system)
- **Constraints** — Time per day, device constraints, reading level preferences
- **Preferred response modality** — Writing, diagrams, image uploads

## Course Progression (Advanced)

- **Mastery gating** — Optional: require rubric threshold before unlocking next lesson (instead of
  any-submission-unlocks)
- **Adaptive sequencing** — Reorder or insert lessons based on performance signals
- **Remediation micro-lessons** — Short targeted lessons when mastery is not met
- **Archive / unarchive** — Full state transitions for archiving courses (replaces boolean delete)

## Assessment (Advanced)

- **Assessment retry with regeneration** — Regenerate assessment items on retry to prevent gaming
- **Adaptive follow-ups** — Additional items targeting weak objectives
- **Timed assessments** — Optional time limits
- **Multi-attempt analytics** — Track improvement across assessment retries
- **Earlier checkpoints** — Mid-course knowledge checks before the final assessment

## Platform Evolution

- **Chat-based course creation** — Conversational UX for describing what you want to learn
- **Course marketplace** — Sharing, rating, and discovering community-created courses
- **Multi-learner classrooms** — Real-time collaboration, shared courses
- **External LMS gradebook sync** — Export grades to external systems
- **Full authoring studio** — Drag/drop lesson editing, content rearrangement
- **Open source readiness** — Modular architecture, prompt packs, provider adapters, contributor
  docs
- **Backward compatibility** — Versioned schemas/prompts with migration support, older course
  instances remain renderable
