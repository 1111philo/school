import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useCourseStore } from '@/stores/course-store';
import {
  generateAssessment,
  getAssessment,
  submitAssessment,
} from '@/api/assessments';
import { AssessmentForm } from '@/components/assessment/AssessmentForm';
import { AssessmentResults } from '@/components/assessment/AssessmentResults';
import type { AssessmentResponse } from '@/api/types';
import { ApiError } from '@/api/client';

export function AssessmentPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { course, loadCourse } = useCourseStore();
  const [assessment, setAssessment] = useState<AssessmentResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Load course on mount
  useEffect(() => {
    if (courseId) loadCourse(courseId);
  }, [courseId, loadCourse]);

  // Check for existing assessment from REST-fetched course data
  useEffect(() => {
    if (!course || !courseId) return;

    const existing = course.assessments.find(
      (a) => a.status === 'pending' || a.status === 'reviewed',
    );

    if (existing) {
      // Assessment exists — fetch full data via REST
      getAssessment(courseId).then(setAssessment).catch(() => {
        // If fetch fails, let user trigger generation
      });
    } else if (
      course.status === 'generating_assessment' ||
      course.status === 'awaiting_assessment'
    ) {
      // Course is mid-generation or ready — connect SSE or let user trigger
      if (course.status === 'generating_assessment') {
        setGenerating(true);
        connectSSE(courseId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.id]);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  function connectSSE(id: string) {
    eventSourceRef.current?.close();

    const evtSource = new EventSource(
      `/api/assessments/${id}/assessment-stream`,
    );
    eventSourceRef.current = evtSource;

    evtSource.addEventListener('assessment_complete', async () => {
      evtSource.close();
      eventSourceRef.current = null;
      try {
        const result = await getAssessment(id);
        setAssessment(result);
      } catch {
        setError('Assessment was generated but could not be loaded.');
      }
      setGenerating(false);
    });

    evtSource.addEventListener('assessment_error', (e) => {
      evtSource.close();
      eventSourceRef.current = null;
      const data = JSON.parse(e.data);
      setError(data.error || 'Assessment generation failed');
      setGenerating(false);
    });

    evtSource.onerror = () => {
      // Only treat as terminal if the connection is fully closed
      // (allows browser auto-reconnect for transient network blips)
      if (evtSource.readyState === EventSource.CLOSED) {
        eventSourceRef.current = null;
        setError('Lost connection during assessment generation');
        setGenerating(false);
      }
    };
  }

  async function handleGenerate() {
    if (!courseId) return;
    setGenerating(true);
    setError(null);
    try {
      await generateAssessment(courseId);
      connectSSE(courseId);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // Already in progress — just connect SSE
        connectSSE(courseId);
      } else {
        setError((e as Error).message);
        setGenerating(false);
      }
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

  // Generating state
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Assessment</h1>
      <p className="text-muted-foreground">
        {generating
          ? 'Generating your assessment...'
          : 'Ready to test your knowledge?'}
      </p>
      {generating && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="animate-spin">&#9696;</span>
          <span>This may take a few seconds</span>
        </div>
      )}
      {!generating && !assessment && (
        <Button onClick={handleGenerate}>Generate Assessment</Button>
      )}
      {error && (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" onClick={handleGenerate}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
