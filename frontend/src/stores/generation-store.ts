import { create } from 'zustand';
import { connectGenerationStream, type GenerationEvent } from '@/api/sse';

export interface ObjectiveProgress {
  planned: boolean;
  planTitle: string | null;
  written: boolean;
  activityCreated: boolean;
  activityId: string | null;
  error: string | null;
}

interface GenerationState {
  progress: Map<number, ObjectiveProgress>;
  complete: boolean;
  lessonCount: number | null;
  connectionError: boolean;
  disconnect: (() => void) | null;

  connect: (courseId: string) => void;
  reset: () => void;
}

function defaultProgress(): ObjectiveProgress {
  return {
    planned: false,
    planTitle: null,
    written: false,
    activityCreated: false,
    activityId: null,
    error: null,
  };
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  progress: new Map(),
  complete: false,
  lessonCount: null,
  connectionError: false,
  disconnect: null,

  connect: (courseId: string) => {
    // Disconnect existing connection
    get().disconnect?.();

    set({ progress: new Map(), complete: false, lessonCount: null, connectionError: false });

    const onEvent = (event: GenerationEvent) => {
      set((state) => {
        const progress = new Map(state.progress);

        switch (event.type) {
          case 'lesson_planned': {
            const idx = event.data.objective_index;
            const existing = progress.get(idx) ?? defaultProgress();
            progress.set(idx, {
              ...existing,
              planned: true,
              planTitle: event.data.lesson_title,
            });
            break;
          }
          case 'lesson_written': {
            const idx = event.data.objective_index;
            const existing = progress.get(idx) ?? defaultProgress();
            progress.set(idx, { ...existing, written: true });
            break;
          }
          case 'activity_created': {
            const idx = event.data.objective_index;
            const existing = progress.get(idx) ?? defaultProgress();
            progress.set(idx, {
              ...existing,
              activityCreated: true,
              activityId: event.data.activity_id,
            });
            break;
          }
          case 'generation_complete':
            return {
              ...state,
              progress,
              complete: true,
              lessonCount: event.data.lesson_count,
            };
          case 'generation_error': {
            const idx = event.data.objective_index;
            const existing = progress.get(idx) ?? defaultProgress();
            progress.set(idx, { ...existing, error: event.data.error });
            break;
          }
        }

        return { ...state, progress };
      });
    };

    const close = connectGenerationStream(courseId, onEvent, () => {
      set({ connectionError: true });
    });

    set({ disconnect: close });
  },

  reset: () => {
    get().disconnect?.();
    set({
      progress: new Map(),
      complete: false,
      lessonCount: null,
      connectionError: false,
      disconnect: null,
    });
  },
}));
