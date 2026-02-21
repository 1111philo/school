import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'framer-motion';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import { CourseEditor } from './CourseEditor';

export function CoursesView() {
    const { savedCourses, loadCourse, deleteCourse, generateCourse, isGenerating } = useAppStore();
    const [showCourseEditor, setShowCourseEditor] = useState(false);

    return (
        <div className="max-w-4xl mx-auto w-full px-6 py-12">
            <Dialog open={showCourseEditor} onOpenChange={setShowCourseEditor}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Create New Course</DialogTitle>
                        <DialogDescription>
                            Define the scope and goals for your new personalized learning journey.
                        </DialogDescription>
                    </DialogHeader>
                    <CourseEditor
                        isGenerating={isGenerating}
                        embedded
                        onCancel={() => setShowCourseEditor(false)}
                        onSave={async (courseData) => {
                            await generateCourse(courseData);
                            setShowCourseEditor(false);
                        }}
                    />
                </DialogContent>
            </Dialog>

            <div className="flex justify-between items-center mb-10">
                <div>
                    <h1 className="text-4xl font-extrabold tracking-tight">
                        My Courses
                    </h1>
                    <p className="text-muted-foreground mt-2 font-medium">
                        {savedCourses.length > 0 && `${savedCourses.length} personalized course${savedCourses.length !== 1 ? 's' : ''}`}
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {savedCourses.map((savedCourse, idx) => {
                        const courseData = savedCourse.course;
                        return (
                            <motion.div
                                key={savedCourse.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.1 }}
                            >
                                <Card className="h-full bg-background border border-border/40 hover:border-border transition-all hover:shadow-md group flex flex-col overflow-hidden rounded-xl">
                                    {/* Course Image Banner */}
                                    {/* Course Image Banner */}
                                    <button
                                        onClick={() => loadCourse(savedCourse.id)}
                                        className="aspect-video w-full bg-muted/30 relative overflow-hidden flex-shrink-0 cursor-pointer text-left border-none p-0 appearance-none bg-transparent"
                                    >
                                        {courseData.imageUrl ? (
                                            <img
                                                src={courseData.imageUrl}
                                                alt={courseData.title}
                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                                <BookOpen className="w-12 h-12 opacity-20" />
                                            </div>
                                        )}
                                    </button>

                                    <CardHeader className="flex-none pb-2">
                                        <CardTitle className="line-clamp-2 text-xl">{courseData.title}</CardTitle>
                                        <CardDescription className="line-clamp-3 mt-2 text-sm text-muted-foreground/80">
                                            {courseData.description}
                                        </CardDescription>
                                    </CardHeader>

                                    <CardContent className="flex-grow flex flex-col justify-end space-y-4 pt-4">
                                        <div className="flex items-center justify-between text-sm text-foreground/70">
                                            <div className="flex items-center gap-1.5">
                                                <BookOpen className="w-4 h-4" />
                                                <span>{savedCourse.totalLessons} Lessons</span>
                                            </div>
                                            <span className="font-medium">{Math.round(savedCourse.progress)}% Complete</span>
                                        </div>

                                        <div className="h-1.5 bg-muted rounded-full overflow-hidden w-full">
                                            <motion.div
                                                className="h-full bg-primary"
                                                initial={{ width: 0 }}
                                                animate={{ width: `${savedCourse.progress}%` }}
                                                transition={{ duration: 0.5, delay: idx * 0.1 + 0.2 }}
                                            />
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-3 pt-4 border-t border-border/40">
                                            <Button
                                                onClick={() => loadCourse(savedCourse.id)}
                                                className="flex-1 font-medium"
                                                variant={(savedCourse.progress === 0 && savedCourse.completedLessons === 0 && (savedCourse.currentPageIndex || 0) === 0 && !Object.keys(savedCourse.completedPageActivities || {}).length) ? "default" : "secondary"}
                                            >
                                                {(savedCourse.progress === 0 && savedCourse.completedLessons === 0 && (savedCourse.currentPageIndex || 0) === 0 && !Object.keys(savedCourse.completedPageActivities || {}).length) ? 'Start Course' : 'Continue Course'}
                                            </Button>
                                            <Button
                                                onClick={() => deleteCourse(savedCourse.id)}
                                                variant="ghost"
                                                size="icon"
                                                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )
                    })}
                </div>
            )}
        </div>
    );
}
