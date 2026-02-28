import { useEffect } from 'react';
import { useCourseStore } from '@/stores/course-store';
import { CourseCard } from '@/components/course/CourseCard';

export function MyCoursesPage() {
  const { myCourses, listLoading: loading, listError: error, loadMyCourses, removeCourse } =
    useCourseStore();

  useEffect(() => {
    loadMyCourses();
  }, [loadMyCourses]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Courses</h1>
        <p className="text-muted-foreground">
          Track your learning progress
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {myCourses.length === 0 && !loading ? (
        <p className="text-center text-muted-foreground py-12">
          No courses yet. Browse the catalog to get started!
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {myCourses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              onDelete={removeCourse}
            />
          ))}
        </div>
      )}

      {loading && myCourses.length === 0 && (
        <p className="text-center text-muted-foreground">Loading...</p>
      )}
    </div>
  );
}
