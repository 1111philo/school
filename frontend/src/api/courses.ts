import { get, post, patch, del } from './client';
import type {
  CourseCreateRequest,
  CourseListItem,
  CourseResponse,
} from './types';

export function createCourse(
  data: CourseCreateRequest,
): Promise<{ id: string; status: string }> {
  return post('/api/courses', data);
}

export function triggerGeneration(
  courseId: string,
): Promise<{ id: string; status: string }> {
  return post(`/api/courses/${courseId}/generate`);
}

export function fetchCourses(
  status?: string,
): Promise<CourseListItem[]> {
  const qs = status ? `?status=${status}` : '';
  return get<CourseListItem[]>(`/api/courses${qs}`);
}

export function fetchCourse(courseId: string): Promise<CourseResponse> {
  return get<CourseResponse>(`/api/courses/${courseId}`);
}

export function transitionCourse(
  courseId: string,
  targetState: string,
): Promise<{ id: string; status: string }> {
  return patch(`/api/courses/${courseId}/state?target_state=${targetState}`);
}

export function deleteCourse(
  courseId: string,
): Promise<{ deleted: boolean }> {
  return del(`/api/courses/${courseId}`);
}
