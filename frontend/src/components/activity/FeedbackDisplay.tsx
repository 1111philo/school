import { Badge } from '@/components/ui/badge';
import { MASTERY_LABELS, MASTERY_COLORS } from '@/lib/constants';

interface FeedbackDisplayProps {
  score: number;
  mastery: string;
  rationale: string;
  strengths: string[];
  improvements: string[];
  tips: string[];
}

export function FeedbackDisplay({
  score,
  mastery,
  rationale,
  strengths,
  improvements,
  tips,
}: FeedbackDisplayProps) {
  const scoreColor =
    score >= 80
      ? 'text-green-600'
      : score >= 60
        ? 'text-yellow-600'
        : 'text-red-600';

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center gap-3">
        <span className={`text-3xl font-bold ${scoreColor}`}>{score}</span>
        <span className="text-sm text-muted-foreground">/ 100</span>
        <Badge className={MASTERY_COLORS[mastery] ?? ''}>
          {MASTERY_LABELS[mastery] ?? mastery}
        </Badge>
      </div>

      <p className="text-sm">{rationale}</p>

      {strengths.length > 0 && (
        <div>
          <p className="text-sm font-medium text-green-700">Strengths</p>
          <ul className="ml-4 list-disc text-sm">
            {strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {improvements.length > 0 && (
        <div>
          <p className="text-sm font-medium text-yellow-700">Improvements</p>
          <ul className="ml-4 list-disc text-sm">
            {improvements.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {tips.length > 0 && (
        <div>
          <p className="text-sm font-medium text-blue-700">Tips</p>
          <ul className="ml-4 list-disc text-sm">
            {tips.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
