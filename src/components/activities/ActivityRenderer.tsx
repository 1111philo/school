import type { LessonActivity, MultipleChoiceConfig, ShortResponseConfig, DrawingConfig, CustomCodeConfig, FileUploadConfig } from '@/types';
import { MultipleChoiceActivity } from './MultipleChoiceActivity';
import { ShortResponseActivity } from './ShortResponseActivity';
import { DrawingActivity } from './DrawingActivity';
import { CustomActivity } from './CustomActivity';
import { FileUploadActivity } from './FileUploadActivity';

interface ActivityRendererProps {
    activity: LessonActivity;
    onComplete: (score: number, feedback?: string) => void;
    learningObjectives?: string[];
    prePrompts?: string;
}

export function ActivityRenderer({ activity, onComplete, learningObjectives, prePrompts }: ActivityRendererProps) {
    switch (activity.type) {
        case 'custom-code':
            return (
                <CustomActivity
                    config={activity.config as CustomCodeConfig}
                    onComplete={onComplete}
                    learningObjectives={learningObjectives}
                />
            );

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

        case 'file-upload':
            return (
                <FileUploadActivity
                    config={activity.config as FileUploadConfig}
                    onComplete={onComplete}
                    learningObjectives={learningObjectives}
                    prePrompts={prePrompts}
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
