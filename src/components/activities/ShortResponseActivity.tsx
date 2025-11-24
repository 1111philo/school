import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Loader2, Send } from 'lucide-react';
import type { ShortResponseConfig } from '@/types';
import { GenAIService } from '@/services/GenAIService';
import { useAppStore } from '@/store/useAppStore';

interface ShortResponseActivityProps {
    config: ShortResponseConfig;
    onComplete: (score: number, feedback?: string) => void;
}

export function ShortResponseActivity({ config, onComplete }: ShortResponseActivityProps) {
    const [response, setResponse] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [score, setScore] = useState<number | null>(null);
    const { settings } = useAppStore();

    const handleSubmit = async () => {
        if (!response.trim()) return;

        setIsSubmitting(true);
        try {
            const service = GenAIService.getInstance();
            service.setApiKey(settings.apiKey);

            const result = await service.assessActivity(
                'short-response',
                config.question,
                response,
                config.rubric
            );

            setScore(result.score);
            setFeedback(result.feedback);
            onComplete(result.score, result.feedback);
        } catch (error) {
            console.error("Failed to assess response", error);
            setFeedback("Sorry, I couldn't assess your response right now. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <h3 className="text-lg font-medium">{config.question}</h3>
                <Textarea
                    placeholder="Type your answer here..."
                    value={response}
                    onChange={(e) => setResponse(e.target.value)}
                    className="min-h-[150px] resize-none text-base"
                    disabled={isSubmitting || score !== null}
                />
            </div>

            {feedback && (
                <Card className={`p-4 ${score && score >= 70 ? 'bg-green-500/10 border-green-500/20' : 'bg-orange-500/10 border-orange-500/20'}`}>
                    <h4 className="font-semibold mb-2">Feedback</h4>
                    <p className="text-sm">{feedback}</p>
                    {score !== null && (
                        <p className="mt-2 font-bold">Score: {score}%</p>
                    )}
                </Card>
            )}

            {!score && (
                <Button
                    onClick={handleSubmit}
                    disabled={!response.trim() || isSubmitting}
                    className="w-full"
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Assessing...
                        </>
                    ) : (
                        <>
                            <Send className="w-4 h-4 mr-2" />
                            Submit Answer
                        </>
                    )}
                </Button>
            )}
        </div>
    );
}
