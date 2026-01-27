# Activities System Documentation

This document describes the interactive activity system used in the learning platform. Activities are embedded assessments within lessons that test student comprehension and provide immediate feedback.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [ActivityRenderer Dispatch Logic](#activityrenderer-dispatch-logic)
3. [Activity Types](#activity-types)
   - [Multiple Choice](#multiple-choice-activity)
   - [Short Response](#short-response-activity)
   - [Drawing](#drawing-activity)
4. [Completion Communication](#completion-communication)
5. [Grading Flow](#grading-flow)
6. [UI/UX Patterns](#uiux-patterns)
7. [Adding a New Activity Type](#adding-a-new-activity-type)

---

## Architecture Overview

The activity system follows a **dispatcher pattern** where a central component (`ActivityRenderer`) receives a generic `LessonActivity` object and renders the appropriate specialized component based on the activity type.

```
┌─────────────────────────────────────────────────────────────┐
│                     Parent Component                        │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                  ActivityRenderer                      │ │
│  │                                                        │ │
│  │   activity.type === ?                                  │ │
│  │        │                                               │ │
│  │        ├─── "multiple-choice" ──► MultipleChoiceActivity│
│  │        ├─── "short-response" ──► ShortResponseActivity │ │
│  │        ├─── "drawing" ─────────► DrawingActivity       │ │
│  │        └─── default ───────────► Unsupported Message   │ │
│  └───────────────────────────────────────────────────────┘ │
│                          │                                  │
│                          ▼                                  │
│                 onComplete(score, feedback?)                │
└─────────────────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `src/components/activities/ActivityRenderer.tsx` | Dispatcher component |
| `src/components/activities/MultipleChoiceActivity.tsx` | Multiple choice implementation |
| `src/components/activities/ShortResponseActivity.tsx` | Short response implementation |
| `src/components/activities/DrawingActivity.tsx` | Drawing canvas implementation |
| `src/types.ts` | Type definitions for all activity configs |
| `src/services/GenAIService.ts` | AI-powered grading service |

---

## ActivityRenderer Dispatch Logic

The `ActivityRenderer` is a stateless functional component that acts as a factory/dispatcher. It receives a `LessonActivity` object and an `onComplete` callback, then renders the appropriate activity component.

### Props Interface

```typescript
interface ActivityRendererProps {
    activity: LessonActivity;
    onComplete: (score: number, feedback?: string) => void;
}
```

### Dispatch Implementation

```typescript
export function ActivityRenderer({ activity, onComplete }: ActivityRendererProps) {
    switch (activity.type) {
        case 'multiple-choice':
            return (
                <MultipleChoiceActivity
                    config={activity.config as MultipleChoiceConfig}
                    onComplete={onComplete}
                />
            );

        case 'short-response':
            return (
                <ShortResponseActivity
                    config={activity.config as ShortResponseConfig}
                    onComplete={onComplete}
                />
            );

        case 'drawing':
            return (
                <DrawingActivity
                    config={activity.config as DrawingConfig}
                    onComplete={onComplete}
                />
            );

        default:
            return (
                <div className="p-4 border border-dashed rounded-lg text-center text-muted-foreground">
                    Unsupported activity type: {activity.type}
                </div>
            );
    }
}
```

### Type Safety

The renderer uses TypeScript type assertions (`as MultipleChoiceConfig`, etc.) to cast the generic `config` property to the specific config type. This is necessary because `LessonActivity.config` is a union type:

```typescript
export interface LessonActivity {
    type: 'multiple-choice' | 'drag-drop' | 'fill-blank' | 'quiz' | 'short-response' | 'drawing';
    config: MultipleChoiceConfig | DragDropConfig | FillBlankConfig | QuizConfig | ShortResponseConfig | DrawingConfig;
    passingScore: number;
    attemptNumber?: number;
}
```

---

## Activity Types

### Multiple Choice Activity

A quiz-style activity that presents one question at a time with four options.

#### Config Type

```typescript
export interface MultipleChoiceConfig {
    questions: {
        question: string;
        options: string[];
        correctIndex: number;
        explanation: string;
    }[];
}
```

#### Props

```typescript
interface MultipleChoiceActivityProps {
    config: MultipleChoiceConfig;
    onComplete: (score: number, feedback?: string) => void;
}
```

#### Internal State

```typescript
const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
const [showFeedback, setShowFeedback] = useState(false);
const [correctCount, setCorrectCount] = useState(0);
const [missedQuestions, setMissedQuestions] = useState<number[]>([]);
```

#### Behavior

1. **Question Display**: Shows one question at a time with progress indicator
2. **Answer Selection**: User clicks an option to select it (disabled after submission)
3. **Submission**: User clicks "Submit Answer" to check their selection
4. **Feedback Display**: Shows correct/incorrect with color-coded feedback and explanation
5. **Navigation**: User clicks "Next Question" or "Complete Activity" to proceed
6. **Completion**: Final score calculated as percentage, missed questions compiled into feedback

#### Grading Flow

Grading is **client-side and deterministic**:

```typescript
const handleSubmit = () => {
    if (selectedAnswer === null) return;
    setShowFeedback(true);
    if (isCorrect) {
        setCorrectCount(prev => prev + 1);
    } else {
        setMissedQuestions(prev => [...prev, currentQuestionIndex]);
    }
};

const handleNext = () => {
    if (isLastQuestion) {
        const finalScore = Math.round(
            ((correctCount + (isCorrect ? 1 : 0)) / config.questions.length) * 100
        );
        // Compile missed questions into review feedback
        let feedback = "";
        if (missedQuestions.length > 0 || !isCorrect) {
            // ... build feedback from explanations
        }
        onComplete(finalScore, feedback);
    } else {
        // Move to next question
    }
};
```

#### UI/UX Features

- **Progress Indicator**: "Question X of Y" and correct count displayed
- **Animated Transitions**: Uses `framer-motion` for smooth question transitions
- **Color-Coded Feedback**: Green for correct, red for incorrect
- **Visual Icons**: CheckCircle and XCircle icons from lucide-react
- **Explanation Filtering**: Removes leading affirmations like "Correct!" from explanations

---

### Short Response Activity

A free-text response activity graded by AI.

#### Config Type

```typescript
export interface ShortResponseConfig {
    question: string;
    rubric?: string; // Guidance for the AI on how to grade it
}
```

#### Props

```typescript
interface ShortResponseActivityProps {
    config: ShortResponseConfig;
    onComplete: (score: number, feedback?: string) => void;
}
```

#### Internal State

```typescript
const [response, setResponse] = useState('');
const [isSubmitting, setIsSubmitting] = useState(false);
const [feedback, setFeedback] = useState<string | null>(null);
const [score, setScore] = useState<number | null>(null);
const { settings } = useAppStore(); // For API key
```

#### Behavior

1. **Question Display**: Shows the question prompt
2. **Text Entry**: User types response in a textarea (min 150px height)
3. **Submission**: User clicks "Submit Answer" to send for AI grading
4. **Loading State**: Shows spinner with "Assessing..." text
5. **Feedback Display**: Shows AI feedback and score
6. **Locked State**: Textarea and button disabled after submission

#### Grading Flow

Grading is **AI-powered via GenAIService**:

```typescript
const handleSubmit = async () => {
    if (!response.trim()) return;
    setIsSubmitting(true);
    try {
        const service = GenAIService.getInstance();
        service.setApiKey(settings.apiKey);

        const result = await service.assessActivity(
            'short-response',
            config.question,
            response,
            config.rubric
        );

        setScore(result.score);
        setFeedback(result.feedback);
        onComplete(result.score, result.feedback);
    } catch (error) {
        setFeedback("Sorry, I couldn't assess your response right now. Please try again.");
    } finally {
        setIsSubmitting(false);
    }
};
```

#### UI/UX Features

- **Large Textarea**: 150px minimum height, non-resizable
- **Loading Spinner**: Animated Loader2 icon during submission
- **Conditional Button**: Submit button hidden after grading
- **Color-Coded Feedback Card**: Green for score >= 70, orange otherwise

---

### Drawing Activity

A canvas-based activity where users draw and submit for AI evaluation.

#### Config Type

```typescript
export interface DrawingConfig {
    prompt: string; // What the user should draw
    referenceDescription?: string; // Description for AI evaluation
}
```

#### Props

```typescript
interface DrawingActivityProps {
    config: DrawingConfig;
    onComplete: (score: number, feedback?: string) => void;
}
```

#### Internal State

```typescript
const canvasRef = useRef<HTMLCanvasElement>(null);
const [isDrawing, setIsDrawing] = useState(false);
const [isSubmitting, setIsSubmitting] = useState(false);
const [feedback, setFeedback] = useState<string | null>(null);
const [score, setScore] = useState<number | null>(null);
const { settings } = useAppStore();
const [hasDrawn, setHasDrawn] = useState(false);
```

#### Behavior

1. **Canvas Setup**: Initializes on mount with white background, black stroke
2. **Drawing**: Supports both mouse and touch events
3. **Clear Function**: "Clear" button resets canvas to white
4. **Submission**: Converts canvas to base64 JPEG and sends to AI
5. **Feedback Display**: Shows AI feedback and score

#### Canvas Configuration

```typescript
useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to parent width, fixed 400px height
    const parent = canvas.parentElement;
    if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = 400;
    }

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Default stroke style
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
}, []);
```

#### Drawing Logic

```typescript
const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || score !== null) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();

    let x, y;
    if ('touches' in e) {
        x = e.touches[0].clientX - rect.left;
        y = e.touches[0].clientY - rect.top;
    } else {
        x = e.clientX - rect.left;
        y = e.clientY - rect.top;
    }

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
};
```

#### Grading Flow

```typescript
const handleSubmit = async () => {
    if (!hasDrawn) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsSubmitting(true);
    try {
        const service = GenAIService.getInstance();
        service.setApiKey(settings.apiKey);

        // Convert canvas to base64 JPEG
        const imageBase64 = canvas.toDataURL('image/jpeg').split(',')[1];

        const result = await service.assessActivity(
            'drawing',
            config.prompt,
            imageBase64,
            config.referenceDescription
        );

        setScore(result.score);
        setFeedback(result.feedback);
        onComplete(result.score, result.feedback);
    } catch (error) {
        setFeedback("Sorry, I couldn't assess your drawing right now. Please try again.");
    } finally {
        setIsSubmitting(false);
    }
};
```

#### UI/UX Features

- **Touch Support**: Full touch event handling for mobile/tablet
- **Cursor Style**: Crosshair cursor on canvas
- **Clear Button**: Positioned in top-right corner with blur background
- **Helper Text**: "Draw your answer in the box above"
- **Disabled State**: Canvas ignores input after submission

---

## Completion Communication

All activities communicate completion back to the parent via the `onComplete` callback:

```typescript
onComplete: (score: number, feedback?: string) => void;
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `score` | `number` | 0-100 percentage score |
| `feedback` | `string?` | Optional feedback text for the parent to display |

### When Called

- **Multiple Choice**: After the last question's "Complete Activity" button
- **Short Response**: After AI assessment returns
- **Drawing**: After AI assessment returns

### Parent Handling

The parent component typically:
1. Stores the score on the lesson
2. Determines if passing score was met
3. Decides whether to advance to next lesson or show remedial content
4. May display additional feedback UI

---

## Grading Flow

### Client-Side Grading (Multiple Choice)

```
User selects answer
        │
        ▼
User clicks "Submit"
        │
        ▼
Compare selectedAnswer with correctIndex
        │
        ├── Match: increment correctCount
        └── No Match: add to missedQuestions
        │
        ▼
Show feedback with explanation
        │
        ▼
User clicks "Next" / "Complete"
        │
        ▼ (if last question)
Calculate finalScore = (correctCount / totalQuestions) * 100
        │
        ▼
Compile feedback from missed question explanations
        │
        ▼
Call onComplete(finalScore, feedback)
```

### AI-Powered Grading (Short Response & Drawing)

```
User enters response / draws
        │
        ▼
User clicks "Submit"
        │
        ▼
Set isSubmitting = true (show loading)
        │
        ▼
Get GenAIService instance
        │
        ▼
Call assessActivity(type, prompt, input, context)
        │
        ├── type: 'short-response' or 'drawing'
        ├── prompt: the question/drawing prompt
        ├── input: text response or base64 image
        └── context: rubric or referenceDescription
        │
        ▼
GenAI API call with multimodal content
        │
        ▼
Parse JSON response { score, feedback }
        │
        ▼
Update local state (score, feedback)
        │
        ▼
Call onComplete(score, feedback)
```

### GenAIService.assessActivity Implementation

```typescript
async assessActivity(
    type: 'short-response' | 'drawing',
    prompt: string,
    input: string,
    context?: string
): Promise<{ score: number; feedback: string }> {
    let parts: any[] = [];

    if (type === 'short-response') {
        parts = [
            { text: `You are an expert teacher grading a student's short response.` },
            { text: `Question: ${prompt}` },
            { text: `Rubric/Context: ${context || 'Grade based on accuracy and clarity.'}` },
            { text: `Student Response: ${input}` },
            { text: `Evaluate and return JSON: { "score": number, "feedback": "string" }` }
        ];
    } else if (type === 'drawing') {
        parts = [
            { text: `You are an expert teacher grading a student's drawing.` },
            { text: `Prompt: ${prompt}` },
            { text: `Reference Description: ${context || 'Evaluate accuracy.'}` },
            { text: `Evaluate and return JSON: { "score": number, "feedback": "string" }` },
            {
                inlineData: {
                    mimeType: "image/jpeg",
                    data: input // base64 image data
                }
            }
        ];
    }

    const result = await this.genAI.models.generateContent({
        model: "gemini-2.0-flash-lite",
        contents: [{ role: "user", parts }],
        config: { responseMimeType: "application/json" }
    });

    return JSON.parse(result.text);
}
```

---

## UI/UX Patterns

### Common Patterns Across Activities

| Pattern | Implementation |
|---------|----------------|
| **Card Container** | All activities use `<Card>` from shadcn/ui |
| **Loading States** | `Loader2` icon with `animate-spin` class |
| **Color Feedback** | Green (>= 70) or orange/red (< 70) backgrounds |
| **Disabled States** | Inputs/buttons disabled during loading and after completion |
| **Submit Button** | Full width, hidden after submission for AI-graded activities |

### Animation Usage

- **Multiple Choice**: Uses `framer-motion` for question transitions
  - `AnimatePresence` for exit animations
  - `motion.div` with opacity and x transforms

### Icon Usage (lucide-react)

| Icon | Usage |
|------|-------|
| `CheckCircle` | Correct answer indicator |
| `XCircle` | Incorrect answer indicator |
| `Loader2` | Loading spinner |
| `Send` | Submit button |
| `Trash2` | Clear canvas button |

### Responsive Design

- Canvas adapts to parent width
- Textarea uses percentage-based width
- Mobile-friendly touch support in drawing

---

## Adding a New Activity Type

### Step 1: Define the Config Type

Add to `src/types.ts`:

```typescript
export interface YourNewConfig {
    // Define configuration fields
    prompt: string;
    expectedResult: string;
    // ... other fields
}
```

Update the union types:

```typescript
export interface LessonActivity {
    type: 'multiple-choice' | 'drag-drop' | 'fill-blank' | 'quiz' | 'short-response' | 'drawing' | 'your-new-type';
    config: MultipleChoiceConfig | DragDropConfig | FillBlankConfig | QuizConfig | ShortResponseConfig | DrawingConfig | YourNewConfig;
    passingScore: number;
    attemptNumber?: number;
}
```

### Step 2: Create the Activity Component

Create `src/components/activities/YourNewActivity.tsx`:

```typescript
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { YourNewConfig } from '@/types';

interface YourNewActivityProps {
    config: YourNewConfig;
    onComplete: (score: number, feedback?: string) => void;
}

export function YourNewActivity({ config, onComplete }: YourNewActivityProps) {
    const [userInput, setUserInput] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [score, setScore] = useState<number | null>(null);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            // Your grading logic here
            // Either client-side comparison or AI-powered
            const result = { score: 100, feedback: 'Great job!' };

            setScore(result.score);
            setFeedback(result.feedback);
            onComplete(result.score, result.feedback);
        } catch (error) {
            setFeedback("Assessment failed. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <h3 className="text-lg font-medium">{config.prompt}</h3>

            {/* Your activity UI here */}

            {feedback && (
                <Card className={`p-4 ${score && score >= 70 ? 'bg-green-500/10' : 'bg-orange-500/10'}`}>
                    <p>{feedback}</p>
                    {score !== null && <p className="font-bold">Score: {score}%</p>}
                </Card>
            )}

            {!score && (
                <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full">
                    {isSubmitting ? 'Submitting...' : 'Submit'}
                </Button>
            )}
        </div>
    );
}
```

### Step 3: Register in ActivityRenderer

Update `src/components/activities/ActivityRenderer.tsx`:

```typescript
import type { LessonActivity, MultipleChoiceConfig, ShortResponseConfig, DrawingConfig, YourNewConfig } from '@/types';
import { MultipleChoiceActivity } from './MultipleChoiceActivity';
import { ShortResponseActivity } from './ShortResponseActivity';
import { DrawingActivity } from './DrawingActivity';
import { YourNewActivity } from './YourNewActivity';

export function ActivityRenderer({ activity, onComplete }: ActivityRendererProps) {
    switch (activity.type) {
        case 'multiple-choice':
            return (
                <MultipleChoiceActivity
                    config={activity.config as MultipleChoiceConfig}
                    onComplete={onComplete}
                />
            );

        case 'short-response':
            return (
                <ShortResponseActivity
                    config={activity.config as ShortResponseConfig}
                    onComplete={onComplete}
                />
            );

        case 'drawing':
            return (
                <DrawingActivity
                    config={activity.config as DrawingConfig}
                    onComplete={onComplete}
                />
            );

        case 'your-new-type':
            return (
                <YourNewActivity
                    config={activity.config as YourNewConfig}
                    onComplete={onComplete}
                />
            );

        default:
            return (
                <div className="p-4 border border-dashed rounded-lg text-center text-muted-foreground">
                    Unsupported activity type: {activity.type}
                </div>
            );
    }
}
```

### Step 4: Update GenAIService (if AI-graded)

If your activity requires AI grading, update `GenAIService.assessActivity`:

```typescript
async assessActivity(
    type: 'short-response' | 'drawing' | 'your-new-type',
    prompt: string,
    input: string,
    context?: string
): Promise<{ score: number; feedback: string }> {
    let parts: any[] = [];

    if (type === 'your-new-type') {
        parts = [
            { text: `You are grading a ${type} activity.` },
            { text: `Prompt: ${prompt}` },
            { text: `Context: ${context}` },
            { text: `Student Input: ${input}` },
            { text: `Return JSON: { "score": number, "feedback": "string" }` }
        ];
    }
    // ... rest of implementation
}
```

### Step 5: Update Course Generation Prompts

Update the prompts in `GenAIService.generateCourse` and `GenAIService.generateNextLesson` to include your new activity type as an option for the AI to generate.

---

## Summary

The activity system provides a flexible, extensible architecture for interactive assessments:

- **Dispatcher Pattern**: `ActivityRenderer` routes to specialized components
- **Unified Callback**: All activities use `onComplete(score, feedback?)`
- **Dual Grading**: Client-side for deterministic activities, AI for open-ended
- **Consistent UX**: Shared patterns for loading, feedback, and disabled states
- **Easy Extension**: Clear steps to add new activity types
