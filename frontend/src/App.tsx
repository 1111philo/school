import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { CatalogPage } from '@/pages/CatalogPage';
import { CreateCoursePage } from '@/pages/CreateCoursePage';
import { GenerationPage } from '@/pages/GenerationPage';
import { CoursePage } from '@/pages/CoursePage';
import { LessonPage } from '@/pages/LessonPage';
import { ActivityPage } from '@/pages/ActivityPage';
import { AssessmentPage } from '@/pages/AssessmentPage';
import { MyCoursesPage } from '@/pages/MyCoursesPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/catalog" replace />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="courses/new" element={<CreateCoursePage />} />
          <Route
            path="courses/:courseId/generate"
            element={<GenerationPage />}
          />
          <Route path="courses/:courseId" element={<CoursePage />}>
            <Route path="lessons/:index" element={<LessonPage />} />
            <Route
              path="lessons/:index/activity"
              element={<ActivityPage />}
            />
          </Route>
          <Route
            path="courses/:courseId/assessment"
            element={<AssessmentPage />}
          />
          <Route path="my-courses" element={<MyCoursesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
