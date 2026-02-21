import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Course, UserSettings, Lesson, LessonRoadmap, LessonActivity, LogEntry } from '../types';
import { generateLessonVisual } from './visualGenerator';

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

    private getUsage(response: any) {
        return response.usageMetadata ? {
            promptTokens: response.usageMetadata.promptTokenCount || 0,
            candidatesTokens: response.usageMetadata.candidatesTokenCount || 0,
            totalTokens: response.usageMetadata.totalTokenCount || 0
        } : undefined;
    }

    async generateCourse(courseData: Partial<Course>, settings: UserSettings): Promise<{ course: Course; reasoning: string; prompt: string; response: string; usage?: LogEntry['usage'] }> {
        if (!this.genAI) throw new Error("API Key not set");

        const model = this.genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const learningObjectivesText = courseData.learningObjectives && courseData.learningObjectives.length > 0
            ? `### LEARNING OBJECTIVES ###\n${courseData.learningObjectives.map((obj: string, i: number) => `${i + 1}. ${obj}`).join('\n')}\n##########################################`
            : '';

        const prompt = `
        You are an expert curriculum designer.
        Student: ${settings.userName}.
        Topic: ${courseData.title || "General Interest"}
        Description: ${courseData.description || "No description provided"}
        
        ${courseData.prePrompts ? `### MANDATORY COURSE DESIGN GUIDELINES ###
        ${courseData.prePrompts}
        ##########################################` : ''}

        ${learningObjectivesText}

        Goal: Create a personalized course roadmap based on the topic, description, and learning objectives provided.
        The course must be contextualized using the student's name (${settings.userName}) and the specific details provided.
        STRICTLY refer to the student as ${settings.userName} throughout the course content.
        Any tasks or learning objectives proposed MUST align with the MANDATORY COURSE DESIGN GUIDELINES above.
        
        CRITICAL: The number of lessons in the roadmap MUST MATCH the number of Learning Objectives provided. If 3 objectives are provided, there MUST be exactly 3 lessons.
        Each lesson title MUST succinctly describe its corresponding Learning Objective.
        
        For the roadmap, provide for each lesson:
        - id (lesson-1, lesson-2, etc.)
        - title
        - description (2-3 sentences about what will be covered)
        - order (1, 2, 3, etc.)
        
        Output JSON format:
        {
            "course": {
                "id": "course-${Date.now()}",
                "visualPrompt": "A prompt for an image generator to create a minimalist ink blot in the style of Pablo Picasso. The ink blot should suggest one single, clear noun related to the course title ('${courseData.title}'). Use bold, expressive ink strokes and simple contrasting colors. DO NOT INCLUDE ANY TEXT, LETTERS, OR CHARACTERS IN THE IMAGE.",
                "roadmap": [
                    {
                        "id": "lesson-1",
                        "title": "Lesson 1 Title",
                        "description": "What this lesson covers...",
                        "order": 1
                    }
                    // ... more lessons corresponding to the learning objectives
                ],
                "lessons": []
            },
            "reasoning": "Explanation of course design and roadmap structure"
        }
        
        CRITICAL: Return ONLY valid JSON. No markdown code blocks.
        `;

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        try {
            let data = JSON.parse(text);

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
            course.learningObjectives = courseData.learningObjectives;
            course.description = courseData.description || course.description;
            course.title = courseData.title || course.title;
            course.created = course.created || Date.now();

            // No longer generating the first lesson here. Handled by the newly refactored generateNextLesson flow.

            return {
                course,
                reasoning: data.reasoning || "Generated curriculum structure",
                prompt,
                response: text,
                usage: this.getUsage(result.response)
            };
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
        learningObjectives?: string[]
    ): Promise<{ lesson: Lesson; logs: { action: string; reasoning: string; prompt: string; response: string; usage?: LogEntry['usage'] }[] }> {
        if (!this.genAI) throw new Error("API Key not set");

        const performanceLevel = comprehensionScore < 70 ? 'struggling' : comprehensionScore < 85 ? 'adequate' : 'excellent';
        const previousLessonTitle = previousLesson ? previousLesson.title : "None (First Lesson)";

        // 1. Determine learning objective
        const objectiveIndex = nextLessonRoadmap.order - 1;
        const learningObjective = (learningObjectives && learningObjectives[objectiveIndex])
            ? learningObjectives[objectiveIndex]
            : nextLessonRoadmap.title;

        // --- Phase 1: Lesson Plan Agent ---
        const planPrompt = `
        You are a professional curriculum creator. Write in plain, succinct language.

        Input: 
        Course Title: ${courseContext.title}
        Course Description: ${courseContext.description}
        Course Pre-Prompts: ${courseContext.prePrompts || 'None'}
        Learning Objective: ${learningObjective}

        Output: JSON response that includes the following content built around the learning objective
        {
            "plan": {
                "learningObjective": "Restate the user’s objective in first person, brief, measurable, aligned to the assessment.",
                "competency": "A numbered organizational heading (e.g., 1. ...) summarizing the broader capability being developed.",
                "enduringUnderstanding": "Why this objective matters long-term; key takeaway(s), concise.",
                "essentialQuestions": ["Question 1", "Question 2"],
                "assessmentProject": "One single, concrete portfolio artifact that proves the objective; include Bloom’s level and Webb’s DOK (e.g., Bloom: Apply; DOK: 3).",
                "masteryCriteria": ["Criterion 1", "Criterion 2"],
                "udlAccommodations": "Briefly address Engagement, Representation, and Action/Expression within the objective + assessment.",
                "activities": ["Activity 1", "Activity 2", "Activity 3"]
            },
            "reasoning": "Brief explanation"
        }
        
        Item definitions:
        - Learning Objective: Restate the user’s objective in first person, brief, measurable, aligned to the assessment.
        - Competency: A numbered organizational heading (e.g., 1. ...) summarizing the broader capability being developed.
        - Enduring Understanding: Why this objective matters long-term; key takeaway(s), concise.
        - Essential Questions: 2–4 questions the learner should grapple with and be able to answer by the end.
        - Assessment Project (Check Bloom’s & Webb’s): One single, concrete portfolio artifact that proves the objective; include Bloom’s level and Webb’s DOK (e.g., Bloom: Apply; DOK: 3).
        - Mastery Criteria / Success Metrics: Brief rubric-style criteria (3–6 checks) used to grade the project.
        - UDL Accommodations: Briefly address Engagement, Representation, and Action/Expression within the objective + assessment.
        - Activities: 3–6 lesson-ready activities that prepare the learner to succeed on the assessment; concise, action-oriented.
        
        CRITICAL: The JSON MUST exactly match the structure above. It must contain the keys 'plan' and 'reasoning' at the root.
        `;

        const planModel = this.genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });
        const planResult = await planModel.generateContent(planPrompt);
        const planText = planResult.response.text();

        let planData;
        try {
            planData = JSON.parse(planText);
        } catch (e) {
            console.error("Failed to parse Lesson Plan JSON", planText);
            throw new Error("Failed to generate Lesson Plan.");
        }

        const plan = planData.plan;

        // --- Phase 2: Lesson Content Agent ---
        const contentPrompt = `
        You are an expert curriculum designer.
        Based on the following Lesson Plan, build the actual interactive lesson content for the student: ${settings.userName}.
        STRICTLY refer to the student as ${settings.userName} throughout the lesson. Do not use variations or nicknames.
        
        Lesson Plan:
        ${JSON.stringify(plan, null, 2)}
        
        Previous Lesson Performance Context:
        - Previous Lesson: ${previousLessonTitle}
        - Performance: ${comprehensionScore}/100 (${performanceLevel})
        
        Task: Create a multi-page interactive lesson.
        Return an array of "pages". A page is a logical chunk of the lesson. 
        Some pages should end with a practice activity defined in the "activities" from the lesson plan, to check their understanding before moving to the next page.
        Make sure the content is engaging text (markdown) tailored to UDL accommodations.

        Output JSON format:
        {
            "pages": [
                {
                    "id": "page-1",
                    "content": "Markdown content explaining the first concept...",
                    "activity": null
                },
                {
                    "id": "page-2",
                    "content": "Markdown content for the next concept...",
                    "activity": {
                        "type": "short-response",
                        "config": { "question": "A practice question based on the plan..." },
                        "passingScore": 70
                    }
                }
            ],
            "reasoning": "How this content adapts to student's performance and follows the plan"
        }
        
        CRITICAL: The JSON MUST exactly match the format above. It must have 'pages' as an array and 'reasoning' as a string at the root.
        
        Allowed activity types for intermediate pages: 'multiple-choice', 'short-response', 'file-upload'.
        
        ACTIVITY TYPE GUIDELINES (STRICT COMPLIANCE REQUIRED):
        - If type 'short-response': config must be { "question": "..." }
        - If type 'multiple-choice': config must be { "questions": [{ "question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "..." }] }
        - If type 'file-upload': config must be { "title": "...", "instructions": "...", "allowedTypes": "any" }
        
        Do NOT generate the final assessment project here. The final assessment will be generated separately by the Assessment Builder Agent when the user finishes all pages.
        `;

        const contentModel = this.genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });
        const contentResult = await contentModel.generateContent(contentPrompt);
        const contentText = contentResult.response.text();

        let contentData;
        try {
            contentData = JSON.parse(contentText);
        } catch (e) {
            console.error("Failed to parse Lesson Content JSON", contentText);
            throw new Error("Failed to generate Lesson Content.");
        }

        // --- Phase 3: Visual Review Agent ---
        const visualPromptText = `
        You are an expert instructional designer and educational illustrator.
        
        Review the following multi-page Lesson Content and identify one specific concept, process, or analogy that would benefit most from a clear instructional visual to help ${settings.userName} grasp the concept.
        
        Lesson Content:
        ${JSON.stringify(contentData.pages, null, 2)}
        
        Task:
        1. Parse the content for:
           - "How-to" steps that can be visualized.
           - Key analogies mentioned in the text (e.g., "The heart is like a pump").
           - Complex relationships between terms.
        2. Identify the specific page ID where this concept is introduced.
        3. Create a prompt for a "simple, clean instructional figure or diagram". 
           Avoid artistic metaphors or "styles" like Picasso; focus on clarity, accuracy, and educational utility.
        
        Style Guidelines:
        - Style: Technical yet accessible educational illustration. Minimalist, flat design, professional.
        - Background: Solid white or very light gray.
        - NO TEXT: Do not include any characters, labels, letters, or numbers. Pointing arrows are allowed but they must not have labels.
        
        Output JSON format:
        {
            "needsVisual": true,
            "pageId": "page-[X]",
            "visualPrompt": "A simple, clean instructional diagram showing [Instructional Concept]. Professional flat design, high contrast, white background.",
            "reasoning": "This page introduces the concept of [Concept] using the analogy of [Analogy], so a direct visual will help the student jump from the theory to the visualization."
        }
        
        CRITICAL: The JSON MUST contain 'needsVisual', 'pageId', 'visualPrompt', and 'reasoning'. Default to 'needsVisual': true.
        `;

        const visualModel = this.genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });
        const visualResult = await visualModel.generateContent(visualPromptText);
        const visualText = visualResult.response.text();

        let visualData;
        try {
            visualData = JSON.parse(visualText);
        } catch (e) {
            console.error("Failed to parse Visual Review JSON", visualText);
            visualData = { needsVisual: false, reasoning: "Failed to parse visual agent response." };
        }

        // --- Phase 4: Visual Creation Agent ---
        let visualCreationLog = null;
        let generatedImageUrl = undefined;
        let refinedPrompt = visualData.needsVisual ? visualData.visualPrompt : undefined;

        if (visualData.needsVisual && settings.apiKey) {
            const targetPage = contentData.pages.find((p: any) => p.id === visualData.pageId);
            const creationPromptText = `
            You are a Visual Creation Agent. You take a visual concept identified by a reviewer and prepare it for final insertion into a lesson.
            
            Visual Concept: ${visualData.visualPrompt}
            Reasoning for Visual: ${visualData.reasoning}
            Target Page ID: ${visualData.pageId}
            Target Page Content: 
            ${targetPage?.content || "No content available"}
            
            Task:
            1. Refine the visual prompt for an image generator (Gemini Imagen) to ensure it creates a high-quality, clear educational diagram.
               Guidelines: Technical yet accessible, minimalist, flat design, white background, NO TEXT, NO LETTERS, NO CHARACTERS.
            2. Write a concise, helpful "Alt Text" for screen readers (max 125 chars).
            3. Write a brief "Caption/Description" that will appear below the image to explain its significance to ${settings.userName} based on the page content.
            
            Output JSON format:
            {
                "refinedPrompt": "...",
                "altText": "...",
                "caption": "..."
            }
            `;

            const creationModel = this.genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                generationConfig: { responseMimeType: "application/json" }
            });

            try {
                const creationResult = await creationModel.generateContent(creationPromptText);
                const creationText = creationResult.response.text();
                const creationData = JSON.parse(creationText);
                refinedPrompt = creationData.refinedPrompt;

                // Generate the actual image
                // We pass a partial lesson object as generateLessonVisual only uses .title
                generatedImageUrl = await generateLessonVisual(
                    { title: nextLessonRoadmap.title } as Lesson,
                    creationData.refinedPrompt,
                    settings.apiKey
                );

                // Find the page and append the image
                const pageIndex = contentData.pages.findIndex((p: any) => p.id === visualData.pageId);
                if (pageIndex !== -1) {
                    const page = contentData.pages[pageIndex];
                    const imageMarkdown = `\n\n![${creationData.altText}](${generatedImageUrl})\n\n*${creationData.caption}*\n\n`;
                    page.content += imageMarkdown;
                }

                visualCreationLog = {
                    action: 'Visual Creation Agent',
                    reasoning: `Generated and placed custom visual for ${visualData.pageId}.`,
                    prompt: creationPromptText,
                    response: creationText,
                    usage: this.getUsage(creationResult.response)
                };
            } catch (error) {
                console.error("Visual Creation Agent failed:", error);
            }
        }

        const lesson: Lesson = {
            id: nextLessonRoadmap.id,
            title: nextLessonRoadmap.title,
            plan: plan,
            pages: contentData.pages,
            learningObjectives: [plan.learningObjective],
            isCompleted: false,
            isGenerated: true,
            attempts: 0,
            visualPrompt: refinedPrompt,
            visualPageId: visualData.needsVisual ? visualData.pageId : undefined,
            visualExplanation: generatedImageUrl
        };

        const logs = [
            {
                action: 'Lesson Plan Agent',
                reasoning: planData.reasoning || "Generated pedagogical structure and assessment plan.",
                prompt: planPrompt,
                response: planText,
                usage: this.getUsage(planResult.response)
            },
            {
                action: 'Lesson Content Agent',
                reasoning: contentData.reasoning || "Generated interactive pages and activities based on the plan.",
                prompt: contentPrompt,
                response: contentText,
                usage: this.getUsage(contentResult.response)
            },
            {
                action: 'Visual Review Agent',
                reasoning: visualData.reasoning || (visualData.needsVisual ? `Identified visual opportunity for page ${visualData.pageId}.` : "Determined no visual was necessary."),
                prompt: visualPromptText,
                response: visualText,
                usage: this.getUsage(visualResult.response)
            }
        ];

        if (visualCreationLog) {
            logs.push(visualCreationLog);
        }

        return { lesson, logs };
    }

    async generateAssessment(
        lesson: Lesson,
        settings: UserSettings,
        courseContext?: { prePrompts?: string }
    ): Promise<{ assessment: LessonActivity; reasoning: string; prompt: string; response: string; usage?: LogEntry['usage'] }> {
        if (!this.genAI) throw new Error("API Key not set");

        const prompt = `
        ${courseContext?.prePrompts ? `### MANDATORY COURSE DESIGN GUIDELINES ###\n        ${courseContext.prePrompts}\n        ##########################################` : ''}

        You are the Assessment Builder Agent.
        
        Lesson: ${lesson.title}
        Student: ${settings.userName || 'Student'}
        
        Assessment Project Plan:
        ${JSON.stringify(lesson.plan?.assessmentProject)}
        
        Mastery Criteria / Success Metrics:
        ${JSON.stringify(lesson.plan?.masteryCriteria)}
        
        TASK:
        Design the final assessment for this lesson. The assessment MUST strictly follow the 'Assessment Project' details specified above.
        
        UI CONTEXT:
        The student will be presented with:
        1. A "Description / Reflection" text area (where they can explain their work or paste links).
        2. An "Upload Evidence" button (supports images: PNG, JPG, passing files, text, etc).
        
        In your instructions, tell the user exactly what to do and what evidence to provide to satisfy the mastery criteria.
        
        Output JSON format:
        {
            "assessment": {
                "type": "file-upload",
                "config": {
                    "title": "Final Assessment: [Create catchy title based on Assessment Project]",
                    "instructions": "Markdown String explaining the project and what to submit...",
                    "allowedTypes": "any"
                },
                "passingScore": 80
            },
            "reasoning": "Explain EXACTLY how this assessment fulfills the Assessment Project definition and Mastery Criteria."
        }
        
        CRITICAL: Return ONLY valid JSON.
        `;

        const model = this.genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        try {
            const data = JSON.parse(text);
            return {
                assessment: data.assessment,
                reasoning: data.reasoning,
                prompt,
                response: text,
                usage: this.getUsage(result.response)
            };
        } catch (e) {
            console.error("Failed to parse Assessment Activity JSON", text);
            throw new Error("Failed to generate assessment.");
        }
    }

    async generateActivity(
        lesson: Lesson,
        settings: UserSettings,
        courseContext?: { prePrompts?: string }
    ): Promise<{ activity: LessonActivity; reasoning: string; prompt: string; response: string; usage?: LogEntry['usage'] }> {
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

        const model = this.genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        try {
            const data = JSON.parse(text);
            return {
                ...data,
                prompt,
                response: text,
                usage: this.getUsage(result.response)
            };
        } catch (e) {
            console.error("Failed to parse Activity JSON", text);
            throw new Error("Failed to generate activity.");
        }
    }

    async generateRemedialActivity(
        lesson: Lesson,
        previousScore: number,
        attemptNumber: number,
        courseContext?: { prePrompts?: string }
    ): Promise<{ activity: LessonActivity; reasoning: string; prompt: string; response: string; usage?: LogEntry['usage'] }> {
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

        const model = this.genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        try {
            const data = JSON.parse(text);
            return {
                ...data,
                prompt,
                response: text,
                usage: this.getUsage(result.response)
            };
        } catch (e) {
            console.error("Failed to parse Remedial Activity JSON", text);
            throw new Error("Failed to generate remedial activity.");
        }
    }

    async assessActivity(
        submission: any,
        learningObjectives?: string[],
        courseContext?: { prePrompts?: string }
    ): Promise<{ score: number; feedback: string; usage?: LogEntry['usage'] }> {
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
                model: "gemini-2.5-flash",
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
                feedback: data.feedback,
                usage: this.getUsage(result.response)
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
