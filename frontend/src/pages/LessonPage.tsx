import { useParams } from 'react-router-dom';
import { useCourseStore } from '@/stores/course-store';
import { MarkdownRenderer } from '@/components/lesson/MarkdownRenderer';
import { LessonNav } from '@/components/lesson/LessonNav';

export function LessonPage() {
  const { index } = useParams<{ index: string }>();
  const { course } = useCourseStore();
  const lessonIndex = Number(index ?? 0);

  if (!course) return null;

  const lesson = course.lessons[lessonIndex];

  if (!lesson) {
    return <p className="text-muted-foreground">Lesson not found.</p>;
  }

  if (lesson.status === 'locked') {
    return (
      <p className="text-muted-foreground">
        Complete the previous lesson to unlock this one.
      </p>
    );
  }

  return (
    <div>
      {lesson.lesson_content ? (
        <MarkdownRenderer content={lesson.lesson_content} />
      ) : (
        <p className="text-muted-foreground">No content available yet.</p>
      )}
      <LessonNav course={course} currentIndex={lessonIndex} />
    </div>
  );
}
