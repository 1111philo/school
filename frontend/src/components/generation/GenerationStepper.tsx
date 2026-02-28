import { StepperItem } from './StepperItem';
import type { ObjectiveProgress } from '@/stores/generation-store';

interface GenerationStepperProps {
  objectives: string[];
  progress: Map<number, ObjectiveProgress>;
  generating?: boolean;
}

export function GenerationStepper({ objectives, progress, generating }: GenerationStepperProps) {
  // When SSE events arrive before the REST fetch, objectives may be empty but
  // progress has entries keyed by objective_index. Build a display list from
  // whichever source has more items so the stepper is visible immediately.
  const maxIndex = progress.size > 0
    ? Math.max(...progress.keys(), objectives.length - 1)
    : objectives.length - 1;
  const count = Math.max(objectives.length, maxIndex + 1);
  const indices = Array.from({ length: count }, (_, i) => i);

  // Infer which objective is currently in progress.
  // Generation is sequential, so it's the first one without full completion
  // (planned + written + activityCreated) after the last completed one.
  let inferredActiveIndex = -1;
  if (generating) {
    for (const i of indices) {
      const p = progress.get(i);
      if (!p || !p.planned || !p.written || !p.activityCreated) {
        inferredActiveIndex = i;
        break;
      }
    }
  }

  return (
    <div className="space-y-0">
      {indices.map((i) => (
        <StepperItem
          key={i}
          index={i}
          objectiveLabel={objectives[i] ?? `Objective ${i + 1}`}
          progress={progress.get(i)}
          inferActive={i === inferredActiveIndex}
        />
      ))}
    </div>
  );
}
