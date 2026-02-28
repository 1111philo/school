import { useState } from 'react';
import type { ActivitySpec } from '@/api/types';

interface ActivityPanelProps {
  spec: ActivitySpec;
}

export function ActivityPanel({ spec }: ActivityPanelProps) {
  const [showHints, setShowHints] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-muted-foreground">
          {spec.activity_type}
        </p>
        <p className="mt-1 text-sm">{spec.instructions}</p>
      </div>

      <div className="rounded-md bg-muted p-4">
        <p className="text-sm font-medium">Prompt</p>
        <p className="mt-1 text-sm">{spec.prompt}</p>
      </div>

      {spec.hints.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowHints(!showHints)}
            className="text-sm font-medium text-primary hover:underline"
          >
            {showHints ? 'Hide Hints' : 'Show Hints'}
          </button>
          {showHints && (
            <ul className="mt-2 ml-4 list-disc text-sm text-muted-foreground">
              {spec.hints.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
