import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppState, Course, LogEntry, UserSettings, SavedCourse } from '../types';
import { GenAIService } from '../services/GenAIService';

interface AppStore {
    appState: AppState;
    savedCourses: SavedCourse[];
    currentCourseId: string | null;
    currentCourse: Course | null;
    currentLessonIndex: number;
    logs: LogEntry[];
    isGenerating: boolean;
    settings: UserSettings;

    // Actions
    setAppState: (state: AppState) => void;
    generateCourse: (courseData: Partial<Course>) => Promise<void>;
    saveCourse: (course: Course) => void;
    loadCourse: (courseId: string) => void;
    deleteCourse: (courseId: string) => void;
    deleteCurrentCourseAndRegenerate: (courseData: Partial<Course>) => Promise<void>;
    importCourse: (course: SavedCourse) => void;
    generateLessonActivity: (lessonId: string) => Promise<void>;
    generateNextLesson: (comprehensionScore: number) => Promise<void>;
    retryLesson: (lessonId: string, previousScore: number) => Promise<void>;
    completeLesson: (lessonId: string, comprehensionScore: number) => void;
    setCurrentLessonIndex: (index: number) => void;
    addLog: (action: string, reasoning: string) => void;
    updateSettings: (settings: Partial<UserSettings>) => void;
    resetProgress: () => void;
    clearAllData: () => void;
}

export const useAppStore = create<AppStore>()(
    persist(
        (set, get) => ({
            appState: 'COURSES',
            savedCourses: [],
            currentCourseId: null,
            currentCourse: null,
            currentLessonIndex: 0,
            logs: [],
            isGenerating: false,
            settings: {
                apiKey: '',
                userName: ''
            },

            clearAllData: () => {
                localStorage.removeItem('1111-school-storage');
                set({
                    appState: 'COURSES',
                    savedCourses: [],
                    currentCourseId: null,
                    currentCourse: null,
                    currentLessonIndex: 0,
                    logs: [],
                    settings: {
                        apiKey: '',
                        userName: ''
                    }
                });
                window.location.reload(); // Force reload to ensure clean state
            },

            setAppState: (state) => set({ appState: state }),

            generateCourse: async (courseData: Partial<Course>) => {
                const { settings, addLog, isGenerating } = get();
                if (isGenerating) return;

                set({ isGenerating: true, appState: 'COURSE_GENERATION' });

                try {
                    const service = GenAIService.getInstance();
                    service.setApiKey(settings.apiKey);

                    const { course, reasoning } = await service.generateCourse(
                        courseData,
                        settings
                    );

                    // Generate visual explanation for the first lesson if visualPrompt exists
                    if (course.lessons[0] && (course.lessons[0] as any).visualPrompt) {
                        const { generateLessonVisual } = await import('../services/visualGenerator');
                        const visualUrl = await generateLessonVisual(
                            course.lessons[0],
                            (course.lessons[0] as any).visualPrompt,
                            settings.apiKey,
                            { model: 'flash', aspectRatio: '16:9' } // Fast generation for initial lesson
                        );
                        course.lessons[0].visualExplanation = visualUrl;
                    }

                    addLog('Generate Course', reasoning);

                    // Save the course
                    const savedCourse: SavedCourse = {
                        id: course.id,
                        title: course.title,
                        description: course.description,
                        createdAt: Date.now(),
                        lastAccessedAt: Date.now(),
                        progress: 0,
                        totalLessons: course.roadmap.length,
                        completedLessons: 0,
                        course
                    };

                    set((state) => ({
                        savedCourses: [...state.savedCourses, savedCourse],
                        currentCourseId: course.id,
                        currentCourse: course,
                        currentLessonIndex: 0,
                        appState: 'LEARNING'
                    }));
                } catch (error) {
                    console.error("Failed to generate course", error);
                    addLog('Error', `Failed to generate course: ${error}`);
                    alert(`Failed to generate course: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    set({ appState: 'COURSES' });
                } finally {
                    set({ isGenerating: false });
                }
            },

            saveCourse: (_course: Course) => {
                // Implementation for saving course updates
            },

            loadCourse: (courseId: string) => {
                const { savedCourses } = get();
                console.log(`Attempting to load course: ${courseId}`);
                const savedCourse = savedCourses.find(c => c.id === courseId);

                if (savedCourse) {
                    console.log(`Found course: ${savedCourse.title}`);
                    set({
                        currentCourseId: courseId,
                        currentCourse: savedCourse.course,
                        currentLessonIndex: savedCourse.completedLessons,
                        appState: 'LEARNING'
                    });

                    // Update last accessed
                    set((state) => ({
                        savedCourses: state.savedCourses.map(c =>
                            c.id === courseId ? { ...c, lastAccessedAt: Date.now() } : c
                        )
                    }));
                }
            },

            deleteCourse: (courseId: string) => {
                set((state) => ({
                    savedCourses: state.savedCourses.filter(c => c.id !== courseId)
                }));
            },

            deleteCurrentCourseAndRegenerate: async (courseData: Partial<Course>) => {
                const { currentCourseId, deleteCourse, generateCourse } = get();
                if (currentCourseId) {
                    deleteCourse(currentCourseId);
                }
                await generateCourse(courseData);
            },

            importCourse: (savedCourse: SavedCourse) => {
                set((state) => ({
                    savedCourses: [...state.savedCourses, savedCourse]
                }));
            },

            generateLessonActivity: async (lessonId: string) => {
                const { currentCourse, settings, addLog, isGenerating } = get();
                if (!currentCourse || isGenerating) return;

                const lesson = currentCourse.lessons.find(l => l.id === lessonId);
                if (!lesson) return;

                set({ isGenerating: true });

                try {
                    const service = GenAIService.getInstance();
                    service.setApiKey(settings.apiKey);

                    const { activity, reasoning } = await service.generateActivity(lesson, settings, {
                        prePrompts: currentCourse.prePrompts
                    });

                    addLog('Generate Activity', reasoning);

                    set((state) => {
                        if (!state.currentCourse || !state.currentCourseId) return {};

                        const updatedLessons = state.currentCourse.lessons.map(l =>
                            l.id === lessonId ? { ...l, activity } : l
                        );

                        const updatedCourse = { ...state.currentCourse, lessons: updatedLessons };

                        return {
                            currentCourse: updatedCourse,
                            savedCourses: state.savedCourses.map(c =>
                                c.id === state.currentCourseId
                                    ? { ...c, course: updatedCourse }
                                    : c
                            )
                        };
                    });
                } catch (error) {
                    console.error("Failed to generate activity", error);
                    addLog('Error', `Failed to generate activity: ${error}`);
                } finally {
                    set({ isGenerating: false });
                }
            },

            generateNextLesson: async (comprehensionScore: number) => {
                const { currentCourse, currentLessonIndex, settings, addLog, isGenerating } = get();
                if (!currentCourse || isGenerating) return;

                // currentLessonIndex is already incremented by completeLesson, so it points to the NEXT lesson
                const nextIndex = currentLessonIndex;

                if (nextIndex >= currentCourse.roadmap.length) {
                    console.log("No more lessons in roadmap");
                    return;
                }

                set({ isGenerating: true });

                try {
                    const service = GenAIService.getInstance();
                    service.setApiKey(settings.apiKey);

                    // Previous lesson is at index - 1
                    // If generating the first lesson (index 0), there is no previous lesson.
                    const previousLesson = nextIndex > 0 ? currentCourse.lessons[nextIndex - 1] : null;
                    const nextLessonRoadmap = currentCourse.roadmap[nextIndex];

                    if (nextIndex > 0 && !previousLesson) {
                        console.error("Previous lesson not found");
                        return;
                    }

                    const { lesson, reasoning } = await service.generateNextLesson(
                        currentCourse,
                        previousLesson!, // Service handles null for first lesson if we update it
                        comprehensionScore,
                        nextLessonRoadmap,
                        settings,
                        currentCourse.lessonPrompts
                    );

                    // Generate visual explanation if visualPrompt exists
                    if ((lesson as any).visualPrompt) {
                        const { generateLessonVisual } = await import('../services/visualGenerator');
                        const visualUrl = await generateLessonVisual(
                            lesson,
                            (lesson as any).visualPrompt,
                            settings.apiKey,
                            { model: 'flash', aspectRatio: '16:9' } // Fast generation for lessons
                        );
                        lesson.visualExplanation = visualUrl;
                    }

                    addLog('Generate Next Lesson', reasoning);

                    set((state) => {
                        if (!state.currentCourse || !state.currentCourseId) return {};

                        const updatedCourse = {
                            ...state.currentCourse,
                            lessons: [...state.currentCourse.lessons, lesson]
                        };

                        return {
                            currentCourse: updatedCourse,
                            currentLessonIndex: nextIndex,
                            savedCourses: state.savedCourses.map(c =>
                                c.id === state.currentCourseId
                                    ? { ...c, course: updatedCourse, totalLessons: updatedCourse.roadmap.length }
                                    : c
                            )
                        };
                    });
                } catch (error) {
                    console.error("Failed to generate next lesson", error);
                    addLog('Error', `Failed to generate next lesson: ${error}`);
                } finally {
                    set({ isGenerating: false });
                }
            },

            retryLesson: async (lessonId: string, previousScore: number) => {
                const { currentCourse, settings, addLog, isGenerating } = get();
                if (!currentCourse || isGenerating) return;

                const lesson = currentCourse.lessons.find(l => l.id === lessonId);
                if (!lesson) return;

                set({ isGenerating: true });

                try {
                    const service = GenAIService.getInstance();
                    service.setApiKey(settings.apiKey);

                    const attemptNumber = (lesson.attempts || 0) + 1;

                    const { activity, reasoning } = await service.generateRemedialActivity(
                        lesson,
                        previousScore,
                        attemptNumber,
                        { prePrompts: currentCourse.prePrompts }
                    );

                    addLog('Generate Remedial Activity', reasoning);

                    set((state) => {
                        if (!state.currentCourse || !state.currentCourseId) return {};

                        const updatedLessons = state.currentCourse.lessons.map(l =>
                            l.id === lessonId
                                ? { ...l, activity, attempts: attemptNumber }
                                : l
                        );

                        const updatedCourse = { ...state.currentCourse, lessons: updatedLessons };

                        return {
                            currentCourse: updatedCourse,
                            savedCourses: state.savedCourses.map(c =>
                                c.id === state.currentCourseId
                                    ? { ...c, course: updatedCourse }
                                    : c
                            )
                        };
                    });
                } catch (error) {
                    console.error("Failed to generate remedial activity", error);
                    addLog('Error', `Failed to generate remedial activity: ${error}`);
                } finally {
                    set({ isGenerating: false });
                }
            },

            completeLesson: (lessonId: string, comprehensionScore: number) => {
                set((state) => {
                    if (!state.currentCourse || !state.currentCourseId) return {};

                    const updatedLessons = state.currentCourse.lessons.map(l =>
                        l.id === lessonId ? { ...l, isCompleted: true, comprehensionScore } : l
                    );

                    const completedCount = updatedLessons.filter(l => l.isCompleted).length;
                    const totalLessons = state.currentCourse.roadmap.length;
                    // Cap progress at 100% to prevent exceeding 100%
                    const progress = Math.min(100, (completedCount / totalLessons) * 100);

                    const updatedCourse = { ...state.currentCourse, lessons: updatedLessons };

                    return {
                        currentCourse: updatedCourse,
                        currentLessonIndex: state.currentLessonIndex + 1,
                        savedCourses: state.savedCourses.map(c =>
                            c.id === state.currentCourseId
                                ? { ...c, course: updatedCourse, completedLessons: completedCount, progress }
                                : c
                        )
                    };
                });
            },

            setCurrentLessonIndex: (index: number) => {
                set((state) => {
                    if (!state.currentCourse) return {};

                    // Ensure index is within valid range
                    const validIndex = Math.max(0, Math.min(index, state.currentCourse.roadmap.length - 1));

                    return { currentLessonIndex: validIndex };
                });
            },

            addLog: (action, reasoning) => set((state) => ({
                logs: [...state.logs, {
                    id: Math.random().toString(36).substring(7),
                    timestamp: Date.now(),
                    action,
                    reasoning
                }]
            })),

            updateSettings: (newSettings) => set((state) => ({
                settings: { ...state.settings, ...newSettings }
            })),

            resetProgress: () => set({
                appState: 'COURSES',
                currentCourseId: null,
                currentCourse: null,
                currentLessonIndex: 0,
                logs: []
            })
        }),
        {
            name: '1111-school-storage',
            partialize: (state) => ({
                settings: state.settings,
                savedCourses: state.savedCourses
            })
        }
    )
);
