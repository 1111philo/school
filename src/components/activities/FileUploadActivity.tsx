import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Loader2, Send, Upload, FileText, CheckCircle } from 'lucide-react';
import type { FileUploadConfig } from '@/types';
import { GenAIService } from '@/services/GenAIService';
import { useAppStore } from '@/store/useAppStore';
import ReactMarkdown from 'react-markdown';

interface FileUploadActivityProps {
    config: FileUploadConfig;
    onComplete: (score: number, feedback?: string) => void;
    learningObjectives?: string[];
    prePrompts?: string;
}

export function FileUploadActivity({ config, onComplete, learningObjectives, prePrompts }: FileUploadActivityProps) {
    const [textResponse, setTextResponse] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [fileBase64, setFileBase64] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [score, setScore] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);

            // Convert to base64
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
                const base64js_compatible = base64String.split(',')[1];
                setFileBase64(base64js_compatible);
            };
            reader.readAsDataURL(selectedFile);
        }
    };

    const handleSubmit = async () => {
        if (!textResponse.trim() && !file) return;

        setIsSubmitting(true);
        try {
            const service = GenAIService.getInstance();
            service.setApiKey(useAppStore.getState().settings.apiKey);

            // Construct submission object
            const submission = {
                type: 'file-upload',
                title: config.title,
                textResponse: textResponse,
                fileName: file ? file.name : null,
                fileType: file ? file.type : null,
                fileContent: fileBase64, // Base64 content if image
            };

            const result = await service.assessActivity(
                submission,
                learningObjectives,
                { prePrompts }
            );

            setScore(result.score);
            setFeedback(result.feedback);
            onComplete(result.score, result.feedback);
        } catch (error) {
            console.error('Failed to submit proof of work:', error);
            setFeedback("Sorry, I couldn't assess your submission right now. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <h3 className="text-xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                    {config.title}
                </h3>

                <div className="prose dark:prose-invert max-w-none bg-muted/30 p-4 rounded-lg border border-border/50">
                    <ReactMarkdown>{config.instructions}</ReactMarkdown>
                </div>

                <div className="grid gap-6 md:grid-cols-2 mt-6">
                    {/* Text Input Section */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-2">
                            <FileText className="w-4 h-4 text-primary" />
                            Description / Reflection
                        </label>
                        <Textarea
                            placeholder="Describe your work, steps taken, or paste a link (URL) to your portfolio/site here..."
                            value={textResponse}
                            onChange={(e) => setTextResponse(e.target.value)}
                            className="min-h-[200px] resize-none text-base"
                            disabled={isSubmitting || score !== null}
                        />
                    </div>

                    {/* File Upload Section */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-2">
                            <Upload className="w-4 h-4 text-primary" />
                            Upload Evidence (PNG or JPG)
                        </label>
                        <div
                            className={`border-2 border-dashed rounded-xl h-[200px] flex flex-col items-center justify-center p-6 transition-colors ${file ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/20 hover:border-primary/30'
                                }`}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden"
                                accept="image/png,image/jpeg"
                                disabled={isSubmitting || score !== null}
                            />

                            {file ? (
                                <div className="text-center space-y-2">
                                    <CheckCircle className="w-8 h-8 text-green-500 mx-auto" />
                                    <p className="font-medium truncate max-w-[200px]">{file.name}</p>
                                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                                    {!score && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => { setFile(null); setFileBase64(null); }}
                                            className="text-destructive hover:text-destructive"
                                        >
                                            Remove
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center space-y-3">
                                    <div className="p-3 bg-background rounded-full shadow-sm inline-block">
                                        <Upload className="w-6 h-6 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <Button
                                            variant="secondary"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={isSubmitting || score !== null}
                                        >
                                            Choose Image
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Supports PNG and JPG
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
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
                    disabled={(!textResponse.trim() && !file) || isSubmitting}
                    className="w-full h-12 text-lg"
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            Assessing Submission...
                        </>
                    ) : (
                        <>
                            <Send className="w-5 h-5 mr-2" />
                            Submit Proof of Work
                        </>
                    )}
                </Button>
            )}
        </div>
    );
}
