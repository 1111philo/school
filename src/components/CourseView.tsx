import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle, Circle, ArrowLeft, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import { ActivityRenderer } from './activities/ActivityRenderer';

export function CourseView() {
    const { currentCourse, currentLessonIndex, completeLesson, generateNextLesson, retryLesson, addLog, setAppState, setCurrentLessonIndex, isGenerating } = useAppStore();
    const [activityScore, setActivityScore] = useState<number | null>(null);
    const [activityFeedback, setActivityFeedback] = useState<string | null>(null);
    const [showActivityResult, setShowActivityResult] = useState(false);

    // Reset state when changing lessons
    useEffect(() => {
        setActivityScore(null);
        setActivityFeedback(null);
        setShowActivityResult(false);
    }, [currentLessonIndex]);


    if (!currentCourse) return null;

    const activeLesson = currentCourse.lessons[currentLessonIndex];
    const activeLessonRoadmap = currentCourse.roadmap[currentLessonIndex];
    const isLastLesson = currentLessonIndex >= currentCourse.roadmap.length - 1;
    const passingScore = activeLesson?.activity.passingScore || 70;

    const handleActivityComplete = async (score: number, feedback?: string) => {
        setActivityScore(score);
        if (feedback) setActivityFeedback(feedback);
        setShowActivityResult(true);

        const passed = score >= passingScore;

        if (passed) {
            // Mark lesson as complete
            completeLesson(activeLesson.id, score);
            addLog('Lesson Completed', `Scored ${score}/100 on ${activeLesson.title}`);

            // Generate next lesson if not the last
            if (!isLastLesson) {
                await generateNextLesson(score);
            }
        } else {
            addLog('Activity Failed', `Scored ${score}/100 (needed ${passingScore}). Generating remedial activity.`);
        }
    };

    const handleRetry = async () => {
        if (activityScore === null) return;
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
        <div className="max-w-6xl mx-auto space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <Button variant="ghost" onClick={() => setAppState('COURSES')}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Courses
                </Button>
                <div className="text-sm text-muted-foreground">
                    Lesson {currentLessonIndex + 1} of {currentCourse.roadmap.length}
                </div>
            </div>

            {/* Course Info */}
            <div className="mb-6">
                <h1 className="text-3xl font-bold mb-2">{currentCourse.title}</h1>
                <p className="text-muted-foreground">{currentCourse.description}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Sidebar - Roadmap */}
                <Card className="md:col-span-1 bg-background/60 backdrop-blur-md border-primary/10 shadow-lg p-4 flex flex-col max-h-[70vh]">
                    <h2 className="font-bold text-lg mb-4 text-primary">Course Roadmap</h2>
                    <ScrollArea className="flex-1">
                        <div className="space-y-2">
                            {currentCourse.roadmap.map((roadmapItem, index) => {
                                const lesson = currentCourse.lessons.find(l => l.id === roadmapItem.id);
                                const isGenerated = lesson?.isGenerated || false;
                                const isCompleted = lesson?.isCompleted || false;
                                const isCurrent = index === currentLessonIndex;
                                return (
                                    <button
                                        key={roadmapItem.id}
                                        onClick={() => setCurrentLessonIndex(index)}
                                        className={`w-full text-left p-3 rounded-lg text-sm transition-all flex items-start gap-3 cursor-pointer hover:bg-muted/50 ${isCurrent
                                            ? 'bg-primary/10 text-primary font-medium hover:bg-primary/20'
                                            : isCompleted
                                                ? 'text-muted-foreground'
                                                : isGenerated
                                                    ? 'text-foreground'
                                                    : 'text-muted-foreground/60'
                                            }`}
                                    >
                                        <div className="mt-0.5">
                                            {isCompleted ? (
                                                <CheckCircle className="w-4 h-4 text-green-500" />
                                            ) : isCurrent && isGenerating && !isGenerated ? (
                                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                            ) : (
                                                <Circle className="w-4 h-4" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium truncate">
                                                {index + 1}. {roadmapItem.title}
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                {roadmapItem.description}
                                            </div>
                                            {isCurrent && isGenerating && !isGenerated && (
                                                <div className="text-xs text-primary mt-1 italic flex items-center gap-1">
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                    Generating...
                                                </div>
                                            )}
                                            {!isGenerated && index > currentLessonIndex && !isGenerating && (
                                                <div className="text-xs text-muted-foreground/70 mt-1 italic">
                                                    Not yet generated
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </ScrollArea>
                </Card>

                {/* Main Content - Lesson */}
                <Card className="md:col-span-3 bg-background/60 backdrop-blur-md border-primary/10 shadow-xl p-6 md:p-8 flex flex-col overflow-hidden max-h-[70vh]">
                    {activeLesson ? (
                        <div className="flex flex-col h-full">
                            <ScrollArea className="flex-1 pr-6">
                                <motion.div
                                    key={activeLesson.id}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="space-y-6"
                                >
                                    <div className="prose dark:prose-invert max-w-none">
                                        <h2>{activeLesson.title}</h2>
                                        <ReactMarkdown>{activeLesson.content}</ReactMarkdown>

                                        {activeLesson.visualExplanation && (
                                            <div className="my-6 p-4 bg-muted/30 rounded-lg border border-border/40">
                                                <p className="text-sm text-muted-foreground mb-2">Visual Explanation:</p>
                                                <img
                                                    src={activeLesson.visualExplanation}
                                                    alt={`Visual explanation for ${activeLesson.title}`}
                                                    className="w-full rounded-lg"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Activity Section */}
                                    {!activeLesson.isCompleted && !showActivityResult && activeLesson.activity && (
                                        <div className="mt-8 pt-6 border-t border-border/40">
                                            <h3 className="text-lg font-semibold mb-4">
                                                Interactive Activity{activeLesson.attempts && activeLesson.attempts > 0 && (
                                                    <span className="text-sm text-muted-foreground ml-2">
                                                        (Attempt {activeLesson.attempts + 1})
                                                    </span>
                                                )}
                                            </h3>
                                            {isGenerating ? (
                                                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                                                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                                    <p className="text-muted-foreground">Creating a new learning activity for you...</p>
                                                </div>
                                            ) : (
                                                <ActivityRenderer
                                                    activity={activeLesson.activity}
                                                    onComplete={handleActivityComplete}
                                                />
                                            )}
                                        </div>
                                    )}

                                    {/* Activity Result */}
                                    {showActivityResult && activityScore !== null && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="mt-8 pt-6 border-t border-border/40"
                                        >
                                            <Card className={`p-6 ${activityScore >= passingScore
                                                ? 'bg-green-500/10 border-green-500/20'
                                                : 'bg-orange-500/10 border-orange-500/20'
                                                }`}>
                                                <h3 className="text-xl font-bold mb-2">
                                                    {activityScore >= passingScore ? '🎉 Great Job!' : '📚 Keep Learning'}
                                                </h3>
                                                <p className="text-lg mb-4">
                                                    You scored <strong>{activityScore}%</strong>
                                                    {activityScore >= passingScore
                                                        ? ' - You passed!'
                                                        : ` - You need ${passingScore}% to pass.`}
                                                </p>

                                                {activityFeedback && (
                                                    <div className="mb-6 p-4 bg-background/50 rounded-lg text-sm whitespace-pre-wrap">
                                                        {activityFeedback}
                                                    </div>
                                                )}

                                                {activityScore >= passingScore ? (
                                                    <>
                                                        {isGenerating ? (
                                                            <div className="flex items-center gap-2 text-muted-foreground">
                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                                <span>Generating your next lesson...</span>
                                                            </div>
                                                        ) : isLastLesson ? (
                                                            <div>
                                                                <p className="text-muted-foreground mb-4">
                                                                    You've completed the entire course!
                                                                </p>
                                                                <Button onClick={() => setAppState('COURSES')}>
                                                                    Back to Courses
                                                                </Button>
                                                            </div>
                                                        ) : (
                                                            <Button onClick={handleContinue}>
                                                                Continue to Next Lesson
                                                            </Button>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        <p className="text-sm text-muted-foreground mb-4">
                                                            Don't worry! We'll create a new activity that will help you learn this material better.
                                                        </p>
                                                        {isGenerating ? (
                                                            <div className="flex items-center gap-2 text-muted-foreground">
                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                                <span>Creating a new learning activity for you...</span>
                                                            </div>
                                                        ) : (
                                                            <Button onClick={handleRetry}>
                                                                Try New Activity
                                                            </Button>
                                                        )}
                                                    </>
                                                )}
                                            </Card>
                                        </motion.div>
                                    )}

                                    {/* Completed Lesson */}
                                    {activeLesson.isCompleted && !showActivityResult && (
                                        <div className="mt-8 pt-6 border-t border-border/40 text-center space-y-4">
                                            <p className="text-muted-foreground mb-4">
                                                ✓ Lesson completed with {activeLesson.comprehensionScore}%
                                            </p>
                                            {!isLastLesson && (
                                                <Button
                                                    onClick={() => setCurrentLessonIndex(currentLessonIndex + 1)}
                                                    variant="outline"
                                                >
                                                    Go to Next Lesson →
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </motion.div>
                            </ScrollArea>
                        </div>
                    ) : activeLessonRoadmap ? (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                            {isGenerating ? (
                                <>
                                    <Loader2 className="w-12 h-12 animate-spin text-primary" />
                                    <div>
                                        <h3 className="text-lg font-semibold mb-2">Generating: {activeLessonRoadmap.title}</h3>
                                        <p className="text-muted-foreground">
                                            Creating a personalized lesson based on your progress...
                                        </p>
                                        <p className="text-sm text-muted-foreground/70 mt-2">
                                            This may take a moment
                                        </p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <Circle className="w-12 h-12 text-muted-foreground" />
                                    <div>
                                        <h3 className="text-lg font-semibold mb-2">{activeLessonRoadmap.title}</h3>
                                        <p className="text-muted-foreground mb-4">
                                            This lesson hasn't been generated yet. Complete the previous lesson to unlock it.
                                        </p>
                                        {/* Allow manual generation if previous lesson is completed but this one isn't generated */}
                                        {currentLessonIndex > 0 && currentCourse.lessons[currentLessonIndex - 1]?.isCompleted && (
                                            <Button
                                                onClick={() => generateNextLesson(currentCourse.lessons[currentLessonIndex - 1].comprehensionScore || 100)}
                                                variant="default"
                                            >
                                                Generate Lesson
                                            </Button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                            No lesson available.
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
