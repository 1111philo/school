import { create } from 'zustand';
import { connectGenerationStream, type GenerationEvent } from '@/api/sse';
import { fetchCourse } from '@/api/courses';
import type { CourseResponse, CourseStatus } from '@/api/types';

export interface ObjectiveProgress {
  planned: boolean;
  planTitle: string | null;
  written: boolean;
  activityCreated: boolean;
  activityId: string | null;
  error: string | null;
}

interface GenerationState {
  objectives: string[];
  progress: Map<number, ObjectiveProgress>;
  /** The backend course status, kept in sync with REST fetches */
  courseStatus: CourseStatus | null;
  complete: boolean;
  loading: boolean;
  error: string | null;
  _disconnect: (() => void) | null;
  _initId: number;

  /** Fetch course, derive state, connect SSE only if still generating */
  init: (courseId: string) => Promise<void>;
  teardown: () => void;
}

// Any status other than "generating" means generation is done (success or fail)
const STILL_GENERATING = ['generating'];

function deriveProgress(course: CourseResponse): Map<number, ObjectiveProgress> {
  const progress = new Map<number, ObjectiveProgress>();
  for (const lesson of course.lessons) {
    progress.set(lesson.objective_index, {
      planned: true,
      planTitle: null,
      written: lesson.lesson_content != null,
      activityCreated: lesson.activity?.activity_spec != null,
      activityId: lesson.activity?.id ?? null,
      error: null,
    });
  }
  return progress;
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  objectives: [],
  progress: new Map(),
  courseStatus: null,
  complete: false,
  loading: true,
  error: null,
  _disconnect: null,
  _initId: 0,

  init: async (courseId: string) => {
    // Clean up any previous connection
    get()._disconnect?.();
    const initId = get()._initId + 1;
    set({ loading: true, error: null, complete: false, _disconnect: null, _initId: initId });

    // Step 1: Fetch current state and render immediately
    let course: CourseResponse;
    try {
      course = await fetchCourse(courseId);
    } catch (e) {
      if (get()._initId !== initId) return; // stale call (strict-mode remount)
      set({ loading: false, error: (e as Error).message });
      return;
    }

    // Discard if a newer init started (React strict-mode double-mount)
    if (get()._initId !== initId) return;

    const progress = deriveProgress(course);
    const stillGenerating = STILL_GENERATING.includes(course.status);
    const complete = !stillGenerating;

    set({
      objectives: course.input_objectives,
      progress,
      courseStatus: course.status,
      complete,
      loading: false,
      error: course.status === 'generation_failed' ? 'Generation failed for some objectives.' : null,
    });

    // Step 2: If generation is done (success OR failure), no SSE needed
    if (complete) return;

    // Step 3: Still generating — connect SSE for progressive updates
    const onEvent = (event: GenerationEvent) => {
      // If this init was superseded, ignore events
      if (get()._initId !== initId) return;

      if (event.type === 'generation_complete') {
        // Refetch to get authoritative final state
        fetchCourse(courseId).then((course) => {
          if (get()._initId !== initId) return;
          set({
            progress: deriveProgress(course),
            courseStatus: course.status,
            complete: true,
            error: course.status === 'generation_failed' ? 'Generation failed for some objectives.' : null,
          });
        }).catch(() => {
          // Even if refetch fails, mark as complete so user isn't stuck
          set({ complete: true });
        });
        return;
      }

      set((state) => {
        const progress = new Map(state.progress);
        const existing = (idx: number) => progress.get(idx) ?? {
          planned: false, planTitle: null, written: false,
          activityCreated: false, activityId: null, error: null,
        };

        switch (event.type) {
          case 'lesson_planned': {
            const e = existing(event.data.objective_index);
            progress.set(event.data.objective_index, {
              ...e, planned: true, planTitle: event.data.lesson_title,
            });
            return { ...state, progress };
          }
          case 'lesson_written': {
            const e = existing(event.data.objective_index);
            progress.set(event.data.objective_index, { ...e, written: true });
            return { ...state, progress };
          }
          case 'activity_created': {
            const e = existing(event.data.objective_index);
            progress.set(event.data.objective_index, {
              ...e, activityCreated: true, activityId: event.data.activity_id,
            });
            return { ...state, progress };
          }
          case 'generation_error': {
            const e = existing(event.data.objective_index);
            progress.set(event.data.objective_index, { ...e, error: event.data.error });
            return { ...state, progress };
          }
        }
        return state;
      });
    };

    // Close any leaked connection before opening a new one
    get()._disconnect?.();

    const close = connectGenerationStream(courseId, onEvent, () => {
      // On SSE error, refetch to get final state
      if (get()._initId !== initId) return;
      fetchCourse(courseId).then((course) => {
        if (get()._initId !== initId) return;
        set({
          progress: deriveProgress(course),
          courseStatus: course.status,
          complete: !STILL_GENERATING.includes(course.status),
        });
      }).catch(() => {
        set({ error: 'Lost connection to the server.', complete: true });
      });
    });

    set({ _disconnect: close });
  },

  teardown: () => {
    get()._disconnect?.();
    set({
      objectives: [],
      progress: new Map(),
      courseStatus: null,
      complete: false,
      loading: true,
      error: null,
      _disconnect: null,
      _initId: get()._initId + 1, // invalidate any in-flight async work
    });
  },
}));
