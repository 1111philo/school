import type { CourseStatus } from '@/api/types';

export const STATUS_LABELS: Record<CourseStatus, string> = {
  draft: 'Draft',
  generating: 'Generating',
  active: 'Ready',
  in_progress: 'In Progress',
  awaiting_assessment: 'Ready for Assessment',
  generating_assessment: 'Generating Assessment',
  assessment_ready: 'Assessment Ready',
  completed: 'Completed',
  generation_failed: 'Failed',
};

export const STATUS_COLORS: Record<CourseStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  generating: 'bg-yellow-100 text-yellow-700',
  active: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-blue-100 text-blue-700',
  awaiting_assessment: 'bg-purple-100 text-purple-700',
  generating_assessment: 'bg-yellow-100 text-yellow-700',
  assessment_ready: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  generation_failed: 'bg-red-100 text-red-700',
};

export const MASTERY_LABELS: Record<string, string> = {
  not_yet: 'Not Yet',
  meets: 'Meets',
  exceeds: 'Exceeds',
};

export const MASTERY_COLORS: Record<string, string> = {
  not_yet: 'bg-yellow-100 text-yellow-700',
  meets: 'bg-green-100 text-green-700',
  exceeds: 'bg-emerald-100 text-emerald-800',
};
