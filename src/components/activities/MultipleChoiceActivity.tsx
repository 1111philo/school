import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { MultipleChoiceConfig } from '@/types';
import { CheckCircle, XCircle, Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';

interface MultipleChoiceActivityProps {
    config: MultipleChoiceConfig;
    onComplete: (score: number, feedback?: string) => void;
}

export function MultipleChoiceActivity({ config, onComplete }: MultipleChoiceActivityProps) {
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
    const [showFeedback, setShowFeedback] = useState(false);
    const [correctCount, setCorrectCount] = useState(0);
    const [missedQuestions, setMissedQuestions] = useState<number[]>([]);
    const { currentCourse, currentLessonIndex, generateNextLesson, isGenerating } = useAppStore();

    const handleRegenerate = async () => {
        if (!currentCourse) return;
        // Regenerate the current lesson by passing the previous lesson's score (or 100 for first lesson)
        const prevScore = currentLessonIndex > 0
            ? currentCourse.lessons[currentLessonIndex - 1]?.comprehensionScore || 100
            : 100;
        await generateNextLesson(prevScore);
    };

    if (!config.questions || config.questions.length === 0) {
        return (
            <Card className="p-8 text-center space-y-4 bg-muted/20 border-dashed">
                <p className="text-muted-foreground font-medium">
                    This activity structure was malformed during generation.
                </p>
                <Button
                    variant="outline"
                    onClick={handleRegenerate}
                    disabled={isGenerating}
                    className="gap-2"
                >
                    {isGenerating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Sparkles className="w-4 h-4" />
                    )}
                    Regenerate Activity
                </Button>
            </Card>
        );
    }

    const currentQuestion = config.questions[currentQuestionIndex];

    if (!currentQuestion) return null;

    const isLastQuestion = currentQuestionIndex === config.questions.length - 1;
    const isCorrect = selectedAnswer === currentQuestion.correctIndex;

    const handleSubmit = () => {
        if (selectedAnswer === null) return;

        setShowFeedback(true);
        if (isCorrect) {
            setCorrectCount(prev => prev + 1);
        } else {
            setMissedQuestions(prev => [...prev, currentQuestionIndex]);
        }
    };

    const handleNext = () => {
        if (isLastQuestion) {
            const finalScore = Math.round(((correctCount + (isCorrect ? 1 : 0)) / config.questions.length) * 100);

            let feedback = "";
            if (missedQuestions.length > 0 || !isCorrect) {
                const allMissed = [...missedQuestions];
                if (!isCorrect && !allMissed.includes(currentQuestionIndex)) {
                    allMissed.push(currentQuestionIndex);
                }

                if (allMissed.length > 0) {
                    feedback = "Key points to review:\n\n" + allMissed.map(idx =>
                        `- ${config.questions[idx].explanation}`
                    ).join('\n');
                }
            }

            onComplete(finalScore, feedback);
        } else {
            setCurrentQuestionIndex(prev => prev + 1);
            setSelectedAnswer(null);
            setShowFeedback(false);
        }
    };

    return (
        <Card className="p-6 bg-background/60 backdrop-blur-md border-primary/10">
            <div className="space-y-6">
                {/* Progress */}
                <div className="flex justify-between items-center text-sm text-muted-foreground">
                    <span>Question {currentQuestionIndex + 1} of {config.questions.length}</span>
                    <span>{correctCount} correct</span>
                </div>

                {/* Question */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentQuestionIndex}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-4"
                    >
                        <h3 className="text-lg font-semibold">{currentQuestion.question}</h3>

                        {/* Options */}
                        <div className="space-y-2">
                            {currentQuestion.options.map((option, index) => (
                                <button
                                    key={index}
                                    onClick={() => !showFeedback && setSelectedAnswer(index)}
                                    disabled={showFeedback}
                                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${selectedAnswer === index
                                        ? showFeedback
                                            ? index === currentQuestion.correctIndex
                                                ? 'border-green-500 bg-green-500/10'
                                                : 'border-red-500 bg-red-500/10'
                                            : 'border-primary bg-primary/5'
                                        : showFeedback && index === currentQuestion.correctIndex
                                            ? 'border-green-500 bg-green-500/10'
                                            : 'border-border hover:border-primary/50'
                                        } ${showFeedback ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span>{option}</span>
                                        {showFeedback && (
                                            <>
                                                {index === currentQuestion.correctIndex && (
                                                    <CheckCircle className="w-5 h-5 text-green-500" />
                                                )}
                                                {selectedAnswer === index && index !== currentQuestion.correctIndex && (
                                                    <XCircle className="w-5 h-5 text-red-500" />
                                                )}
                                            </>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* Feedback */}
                        {showFeedback && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`p-4 rounded-lg ${isCorrect ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'
                                    }`}
                            >
                                <p className={`font-medium mb-2 ${isCorrect ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                    {isCorrect ? '✓ Correct!' : '✗ Incorrect'}
                                </p>
                                <p className="text-sm">
                                    {currentQuestion.explanation.replace(/^(That's right|Correct|Yes|Exactly|Great job)[!,.]?\s*/i, '')}
                                </p>
                            </motion.div>
                        )}
                    </motion.div>
                </AnimatePresence>

                {/* Actions */}
                <div className="flex justify-end gap-2">
                    {!showFeedback ? (
                        <Button onClick={handleSubmit} disabled={selectedAnswer === null}>
                            Submit Answer
                        </Button>
                    ) : (
                        <Button onClick={handleNext}>
                            {isLastQuestion ? 'Complete Activity' : 'Next Question'}
                        </Button>
                    )}
                </div>
            </div>
        </Card>
    );
}
