export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

export interface LogEntry {
    id: string;
    timestamp: number;
    action: string;
    reasoning: string;
}

export interface LessonActivity {
    type: 'multiple-choice' | 'drag-drop' | 'fill-blank' | 'quiz' | 'short-response' | 'drawing';
    config: MultipleChoiceConfig | DragDropConfig | FillBlankConfig | QuizConfig | ShortResponseConfig | DrawingConfig;
    passingScore: number;
    attemptNumber?: number; // Track remedial attempts
}

export interface MultipleChoiceConfig {
    questions: {
        question: string;
        options: string[];
        correctIndex: number;
        explanation: string;
    }[];
}

export interface DragDropConfig {
    instruction: string;
    items: string[];
    correctOrder?: number[]; // For ordering tasks
    pairs?: { left: string; right: string }[]; // For matching tasks
}

export interface FillBlankConfig {
    text: string; // Text with __blank__ markers
    answers: string[]; // Correct answers for each blank
    caseSensitive?: boolean;
}

export interface QuizConfig {
    questions: {
        question: string;
        type: 'multiple-choice' | 'true-false' | 'short-answer';
        options?: string[];
        correctAnswer: string | number;
        explanation: string;
    }[];
}

export interface ShortResponseConfig {
    question: string;
    rubric?: string; // Guidance for the AI on how to grade it
}

export interface DrawingConfig {
    prompt: string; // What the user should draw
    referenceDescription?: string; // Description of what the drawing should look like for the AI
}

export interface Lesson {
    id: string;
    title: string;
    content: string;
    visualExplanation?: string; // Path to generated visual explanation image
    activity: LessonActivity;
    isCompleted: boolean;
    comprehensionScore?: number;
    generatedAt?: number;
    isGenerated: boolean; // Track if full content is generated
    attempts?: number; // Track how many times user attempted
}

export interface LessonRoadmap {
    id: string;
    title: string;
    description: string;
    order: number;
}

export interface Course {
    id: string;
    title: string;
    description: string;
    roadmap: LessonRoadmap[]; // Overview of all planned lessons
    lessons: Lesson[]; // Only contains generated lessons
}

export interface SavedCourse {
    id: string;
    title: string;
    description: string;
    createdAt: number;
    lastAccessedAt: number;
    progress: number;
    totalLessons: number;
    completedLessons: number;
    course: Course;
    chatHistory: ChatMessage[];
}

export interface ChatSession {
    id: string;
    messages: ChatMessage[];
    startedAt: number;
}

export type AppState = 'CHAT' | 'COURSE_GENERATION' | 'LEARNING' | 'COURSES' | 'SETTINGS';

export interface UserSettings {
    apiKey: string;
    userName: string;
}
