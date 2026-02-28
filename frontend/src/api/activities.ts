import { post } from './client';
import type { ActivitySubmitResponse } from './types';

export function submitActivity(
  activityId: string,
  text: string,
): Promise<ActivitySubmitResponse> {
  return post<ActivitySubmitResponse>(`/api/activities/${activityId}/submit`, {
    text,
  });
}
