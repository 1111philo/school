import { create } from 'zustand';
import type { CourseResponse, CourseListItem } from '@/api/types';
import { fetchCourse, fetchCourses, deleteCourse } from '@/api/courses';

interface CourseState {
  course: CourseResponse | null;
  courseLoading: boolean;
  courseError: string | null;

  myCourses: CourseListItem[];
  listLoading: boolean;
  listError: string | null;

  loadCourse: (id: string) => Promise<void>;
  loadMyCourses: () => Promise<void>;
  removeCourse: (id: string) => Promise<void>;
  clearCourse: () => void;
}

export const useCourseStore = create<CourseState>((set) => ({
  course: null,
  courseLoading: false,
  courseError: null,

  myCourses: [],
  listLoading: false,
  listError: null,

  loadCourse: async (id) => {
    set({ courseLoading: true, courseError: null });
    try {
      const course = await fetchCourse(id);
      set({ course, courseLoading: false });
    } catch (e) {
      set({ courseError: (e as Error).message, courseLoading: false });
    }
  },

  loadMyCourses: async () => {
    set({ listLoading: true, listError: null });
    try {
      const myCourses = await fetchCourses();
      set({ myCourses, listLoading: false });
    } catch (e) {
      set({ listError: (e as Error).message, listLoading: false });
    }
  },

  removeCourse: async (id) => {
    try {
      await deleteCourse(id);
      set((s) => ({ myCourses: s.myCourses.filter((c) => c.id !== id) }));
    } catch (e) {
      set({ listError: (e as Error).message });
    }
  },

  clearCourse: () => set({ course: null }),
}));
