import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCatalogStore } from '@/stores/catalog-store';
import { CatalogCard } from '@/components/catalog/CatalogCard';
import { CatalogSearch } from '@/components/catalog/CatalogSearch';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export function CatalogPage() {
  const { courses, loading, error } = useCatalogStore();
  const navigate = useNavigate();

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    courses.forEach((c) => c.tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [courses]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Course Catalog</h1>
        <p className="text-muted-foreground">
          Browse courses or create your own
        </p>
      </div>

      <CatalogSearch allTags={allTags} />

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          className="flex cursor-pointer flex-col border-dashed hover:border-primary"
          onClick={() => navigate('/courses/new')}
        >
          <CardHeader className="flex-1">
            <CardTitle className="text-base">Create Your Own</CardTitle>
            <CardDescription>
              Describe what you want to learn and we'll build a custom course
            </CardDescription>
          </CardHeader>
        </Card>

        {courses.map((course) => (
          <CatalogCard key={course.course_id} course={course} />
        ))}
      </div>

      {loading && courses.length === 0 && (
        <p className="text-center text-muted-foreground">Loading...</p>
      )}
    </div>
  );
}
