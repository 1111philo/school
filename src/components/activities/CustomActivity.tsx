import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import type { CustomCodeConfig } from '@/types';
import { GenAIService } from '@/services/GenAIService';
import { useAppStore } from '@/store/useAppStore';

interface CustomActivityProps {
    config: CustomCodeConfig;
    onComplete: (score: number, feedback: string) => void;
    learningObjectives?: string[];
}

export function CustomActivity({ config, onComplete, learningObjectives }: CustomActivityProps) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isAssessing, setIsAssessing] = useState(false);
    const { settings } = useAppStore();

    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            if (event.data?.type === 'ACTIVITY_SUBMIT') {
                setIsAssessing(true);
                try {
                    const submissionData = event.data.data;
                    const service = GenAIService.getInstance();
                    service.setApiKey(settings.apiKey);

                    const result = await service.assessActivity(submissionData, learningObjectives);
                    onComplete(result.score, result.feedback);
                } catch (error) {
                    console.error("Assessment failed", error);
                    // Handle error (maybe show a toast or retry button)
                } finally {
                    setIsAssessing(false);
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [onComplete, learningObjectives, settings.apiKey]);

    useEffect(() => {
        if (iframeRef.current) {
            const doc = iframeRef.current.contentDocument;
            if (doc) {
                doc.open();
                doc.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>${config.css}</style>
                    </head>
                    <body>
                        ${config.html}
                        <script>
                            ${config.js}
                        </script>
                    </body>
                    </html>
                `);
                doc.close();
            }
        }
    }, [config]);

    return (
        <div className="space-y-4">
            <div className="p-4 bg-muted/30 rounded-lg">
                <h4 className="font-semibold mb-2">Instructions</h4>
                <p>{config.instructions}</p>
            </div>

            <Card className="overflow-hidden border-2 h-[500px] relative">
                {isAssessing && (
                    <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10 backdrop-blur-sm">
                        <div className="text-center">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
                            <p className="font-medium">Assessing your work...</p>
                        </div>
                    </div>
                )}
                <iframe
                    ref={iframeRef}
                    title="Interactive Activity"
                    className="w-full h-full border-0"
                    sandbox="allow-scripts allow-forms allow-same-origin" // allow-same-origin needed for some interactions, but verify security profile
                />
            </Card>
        </div>
    );
}
