export interface LogEntry {
    id: string;
    timestamp: number;
    action: string;
    reasoning: string;
    prompt?: string;
    response?: string;
    usage?: {
        promptTokens: number;
        candidatesTokens: number;
        totalTokens: number;
    };
}

export interface LessonActivity {
    type: 'multiple-choice' | 'drag-drop' | 'fill-blank' | 'quiz' | 'short-response' | 'drawing' | 'custom-code' | 'file-upload';
    config: MultipleChoiceConfig | DragDropConfig | FillBlankConfig | QuizConfig | ShortResponseConfig | DrawingConfig | CustomCodeConfig | FileUploadConfig;
    passingScore: number;
    attemptNumber?: number; // Track remedial attempts
}

export interface CustomCodeConfig {
    html: string;
    css: string;
    js: string;
    instructions: string;
}

export interface FileUploadConfig {
    title: string;
    instructions: string;
    allowedTypes: 'any' | 'image' | 'text';
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

export interface LessonPlan {
    learningObjective: string;
    competency: string;
    enduringUnderstanding: string;
    essentialQuestions: string[];
    assessmentProject: string;
    masteryCriteria: string[];
    udlAccommodations: string;
    activities: string[];
}

export interface LessonPage {
    id: string;
    content: string;
    activity?: LessonActivity;
}

export interface Lesson {
    id: string;
    title: string;
    plan?: LessonPlan;
    pages: LessonPage[];
    assessment?: LessonActivity; // Final assessment project
    visualExplanation?: string; // Path to generated visual explanation image
    visualPrompt?: string; // Prompt used to generate the visual explanation image
    visualPageId?: string; // The ID of the page where the visual should be inserted
    learningObjectives?: string[];
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
    prePrompts?: string;
    learningObjectives?: string[];
    roadmap: LessonRoadmap[]; // Overview of all planned lessons
    lessons: Lesson[]; // Only contains generated lessons
    created: number;
    imageUrl?: string;
    visualPrompt?: string;
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
    currentPageIndex?: number;
    completedPageActivities?: Record<string, boolean>;
    course: Course;
}

export type AppState = 'COURSE_GENERATION' | 'LEARNING' | 'COURSES' | 'SETTINGS';

export interface UserSettings {
    apiKey: string;
    userName: string;
}
