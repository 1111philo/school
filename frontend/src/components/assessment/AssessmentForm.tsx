import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { AssessmentSpec } from '@/api/types';

interface AssessmentFormProps {
  spec: AssessmentSpec;
  onSubmit: (responses: { objective: string; text: string }[]) => Promise<void>;
  submitting: boolean;
}

export function AssessmentForm({ spec, onSubmit, submitting }: AssessmentFormProps) {
  const [answers, setAnswers] = useState<Record<number, string>>(
    () => Object.fromEntries(spec.items.map((_, i) => [i, ''])),
  );

  function update(i: number, text: string) {
    setAnswers((a) => ({ ...a, [i]: text }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const responses = spec.items.map((item, i) => ({
      objective: item.objective,
      text: answers[i]?.trim() ?? '',
    }));
    if (responses.some((r) => !r.text)) return;
    await onSubmit(responses);
  }

  const allFilled = spec.items.every((_, i) => answers[i]?.trim());

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h2 className="text-lg font-semibold">{spec.assessment_title}</h2>
      {spec.items.map((item, i) => (
        <div key={i} className="space-y-2">
          <p className="text-sm font-medium">
            {i + 1}. {item.objective}
          </p>
          <div className="rounded-md bg-muted p-3">
            <p className="text-sm">{item.prompt}</p>
          </div>
          <Textarea
            placeholder="Your answer..."
            value={answers[i] ?? ''}
            onChange={(e) => update(i, e.target.value)}
            rows={4}
            disabled={submitting}
          />
        </div>
      ))}
      <Button type="submit" disabled={submitting || !allFilled} className="w-full">
        {submitting ? 'Submitting...' : 'Submit Assessment'}
      </Button>
    </form>
  );
}
