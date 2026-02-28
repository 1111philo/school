import { NavLink, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ProgressBar } from './ProgressBar';
import type { CourseResponse } from '@/api/types';

interface LessonSidebarProps {
  course: CourseResponse;
}

export function LessonSidebar({ course }: LessonSidebarProps) {
  const navigate = useNavigate();
  const completed = course.lessons.filter((l) => l.status === 'completed').length;
  const allCompleted = completed === course.lessons.length && course.lessons.length > 0;

  return (
    <aside className="w-64 shrink-0 space-y-4">
      <ProgressBar completed={completed} total={course.lessons.length} />

      <nav className="space-y-1">
        {course.lessons.map((lesson, i) => (
          <NavLink
            key={lesson.id}
            to={`/courses/${course.id}/lessons/${i}`}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'hover:bg-muted',
                lesson.status === 'locked' && 'pointer-events-none opacity-50',
              )
            }
          >
            <span className="text-xs">
              {lesson.status === 'completed'
                ? '✓'
                : lesson.status === 'locked'
                  ? '🔒'
                  : '○'}
            </span>
            <span className="truncate">Lesson {i + 1}</span>
          </NavLink>
        ))}
      </nav>

      {allCompleted && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => navigate(`/courses/${course.id}/assessment`)}
        >
          Take Assessment
        </Button>
      )}
    </aside>
  );
}
