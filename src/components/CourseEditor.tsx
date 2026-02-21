import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CardContent } from '@/components/ui/card';
import { ArrowLeft, Plus, X, Upload, Download } from 'lucide-react';
import type { Course } from '@/types';

interface CourseEditorProps {
    initialData?: Partial<Course>;
    onSave: (courseData: Partial<Course>) => void;
    onCancel: () => void;
    isGenerating?: boolean;
    embedded?: boolean;
}

export function CourseEditor({ initialData, onSave, onCancel, isGenerating, embedded }: CourseEditorProps) {
    const [courseData, setCourseData] = useState<Partial<Course>>({
        title: '',
        description: '',
        prePrompts: '',
        learningObjectives: [],
        ...initialData
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Update local state if initialData changes (e.g. re-opening editor)
    useEffect(() => {
        if (initialData) {
            setCourseData(prev => ({ ...prev, ...initialData }));
        }
    }, [initialData]);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target?.result as string);
                // Validate basic structure - allow importing both Course and SavedCourse structures
                const importedCourse = json.course || json;

                if (importedCourse.title || importedCourse.name) {
                    setCourseData({
                        title: importedCourse.title || importedCourse.name,
                        description: importedCourse.description || '',
                        prePrompts: importedCourse.prePrompts || '',
                        learningObjectives: importedCourse.learningObjectives || importedCourse.lessonPrompts || []
                    });
                } else {
                    alert('Invalid course file format');
                }
            } catch (error) {
                console.error('Error parsing JSON', error);
                alert('Error parsing JSON file');
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // Reset input
    };

    const addLearningObjective = () => {
        setCourseData(prev => ({
            ...prev,
            learningObjectives: [...(prev.learningObjectives || []), '']
        }));
    };

    const updateLearningObjective = (index: number, value: string) => {
        setCourseData(prev => {
            const newObjectives = [...(prev.learningObjectives || [])];
            newObjectives[index] = value;
            return { ...prev, learningObjectives: newObjectives };
        });
    };

    const removeLearningObjective = (index: number) => {
        setCourseData(prev => {
            const newObjectives = [...(prev.learningObjectives || [])];
            newObjectives.splice(index, 1);
            return { ...prev, learningObjectives: newObjectives };
        });
    };

    const isValid = courseData.title && courseData.description;

    return (
        <div className={embedded ? "space-y-6" : "max-w-4xl mx-auto p-4 space-y-6"}>
            {!embedded && (
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" onClick={onCancel}>
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back
                        </Button>
                        <h1 className="text-2xl font-bold">
                            {initialData?.title ? 'Edit Course Settings' : 'Create New Course'}
                        </h1>
                    </div>
                    {!initialData?.id && (
                        <div className="text-muted-foreground text-sm">
                            Fill out the details below to start your journey.
                        </div>
                    )}
                </div>
            )}

            <div className={embedded ? "" : "border rounded-xl bg-card text-card-foreground shadow"}>
                <CardContent className="space-y-4 pt-6">
                    {!initialData?.id && (
                        <div className="flex justify-end mb-4">
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept=".json"
                                onChange={handleImportFile}
                            />
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleImportClick}
                                className="h-8 text-xs bg-primary/5 hover:bg-primary/10 border-primary/20"
                            >
                                <Upload className="w-3.5 h-3.5 mr-2" />
                                Import Course JSON
                            </Button>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Course Title (Required)</label>
                        <Input
                            value={courseData.title || ''}
                            onChange={(e) => setCourseData({ ...courseData, title: e.target.value })}
                            placeholder="e.g., Python for Data Science"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Description (Required)</label>
                        <Textarea
                            value={courseData.description || ''}
                            onChange={(e) => setCourseData({ ...courseData, description: e.target.value })}
                            placeholder="Describe what you want to learn..."
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Course Pre-Prompts</label>
                        <p className="text-xs text-muted-foreground">
                            Detailed instructions injected into the system prompt when generating the course roadmap.
                        </p>
                        <Textarea
                            className="min-h-[100px] font-mono text-sm"
                            value={courseData.prePrompts || ''}
                            onChange={(e) => setCourseData({ ...courseData, prePrompts: e.target.value })}
                            placeholder="e.g., Focus on practical examples. Ensure the tone is professional."
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Learning Objectives</label>
                        <p className="text-xs text-muted-foreground">
                            Specific learning objectives for each lesson. The number of objectives determines the number of lessons.
                        </p>

                        <div className="space-y-3">
                            {(courseData.learningObjectives || []).map((objective, index) => (
                                <div key={index} className="flex gap-2">
                                    <Textarea
                                        className="font-mono text-sm min-h-[60px]"
                                        value={objective}
                                        onChange={(e) => updateLearningObjective(index, e.target.value)}
                                        placeholder={`Learning Objective #${index + 1}`}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeLearningObjective(index)}
                                        className="text-muted-foreground hover:text-destructive self-start"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={addLearningObjective}
                                className="w-full border-dashed"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Learning Objective
                            </Button>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
                        {isValid && (
                            <Button variant="outline" onClick={() => {
                                const settingsToExport = {
                                    title: courseData.title,
                                    description: courseData.description,
                                    prePrompts: courseData.prePrompts,
                                    learningObjectives: courseData.learningObjectives
                                };
                                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(settingsToExport, null, 2));
                                const downloadAnchorNode = document.createElement('a');
                                downloadAnchorNode.setAttribute("href", dataStr);
                                downloadAnchorNode.setAttribute("download", `${(courseData.title || 'course_settings').replace(/\s+/g, '_')}_settings.json`);
                                document.body.appendChild(downloadAnchorNode);
                                downloadAnchorNode.click();
                                downloadAnchorNode.remove();
                            }}>
                                <Download className="w-4 h-4 mr-2" />
                                Export Settings
                            </Button>
                        )}
                        <Button
                            onClick={() => {
                                if (initialData?.id) {
                                    if (confirm("Are you sure? This will delete all existing progress and lessons for this course and generate a new version based on these settings.")) {
                                        onSave(courseData);
                                    }
                                } else {
                                    onSave(courseData);
                                }
                            }}
                            disabled={!isValid || isGenerating}
                        >
                            {isGenerating ? 'Generating...' : (initialData?.id ? 'Save and Regenerate Course' : 'Create & Generate Course')}
                        </Button>
                    </div>
                </CardContent>
            </div>
        </div>
    );
}
