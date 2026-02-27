1111 School PRD Review — Consolidated Findings

## 1. Architecture & Simplicity: Over-Engineered in Key Areas

The "agent" framing is inflating complexity. The 9 "specialized AI agents" are actually structured
LLM calls — none use tools, none have memory across invocations, none make autonomous decisions.
Calling them agents leads to over-engineered infrastructure (FSM orchestration, agent logging
wrappers, dependency injection dataclasses) that would be unnecessary if they were treated as what
they are: functions that send prompts and parse structured output.

pydantic_graph is the most concerning technology choice. The course generation pipeline is
sequential: describe → plan → write → create activity. That's a for-loop, not a graph. This very
new, niche library adds conceptual overhead and a risky dependency for no architectural benefit. A
plain async def generate_course() with sequential calls would be clearer and easier to debug.

The Pydantic ecosystem dependency is deep and risky. PydanticAI, pydantic_graph, pydantic_evals,
Pydantic Logfire — four libraries from the same rapidly evolving ecosystem, some effectively
beta-quality. If any has a breaking change, you have a systemic problem. Consider using Pydantic
(core, stable) plus direct LLM SDK calls with your own thin wrapper.

The course_describer agent should be eliminated. Its only job is rewriting the user's input into a
"focused description" — the lesson_planner could absorb this with a single sentence in its system
prompt. Removing it cuts LLM calls by 33% per course.

SQLite for dev / PostgreSQL for prod is a well-known anti-pattern. JSON handling, type strictness,
enum behavior, concurrent writes, and Alembic migrations all differ between the two. Use
PostgreSQL everywhere (Docker Compose is already in the stack). SQLite for fast unit tests only.

---

## 2. Core Learning Pipeline: Sound Structure, Specific Flaws

The agent boundaries are mostly correct. The lesson_planner/lesson_writer split and the
activity_creator/activity_reviewer split are justified — they have genuinely different concerns.

Critical flaw: PRDs 4 and 8 contradict each other on assessment retry. PRD 4's transition table
sends failed learners back to in_progress (revisit lessons). PRD 8's completion flow keeps them at
AssessmentReady and loops to resubmit. These need to be reconciled.

Assessment retry is gameable. The same assessment items are presented on retry with no
regeneration. Learners can memorize feedback and parrot it back. Either regenerate items on retry,
or require revisiting weak-area lessons first.

No minimum-effort guard on submissions. A learner can type "asdf" for every activity, unlock all
lessons, and reach assessment having learned nothing. Even a simple length check would help.

The archive/unarchive system adds 5 state transitions for a low-priority feature. Replace with a
simple deleted boolean for MVP.

Too much dead code specified. Image upload paths, UDL accommodations, Bloom's taxonomy levels, and
badge systems are all specified in detail but consumed by nothing downstream. This inflates
implementation cost without delivering value.

---

## 3. Feature Prioritization: Two Essential, Two Deferrable

| Priority | PRD | Verdict |
|---|---|---|
| Essential | PRD 10 — Course Discovery | Solves the cold-start problem. Without predefined courses, every user must articulate objectives from scratch. High friction kills conversion. |
| High value | PRD 6 — Learner Profile (slimmed) | A 4-5 field profile (experience level, goals, interests, tone, learning style) collected via a simple form delivers 80% of personalization value at 10% of the specified cost. Defer the 3-lesson Setup Course, UDL preferences, skill signals, and change history. |
| Defer | PRD 9 — Agent Transparency | Replace with a lightweight "Show AI Details" toggle per lesson. The full log viewer with filtering, search, and redaction is a sophisticated debug tool that most learners won't use. |
| Defer | PRD 7 — Visual Aids | High effort, high technical risk (LLMs produce malformed SVGs frequently), additive not foundational. For v1, let the lesson_writer include Mermaid code blocks inline and render them on the frontend. |

---

## 4. Security & Privacy: Critical Gaps

### Top 10 Issues by Severity

| # | Issue | Severity |
|---|---|---|
| 1 | No COPPA compliance — Education platform likely serving minors with zero age verification or parental consent | CRITICAL |
| 2 | No content moderation — Users can generate courses on weapons, self-harm, hate speech, etc. with no filtering | CRITICAL |
| 3 | No prompt injection defenses — User-controlled text flows directly into LLM prompts in course names, descriptions, profile fields, and submissions | HIGH |
| 4 | No email verification — Accounts created with arbitrary emails, enables enumeration and makes OAuth linking exploitable | HIGH |
| 5 | No output safety filtering — LLM-generated content presented to learners with no post-generation safety check | HIGH |
| 6 | No FERPA consideration — If used in schools, FERPA applies to student education records | HIGH |
| 7 | System prompts exposed via agent logs — Users can see full system prompts including instructional strategy and output schemas | HIGH |
| 8 | No per-request cost bounding — A single course generation with many objectives could exhaust the daily budget | HIGH |
| 9 | Cost amplification — No limit on objectives per request; 50 objectives = ~200 LLM calls from one API call | HIGH |
| 10 | OAuth account linking without email verification — Attacker with a Google account matching a victim's email could hijack their account | MEDIUM |

Additional concerns: Rate limiting keyed to session_id instead of user_id (resets on re-login), no
global system-wide rate limit, PII redaction defaults to off, no data export for GDPR
portability, profile change history has no retention limits.

---

## 5. Build Order & Dependencies: Mostly Sound, Five Key Risks

The PRD 1-5 ordering is correct — the dependency chain is linear and logical.

**Risk 1:** PRD 5 is a big-bang integration. It rewires the entire frontend at once. If API contracts
from PRDs 2-4 are wrong, everything breaks simultaneously. Consider splitting it: wire up course
generation first, then activity submission, then progression — testing each in isolation.

**Risk 2:** No user scoping until PRD 11. Every database query in PRDs 2-5 is built without user_id
filtering. PRD 11 requires adding it everywhere. If get_current_user and UserScopedRepository
aren't established in PRD 1 (even returning a stubbed user), every query must be rewritten. This
is the single most likely source of data isolation bugs.

**Risk 3:** PRD 2's pipeline is synchronous but PRD 5 needs SSE events. The pipeline must be
retrofitted for event emission. Design event hooks in PRD 2 even if SSE isn't exposed until PRD 5.

**Risk 4:** Cross-PRD model duplication. SuggestedActivity is defined in both PRD 2 and PRD 3. If they
drift, the pipeline silently breaks. Define shared types in a common module.

**Risk 5:** The MVP has no course completion UX. PRDs 1-5 let you generate courses, read lessons, and
do activities — but there's no "you finished" screen. The experience feels broken without closure.
Add a minimal completion path to PRD 4/5.

---

## 6. Concrete Recommendations

### Do Before Building

1. Add content moderation before course generation (safety classifier + topic blocklist)
2. Add prompt injection defenses (input fencing, instruction hierarchy markers)
3. Cap learning objectives at ~10 per request
4. Add email verification to registration
5. Consult legal on COPPA/FERPA — this could change your entire data architecture
6. Establish get_current_user and user-scoped queries in PRD 1, even with a stub

### Simplify

7. Drop pydantic_graph — replace with plain async functions
8. Eliminate course_describer agent — fold into lesson_planner
9. Remove image upload code paths entirely from MVP
10. Remove badge system from PRD 8 — ship it separately later
11. Replace archive/unarchive with a boolean deleted flag
12. Use PostgreSQL in dev — SQLite for unit tests only
13. Slim PRD 6 to a 4-5 field form, not a 3-lesson Setup Course

### Fix Design Conflicts

14. Reconcile PRD 4 vs PRD 8 on assessment retry behavior
15. Regenerate assessment items on retry to prevent gaming
16. Add minimum-effort validation on activity submissions
17. Design SSE event hooks in PRD 2 rather than retrofitting in PRD 5
18. Define shared types (like SuggestedActivity) in a common module

---

## 7. Missing: Deployment Strategy

No PRD covers deployment. The stack references Docker Compose for local dev, `https://1111.school`
and `https://app.1111.school` as production URLs, and mentions "secrets manager in production" and
"Redis in high-traffic deployments" as options — but no PRD specifies a cloud provider, container
orchestration strategy, CI/CD pipeline, or deployment workflow. Log retention is explicitly deferred
as "a production concern for later." Before building, the team needs a deployment PRD or at minimum
a decision on hosting platform, build/deploy pipeline, environment promotion (dev → staging → prod),
and infrastructure-as-code approach. Without this, PRD 1's Docker Compose setup is the only
environment that exists, and the gap widens with every subsequent PRD.

---

The core vision is solid — the learning loop of generate → study → practice → assess is sound, and
the decomposition into incremental PRDs is the right approach. The main themes are: strip the
Pydantic ecosystem dependencies back to what's proven, treat the LLM calls as functions not
agents, address AI safety and content moderation before building, and establish user scoping
patterns from day one rather than bolting them on last.
