import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface SubmissionFormProps {
  onSubmit: (text: string) => Promise<void>;
  submitting: boolean;
}

export function SubmissionForm({ onSubmit, submitting }: SubmissionFormProps) {
  const [text, setText] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await onSubmit(text.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Textarea
        placeholder="Type your response..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        disabled={submitting}
      />
      <Button type="submit" disabled={submitting || !text.trim()}>
        {submitting ? 'Submitting...' : 'Submit'}
      </Button>
    </form>
  );
}
