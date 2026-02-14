import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import { CourseEditor } from './CourseEditor';

export function CoursesView() {
    const { savedCourses, loadCourse, deleteCourse, generateCourse, isGenerating } = useAppStore();
    const [showCourseEditor, setShowCourseEditor] = useState(false);

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    if (showCourseEditor) {
        return (
            <CourseEditor
                isGenerating={isGenerating}
                onCancel={() => setShowCourseEditor(false)}
                onSave={async (courseData) => {
                    await generateCourse(courseData);
                    setShowCourseEditor(false);
                }}
            />
        );
    }

    return (
        <div className="max-w-6xl mx-auto p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
                        My Courses
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        {savedCourses.length === 0
                            ? 'Start a new conversation to create your first course'
                            : `${savedCourses.length} course${savedCourses.length !== 1 ? 's' : ''}`}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => setShowCourseEditor(true)} size="lg" className="gap-2">
                        <Plus className="w-5 h-5" />
                        New Course
                    </Button>
                </div>
            </div>

            {savedCourses.length === 0 ? (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center justify-center h-[50vh] text-center"
                >
                    <BookOpen className="w-16 h-16 text-muted-foreground/50 mb-4" />
                    <h2 className="text-xl font-semibold text-muted-foreground mb-2">No courses yet</h2>
                    <p className="text-muted-foreground mb-6">
                        Create your first personalized course to get started
                    </p>
                    <Button onClick={() => setShowCourseEditor(true)} size="lg">
                        <Plus className="w-5 h-5 mr-2" />
                        Start New Course
                    </Button>
                </motion.div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {savedCourses.map((course, idx) => (
                        <motion.div
                            key={course.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                        >
                            <Card className="h-full bg-background/60 backdrop-blur-md border-primary/10 hover:border-primary/30 transition-all hover:shadow-lg group">
                                <CardHeader>
                                    <CardTitle className="line-clamp-2">{course.title}</CardTitle>
                                    <CardDescription className="line-clamp-3">
                                        {course.description}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {/* Progress Bar */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Progress</span>
                                            <span className="font-medium">{Math.round(course.progress)}%</span>
                                        </div>
                                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                                            <motion.div
                                                className="h-full bg-gradient-to-r from-primary to-primary/60"
                                                initial={{ width: 0 }}
                                                animate={{ width: `${course.progress}%` }}
                                                transition={{ duration: 0.5, delay: idx * 0.1 + 0.2 }}
                                            />
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {course.completedLessons} of {course.totalLessons} lessons completed
                                        </p>
                                    </div>

                                    {/* Metadata */}
                                    <div className="text-xs text-muted-foreground space-y-1">
                                        <p>Created: {formatDate(course.createdAt)}</p>
                                        <p>Last accessed: {formatDate(course.lastAccessedAt)}</p>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-2 pt-2">
                                        <Button
                                            onClick={() => loadCourse(course.id)}
                                            className="flex-1"
                                            variant="default"
                                        >
                                            {course.progress === 0 ? 'Start' : 'Continue'}
                                        </Button>
                                        <Button
                                            onClick={() => deleteCourse(course.id)}
                                            variant="ghost"
                                            size="icon"
                                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}
