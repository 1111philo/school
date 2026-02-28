import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { GenerationStepper } from '@/components/generation/GenerationStepper';
import { useGenerationStore } from '@/stores/generation-store';
import { useCourseStore } from '@/stores/course-store';

export function GenerationPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { course, loadCourse } = useCourseStore();
  const { progress, complete, connectionError, connect, reset } = useGenerationStore();

  useEffect(() => {
    if (courseId) loadCourse(courseId);
  }, [courseId, loadCourse]);

  useEffect(() => {
    if (courseId) connect(courseId);
    return () => reset();
  }, [courseId, connect, reset]);

  // If course is already active/in_progress, allow starting directly
  const courseReady =
    complete ||
    (course &&
      ['active', 'in_progress', 'awaiting_assessment', 'assessment_ready', 'completed'].includes(
        course.status,
      ));

  const objectives = course?.input_objectives ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Generating Your Course</h1>
        <p className="text-muted-foreground">
          {complete
            ? 'Your course is ready!'
            : connectionError
              ? 'Connection lost. Refresh to check progress.'
              : 'Creating personalized lessons for each objective...'}
        </p>
      </div>

      {objectives.length > 0 && (
        <GenerationStepper objectives={objectives} progress={progress} />
      )}

      {courseReady && (
        <Button
          className="w-full"
          onClick={() => navigate(`/courses/${courseId}/lessons/0`)}
        >
          Start Learning
        </Button>
      )}
    </div>
  );
}
