import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Course, UserSettings, Lesson, LessonRoadmap, LessonActivity } from '../types';

export class GenAIService {
    private static instance: GenAIService;
    private genAI: GoogleGenerativeAI | null = null;

    private constructor() { }

    public static getInstance(): GenAIService {
        if (!GenAIService.instance) {
            GenAIService.instance = new GenAIService();
        }
        return GenAIService.instance;
    }

    public setApiKey(key: string) {
        this.genAI = new GoogleGenerativeAI(key);
    }

    async generateCourse(courseData: Partial<Course>, settings: UserSettings): Promise<{ course: Course; reasoning: string }> {
        if (!this.genAI) throw new Error("API Key not set");

        const model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `
        You are an expert curriculum designer.
        Student: ${settings.userName}.
        Topic: ${courseData.title || "General Interest"}
        Description: ${courseData.description || "No description provided"}
        
        ${courseData.prePrompts ? `### MANDATORY COURSE DESIGN GUIDELINES ###
        ${courseData.prePrompts}
        ##########################################` : ''}

        Goal: Create a personalized course roadmap with 3-5 lessons based on the topic and description provided.
        The course must be contextualized using the student's name and the specific details provided.
        Any tasks or learning objectives proposed MUST align with the MANDATORY COURSE DESIGN GUIDELINES above.
        
        IMPORTANT: Generate a complete roadmap of ALL lessons, but only generate the FIRST lesson in full detail.
        
        For the roadmap, provide for each lesson:
        - id (lesson-1, lesson-2, etc.)
        - title
        - description (2-3 sentences about what will be covered)
        - order (1, 2, 3, etc.)
        
        For the FIRST lesson only, provide:
        - Full content (markdown, 100-200 words MAX, clear and concise)
        - A list of 1-3 specific Learning Objectives for this lesson.
        - Keep it short and to the point - focus on ONE key concept
        - Do NOT generate an activity yet.
        
        Output JSON format:
        {
            "course": {
                "id": "course-${Date.now()}",
                "title": "Course Title",
                "description": "Course Description",
                "roadmap": [
                    {
                        "id": "lesson-1",
                        "title": "Lesson 1 Title",
                        "description": "What this lesson covers...",
                        "order": 1
                    }
                    // ... more lessons (3-5 total)
                ],
                "lessons": [
                    {
                        "id": "lesson-1",
                        "title": "Lesson 1 Title",
                        "content": "Full markdown content for lesson 1...",
                        "visualPrompt": "Description for a simple visual diagram/illustration to explain the key concept (will be used to generate an image)",
                        "learningObjectives": ["Objective 1", "Objective 2"],
                        "isCompleted": false,
                        "isGenerated": true,
                        "attempts": 0
                    }
                ]
            },
            "reasoning": "Explanation of course design and first lesson focus"
        }
        
        CRITICAL: Return ONLY valid JSON. No markdown code blocks.
        `;

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const jsonStr = jsonMatch ? jsonMatch[0] : text;
            let data = JSON.parse(jsonStr);

            // Robustness: Handle cases where AI returns the course object directly at the root
            if (!data.course && (data.roadmap || data.lessons)) {
                data = { course: data, reasoning: data.reasoning || "Generated roadmap" };
                delete data.course.reasoning; // Clean up if it was at the root
            }

            if (!data.course) {
                throw new Error("AI response did not contain course data.");
            }

            const course = data.course;
            course.id = courseData.id || `course-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            course.prePrompts = courseData.prePrompts;
            course.lessonPrompts = courseData.lessonPrompts;
            course.description = course.description || courseData.description;
            course.title = course.title || courseData.title;
            course.created = course.created || Date.now();

            // CRITICAL: Ensure the first lesson matches properly
            if (course.roadmap && course.roadmap.length > 0) {
                if (!course.lessons) {
                    course.lessons = [];
                }

                if (course.lessons.length > 0) {
                    course.lessons[0].id = course.roadmap[0].id;
                    course.lessons[0].isGenerated = true;
                }
            }

            return { course, reasoning: data.reasoning || "Generated curriculum structure" };
        } catch (e) {
            console.error("Failed to parse JSON", e);
            console.error("Raw Text was:", text);
            throw new Error(`Failed to generate course format: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
    }

    async generateNextLesson(
        courseContext: Course,
        previousLesson: Lesson | null,
        comprehensionScore: number,
        nextLessonRoadmap: LessonRoadmap,
        settings: UserSettings,
        lessonPrompts?: string[]
    ): Promise<{ lesson: Lesson; reasoning: string }> {
        if (!this.genAI) throw new Error("API Key not set");

        const performanceLevel = comprehensionScore < 70 ? 'struggling' : comprehensionScore < 85 ? 'adequate' : 'excellent';
        const previousLessonTitle = previousLesson ? previousLesson.title : "None (First Lesson)";

        const prompt = `
        You are an expert curriculum designer creating the next lesson in a course.
        
        Course: ${courseContext.title}
        Previous Lesson: ${previousLessonTitle}
        Student Performance: ${comprehensionScore}/100 (${performanceLevel})
        Student: ${settings.userName}
        
        - Title: ${nextLessonRoadmap.title}
        - Description: ${nextLessonRoadmap.description}

        ${courseContext.prePrompts ? `### MANDATORY COURSE DESIGN GUIDELINES ###
        ${courseContext.prePrompts}
        ##########################################` : ''}

        ${lessonPrompts && lessonPrompts.length > 0 ? `Additional Instructions (Lesson Prompts): ${lessonPrompts.join('\n')}` : ''}
        
            You are an expert educational content creator.
            Create the next lesson for the course "${courseContext.title}".
            
            Previous Lesson Context:
            - Title: ${previousLessonTitle}
            - Comprehension Score: ${comprehensionScore}%
            
            Next Lesson Roadmap Item:
            - Title: ${nextLessonRoadmap.title}
            - Description: ${nextLessonRoadmap.description}
            
            Generate a JSON object with the following structure:
            {
                "lesson": {
                    "id": "${nextLessonRoadmap.id}",
                    "title": "${nextLessonRoadmap.title}",
                    "content": "markdown content...",
                    "visualPrompt": "description for an image...",
                    "learningObjectives": ["Objective 1", "Objective 2"],
                    "isCompleted": false,
                    "isGenerated": true,
                    "attempts": 0
                },
                "reasoning": "How this lesson adapts to student's performance"
            }
            
            IMPORTANT:
            - Content should be engaging and educational.
            - Do NOT generate an activity.
            - Provide clear learning objectives.
            - Ensure the JSON is valid.
            `;

        const model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        try {
            console.log("Raw AI Response (Next Lesson):", text);
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const jsonStr = jsonMatch ? jsonMatch[0] : text;
            const data = JSON.parse(jsonStr);

            return data;
        } catch (e) {
            console.error("Failed to parse JSON", e);
            console.error("Raw Text was:", text);
            throw new Error("Failed to generate next lesson. Please try again.");
        }
    }

    async generateActivity(
        lesson: Lesson,
        settings: UserSettings,
        courseContext?: { prePrompts?: string }
    ): Promise<{ activity: LessonActivity; reasoning: string }> {
        if (!this.genAI) throw new Error("API Key not set");

        const prompt = `
        ${courseContext?.prePrompts ? `### MANDATORY COURSE DESIGN GUIDELINES ###
        ${courseContext.prePrompts}
        ##########################################` : ''}

        You are an expert educational curriculum designer.
        
        Lesson: ${lesson.title}
        Objectives: ${lesson.learningObjectives?.join(', ') || 'General understanding'}
        Student: ${settings.userName || 'Student'}
        
        TASK:
        Design a "Real World Application" challenge for the student to PROVE they understand the lesson objectives while ADHERING STRICTLY to the course design guidelines above.
        
        UI CONTEXT:
        The student will be presented with:
        1. A "Description / Reflection" text area (where they can explain their work or paste links).
        2. An "Upload Evidence" button (ONLY supports images: PNG or JPG).
        
        In your instructions, tell the user exactly what to type in the text area and what evidence to upload as a file.
        
        REQUIREMENTS:
        1.  Title: A catchy title.
        2.  Instructions: Clear, step-by-step instructions.
        3.  Guidelines Check: The activity MUST fulfill any requirements specified in the MANDATORY COURSE DESIGN GUIDELINES. If guidelines say "build a portfolio", the activity MUST contribute to that portfolio.
        
        Output JSON format:
        {
            "activity": {
                "type": "file-upload",
                "config": {
                    "title": "String",
                    "instructions": "Markdown String",
                    "allowedTypes": "any"
                },
                "passingScore": 70
            },
            "reasoning": "Explain EXACTLY how this activity fulfills BOTH the lesson objectives AND the MANDATORY COURSE DESIGN GUIDELINES."
        }
        
        CRITICAL: Return ONLY valid JSON.
        `;

        const model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const jsonStr = jsonMatch ? jsonMatch[0] : text;
            return JSON.parse(jsonStr);
        } catch (e) {
            console.error("Failed to parse Activity JSON", e);
            throw new Error("Failed to generate activity.");
        }
    }

    async generateRemedialActivity(
        lesson: Lesson,
        previousScore: number,
        attemptNumber: number,
        courseContext?: { prePrompts?: string }
    ): Promise<{ activity: LessonActivity; reasoning: string }> {
        if (!this.genAI) throw new Error("API Key not set");

        const prompt = `
        ${courseContext?.prePrompts ? `### MANDATORY COURSE DESIGN GUIDELINES ###
        ${courseContext.prePrompts}
        ##########################################` : ''}

        You are an expert educator creating a remedial learning activity.
        
        Lesson: ${lesson.title}
        Objectives: ${lesson.learningObjectives?.join(', ')}
        Student's Previous Score: ${previousScore}/100
        Attempt Number: ${attemptNumber}
        
        TASK:
        The student struggled with the previous activity. Create a NEW "Real World Application" challenge (Proof of Work) that first RE-TEACHES the concept and then asks for evidence.
        
        UI CONTEXT:
        The student will be presented with:
        1. A "Description / Reflection" text area (where they can explain their work or paste links).
        2. An "Upload Evidence" button (ONLY supports images: PNG or JPG).
        
        In your instructions, tell the user exactly what to type in the text area and what evidence to upload as a file.
        
        The activity MUST ADHERE STRICTLY to the MANDATORY COURSE DESIGN GUIDELINES above.
        
        REQUIREMENTS:
        1.  Title: A catchy title.
        2.  Instructions: MUST include a "Review" section in markdown explaining the key concepts simply, followed by a new challenge.
        3.  Type: 'file-upload'
        
        Output JSON format:
        {
            "activity": {
                "type": "file-upload",
                "config": {
                    "title": "String",
                    "instructions": "Markdown String (Review + New Challenge)",
                    "allowedTypes": "any"
                },
                "passingScore": 70,
                "attemptNumber": ${attemptNumber}
            },
            "reasoning": "Explain how this remedial activity re-teaches the concept and follows the course design guidelines."
        }
        
        CRITICAL: Return ONLY valid JSON.
        `;

        const model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result = await model.generateContent(prompt);
        try {
            const jsonMatch = result.response.text().match(/\{[\s\S]*\}/);
            return JSON.parse(jsonMatch ? jsonMatch[0] : result.response.text());
        } catch (e) {
            throw new Error("Failed to generate remedial activity.");
        }
    }

    async assessActivity(
        submission: any,
        learningObjectives?: string[],
        courseContext?: { prePrompts?: string }
    ): Promise<{ score: number; feedback: string }> {
        if (!this.genAI) throw new Error("API Key not set");

        try {
            const { fileContent, fileType, ...textData } = submission;

            const prompt = `
            You are an expert teacher grading a student's activity submission.
            
            ${courseContext?.prePrompts ? `### MANDATORY COURSE DESIGN GUIDELINES ###
            The student was instructed to follow these rules:
            ${courseContext.prePrompts}
            ##########################################` : ''}

            Learning Objectives:
            ${learningObjectives?.map(o => `- ${o}`).join('\n') || "General understanding"}
            
            Student Submission Data (JSON):
            ${JSON.stringify(textData, null, 2)}
            
            Task: Evaluate the submission against BOTH the learning objectives AND the MANDATORY COURSE DESIGN GUIDELINES.
            1. Analyze the submission data (it could be answers, interactions, logs, etc.).
            2. If an image is provided, examine it as part of the evidence.
            3. Determine if the student met the objectives AND followed the mandatory guidelines.
            4. Provide a score (0-100).
            5. Provide constructive feedback. If they didn't follow the guidelines (e.g. didn't relate it to their portfolio as requested), mention it in the feedback.
            
            Return JSON: { "score": number, "feedback": "string" }
            `;

            const model = this.genAI.getGenerativeModel({
                model: "gemini-2.0-flash",
                generationConfig: { responseMimeType: "application/json" }
            });

            const parts: any[] = [prompt];
            if (fileContent && fileType) {
                parts.push({
                    inlineData: {
                        data: fileContent,
                        mimeType: fileType
                    }
                });
            }

            const result = await model.generateContent(parts);
            const text = result.response.text();
            const data = JSON.parse(text);

            return {
                score: data.score,
                feedback: data.feedback
            };
        } catch (error) {
            console.error("Error assessing activity:", error);
            throw error;
        }
    }

    async tuneLesson(_lessonId: string, answer: string): Promise<{ adjustment: string; reasoning: string }> {
        return {
            adjustment: "Acknowledged",
            reasoning: `User feedback "${answer}" recorded. In a full implementation, this would trigger a re-generation of subsequent lessons.`
        };
    }
}
