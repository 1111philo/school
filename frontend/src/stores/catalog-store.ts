import { create } from 'zustand';
import type { CatalogCourse } from '@/api/types';
import { fetchCatalog } from '@/api/catalog';

interface CatalogState {
  courses: CatalogCourse[];
  loading: boolean;
  error: string | null;
  search: string;
  tag: string;
  load: () => Promise<void>;
  setSearch: (search: string) => void;
  setTag: (tag: string) => void;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  courses: [],
  loading: false,
  error: null,
  search: '',
  tag: '',

  load: async () => {
    set({ loading: true, error: null });
    try {
      const { search, tag } = get();
      const courses = await fetchCatalog({
        search: search || undefined,
        tag: tag || undefined,
      });
      set({ courses, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  setSearch: (search) => set({ search }),
  setTag: (tag) => set({ tag }),
}));
