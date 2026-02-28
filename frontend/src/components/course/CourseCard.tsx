import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProgressBar } from './ProgressBar';
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/constants';
import type { CourseListItem } from '@/api/types';

interface CourseCardProps {
  course: CourseListItem;
  onDelete: (id: string) => Promise<void>;
}

export function CourseCard({ course, onDelete }: CourseCardProps) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  function getAction() {
    switch (course.status) {
      case 'generating':
        return { label: 'View Progress', path: `/courses/${course.id}/generate` };
      case 'generation_failed':
      case 'draft':
        return { label: 'Generate', path: `/courses/${course.id}/generate` };
      case 'completed':
        return { label: 'Review', path: `/courses/${course.id}` };
      case 'awaiting_assessment':
      case 'assessment_ready':
        return { label: 'Take Assessment', path: `/courses/${course.id}/assessment` };
      default:
        return { label: 'Continue', path: `/courses/${course.id}` };
    }
  }

  const action = getAction();

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base line-clamp-1">
            {course.input_description ?? 'Course'}
          </CardTitle>
          <Badge className={STATUS_COLORS[course.status]}>
            {STATUS_LABELS[course.status]}
          </Badge>
        </div>
        <CardDescription>
          {course.source_type === 'predefined' ? 'From catalog' : 'Custom'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {course.lesson_count > 0 && (
          <ProgressBar
            completed={course.lessons_completed}
            total={course.lesson_count}
          />
        )}
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => navigate(action.path)}
        >
          {action.label}
        </Button>
        {confirming ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                await onDelete(course.id);
                setConfirming(false);
              }}
            >
              Confirm
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(true)}
          >
            Delete
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
