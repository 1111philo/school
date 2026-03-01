// ---- Catalog ----
export interface CatalogCourse {
  course_id: string;
  name: string;
  description: string;
  learning_objectives: string[];
  tags: string[];
  estimated_hours: number | null;
}

// ---- Course ----
export interface CourseCreateRequest {
  description: string;
  objectives: string[];
}

export interface CourseListItem {
  id: string;
  source_type: 'custom' | 'predefined';
  input_description: string | null;
  status: CourseStatus;
  lesson_count: number;
  lessons_completed: number;
}

export interface CourseResponse {
  id: string;
  source_type: 'custom' | 'predefined';
  input_description: string | null;
  input_objectives: string[];
  generated_description: string | null;
  status: CourseStatus;
  lessons: LessonResponse[];
  assessments: AssessmentSummary[];
}

export type CourseStatus =
  | 'draft'
  | 'generating'
  | 'active'
  | 'in_progress'
  | 'awaiting_assessment'
  | 'generating_assessment'
  | 'assessment_ready'
  | 'completed'
  | 'generation_failed';

// ---- Lesson ----
export interface LessonResponse {
  id: string;
  objective_index: number;
  lesson_content: string | null;
  status: 'locked' | 'unlocked' | 'completed';
  activity: ActivityResponse | null;
}

// ---- Activity ----
export interface ActivitySpec {
  activity_type: string;
  instructions: string;
  prompt: string;
  scoring_rubric: string[];
  hints: string[];
}

export interface ActivityFeedback {
  rationale: string;
  strengths: string[];
  improvements: string[];
  tips: string[];
}

export interface ActivityResponse {
  id: string;
  activity_spec: ActivitySpec | null;
  latest_score: number | null;
  latest_feedback: ActivityFeedback | null;
  mastery_decision: 'not_yet' | 'meets' | 'exceeds' | null;
  attempt_count: number;
}

export interface ActivitySubmitResponse {
  score: number;
  mastery_decision: 'not_yet' | 'meets' | 'exceeds';
  rationale: string;
  strengths: string[];
  improvements: string[];
  tips: string[];
}

// ---- Assessment ----
export interface AssessmentItem {
  objective: string;
  prompt: string;
  rubric: string[];
}

export interface AssessmentSpec {
  assessment_title: string;
  items: AssessmentItem[];
}

export interface AssessmentResponse {
  id: string;
  status: 'pending' | 'reviewed' | 'failed';
  score: number | null;
  passed: boolean | null;
  feedback: Record<string, unknown> | null;
  assessment_spec: AssessmentSpec | null;
}

export interface AssessmentSummary {
  id: string;
  status: string;
  score: number | null;
  passed: boolean | null;
}

export interface AssessmentSubmitRequest {
  responses: { objective: string; text: string }[];
}

// ---- SSE Events ----
export interface LessonPlannedEvent {
  objective_index: number;
  lesson_title: string;
  skipped?: boolean;
}

export interface LessonWrittenEvent {
  objective_index: number;
  skipped?: boolean;
}

export interface ActivityCreatedEvent {
  objective_index: number;
  activity_id: string;
  skipped?: boolean;
}

export interface GenerationCompleteEvent {
  course_id: string;
  lesson_count: number;
}

export interface GenerationErrorEvent {
  objective_index: number;
  error: string;
}
