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
    currentPageIndex: number;
    completedPageActivities: Record<string, boolean>;
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
    triggerAssessmentGeneration: (lessonId: string) => Promise<void>;
    generateNextLesson: (comprehensionScore: number) => Promise<void>;
    retryLesson: (lessonId: string, previousScore: number) => Promise<void>;
    completeLesson: (lessonId: string, comprehensionScore: number) => void;
    setCurrentLessonIndex: (index: number) => void;
    setCurrentPageIndex: (index: number) => void;
    markPageActivityComplete: (pageId: string) => void;
    addLog: (action: string, reasoning: string, prompt?: string, response?: string, usage?: LogEntry['usage']) => void;
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
            currentPageIndex: 0,
            completedPageActivities: {},
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
                    currentPageIndex: 0,
                    completedPageActivities: {},
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

                    const { course, reasoning, prompt, response, usage } = await service.generateCourse(
                        courseData,
                        settings
                    );

                    // Generate course visual
                    if (course.visualPrompt) {
                        try {
                            const { generateCourseVisual } = await import('../services/visualGenerator');
                            const visualUrl = await generateCourseVisual(
                                course.title,
                                course.visualPrompt,
                                settings.apiKey,
                                { model: 'flash', aspectRatio: '16:9' }
                            );
                            course.imageUrl = visualUrl;
                        } catch (e) {
                            console.error("Failed to generate course visual", e);
                        }
                    }

                    // We no longer generate the first lesson's visual here, because it's empty.

                    addLog('Generate Course', reasoning, prompt, response, usage);

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
                        currentPageIndex: 0,
                        completedPageActivities: {},
                        appState: 'LEARNING'
                    }));

                    // We now generate the first lesson asynchronously after transitioning to LEARNING state
                    get().generateNextLesson(100);
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
                        currentPageIndex: savedCourse.currentPageIndex || 0,
                        completedPageActivities: savedCourse.completedPageActivities || {},
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

            triggerAssessmentGeneration: async (lessonId: string) => {
                const { currentCourse, settings, addLog, isGenerating } = get();
                if (!currentCourse || isGenerating) return;

                const lesson = currentCourse.lessons.find(l => l.id === lessonId);
                if (!lesson) return;

                set({ isGenerating: true });

                try {
                    const service = GenAIService.getInstance();
                    service.setApiKey(settings.apiKey);

                    const { assessment, reasoning, prompt, response, usage } = await service.generateAssessment(lesson, settings, {
                        prePrompts: currentCourse.prePrompts
                    });

                    addLog('Generate Assessment', reasoning, prompt, response, usage);

                    set((state) => {
                        if (!state.currentCourse || !state.currentCourseId) return {};

                        const updatedLessons = state.currentCourse.lessons.map(l =>
                            l.id === lessonId ? { ...l, assessment } : l
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

                    const { lesson, logs: lessonLogs } = await service.generateNextLesson(
                        currentCourse,
                        previousLesson!, // Service handles null for first lesson if we update it
                        comprehensionScore,
                        nextLessonRoadmap,
                        settings,
                        currentCourse.learningObjectives
                    );

                    lessonLogs.forEach(log => {
                        addLog(log.action, log.reasoning, log.prompt, log.response, log.usage);
                    });

                    set((state) => {
                        if (!state.currentCourse || !state.currentCourseId) return {};

                        const updatedCourse = {
                            ...state.currentCourse,
                            lessons: [...state.currentCourse.lessons, lesson]
                        };

                        return {
                            currentCourse: updatedCourse,
                            currentLessonIndex: nextIndex,
                            currentPageIndex: 0,
                            completedPageActivities: {},
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

                    const { activity, reasoning, prompt, response, usage } = await service.generateRemedialActivity(
                        lesson,
                        previousScore,
                        attemptNumber,
                        { prePrompts: currentCourse.prePrompts }
                    );

                    addLog('Generate Remedial Activity', reasoning, prompt, response, usage);

                    set((state) => {
                        if (!state.currentCourse || !state.currentCourseId) return {};

                        const updatedLessons = state.currentCourse.lessons.map(l =>
                            l.id === lessonId
                                ? { ...l, assessment: activity, attempts: attemptNumber }
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
                        currentPageIndex: 0,
                        completedPageActivities: {},
                        savedCourses: state.savedCourses.map(c =>
                            c.id === state.currentCourseId
                                ? { ...c, course: updatedCourse, completedLessons: completedCount, progress, currentPageIndex: 0, completedPageActivities: {} }
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

                    return {
                        currentLessonIndex: validIndex,
                        currentPageIndex: 0,
                        completedPageActivities: {},
                        savedCourses: state.savedCourses.map(c =>
                            c.id === state.currentCourseId
                                ? { ...c, currentPageIndex: 0, completedPageActivities: {} }
                                : c
                        )
                    };
                });
            },

            setCurrentPageIndex: (index: number) => {
                set((state) => {
                    const currentCourseId = state.currentCourseId;
                    if (!currentCourseId) return {};
                    return {
                        currentPageIndex: index,
                        savedCourses: state.savedCourses.map(c =>
                            c.id === currentCourseId
                                ? { ...c, currentPageIndex: index }
                                : c
                        )
                    };
                });
            },

            markPageActivityComplete: (pageId: string) => {
                set((state) => {
                    const currentCourseId = state.currentCourseId;
                    if (!currentCourseId) return {};
                    const newCompleted = { ...state.completedPageActivities, [pageId]: true };
                    return {
                        completedPageActivities: newCompleted,
                        savedCourses: state.savedCourses.map(c =>
                            c.id === currentCourseId
                                ? { ...c, completedPageActivities: newCompleted }
                                : c
                        )
                    };
                });
            },

            addLog: (action, reasoning, prompt, response, usage) => set((state) => ({
                logs: [...state.logs, {
                    id: Math.random().toString(36).substring(7),
                    timestamp: Date.now(),
                    action,
                    reasoning,
                    prompt,
                    response,
                    usage
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
                currentPageIndex: 0,
                completedPageActivities: {},
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
