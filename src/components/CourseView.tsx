import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { CheckCircle, Circle, Loader2, Settings, Target, Sparkles, BookOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import { ActivityRenderer } from './activities/ActivityRenderer';
import { CourseEditor } from './CourseEditor';

export function CourseView() {
    const { currentCourse, currentLessonIndex, currentPageIndex, completedPageActivities, completeLesson, generateNextLesson, retryLesson, addLog, setAppState, setCurrentLessonIndex, setCurrentPageIndex, markPageActivityComplete, isGenerating, deleteCurrentCourseAndRegenerate, triggerAssessmentGeneration } = useAppStore();
    const [activityScore, setActivityScore] = useState<number | null>(null);
    const [activityFeedback, setActivityFeedback] = useState<string | null>(null);
    const [showActivityResult, setShowActivityResult] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [prevLessonIndex, setPrevLessonIndex] = useState(currentLessonIndex);

    // Reset local activity result when changing lessons
    if (currentLessonIndex !== prevLessonIndex) {
        setPrevLessonIndex(currentLessonIndex);
        setActivityScore(null);
        setActivityFeedback(null);
        setShowActivityResult(false);
    }

    const activeLesson = currentCourse?.lessons[currentLessonIndex];
    const activeLessonRoadmap = currentCourse?.roadmap[currentLessonIndex];
    const isLastLesson = currentCourse ? currentLessonIndex >= currentCourse.roadmap.length - 1 : false;
    const passingScore = activeLesson?.assessment?.passingScore || 70;

    const pages = activeLesson?.pages || [];
    const activePage = (pages && currentPageIndex < pages.length) ? pages[currentPageIndex] : null;
    const isLastPage = pages.length === 0 || currentPageIndex >= pages.length - 1;

    // Ensure currentPageIndex is always valid
    useEffect(() => {
        if (currentPageIndex >= pages.length && pages.length > 0) {
            setCurrentPageIndex(Math.max(0, pages.length - 1));
        }
    }, [pages.length, currentPageIndex, setCurrentPageIndex]);

    if (!currentCourse) return null;

    const handlePageActivityComplete = (score: number, _feedback?: string) => {
        if (!activePage) return;
        const pagePassingScore = activePage.activity?.passingScore || 70;
        if (score >= pagePassingScore) {
            markPageActivityComplete(activePage.id);
            addLog('Practice Activity Completed', `Scored ${score}/100 on ${activePage.id}`);
        } else {
            alert(`Score: ${score}. You need ${pagePassingScore} to proceed. Try again!`);
        }
    };

    const handleActivityComplete = async (score: number, feedback?: string) => {
        setActivityScore(score);
        if (feedback) setActivityFeedback(feedback);
        setShowActivityResult(true);

        if (!activeLesson?.assessment) return; // Should not happen

        const passed = score >= passingScore;

        if (passed) {
            // Mark lesson as complete
            completeLesson(activeLesson!.id, score);
            addLog('Lesson Completed', `Scored ${score}/100 on ${activeLesson!.title}`);

            // Generate next lesson if not the last
            if (!isLastLesson) {
                await generateNextLesson(score);
            }
        } else {
            addLog('Activity Failed', `Scored ${score}/100 (needed ${passingScore}). Generating remedial activity.`);
        }
    };

    const handleRetry = async () => {
        if (activityScore === null || !activeLesson) return;
        setShowActivityResult(false);
        setActivityScore(null);
        setActivityFeedback(null);
        await retryLesson(activeLesson.id, activityScore);
    };

    const handleContinue = () => {
        setShowActivityResult(false);
        setActivityScore(null);
        setActivityFeedback(null);
        // Move to the next lesson
        if (!isLastLesson) {
            setCurrentLessonIndex(currentLessonIndex + 1);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-65px)] bg-background">
            {/* Settings Modal */}
            <Dialog open={isEditing} onOpenChange={setIsEditing}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Course Settings</DialogTitle>
                        <DialogDescription>
                            Configure your course parameters. Note: Saving changes will regenerate your entire course roadmap.
                        </DialogDescription>
                    </DialogHeader>
                    <CourseEditor
                        isGenerating={isGenerating}
                        initialData={currentCourse}
                        embedded
                        onCancel={() => setIsEditing(false)}
                        onSave={async (data) => {
                            await deleteCurrentCourseAndRegenerate(data);
                            setIsEditing(false);
                        }}
                    />
                </DialogContent>
            </Dialog>

            {/* Secondary Header */}
            <div className="flex-none border-b border-border/40 bg-muted/20 px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-semibold truncate max-w-md">{currentCourse.title}</h1>
                    <div className="h-4 w-px bg-border/60" />
                    <div className="text-sm text-muted-foreground">
                        Lesson {currentLessonIndex + 1} of {currentCourse.roadmap.length}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="h-8">
                        <Settings className="w-3.5 h-3.5 mr-2" />
                        Course Settings
                    </Button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar - Roadmap (Left) */}
                <div className="w-80 flex-none border-r border-border/40 flex flex-col bg-muted/5">
                    <div className="p-4 border-b border-border/40">
                        <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Course Roadmap</h2>
                    </div>
                    <ScrollArea className="flex-1">
                        <div className="p-2 space-y-1">
                            {currentCourse.roadmap.map((roadmapItem, index) => {
                                const lesson = currentCourse.lessons.find(l => l.id === roadmapItem.id);
                                const isGenerated = lesson?.isGenerated || false;
                                const isCompleted = lesson?.isCompleted || false;
                                const isCurrent = index === currentLessonIndex;
                                return (
                                    <button
                                        key={roadmapItem.id}
                                        onClick={() => setCurrentLessonIndex(index)}
                                        className={`w-full text-left p-3 rounded-lg text-sm transition-all flex items-start gap-3 cursor-pointer ${isCurrent
                                            ? 'bg-primary/5 text-primary font-medium'
                                            : isCompleted
                                                ? 'text-muted-foreground hover:bg-muted/50'
                                                : isGenerated
                                                    ? 'text-foreground hover:bg-muted/50'
                                                    : 'text-muted-foreground/60 hover:bg-muted/30'
                                            }`}
                                    >
                                        <div className="mt-0.5 shrink-0">
                                            {isCompleted ? (
                                                <CheckCircle className="w-4 h-4 text-green-500" />
                                            ) : isCurrent && isGenerating && !isGenerated ? (
                                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                            ) : (
                                                <Circle className="w-4 h-4" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium leading-tight">
                                                {index + 1}. {roadmapItem.title}
                                            </div>
                                            {isCurrent && isGenerating && !isGenerated && (
                                                <div className="text-xs text-primary mt-1 italic flex items-center gap-1">
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                    Generating...
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </ScrollArea>
                </div>

                {/* Main Content - Lesson (Right) */}
                <div className="flex-1 flex flex-col bg-background relative overflow-hidden">
                    <ScrollArea className="flex-1">
                        <div className="max-w-4xl mx-auto py-12 px-8 md:px-12">
                            {activeLesson ? (
                                <motion.div
                                    key={activeLesson.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="space-y-8"
                                >
                                    <div className="space-y-4">
                                        <h2 className="text-4xl font-bold tracking-tight">{activeLesson.title}</h2>

                                        {activeLesson.learningObjectives && activeLesson.learningObjectives.length > 0 && (
                                            <div className="p-5 bg-primary/5 rounded-xl border border-primary/10 flex gap-4">
                                                <div className="mt-1">
                                                    <Target className="w-5 h-5 text-primary" />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-sm uppercase tracking-wide text-primary mb-1">Learning Objective</h3>
                                                    <p className="text-sm text-foreground/90 font-medium leading-relaxed">
                                                        {activeLesson.learningObjectives[0]}
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="prose prose-lg dark:prose-invert max-w-none prose-headings:scroll-mt-20 prose-a:text-primary hover:prose-a:text-primary/80">
                                        <ReactMarkdown
                                            components={{
                                                img: ({ node, ...props }) => {
                                                    if (!props.src) return null;
                                                    return (
                                                        <span className="block my-10 p-2 bg-muted/20 rounded-2xl border border-border/40 overflow-hidden shadow-sm">
                                                            <img
                                                                {...props}
                                                                className="w-full rounded-xl"
                                                                alt={props.alt || "Educational Visual"}
                                                            />
                                                        </span>
                                                    );
                                                }
                                            }}
                                        >
                                            {(activePage && activePage.content) ? activePage.content : "Generating content..."}
                                        </ReactMarkdown>
                                    </div>

                                    {/* Intermediate Page Activity (if any) */}
                                    {activePage && activePage.activity && !activeLesson.isCompleted && (
                                        <div className="mt-8 p-6 bg-muted/20 border border-border/40 rounded-xl">
                                            <h4 className="font-bold mb-4 flex items-center gap-2">
                                                <Sparkles className="w-4 h-4 text-primary" />
                                                Practice Check
                                            </h4>
                                            {completedPageActivities[activePage.id] ? (
                                                <div className="text-green-500 font-medium flex items-center gap-2">
                                                    <CheckCircle className="w-5 h-5" /> Completed!
                                                </div>
                                            ) : (
                                                <ActivityRenderer
                                                    activity={activePage.activity}
                                                    onComplete={handlePageActivityComplete}
                                                    learningObjectives={activeLesson.learningObjectives}
                                                    prePrompts={currentCourse.prePrompts}
                                                />
                                            )}
                                        </div>
                                    )}

                                    {/* Pagination Controls */}
                                    {pages.length > 1 && !activeLesson.isCompleted && (
                                        <div className="flex justify-between items-center py-6 border-t border-border/20">
                                            <Button
                                                variant="outline"
                                                onClick={() => setCurrentPageIndex(Math.max(0, currentPageIndex - 1))}
                                                disabled={currentPageIndex === 0}
                                            >
                                                Previous Page
                                            </Button>
                                            <div className="text-sm text-muted-foreground">
                                                Page {currentPageIndex + 1} of {pages.length}
                                            </div>
                                            <Button
                                                onClick={() => setCurrentPageIndex(Math.min(pages.length - 1, currentPageIndex + 1))}
                                                disabled={isLastPage || (activePage?.activity != null && !completedPageActivities[activePage.id])}
                                            >
                                                Next Page
                                            </Button>
                                        </div>
                                    )}



                                    {/* Final Assessment Section (Only on Last Page) */}
                                    {isLastPage && !activeLesson.isCompleted && !showActivityResult && (
                                        <div className="mt-12 pt-10 border-t border-border/40">
                                            {activeLesson.assessment ? (
                                                <div className="space-y-6">
                                                    <div className="flex items-center gap-2">
                                                        <Sparkles className="w-5 h-5 text-primary" />
                                                        <h3 className="text-2xl font-bold">Final Assessment</h3>
                                                        {activeLesson.attempts && activeLesson.attempts > 0 && (
                                                            <span className="text-sm font-medium bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                                                                Attempt {activeLesson.attempts + 1}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {isGenerating ? (
                                                        <div className="flex flex-col items-center justify-center py-20 space-y-4 bg-muted/10 rounded-2xl border border-dashed">
                                                            <Loader2 className="w-10 h-10 animate-spin text-primary" />
                                                            <p className="font-medium text-muted-foreground">Tailoring an assessment for you...</p>
                                                        </div>
                                                    ) : (
                                                        <ActivityRenderer
                                                            activity={activeLesson.assessment}
                                                            onComplete={handleActivityComplete}
                                                            learningObjectives={activeLesson.learningObjectives}
                                                            prePrompts={currentCourse.prePrompts}
                                                        />
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center py-16 px-8 text-center bg-primary/5 rounded-3xl border border-primary/10">
                                                    <div className="p-4 bg-primary/10 rounded-2xl mb-6">
                                                        <Sparkles className="w-10 h-10 text-primary" />
                                                    </div>
                                                    <h3 className="text-2xl font-bold mb-3">Ready for the Final Assessment?</h3>
                                                    <p className="text-muted-foreground max-w-lg mb-8 text-lg">
                                                        Generate a final project that tests these concepts in a customized real-world scenario.
                                                    </p>
                                                    <Button
                                                        onClick={() => triggerAssessmentGeneration(activeLesson.id)}
                                                        disabled={isGenerating || (activePage?.activity != null && !completedPageActivities[activePage!.id])}
                                                        size="lg"
                                                        className="h-14 px-8 text-lg rounded-xl shadow-lg shadow-primary/20"
                                                    >
                                                        {isGenerating ? (
                                                            <>
                                                                <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                                                                Generating...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Sparkles className="w-5 h-5 mr-3" />
                                                                Generate Final Assessment
                                                            </>
                                                        )}
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Activity Result */}
                                    {showActivityResult && activityScore !== null && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="mt-12"
                                        >
                                            <div className={`p-8 rounded-3xl border-2 ${activityScore >= passingScore
                                                ? 'bg-green-500/5 border-green-500/20'
                                                : 'bg-orange-500/5 border-orange-500/20'
                                                }`}>
                                                <div className="flex flex-col md:flex-row gap-8">
                                                    <div className="flex-none flex items-center justify-center w-32 h-32 rounded-2xl bg-background shadow-xl border border-border/40">
                                                        <div className="text-center">
                                                            <div className="text-4xl font-bold">{activityScore}%</div>
                                                            <div className="text-xs uppercase font-bold text-muted-foreground mt-1">Score</div>
                                                        </div>
                                                    </div>

                                                    <div className="flex-1 space-y-4">
                                                        <h3 className="text-3xl font-bold">
                                                            {activityScore >= passingScore ? '🎉 Outstanding!' : '📚 Almost there!'}
                                                        </h3>

                                                        {activityFeedback && (
                                                            <div className="bg-background/80 p-5 rounded-xl text-foreground/90 text-lg leading-relaxed shadow-sm border border-border/20">
                                                                {activityFeedback}
                                                            </div>
                                                        )}

                                                        <div className="flex gap-4 pt-4">
                                                            {activityScore >= passingScore ? (
                                                                <>
                                                                    {isGenerating ? (
                                                                        <div className="flex items-center gap-3 px-6 py-3 bg-muted rounded-xl text-muted-foreground animate-pulse">
                                                                            <Loader2 className="w-5 h-5 animate-spin" />
                                                                            <span className="font-semibold">Preparing your next lesson...</span>
                                                                        </div>
                                                                    ) : isLastLesson ? (
                                                                        <Button size="lg" onClick={() => setAppState('COURSES')} className="rounded-xl h-12 px-8">
                                                                            Complete Course & Return
                                                                        </Button>
                                                                    ) : (
                                                                        <Button size="lg" onClick={handleContinue} className="rounded-xl h-12 px-8 shadow-lg shadow-primary/20">
                                                                            Continue to Next Lesson
                                                                        </Button>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                <Button size="lg" onClick={handleRetry} className="rounded-xl h-12 px-8">
                                                                    Re-try with New Exercise
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* Completed Lesson */}
                                    {activeLesson.isCompleted && !showActivityResult && (
                                        <div className="mt-12 pt-10 border-t border-border/40 flex flex-col items-center">
                                            <div className="flex items-center gap-2 text-green-500 font-bold text-xl mb-6">
                                                <CheckCircle className="w-6 h-6" />
                                                <span>Lesson Completed ({activeLesson.comprehensionScore}%)</span>
                                            </div>
                                            {!isLastLesson && (
                                                <Button
                                                    onClick={() => setCurrentLessonIndex(currentLessonIndex + 1)}
                                                    variant="outline"
                                                    size="lg"
                                                    className="h-12 px-10 rounded-xl"
                                                >
                                                    Move to Next Lesson
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </motion.div>
                            ) : activeLessonRoadmap ? (
                                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8">
                                    {isGenerating ? (
                                        <>
                                            <div className="relative">
                                                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
                                                <Loader2 className="w-20 h-20 animate-spin text-primary relative z-10" />
                                            </div>
                                            <div className="space-y-3">
                                                <h3 className="text-3xl font-bold tracking-tight">Generating Lesson</h3>
                                                <p className="text-xl text-muted-foreground max-w-md mx-auto">
                                                    We're building "{activeLessonRoadmap.title}" specifically for your learning journey.
                                                </p>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="p-6 bg-muted rounded-3xl">
                                                <BookOpen className="w-16 h-16 text-muted-foreground/40" />
                                            </div>
                                            <div className="space-y-4">
                                                <h3 className="text-3xl font-bold">{activeLessonRoadmap.title}</h3>
                                                <p className="text-xl text-muted-foreground max-w-lg mx-auto">
                                                    This lesson is waiting for you. Complete the previous material to unlock your next challenge.
                                                </p>
                                                <div className="pt-6">
                                                    {((currentLessonIndex > 0 && currentCourse.lessons[currentLessonIndex - 1]?.isCompleted) || currentLessonIndex === 0) && (
                                                        <Button
                                                            onClick={() => {
                                                                if (currentLessonIndex === 0) {
                                                                    generateNextLesson(100);
                                                                } else {
                                                                    generateNextLesson(currentCourse.lessons[currentLessonIndex - 1].comprehensionScore || 100);
                                                                }
                                                            }}
                                                            size="lg"
                                                            className="h-14 px-10 rounded-xl text-lg"
                                                        >
                                                            Unlock Lesson Now
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground text-xl">
                                    No lesson content available.
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>
            </div>
        </div>
    );
}
