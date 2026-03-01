import { get, post } from './client';
import type { AssessmentResponse, AssessmentSubmitRequest } from './types';

export function generateAssessment(
  courseId: string,
): Promise<{ id: string; status: string }> {
  return post<{ id: string; status: string }>(
    `/api/assessments/${courseId}/generate`,
  );
}

export function getAssessment(
  courseId: string,
): Promise<AssessmentResponse> {
  return get<AssessmentResponse>(`/api/assessments/${courseId}/assessment`);
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
