import type { LessonActivity, MultipleChoiceConfig, ShortResponseConfig, DrawingConfig } from '@/types';
import { MultipleChoiceActivity } from './MultipleChoiceActivity';
import { ShortResponseActivity } from './ShortResponseActivity';
import { DrawingActivity } from './DrawingActivity';

interface ActivityRendererProps {
    activity: LessonActivity;
    onComplete: (score: number, feedback?: string) => void;
}

export function ActivityRenderer({ activity, onComplete }: ActivityRendererProps) {
    switch (activity.type) {
        case 'multiple-choice':
            return (
                <MultipleChoiceActivity
                    config={activity.config as MultipleChoiceConfig}
                    onComplete={onComplete}
                />
            );

        case 'short-response':
            return (
                <ShortResponseActivity
                    config={activity.config as ShortResponseConfig}
                    onComplete={onComplete}
                />
            );

        case 'drawing':
            return (
                <DrawingActivity
                    config={activity.config as DrawingConfig}
                    onComplete={onComplete}
                />
            );

        default:
            return (
                <div className="p-4 border border-dashed rounded-lg text-center text-muted-foreground">
                    Unsupported activity type: {activity.type}
                </div>
            );
    }
}
