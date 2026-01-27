# AI Services Layer Documentation

This document provides comprehensive documentation for the AI services layer of the School application. The AI services are responsible for course generation, lesson creation, activity assessment, and visual content generation using Google's Gemini models.

## Table of Contents

- [GenAIService Class](#genaiservice-class)
  - [Initialization and Singleton Pattern](#initialization-and-singleton-pattern)
  - [API Key Management](#api-key-management)
  - [Methods Overview](#methods-overview)
- [Method Details](#method-details)
  - [continueConversation](#continueconversation)
  - [generateCourse](#generatecourse)
  - [generateNextLesson](#generatenextlesson)
  - [generateRemedialActivity](#generateremedialactivity)
  - [assessActivity](#assessactivity)
  - [tuneLesson](#tunelesson)
- [Prompt Engineering Patterns](#prompt-engineering-patterns)
- [Error Handling Approaches](#error-handling-approaches)
- [Response Parsing and Validation](#response-parsing-and-validation)
- [Visual Generator](#visual-generator)
  - [Image Generation Options](#image-generation-options)
  - [Single Image Generation](#single-image-generation)
  - [Batch Image Generation](#batch-image-generation)
  - [Fallback Mechanisms](#fallback-mechanisms)
- [Model Selection Strategy](#model-selection-strategy)

---

## GenAIService Class

The `GenAIService` class is the primary interface for all AI-powered functionality in the application. It wraps the Google Generative AI SDK and provides specialized methods for educational content generation.

**Location:** `src/services/GenAIService.ts`

### Initialization and Singleton Pattern

The service implements the Singleton pattern to ensure only one instance exists throughout the application lifecycle:

```typescript
export class GenAIService {
    private static instance: GenAIService;
    private genAI: GoogleGenAI | null = null;

    private constructor() { }

    public static getInstance(): GenAIService {
        if (!GenAIService.instance) {
            GenAIService.instance = new GenAIService();
        }
        return GenAIService.instance;
    }
}
```

**Usage:**
```typescript
const aiService = GenAIService.getInstance();
```

### API Key Management

The API key must be set before any AI operations can be performed. The service stores the key internally and initializes the Google GenAI client:

```typescript
public setApiKey(key: string) {
    this.genAI = new GoogleGenAI({ apiKey: key });
}
```

All methods check for API key initialization and throw an error if not set:

```typescript
if (!this.genAI) throw new Error("API Key not set");
```

### Methods Overview

| Method | Purpose | Model Used |
|--------|---------|------------|
| `continueConversation` | Handles conversational course planning | `gemini-2.0-flash-lite` |
| `generateCourse` | Creates complete course structure | `gemini-2.0-flash-exp` |
| `generateNextLesson` | Generates subsequent lessons adaptively | `gemini-2.0-flash-exp` |
| `generateRemedialActivity` | Creates review activities for struggling students | `gemini-2.0-flash-lite` |
| `assessActivity` | Grades short-response and drawing activities | `gemini-2.0-flash-lite` |
| `tuneLesson` | Placeholder for lesson adjustment (stub) | N/A |

---

## Method Details

### continueConversation

**Purpose:** Facilitates a natural conversation with users to understand their learning goals before course creation.

**Signature:**
```typescript
async continueConversation(
    history: ChatMessage[],
    settings: UserSettings
): Promise<{ response: string; reasoning: string }>
```

**Parameters:**
- `history`: Array of previous chat messages in the conversation
- `settings`: User settings including `userName`

**Returns:** Object containing:
- `response`: The AI's conversational response (max 225 characters)
- `reasoning`: Brief explanation of the conversational strategy

**Behavior:**
1. Returns an initial greeting if `history` is empty
2. Otherwise, sends conversation history to the AI for continuation
3. The AI asks questions to understand learning topic, knowledge level, goals, and interests

**Initial Greeting (when history is empty):**
```typescript
return {
    response: `Hi ${settings.userName}! I'm your course creation assistant...`,
    reasoning: "Initial greeting to start conversation."
};
```

**Prompt Strategy:**
- Role: Expert educational consultant
- Goals: Understand topic, knowledge level, learning goals, interests, challenges
- Constraint: Responses limited to 225 characters for concise interaction

---

### generateCourse

**Purpose:** Creates a complete personalized course roadmap with the first lesson fully detailed.

**Signature:**
```typescript
async generateCourse(
    history: ChatMessage[],
    settings: UserSettings
): Promise<{ course: Course; reasoning: string }>
```

**Parameters:**
- `history`: Conversation history from the planning phase
- `settings`: User settings

**Returns:** Object containing:
- `course`: Complete course object with roadmap and first lesson
- `reasoning`: Explanation of course design decisions

**Course Structure Generated:**
```typescript
{
    course: {
        id: "course-{timestamp}-{random}",
        title: "Course Title",
        description: "Course Description",
        roadmap: [
            { id: "lesson-1", title: "...", description: "...", order: 1 },
            // 3-5 lessons total
        ],
        lessons: [
            {
                id: "lesson-1",
                title: "...",
                content: "Full markdown content...",
                visualPrompt: "Description for image generation...",
                activity: {
                    type: "multiple-choice",
                    config: { questions: [...] },
                    passingScore: 70
                },
                isCompleted: false,
                isGenerated: true,
                attempts: 0
            }
        ]
    }
}
```

**Key Features:**
- Generates 3-5 lesson roadmap based on conversation
- Only first lesson is fully generated (lazy generation pattern)
- Unique ID generation with timestamp and random suffix to prevent collisions
- Multiple-choice activities with 3-5 questions each

---

### generateNextLesson

**Purpose:** Generates the next lesson in a course, adapting content based on student performance.

**Signature:**
```typescript
async generateNextLesson(
    courseContext: Course,
    previousLesson: Lesson,
    comprehensionScore: number,
    nextLessonRoadmap: LessonRoadmap,
    settings: UserSettings
): Promise<{ lesson: Lesson; reasoning: string }>
```

**Parameters:**
- `courseContext`: The current course object
- `previousLesson`: The lesson the student just completed
- `comprehensionScore`: Student's score on the previous lesson (0-100)
- `nextLessonRoadmap`: Roadmap item for the lesson to generate
- `settings`: User settings

**Adaptive Performance Levels:**
```typescript
const performanceLevel = comprehensionScore < 70
    ? 'struggling'
    : comprehensionScore < 85
        ? 'adequate'
        : 'excellent';
```

**Activity Types Supported:**
- `multiple-choice`: Questions with options and correct answer
- `short-response`: Open-ended text questions with rubric
- `drawing`: Visual response activities with reference description

**Validation:**
The method validates that the generated lesson includes an activity:
```typescript
if (!data.lesson || !data.lesson.activity) {
    throw new Error("Generated lesson is missing the required activity section.");
}
```

---

### generateRemedialActivity

**Purpose:** Creates alternative learning activities for students who did not pass the initial assessment.

**Signature:**
```typescript
async generateRemedialActivity(
    lesson: Lesson,
    previousScore: number,
    attemptNumber: number
): Promise<{ activity: LessonActivity; reasoning: string }>
```

**Parameters:**
- `lesson`: The lesson requiring remediation
- `previousScore`: Student's score on the previous attempt
- `attemptNumber`: Which retry attempt this is

**Design Principles:**
1. Reviews key concepts from the lesson
2. Teaches while assessing (not just testing)
3. Provides more scaffolding and examples
4. Different questions from previous attempts

**Important Constraint:**
Explanations must be **neutral** - they should not start with "Correct", "Yes", or "That's right" to avoid revealing answers prematurely.

---

### assessActivity

**Purpose:** Grades student submissions for short-response and drawing activities using AI evaluation.

**Signature:**
```typescript
async assessActivity(
    type: 'short-response' | 'drawing',
    prompt: string,
    input: string,
    context?: string
): Promise<{ score: number; feedback: string }>
```

**Parameters:**
- `type`: Activity type being assessed
- `prompt`: The original question or task
- `input`: Student's response (text for short-response, base64 image for drawing)
- `context`: Rubric or reference description for grading

**Short-Response Assessment:**
```typescript
parts = [
    { text: `You are an expert teacher grading a student's short response.` },
    { text: `Question: ${prompt}` },
    { text: `Rubric/Context: ${context || 'Grade based on accuracy and clarity.'}` },
    { text: `Student Response: ${input}` },
    { text: `Evaluate the response and provide a score from 0 to 100...` }
];
```

**Drawing Assessment (Multimodal):**
```typescript
parts = [
    { text: `You are an expert teacher grading a student's drawing.` },
    { text: `Prompt: ${prompt}` },
    { text: `Reference Description: ${context || 'Evaluate if the drawing represents the concept accurately.'}` },
    { text: `Evaluate the attached drawing...` },
    {
        inlineData: {
            mimeType: "image/jpeg",
            data: input  // base64 encoded image
        }
    }
];
```

**Response Configuration:**
Uses `responseMimeType: "application/json"` to ensure structured output.

---

### tuneLesson

**Purpose:** Placeholder for future lesson adjustment functionality based on user feedback.

**Signature:**
```typescript
async tuneLesson(
    _lessonId: string,
    answer: string
): Promise<{ adjustment: string; reasoning: string }>
```

**Current Implementation:**
Returns a stub response indicating feedback was recorded:
```typescript
return {
    adjustment: "Acknowledged",
    reasoning: `User feedback "${answer}" recorded. In a full implementation, this would trigger a re-generation of subsequent lessons.`
};
```

---

## Prompt Engineering Patterns

### 1. Role Definition
Each prompt clearly establishes the AI's role:
```
"You are an expert educational consultant..."
"You are an expert curriculum designer..."
"You are an expert educator creating a remedial learning activity..."
```

### 2. Context Injection
User information and conversation history are injected into prompts:
```typescript
Student: ${settings.userName}.
Interest: ${userInterest}.

Conversation History:
${history.map(m => `${m.role}: ${m.content}`).join('\n')}
```

### 3. Structured Output Requirements
All prompts specify exact JSON output format:
```
Output JSON format:
{
    "response": "Your response to the user",
    "reasoning": "Brief explanation of your strategy"
}

CRITICAL: Return ONLY valid JSON. No markdown code blocks.
```

### 4. Constraint Enforcement
Prompts include explicit constraints:
- Character limits: `Keep your response under 225 characters`
- Content limits: `100-200 words MAX`
- Neutrality requirements: `Do NOT start with "Correct", "Yes", or "That's right"`

### 5. Adaptive Difficulty
Performance-based content adjustment:
```typescript
Student Performance: ${comprehensionScore}/100 (${performanceLevel})
```

---

## Error Handling Approaches

### 1. API Key Validation
All methods check for API initialization:
```typescript
if (!this.genAI) throw new Error("API Key not set");
```

### 2. JSON Parsing with Fallback
Robust parsing that handles various response formats:
```typescript
try {
    console.log("Raw AI Response:", text);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text;
    const data = JSON.parse(jsonStr);
    return data;
} catch (e) {
    console.error("Failed to parse JSON", e);
    console.error("Raw Text was:", text);
    // Return fallback or throw depending on method
}
```

### 3. Method-Specific Fallbacks

**Conversation methods** return graceful fallbacks:
```typescript
return {
    response: "I'm having trouble formulating my thoughts. Could you tell me more about what you'd like to learn?",
    reasoning: `Failed to parse AI response. Raw text: ${text.substring(0, 100)}...`
};
```

**Generation methods** throw errors for retry:
```typescript
throw new Error("Failed to generate course format. Please try again.");
```

### 4. Validation Checks
Generated content is validated before return:
```typescript
if (!data.lesson || !data.lesson.activity) {
    console.error("Generated lesson missing activity:", data);
    throw new Error("Generated lesson is missing the required activity section.");
}
```

---

## Response Parsing and Validation

### JSON Extraction Pattern
The service uses regex to extract JSON from potentially wrapped responses:
```typescript
const jsonMatch = text.match(/\{[\s\S]*\}/);
const jsonStr = jsonMatch ? jsonMatch[0] : text;
const data = JSON.parse(jsonStr);
```

This handles cases where the AI might wrap JSON in markdown code blocks.

### ID Generation
Course IDs include timestamp and random component to ensure uniqueness:
```typescript
data.course.id = `course-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
```

### Structured Response Mode
For assessment, the service requests JSON response format directly:
```typescript
config: { responseMimeType: "application/json" }
```

---

## Visual Generator

**Location:** `src/services/visualGenerator.ts`

The visual generator creates educational diagrams and illustrations for lessons using Gemini's image generation capabilities.

### Image Generation Options

```typescript
export interface ImageGenerationOptions {
  /** Model to use: 'flash' for speed (1024px) or 'pro' for quality (4K) */
  model?: 'flash' | 'pro';
  /** Aspect ratio for the generated image */
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  /** Enable Google Search grounding for more accurate visuals (Pro only) */
  enableGrounding?: boolean;
}
```

**Defaults:**
- `model`: `'flash'`
- `aspectRatio`: `'16:9'`
- `enableGrounding`: `true`

### Single Image Generation

**Function:** `generateLessonVisual`

```typescript
export async function generateLessonVisual(
  lesson: Lesson,
  visualPrompt: string,
  apiKey: string,
  options: ImageGenerationOptions = {}
): Promise<string>
```

**Model Selection:**
```typescript
const modelName = model === 'pro'
    ? 'gemini-3-pro-image-preview'  // 4K, grounding, thinking process
    : 'gemini-2.5-flash-image';      // Fast, 1024px
```

**Prompt Enhancement:**
The visual prompt is enhanced for better educational diagrams:
```typescript
const enhancedPrompt = `Educational diagram: ${visualPrompt}.
Style: Clean, simple, colorful illustration suitable for learning.
Clear labels, easy to understand, professional educational design.
Make it visually engaging and scientifically accurate.`;
```

**Pro Model Features:**
When using the Pro model with grounding enabled:
```typescript
if (enableGrounding && model === 'pro') {
    config.tools = [{
        googleSearch: {}
    }];
}
```

**Response Processing:**
```typescript
if (response.candidates && response.candidates[0]) {
    const parts = response.candidates[0].content?.parts;
    if (parts) {
        for (const part of parts) {
            if (part.inlineData) {
                const imageData = part.inlineData.data;
                const mimeType = part.inlineData.mimeType || 'image/png';
                const dataUrl = `data:${mimeType};base64,${imageData}`;
                return dataUrl;
            }
        }
    }
}
```

### Batch Image Generation

**Function:** `generateLessonVisualBatch`

```typescript
export async function generateLessonVisualBatch(
  lesson: Lesson,
  visualPrompt: string,
  apiKey: string,
  count: number = 3,
  options: ImageGenerationOptions = {}
): Promise<string[]>
```

Generates multiple image variations by setting `candidateCount`:
```typescript
config: {
    responseModalities: ['image'],
    candidateCount: count
}
```

Returns an array of data URLs, falling back to a single SVG if generation fails.

### Fallback Mechanisms

When API calls fail or return no images, the system generates an SVG fallback:

```typescript
function createFallbackSVG(title: string, prompt: string): string
```

**Fallback SVG Features:**
- Gradient background with purple/indigo theme
- Lesson title displayed prominently
- Visual prompt text wrapped to multiple lines
- Decorative circles for visual appeal
- "Fallback visualization (API unavailable)" label
- XML-safe text escaping

**Text Wrapping:**
```typescript
const words = prompt.split(' ').slice(0, 30);
words.forEach(word => {
    if ((currentLine + word).length > 40) {
        lines.push(currentLine.trim());
        currentLine = word + ' ';
    } else {
        currentLine += word + ' ';
    }
});
```

**XML Escaping:**
```typescript
function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
```

---

## Model Selection Strategy

The application uses different Gemini models based on task complexity:

| Task | Model | Rationale |
|------|-------|-----------|
| Conversation | `gemini-2.0-flash-lite` | Fast responses for interactive chat |
| Course Generation | `gemini-2.0-flash-exp` | Complex structured output requires newer model |
| Lesson Generation | `gemini-2.0-flash-exp` | Complex structured output with adaptive content |
| Remedial Activities | `gemini-2.0-flash-lite` | Simpler task, speed preferred |
| Assessment | `gemini-2.0-flash-lite` | Grading is relatively straightforward |
| Image (Speed) | `gemini-2.5-flash-image` | 1024px, fast generation |
| Image (Quality) | `gemini-3-pro-image-preview` | 4K, grounding, thinking process |

---

## Architecture Summary

```
                    +-------------------+
                    |   Application     |
                    +-------------------+
                            |
            +---------------+---------------+
            |                               |
    +-------v--------+            +---------v---------+
    | GenAIService   |            | visualGenerator   |
    | (Singleton)    |            | (Module)          |
    +----------------+            +-------------------+
            |                               |
            |    Google Generative AI SDK   |
            +---------------+---------------+
                            |
                    +-------v-------+
                    | Gemini Models |
                    +---------------+
```

The AI services layer provides a clean abstraction over the Google Generative AI SDK, handling:
- API key management
- Prompt construction
- Response parsing
- Error handling
- Fallback mechanisms

This allows the rest of the application to work with typed interfaces (`Course`, `Lesson`, `LessonActivity`) without concerning itself with AI implementation details.
