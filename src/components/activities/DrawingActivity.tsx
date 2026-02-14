import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Send, Trash2 } from 'lucide-react';
import type { DrawingConfig } from '@/types';
import { GenAIService } from '@/services/GenAIService';
import { useAppStore } from '@/store/useAppStore';

interface DrawingActivityProps {
    config: DrawingConfig;
    onComplete: (score: number, feedback?: string) => void;
}

export function DrawingActivity({ config, onComplete }: DrawingActivityProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [score, setScore] = useState<number | null>(null);
    const { settings } = useAppStore();
    const [hasDrawn, setHasDrawn] = useState(false);

    // Canvas setup
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size
        const parent = canvas.parentElement;
        if (parent) {
            canvas.width = parent.clientWidth;
            canvas.height = 400;
        }

        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Default style
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }, []);

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        if (score !== null) return;
        setIsDrawing(true);
        setHasDrawn(true);
        draw(e);
    };

    const stopDrawing = () => {
        setIsDrawing(false);
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx?.beginPath();
        }
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing || score !== null) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        let x, y;

        if ('touches' in e) {
            x = e.touches[0].clientX - rect.left;
            y = e.touches[0].clientY - rect.top;
        } else {
            x = (e as React.MouseEvent).clientX - rect.left;
            y = (e as React.MouseEvent).clientY - rect.top;
        }

        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        setHasDrawn(false);
    };

    const handleSubmit = async () => {
        if (!hasDrawn) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        setIsSubmitting(true);
        try {
            const service = GenAIService.getInstance();
            service.setApiKey(settings.apiKey);

            // Get base64 image
            const imageBase64 = canvas.toDataURL('image/jpeg').split(',')[1];

            // Construct submission object
            const submission = {
                type: 'drawing',
                prompt: config.prompt,
                image: imageBase64,
                referenceDescription: config.referenceDescription
            };

            const result = await service.assessActivity(
                submission,
                [] // Pass empty learning objectives for now as they are not passed to this component yet
            );


            setScore(result.score);
            setFeedback(result.feedback);
            onComplete(result.score, result.feedback);
        } catch (error) {
            console.error("Failed to assess drawing", error);
            setFeedback("Sorry, I couldn't assess your drawing right now. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <h3 className="text-lg font-medium">{config.prompt}</h3>

                <div className="relative border-2 border-dashed border-muted-foreground/20 rounded-xl overflow-hidden touch-none bg-white">
                    <canvas
                        ref={canvasRef}
                        onMouseDown={startDrawing}
                        onMouseUp={stopDrawing}
                        onMouseOut={stopDrawing}
                        onMouseMove={draw}
                        onTouchStart={startDrawing}
                        onTouchEnd={stopDrawing}
                        onTouchMove={draw}
                        className="w-full h-[400px] cursor-crosshair"
                    />

                    {!score && (
                        <div className="absolute top-4 right-4 flex gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={clearCanvas}
                                className="bg-background/80 backdrop-blur hover:bg-background"
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Clear
                            </Button>
                        </div>
                    )}
                </div>

                <p className="text-xs text-muted-foreground text-center">
                    Draw your answer in the box above
                </p>
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
                    disabled={!hasDrawn || isSubmitting}
                    className="w-full"
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Analyzing Drawing...
                        </>
                    ) : (
                        <>
                            <Send className="w-4 h-4 mr-2" />
                            Submit Drawing
                        </>
                    )}
                </Button>
            )}
        </div>
    );
}
