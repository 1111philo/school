import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useCourseStore } from '@/stores/course-store';
import { submitActivity } from '@/api/activities';
import { ActivityPanel } from '@/components/activity/ActivityPanel';
import { SubmissionForm } from '@/components/activity/SubmissionForm';
import { FeedbackDisplay } from '@/components/activity/FeedbackDisplay';
import type { ActivitySubmitResponse } from '@/api/types';

export function ActivityPage() {
  const { courseId, index } = useParams<{ courseId: string; index: string }>();
  const navigate = useNavigate();
  const { course, loadCourse } = useCourseStore();
  const lessonIndex = Number(index ?? 0);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<ActivitySubmitResponse | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!course) return null;

  const lesson = course.lessons[lessonIndex];
  const activity = lesson?.activity;

  if (!activity?.activity_spec) {
    return <p className="text-muted-foreground">No activity for this lesson.</p>;
  }

  // Show previous feedback if already submitted and no new feedback (and not retrying)
  const existingFeedback = activity.latest_feedback;
  const displayFeedback = retrying
    ? null
    : feedback ?? (existingFeedback && activity.latest_score != null
      ? {
          score: activity.latest_score,
          mastery_decision: activity.mastery_decision ?? 'not_yet',
          rationale: existingFeedback.rationale,
          strengths: existingFeedback.strengths,
          improvements: existingFeedback.improvements,
          tips: existingFeedback.tips,
        }
      : null);

  const passed =
    feedback?.mastery_decision === 'meets' ||
    feedback?.mastery_decision === 'exceeds' ||
    activity.mastery_decision === 'meets' ||
    activity.mastery_decision === 'exceeds';

  const isLast = lessonIndex === course.lessons.length - 1;

  async function handleSubmit(text: string) {
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitActivity(activity!.id, text);
      setFeedback(result);
      setRetrying(false);
      // Refetch course to update sidebar lock states
      if (courseId) await loadCourse(courseId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleContinue() {
    if (isLast) {
      navigate(`/courses/${courseId}/assessment`);
    } else {
      navigate(`/courses/${courseId}/lessons/${lessonIndex + 1}`);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">
        Lesson {lessonIndex + 1} Activity
      </h2>

      <ActivityPanel spec={activity.activity_spec} />

      {displayFeedback ? (
        <>
          <FeedbackDisplay
            score={displayFeedback.score}
            mastery={displayFeedback.mastery_decision}
            rationale={displayFeedback.rationale}
            strengths={displayFeedback.strengths}
            improvements={displayFeedback.improvements}
            tips={displayFeedback.tips}
          />
          <div className="flex gap-3">
            {passed ? (
              <Button onClick={handleContinue}>
                {isLast ? 'Take Assessment' : 'Continue'}
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setFeedback(null);
                  setRetrying(true);
                }}
              >
                Retry
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <SubmissionForm onSubmit={handleSubmit} submitting={submitting} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </>
      )}
    </div>
  );
}
