import { cn } from '@/lib/utils';
import type { ObjectiveProgress } from '@/stores/generation-store';

interface StepperItemProps {
  index: number;
  objectiveLabel: string;
  progress: ObjectiveProgress | undefined;
  /** True when we infer this objective is being worked on (sequential generation) */
  inferActive?: boolean;
}

function StepIcon({ done, active }: { done: boolean; active: boolean }) {
  if (done)
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-xs text-white">
        &#10003;
      </span>
    );
  if (active)
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary">
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
      </span>
    );
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-muted-foreground/30" />
  );
}

export function StepperItem({ index, objectiveLabel, progress, inferActive }: StepperItemProps) {
  const p = progress ?? { planned: false, planTitle: null, written: false, activityCreated: false, activityId: null, error: null };

  const steps = [
    { label: p.planTitle ? `Planned: ${p.planTitle}` : (p.planned ? 'Lesson planned' : 'Planning lesson'), done: p.planned },
    { label: 'Writing content', done: p.written },
    { label: 'Creating activity', done: p.activityCreated },
  ];

  const allDone = p.planned && p.written && p.activityCreated;
  const anyStarted = p.planned || p.written || p.activityCreated;
  // Consider this objective active if it has explicit progress OR we inferred it
  const isActive = anyStarted || !!inferActive;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <StepIcon done={allDone} active={isActive && !allDone} />
        <div className="w-px flex-1 bg-border" />
      </div>
      <div className="pb-6">
        <p className={cn('text-sm font-medium', allDone && 'text-green-700')}>
          Objective {index + 1}: {objectiveLabel}
        </p>
        {p.error && (
          <p className="mt-1 text-xs text-destructive">{p.error}</p>
        )}
        <div className="mt-2 space-y-1">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              {step.done ? (
                <span className="text-green-600">&#10003;</span>
              ) : isActive && !steps.slice(0, i).every((s) => s.done) ? (
                <span className="text-muted-foreground/40">&#9675;</span>
              ) : isActive ? (
                <span className="animate-spin text-primary">&#9696;</span>
              ) : (
                <span className="text-muted-foreground/40">&#9675;</span>
              )}
              <span>{step.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
