import { get, post } from './client';
import type { CatalogCourse } from './types';

export function fetchCatalog(params?: {
  search?: string;
  tag?: string;
}): Promise<CatalogCourse[]> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.tag) qs.set('tag', params.tag);
  const query = qs.toString();
  return get<CatalogCourse[]>(`/api/catalog${query ? `?${query}` : ''}`);
}

export function startCatalogCourse(
  courseId: string,
): Promise<{ id: string; status: string }> {
  return post<{ id: string; status: string }>(
    `/api/catalog/${courseId}/start`,
  );
}
