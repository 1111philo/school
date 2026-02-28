import { StepperItem } from './StepperItem';
import type { ObjectiveProgress } from '@/stores/generation-store';

interface GenerationStepperProps {
  objectives: string[];
  progress: Map<number, ObjectiveProgress>;
}

export function GenerationStepper({ objectives, progress }: GenerationStepperProps) {
  return (
    <div className="space-y-0">
      {objectives.map((obj, i) => (
        <StepperItem
          key={i}
          index={i}
          objectiveLabel={obj}
          progress={progress.get(i)}
        />
      ))}
    </div>
  );
}
