import { post } from './client';
import type { AssessmentResponse, AssessmentSubmitRequest } from './types';

export function generateAssessment(
  courseId: string,
): Promise<AssessmentResponse> {
  return post<AssessmentResponse>(`/api/assessments/${courseId}/generate`);
}

export function submitAssessment(
  assessmentId: string,
  data: AssessmentSubmitRequest,
): Promise<AssessmentResponse> {
  return post<AssessmentResponse>(
    `/api/assessments/${assessmentId}/submit`,
    data,
  );
}
