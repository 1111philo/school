import { Badge } from '@/components/ui/badge';
import type { AssessmentResponse } from '@/api/types';

interface AssessmentResultsProps {
  assessment: AssessmentResponse;
}

export function AssessmentResults({ assessment }: AssessmentResultsProps) {
  const passed = assessment.passed;
  const score = assessment.score ?? 0;
  const scoreColor =
    score >= 80 ? 'text-green-600' : score >= 60 ? 'text-yellow-600' : 'text-red-600';

  const feedback = assessment.feedback as Record<string, unknown> | null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <span className={`text-4xl font-bold ${scoreColor}`}>
          {Math.round(score)}
        </span>
        <span className="text-muted-foreground">/ 100</span>
        <Badge variant={passed ? 'default' : 'destructive'}>
          {passed ? 'Passed' : 'Not Passed'}
        </Badge>
      </div>

      {feedback && typeof feedback === 'object' && (
        <div className="space-y-3 text-sm">
          {Object.entries(feedback).map(([key, value]) => (
            <div key={key}>
              <p className="font-medium capitalize">{key.replace(/_/g, ' ')}</p>
              <p className="text-muted-foreground">
                {typeof value === 'string' ? value : JSON.stringify(value)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
