import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { GenerationStepper } from '@/components/generation/GenerationStepper';
import { useGenerationStore } from '@/stores/generation-store';
import { transitionCourse, triggerGeneration } from '@/api/courses';

export function GenerationPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const {
    objectives,
    progress,
    courseStatus,
    complete,
    loading,
    error,
    init,
    teardown,
  } = useGenerationStore();

  useEffect(() => {
    if (courseId) init(courseId);
    return () => teardown();
    // init and teardown are stable Zustand actions — intentionally excluded
    // to avoid stale-closure issues with React strict-mode double-mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // Determine if the generation finished but produced nothing (zombie state).
  // This happens when the backend process crashed or the server restarted
  // while the course was in "generating" status.
  const isZombie = complete && progress.size === 0 && objectives.length > 0;

  // Has at least some lessons been successfully generated?
  const hasLessons = progress.size > 0;

  // Course was already fully generated before this page loaded
  // (status is past "generating", e.g. active, in_progress, completed)
  const alreadyGenerated =
    courseStatus != null &&
    !['draft', 'generating', 'generation_failed'].includes(courseStatus);

  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    if (!courseId || retrying) return;
    setRetrying(true);
    try {
      // The course is stuck in "generating" — transition to generation_failed
      // first so the backend will accept a new generation request.
      if (courseStatus === 'generating') {
        await transitionCourse(courseId, 'generation_failed');
      }
      await triggerGeneration(courseId);
      await init(courseId);
    } catch {
      // If transitions fail, just refresh to show current state
      await init(courseId);
    } finally {
      setRetrying(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Generating Your Course</h1>
          <p className="text-muted-foreground">Loading course details...</p>
        </div>
      </div>
    );
  }

  // Pick the right heading and subtitle based on actual state
  let heading = 'Generating Your Course';
  let subtitle = 'Creating personalized lessons for each objective...';

  if (isZombie) {
    heading = 'Generation Interrupted';
    subtitle =
      'It looks like the generation process was interrupted before any lessons were created.';
  } else if (alreadyGenerated) {
    heading = 'Course Ready';
    subtitle = 'Your course has been generated successfully!';
  } else if (complete && hasLessons) {
    heading = 'Generation Complete';
    subtitle = 'Your course is ready!';
  } else if (courseStatus === 'generation_failed') {
    heading = 'Generation Failed';
    subtitle = error ?? 'Generation failed for some objectives.';
  } else if (error) {
    subtitle = error;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{heading}</h1>
        <p className="text-muted-foreground">{subtitle}</p>
      </div>

      {(objectives.length > 0 || progress.size > 0) && !isZombie && (
        <GenerationStepper objectives={objectives} progress={progress} generating={!complete} />
      )}

      {isZombie && (
        <div className="rounded-lg border border-dashed border-yellow-500/50 bg-yellow-50 p-4 dark:bg-yellow-950/20">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            The server may have restarted during generation. You can retry
            generating the course or go back to your courses.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRetry} disabled={retrying}>
              {retrying ? 'Retrying...' : 'Retry Generation'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/my-courses')}
            >
              Back to My Courses
            </Button>
          </div>
        </div>
      )}

      {complete && hasLessons && (
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
