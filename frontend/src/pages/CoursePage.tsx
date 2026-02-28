import { useEffect } from 'react';
import { useParams, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useCourseStore } from '@/stores/course-store';
import { LessonSidebar } from '@/components/course/LessonSidebar';

export function CoursePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { course, courseLoading: loading, loadCourse } = useCourseStore();

  useEffect(() => {
    if (courseId) loadCourse(courseId);
  }, [courseId, loadCourse]);

  // Redirect to first incomplete lesson if at /courses/:id
  useEffect(() => {
    if (!course || !courseId) return;
    const isRoot = location.pathname === `/courses/${courseId}`;
    if (!isRoot) return;

    const firstIncomplete = course.lessons.findIndex(
      (l) => l.status !== 'completed',
    );
    const idx = firstIncomplete >= 0 ? firstIncomplete : 0;
    navigate(`/courses/${courseId}/lessons/${idx}`, { replace: true });
  }, [course, courseId, location.pathname, navigate]);

  if (loading || !course) {
    return <p className="text-muted-foreground">Loading course...</p>;
  }

  return (
    <div className="flex gap-6">
      <LessonSidebar course={course} />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
