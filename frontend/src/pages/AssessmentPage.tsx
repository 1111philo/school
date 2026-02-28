import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useCourseStore } from '@/stores/course-store';
import { generateAssessment, submitAssessment } from '@/api/assessments';
import { AssessmentForm } from '@/components/assessment/AssessmentForm';
import { AssessmentResults } from '@/components/assessment/AssessmentResults';
import type { AssessmentResponse } from '@/api/types';

export function AssessmentPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { course, loadCourse } = useCourseStore();
  const [assessment, setAssessment] = useState<AssessmentResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (courseId) loadCourse(courseId);
  }, [courseId, loadCourse]);

  // Check for existing assessment
  useEffect(() => {
    if (!course) return;
    const existing = course.assessments.find(
      (a) => a.status === 'pending' || a.status === 'reviewed',
    );
    if (existing) {
      // Fetch full assessment data by generating again (returns existing if pending)
      handleGenerate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.id]);

  async function handleGenerate() {
    if (!courseId) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await generateAssessment(courseId);
      setAssessment(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit(
    responses: { objective: string; text: string }[],
  ) {
    if (!assessment) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitAssessment(assessment.id, { responses });
      setAssessment(result);
      if (courseId) await loadCourse(courseId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRetry() {
    setAssessment(null);
    await handleGenerate();
  }

  if (!course) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  // Show results if reviewed
  if (assessment?.status === 'reviewed') {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold">Assessment Results</h1>
        <AssessmentResults assessment={assessment} />
        <div className="flex gap-3">
          {assessment.passed ? (
            <Button onClick={() => navigate('/my-courses')}>
              Back to My Courses
            </Button>
          ) : (
            <Button onClick={handleRetry}>Retry Assessment</Button>
          )}
        </div>
      </div>
    );
  }

  // Show form if assessment spec is loaded
  if (assessment?.assessment_spec) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold">Assessment</h1>
        <AssessmentForm
          spec={assessment.assessment_spec}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  // Generate state
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Assessment</h1>
      <p className="text-muted-foreground">
        {generating
          ? 'Generating your assessment...'
          : 'Ready to test your knowledge?'}
      </p>
      {!generating && !assessment && (
        <Button onClick={handleGenerate}>Generate Assessment</Button>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
