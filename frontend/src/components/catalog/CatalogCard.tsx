import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { startCatalogCourse } from '@/api/catalog';
import { triggerGeneration } from '@/api/courses';
import type { CatalogCourse } from '@/api/types';
import { useState } from 'react';

interface CatalogCardProps {
  course: CatalogCourse;
}

export function CatalogCard({ course }: CatalogCardProps) {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);

  async function handleStart() {
    setStarting(true);
    try {
      const { id } = await startCatalogCourse(course.course_id);
      await triggerGeneration(id);
      navigate(`/courses/${id}/generate`);
    } catch {
      setStarting(false);
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="text-base">{course.name}</CardTitle>
        <CardDescription className="line-clamp-2">
          {course.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="flex flex-wrap gap-1">
          {course.tags.map((t) => (
            <Badge key={t} variant="secondary" className="text-xs">
              {t}
            </Badge>
          ))}
        </div>
        {course.estimated_hours && (
          <p className="mt-2 text-xs text-muted-foreground">
            ~{course.estimated_hours}h
          </p>
        )}
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          onClick={handleStart}
          disabled={starting}
        >
          {starting ? 'Starting...' : 'Start Course'}
        </Button>
      </CardFooter>
    </Card>
  );
}
