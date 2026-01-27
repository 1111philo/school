# Pedagogical Framework: UDL + Archetypes + Glass Box

This document defines the pedagogical and philosophical foundations for the Curriculum Individualizer's differentiation engine.

**Reference Documents:**
- [Curriculum Individualizer Product Vision](https://docs.google.com/document/d/1Y1TeJMVMaHSw2mUpDA_eBa647vLyk97B3IUCGIQcjcc/edit?tab=t.0#heading=h.yjpzq5z0qjrp)
- [Student Archetypes Data](https://docs.google.com/spreadsheets/d/1XnRspdFq-qtGOUynWqZdvv6GjOgAEYSlwAwJZdZeXTA/edit?gid=0#gid=0)
- [Glass Box AI Philosophy](https://dylanisa.ac/definitions/glass-box/)

---

## Core Thesis

**Advanced LLMs are capable of reasoning through rich qualitative context about learners and producing meaningfully differentiated educational content.**

This isn't rule-based adaptation ("IF reading_level < 6 THEN simplify"). It's genuine reasoning: "Phil cares deeply about environmental impact and is skeptical of AI's resource usage. For this hardware lesson, I should acknowledge environmental trade-offs and frame computing choices through a sustainability lens."

To make this reasoning trustworthy, auditable, and improvable, we apply **Glass Box** principles—the system exposes its differentiation logic so teachers can inspect, verify, and override it.

---

## Framework Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    DIFFERENTIATION ENGINE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────────┐                                           │
│   │  UDL FRAMEWORK  │  ← The "HOW" (what levers exist)          │
│   │  • Engagement   │                                           │
│   │  • Representation                                           │
│   │  • Action/Expression                                        │
│   └────────┬────────┘                                           │
│            │                                                     │
│            ▼                                                     │
│   ┌─────────────────┐                                           │
│   │   ARCHETYPES    │  ← The "WHO" (which levers to pull)       │
│   │  • Need axis    │                                           │
│   │  • Ambition axis│                                           │
│   │  • Qualitative  │                                           │
│   └────────┬────────┘                                           │
│            │                                                     │
│            ▼                                                     │
│   ┌─────────────────┐                                           │
│   │   GLASS BOX     │  ← The "WHY" (visible reasoning)          │
│   │  • Scratch pads │                                           │
│   │  • Traces       │                                           │
│   │  • Confidence   │                                           │
│   └─────────────────┘                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

| Layer | Role | Question It Answers |
|-------|------|---------------------|
| **UDL** | Framework | "What dimensions of a lesson CAN be differentiated?" |
| **Archetypes** | Lens | "For THIS learner, which dimensions SHOULD be differentiated?" |
| **Glass Box** | Transparency | "WHY did the system make these specific choices?" |

---

## Layer 1: Universal Design for Learning (UDL)

UDL is the primary framework for individualization. It provides three principles that map to the dimensions an LLM can manipulate in educational content.

### The Three UDL Principles

**1. Multiple Means of Engagement (The "Why" of Learning)**

How do we recruit interest and sustain effort?

| Guideline | What It Means | LLM Can Adjust |
|-----------|---------------|----------------|
| Recruiting Interest | Connect to learner's world | Examples, hooks, relevance framing |
| Sustaining Effort | Maintain motivation through challenges | Difficulty progression, encouragement, goals |
| Self-Regulation | Build internal motivation | Reflection prompts, metacognitive scaffolds |

**2. Multiple Means of Representation (The "What" of Learning)**

How do we present information so all learners can perceive and comprehend it?

| Guideline | What It Means | LLM Can Adjust |
|-----------|---------------|----------------|
| Perception | Provide alternatives for sensory access | Text/image/audio balance, visual supports |
| Language & Symbols | Clarify vocabulary and notation | Reading level, vocabulary scaffolding, definitions |
| Comprehension | Support understanding | Scaffolding questions, worked examples, analogies |

**3. Multiple Means of Action & Expression (The "How" of Learning)**

How do learners demonstrate what they know?

| Guideline | What It Means | LLM Can Adjust |
|-----------|---------------|----------------|
| Physical Action | Vary methods of response | Activity types, input modalities |
| Expression & Communication | Multiple ways to show understanding | Written/verbal/visual/kinesthetic options |
| Executive Functions | Support planning and monitoring | Checklists, templates, progress indicators |

### UDL as Design Constraint

Every generated lesson must offer multiple pathways across all three principles. This isn't optional differentiation—it's the baseline expectation for any lesson the system produces.

```
Base Lesson Quality Check:
✓ Does it offer multiple ways to engage? (not just one hook)
✓ Does it represent information in multiple formats? (not just text)
✓ Does it allow multiple ways to demonstrate learning? (not just one activity)
```

The individualization layer then emphasizes specific pathways based on the learner's archetype.

---

## Layer 2: Student Archetypes

Archetypes serve two purposes:
1. **Representative clusters** - Categories that help the system reason about learner needs
2. **Validation personas** - Test cases to ensure differentiation is meaningful and generalizable

### The Need × Ambition Matrix

Students are characterized along two primary axes:

**Net Need** - Learning support required
- Encompasses: academic gaps, disabilities, language barriers, socioeconomic factors, family instability
- Scale: Very Low → Low → Medium → High → Very High

**Net Ambition** - Motivation and future orientation
- Encompasses: goal clarity, intrinsic motivation, persistence, growth mindset
- Scale: Very Low → Low → Medium → High → Very High

```
                            AMBITION
                 Low                      High
              ┌────────────────────────────────────┐
         Low  │  Glinda                 │  Ross    │
              │  (Coasting)             │  Joseph  │
              │  • May not engage       │(Thriving)│
              │    unless required      │  • Ready │
              │  • Needs relevance      │    for   │
    NEED      │    hook                 │   depth  │
              ├────────────────────────────────────┤
              │  Gerryana    │  Rial    │  Wilmay  │
         High │  (At Risk)   │  Rick    │(Striving)│
              │  • Heavy     │(Emerging)│  • High  │
              │    scaffolding          │   support│
              │  • Confidence│  • Needs │   + high │
              │    building  │  belonging│  challenge
              └────────────────────────────────────┘
```

### Archetype Profiles

Each archetype includes quantitative and qualitative dimensions:

**Quantitative Dimensions:**
- Age / Grade level
- English fluency level
- Physical disabilities
- Mental/cognitive disabilities
- Neurodiversity indicators

**Qualitative Dimensions (Lagniappe):**
- Interests (for relevant examples)
- Family context (for sensitivity)
- Specific notes about learning patterns
- Barriers and strengths observed

### Sample Archetype Profiles

**Gerryana** - High Need / Low Ambition
```yaml
need: High
ambition: Low
age: 20
family: Fostered
ses: Low
disabilities: Cognitive, Social
interests: fashion, healthcare
lagniappe: null
```
*Differentiation focus: Build relevance through interests, heavy scaffolding, confidence-building activities*

**Wilmay** - High Need / High Ambition
```yaml
need: High
ambition: High
age: 18
family: Single Parent
ses: Low
native_language: Spanish
english_fluency: Proficient 2
interests: soccer, construction
lagniappe: null
```
*Differentiation focus: Honor ambition with challenge, scaffold language not intellect, leverage bilingual assets*

**Rial** - Very High Need / Medium Ambition
```yaml
need: Very High
ambition: Medium
age: 16
family: Grandparent(s)
ses: Very Low
interests: null
lagniappe: "Will step back because she doesn't think she fits in this space"
```
*Differentiation focus: Belonging and identity, gentle entry points, private low-stakes participation first*

**Phil** - Low Need / Very Low Ambition
```yaml
need: Low
ambition: Very Low
age: 17
interests: environment
lagniappe: "...considering the environmental impact of generative AI (including
a high amount of carbon dioxide being released into the atmosphere, causing
warming and less directly, the rise of the sea level, in addition to the huge
amount of drinking water being used to cool physical units, and the environmental
impact of the constant demand for new hardware to be developed which compounds
the previous issues) and New Orleans's lazy coastlines..."
```
*Differentiation focus: Acknowledge and engage with skepticism, frame through sustainability lens, don't be tech-utopian*

**Rick** - High Need / Medium Ambition
```yaml
need: High
ambition: Medium
age: 17
family: 2+ Parent w/ Conflict
disabilities: Auditory, Emotional, Social
neurodiversity: on spectrum
interests: Engineering
lagniappe: "struggles in a neurotypical space, lacking confidence"
```
*Differentiation focus: Clear structure for neurodivergent learning, reduce auditory dependence, build confidence through competence*

**Ross** - Low Need / Very High Ambition
```yaml
need: Low
ambition: Very High
age: 18
family: 2+ Parent
ses: Mid
neurodiversity: somewhat rigid
interests: VR, robotics, haptics
lagniappe: null
```
*Differentiation focus: Depth and autonomy, technical language welcome, real-world application, honor rigidity with clear structure*

### Archetype → UDL Mapping

| Archetype Pattern | Engagement Priority | Representation Priority | Expression Priority |
|-------------------|---------------------|------------------------|---------------------|
| High Need / Low Ambition | **Critical**: Must hook through interests | Heavy scaffolding, visual supports | Low-stakes, familiar formats |
| High Need / High Ambition | Channel ambition, show pathways | Scaffold without patronizing | Multiple options, honor effort |
| Low Need / High Ambition | Autonomy, depth, challenge | Can handle complexity | Open-ended, creative |
| Low Need / Low Ambition | **Critical**: Why should I care? | Standard presentation | Efficiency, minimal friction |
| Very High Need / Medium Ambition | Belonging, "you fit here" | Gentle entry, build up | Safe to fail, private first |

---

## Layer 3: Glass Box Reasoning

Glass Box is the transparency mechanism that makes differentiation auditable, trustworthy, and improvable.

### Four Glass Box Principles Applied

**1. Visible Reasoning Chains**
The LLM exposes its thought process through structured scratch pads showing:
- How it interpreted the student profile
- Which UDL principles it prioritized and why
- What specific changes it made to the base lesson
- Confidence levels for each decision

**2. Human-in-the-Loop Design**
Teachers can:
- Review reasoning before lesson is delivered
- Override specific decisions ("Actually, push Rial harder")
- Provide feedback that improves future generations
- Pause at any point in the differentiation pipeline

**3. Auditable Outputs**
Every differentiated lesson includes:
- Source attribution (which profile data influenced which decisions)
- Confidence levels (high/medium/low for each adaptation)
- Alternatives considered (what the system didn't do and why)
- Explicit assumptions stated

**4. Expert Reasoning Mapping**
UDL guidelines are encoded as the expert framework:
- System reasons through UDL principles explicitly
- Pedagogical best practices guide token generation
- Edge cases (like Phil's environmental concerns) are surfaced early
- Teacher expertise is captured and encoded over time

### Differentiation Reasoning Trace Template

Every differentiated lesson produces a reasoning trace:

```markdown
## Differentiation Reasoning Trace

### Student Context Understanding
- **Archetype**: [Need level] / [Ambition level]
- **Key factors identified**:
  - [Factor 1 with source]
  - [Factor 2 with source]
  - [Factor 3 with source]
- **Lagniappe insights**: [Qualitative notes that influenced reasoning]
- **Confidence in profile interpretation**: [High/Medium/Low]

### UDL Analysis

**Engagement (the "why")**
- Challenge identified: [What barrier to engagement exists?]
- Strategy selected: [How will we address it?]
- Alternatives considered: [What else could we have done?]
- Confidence: [High/Medium/Low]

**Representation (the "what")**
- Challenge identified: [What barrier to comprehension exists?]
- Strategy selected: [How will we address it?]
- Alternatives considered: [What else could we have done?]
- Confidence: [High/Medium/Low]

**Action/Expression (the "how")**
- Challenge identified: [What barrier to demonstration exists?]
- Strategy selected: [How will we address it?]
- Alternatives considered: [What else could we have done?]
- Confidence: [High/Medium/Low]

### Differentiation Decisions

| Aspect | Base Lesson | Individualized | Rationale |
|--------|-------------|----------------|-----------|
| Opening hook | [Original] | [Adapted] | [Why] |
| Vocabulary level | [Original] | [Adapted] | [Why] |
| Examples used | [Original] | [Adapted] | [Why] |
| Visual supports | [Original] | [Adapted] | [Why] |
| Activity type | [Original] | [Adapted] | [Why] |
| Assessment format | [Original] | [Adapted] | [Why] |

### Quantitative Metrics

| Metric | Base | Individualized | Delta |
|--------|------|----------------|-------|
| Word count | X | Y | ±Z |
| Reading level (Lexile) | X | Y | ±Z |
| Images/diagrams | X | Y | ±Z |
| Scaffolding questions | X | Y | ±Z |
| Technical terms | X | Y | ±Z |
| Activity options | X | Y | ±Z |

### Teacher Review Points
- [ ] [Question about a medium-confidence decision]
- [ ] [Question about interpretation of Lagniappe]
- [ ] [Question about appropriateness of adaptation]

### Feedback Integration
[Space for teacher notes that will inform future generations]
```

---

## Experimental Framework

The Glass Box approach enables rigorous experimentation on differentiation effectiveness.

### Variables

**Independent Variables (manipulated):**
```
├── Archetype (Need × Ambition quadrant)
├── Individual context depth (with/without Lagniappe)
├── UDL emphasis (Engagement vs Representation vs Expression weighted)
├── Base lesson complexity
└── Prompt engineering variations
```

**Dependent Variables (measured):**
```
├── Quantitative
│   ├── Word count delta
│   ├── Reading level delta (Lexile/Flesch-Kincaid)
│   ├── Image count
│   ├── Scaffolding question count
│   └── Technical vocabulary density
├── Structural
│   ├── Activity types selected
│   ├── Example domains used
│   ├── Assessment format changes
│   └── Modality distribution (text/visual/interactive)
└── Reasoning
    ├── UDL principles invoked
    ├── Confidence levels
    ├── Alternatives considered
    └── Lagniappe influence (did qualitative data change output?)
```

### Experiment Types

**1. Differentiation Validity**
*Question: Does the system produce meaningfully different outputs for different archetypes?*

```
Design: Same base lesson → All 8 archetypes
Measure: Pairwise similarity of outputs
Success: Outputs are measurably different in ways that align with archetype needs
```

**2. Qualitative Context Impact**
*Question: Does Lagniappe data change outputs beyond what quantitative data predicts?*

```
Design: Same archetype, with vs without Lagniappe
Measure: Output differences attributable to qualitative notes
Success: Phil's lesson acknowledges environmental concerns; Rial's addresses belonging
Example:
  - Phil without Lagniappe: Generic lesson
  - Phil with Lagniappe: "As we learn about hardware, it's worth considering
    the environmental footprint of computing infrastructure..."
```

**3. UDL Lever Sensitivity**
*Question: Which UDL principle has the largest impact on output for each archetype?*

```
Design: Same archetype, vary UDL emphasis (Engagement-heavy, Representation-heavy, Expression-heavy)
Measure: Output changes per emphasis
Success: Understand which lever matters most for each archetype type
```

**4. Generalization Testing**
*Question: Can the system handle novel archetypes it hasn't seen?*

```
Design: Train on 6 archetypes, test on 2 held-out
Measure: Quality of differentiation for unseen archetypes
Success: System generalizes from learned patterns, doesn't overfit to specific profiles
```

**5. Teacher Override Learning**
*Question: Does the system improve from teacher feedback?*

```
Design: Track teacher overrides over time
Measure: Reduction in override frequency for similar decisions
Success: System learns teacher preferences and reduces low-confidence decisions
```

### Measurement Protocol

For each generated lesson:

1. **Automated metrics** (computed):
   - Word count, reading level, image count, vocabulary analysis

2. **Structured extraction** (from reasoning trace):
   - UDL principles invoked, confidence levels, alternatives considered

3. **Human evaluation** (teacher review):
   - Appropriateness rating (1-5)
   - Override count
   - Feedback notes

4. **Outcome tracking** (if deployed):
   - Student engagement (time on task)
   - Completion rate
   - Assessment performance
   - Student self-report (age-appropriate)

---

## Relationship to Tomlinson

Tomlinson's Differentiated Instruction framework (Content, Process, Product, Environment) complements UDL:

| Tomlinson | UDL Equivalent | Role in System |
|-----------|----------------|----------------|
| Content | Representation | What information is presented |
| Process | Engagement + Representation | How learning happens |
| Product | Action/Expression | How students demonstrate learning |
| Environment | (Meta-level) | Where/how the experience is delivered |

**In this system:**
- UDL provides the **design principles** (what to consider)
- Tomlinson provides the **validation checklist** (did we actually differentiate?)

```
Tomlinson Validation:
✓ Did Content differ? (vocabulary, complexity, examples)
✓ Did Process differ? (pacing, scaffolding, activities)
✓ Did Product differ? (assessment format, expression options)
✓ Did Environment considerations apply? (accessibility, modality)
```

---

## Implementation in the Differentiation Engine

### Input Schema

```typescript
interface DifferentiationInput {
  baseLesson: Lesson;

  archetype: {
    need: 'very-low' | 'low' | 'medium' | 'high' | 'very-high';
    ambition: 'very-low' | 'low' | 'medium' | 'high' | 'very-high';
  };

  studentProfile: {
    // Quantitative
    age: number;
    gradeLevel: string;
    englishFluency: 'emerging' | 'proficient-1' | 'proficient-2' | 'fluent';
    nativeLanguages: string[];
    physicalDisabilities: string[];
    mentalDisabilities: string[];
    neurodiversity: string | null;

    // Qualitative
    interests: string[];
    familyStatus: string;
    socioeconomicStatus: string;
    lagniappe: string | null;  // The rich qualitative notes
  };

  udlEmphasis?: {
    engagement: number;      // 0-1, relative weight
    representation: number;  // 0-1, relative weight
    expression: number;      // 0-1, relative weight
  };
}
```

### Output Schema

```typescript
interface DifferentiationOutput {
  individualizedLesson: Lesson;

  reasoningTrace: {
    contextUnderstanding: {
      archetypeClassification: string;
      keyFactors: { factor: string; source: string }[];
      lagniappeInsights: string | null;
      confidence: 'high' | 'medium' | 'low';
    };

    udlAnalysis: {
      engagement: UDLDecision;
      representation: UDLDecision;
      expression: UDLDecision;
    };

    differentiationDecisions: {
      aspect: string;
      baseLessonValue: string;
      individualizedValue: string;
      rationale: string;
    }[];

    quantitativeMetrics: {
      metric: string;
      baseValue: number;
      individualizedValue: number;
      delta: number;
    }[];

    alternativesConsidered: {
      decision: string;
      alternativeOption: string;
      whyNotChosen: string;
    }[];

    teacherReviewPoints: string[];
  };
}

interface UDLDecision {
  challengeIdentified: string;
  strategySelected: string;
  alternativesConsidered: string[];
  confidence: 'high' | 'medium' | 'low';
}
```

### Prompt Structure

```markdown
# Lesson Differentiation Task

You are an expert educator applying Universal Design for Learning (UDL) principles
to differentiate a lesson for a specific student.

## Your Framework

Apply UDL's three principles:
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

## Your Task

1. Analyze the student profile through UDL lens
2. Identify specific challenges and opportunities
3. Adapt the lesson across all three UDL principles
4. Document your reasoning in the required format
5. Flag any decisions where you have medium/low confidence for teacher review

## Output Format

[Structured output matching DifferentiationOutput schema]
```

---

## Success Criteria

### System Success
- [ ] Differentiated outputs are measurably different across archetypes
- [ ] Qualitative context (Lagniappe) demonstrably influences outputs
- [ ] Reasoning traces are coherent and auditable
- [ ] Teachers can understand and override decisions
- [ ] System generalizes to novel archetypes without overfitting

### Pedagogical Success
- [ ] Differentiations align with UDL best practices
- [ ] Teachers rate adaptations as appropriate (4+ out of 5)
- [ ] Student engagement metrics improve vs. undifferentiated content
- [ ] Learning outcomes improve for high-need archetypes

### Glass Box Success
- [ ] Teachers report increased trust due to visible reasoning
- [ ] Override frequency decreases over time (system learns)
- [ ] Reasoning traces create valuable training data
- [ ] Low-confidence flags accurately predict where teacher input is needed
