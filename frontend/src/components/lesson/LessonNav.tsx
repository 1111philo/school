import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { CourseResponse } from '@/api/types';

interface LessonNavProps {
  course: CourseResponse;
  currentIndex: number;
}

export function LessonNav({ course, currentIndex }: LessonNavProps) {
  const navigate = useNavigate();
  const lesson = course.lessons[currentIndex];
  const hasActivity = lesson?.activity?.activity_spec != null;
  const activityDone =
    lesson?.activity?.mastery_decision === 'meets' ||
    lesson?.activity?.mastery_decision === 'exceeds';
  const isLast = currentIndex === course.lessons.length - 1;

  function goNext() {
    if (hasActivity && !activityDone) {
      navigate(`/courses/${course.id}/lessons/${currentIndex}/activity`);
    } else if (!isLast) {
      navigate(`/courses/${course.id}/lessons/${currentIndex + 1}`);
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      navigate(`/courses/${course.id}/lessons/${currentIndex - 1}`);
    }
  }

  return (
    <div className="flex justify-between pt-6">
      <Button
        variant="outline"
        onClick={goPrev}
        disabled={currentIndex === 0}
      >
        Previous
      </Button>
      {isLast && (!hasActivity || activityDone) ? (
        <Button onClick={() => navigate(`/courses/${course.id}/assessment`)}>
          Take Assessment
        </Button>
      ) : (
        <Button onClick={goNext} disabled={isLast && !hasActivity}>
          {hasActivity && !activityDone ? 'Complete Activity' : 'Next'}
        </Button>
      )}
    </div>
  );
}
