import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

export function useRouting() {
    const {
        appState,
        currentCourse,
        currentLessonIndex,
        setAppState,
        loadCourse,
        setCurrentLessonIndex
    } = useAppStore();

    // 1. Store State -> URL & Title
    useEffect(() => {
        let path = '/';
        let title = '1111 School';

        switch (appState) {
            case 'SETTINGS':
                path = '/settings';
                title = `Settings - ${title}`;
                break;
            case 'COURSE_GENERATION':
                path = '/generate';
                title = `Creating Course - ${title}`;
                break;
            case 'LEARNING':
                if (currentCourse) {
                    const lesson = currentCourse.lessons[currentLessonIndex];
                    const lessonTitle = lesson?.title || currentCourse.roadmap[currentLessonIndex]?.title || `Lesson ${currentLessonIndex + 1}`;
                    path = `/course/${currentCourse.id}/lesson/${currentLessonIndex}`;
                    title = `${lessonTitle} - ${currentCourse.title} - ${title}`;
                } else {
                    path = '/';
                }
                break;
            case 'COURSES':
            default:
                path = '/';
                title = `My Courses - ${title}`;
                break;
        }

        // Update Document Title
        if (document.title !== title) {
            document.title = title;
        }

        // Update URL
        if (window.location.pathname !== path) {
            window.history.pushState({ appState, courseId: currentCourse?.id, lessonIndex: currentLessonIndex }, '', path);
        }
    }, [appState, currentCourse, currentLessonIndex]);

    // 2. URL -> Store State (Back/Forward / Initial Load)
    useEffect(() => {
        const handlePopState = () => {
            const path = window.location.pathname;
            parsePath(path);
        };

        const parsePath = (path: string) => {
            if (path === '/settings') {
                setAppState('SETTINGS');
            } else if (path === '/generate') {
                setAppState('COURSE_GENERATION');
            } else if (path.startsWith('/course/')) {
                // Format: /course/:id/lesson/:index
                const parts = path.split('/');
                const courseId = parts[2];
                const lessonPart = parts[4]; // index 3 is 'lesson', 4 is the index
                const lessonIndex = lessonPart ? parseInt(lessonPart, 10) : 0;

                if (courseId) {
                    // Check if already loaded
                    const currentStore = useAppStore.getState();
                    if (currentStore.currentCourseId !== courseId) {
                        loadCourse(courseId);
                    }
                    if (currentStore.currentLessonIndex !== lessonIndex) {
                        setCurrentLessonIndex(lessonIndex);
                    }
                }
            } else {
                setAppState('COURSES');
            }
        };

        window.addEventListener('popstate', handlePopState);

        // Initial parse on mount
        parsePath(window.location.pathname);

        return () => window.removeEventListener('popstate', handlePopState);
    }, [setAppState, loadCourse, setCurrentLessonIndex]);
}
