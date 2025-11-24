import { GoogleGenAI } from "@google/genai";
import type { ChatMessage, Course, UserSettings, Lesson, LessonRoadmap, LessonActivity } from '../types';

export class GenAIService {
    private static instance: GenAIService;
    private genAI: GoogleGenAI | null = null;

    private constructor() { }

    public static getInstance(): GenAIService {
        if (!GenAIService.instance) {
            GenAIService.instance = new GenAIService();
        }
        return GenAIService.instance;
    }

    public setApiKey(key: string) {
        this.genAI = new GoogleGenAI({ apiKey: key });
    }

    async continueConversation(history: ChatMessage[], settings: UserSettings): Promise<{ response: string; reasoning: string }> {
        if (!this.genAI) throw new Error("API Key not set");

        const messageCount = history.length;

        // Initial greeting
        if (messageCount === 0) {
            return {
                response: `Hi ${settings.userName}! I'm your course creation assistant. I'm here to help you learn something new. What topic or skill would you like to master?`,
                reasoning: "Initial greeting to start conversation."
            };
        }

        const prompt = `
        You are an expert educational consultant helping ${settings.userName} create a personalized learning course.
        
        Your goal is to have a natural conversation to understand:
        1. What they want to learn
        2. Their current knowledge level
        3. Their learning goals
        4. Their interests and how to make the content relatable
        5. Any specific challenges or questions they have
        
        Conversation History:
        ${history.map(m => `${m.role}: ${m.content}`).join('\n')}
        
        Task: Continue the conversation naturally. Ask thoughtful questions, provide insights, and help them clarify what they want to learn. Be encouraging and curious.
        
        CRITICAL: Keep your response under 225 characters. Be concise and focused.
        
        Output JSON format:
        {
            "response": "Your response to the user (MAX 225 characters)",
            "reasoning": "Brief explanation of your conversational strategy"
        }
        
        IMPORTANT: Return ONLY the JSON object. Do not wrap it in markdown code blocks.
        `;

        // Use smaller model for simple conversation
        const result = await this.genAI.models.generateContent({
            model: "gemini-1.5-flash",
            contents: prompt
        });

        const text = result.text || "";

        try {
            console.log("Raw AI Response:", text);
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const jsonStr = jsonMatch ? jsonMatch[0] : text;
            const data = JSON.parse(jsonStr);
            return data;
        } catch (e) {
            console.error("Failed to parse JSON", e);
            console.error("Raw Text was:", text);
            return {
                response: "I'm having trouble formulating my thoughts. Could you tell me more about what you'd like to learn?",
                reasoning: `Failed to parse AI response. Raw text: ${text.substring(0, 100)}...`
            };
        }
    }

    async generateCourse(history: ChatMessage[], settings: UserSettings): Promise<{ course: Course; reasoning: string }> {
        if (!this.genAI) throw new Error("API Key not set");

        const userInterest = history.find(m => m.role === 'user')?.content || "General";

        const prompt = `
        You are an expert curriculum designer.
        Student: ${settings.userName}.
        Interest: ${userInterest}.
        
        Goal: Based on the conversation above, create a personalized course roadmap with 3-5 lessons on the topic the student wants to learn about.
        The course must be contextualized using the student's interest and background from the conversation.
        
        Analyze the conversation to determine:
        - What topic/subject the student wants to learn
        - Their current knowledge level
        - Their interests and how to make content relatable
        
        Create a course on THAT topic (not gravity unless they specifically asked about gravity).
        
        Conversation History (Assessment):
        ${history.map(m => `${m.role}: ${m.content}`).join('\n')}
        
        IMPORTANT: Generate a complete roadmap of ALL lessons, but only generate the FIRST lesson in full detail.
        
        For the roadmap, provide for each lesson:
        - id (lesson-1, lesson-2, etc.)
        - title
        - description (2-3 sentences about what will be covered)
        - order (1, 2, 3, etc.)
        
        For the FIRST lesson only, provide:
        - Full content (markdown, 100-200 words MAX, clear and concise)
        - An interactive activity to assess comprehension
        - Keep it short and to the point - focus on ONE key concept
        
        Activity types available:
        - multiple-choice: Questions with 4 options each
        
        For multiple-choice activities, include 3-5 questions. Each question should have:
        - question text
        - 4 options
        - correctIndex (0-3)
        - correctIndex (0-3)
        - explanation (why the answer is correct/incorrect - MUST be neutral, do NOT start with "Correct", "Yes", or "That's right")
        
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
                    },
                    {
                        "id": "lesson-2",
                        "title": "Lesson 2 Title",
                        "description": "What this lesson covers...",
                        "order": 2
                    }
                    // ... more lessons (3-5 total)
                ],
                "lessons": [
                    {
                        "id": "lesson-1",
                        "title": "Lesson 1 Title",
                        "content": "Full markdown content for lesson 1...",
                        "visualPrompt": "Description for a simple visual diagram/illustration to explain the key concept (will be used to generate an image)",
                        "activity": {
                            "type": "multiple-choice",
                            "config": {
                                "questions": [
                                    {
                                        "question": "Question text?",
                                        "options": ["Option A", "Option B", "Option C", "Option D"],
                                        "correctIndex": 0,
                                        "correctIndex": 0,
                                        "explanation": "Neutral explanation of the answer"
                                    }
                                    // ... 2-4 more questions
                                ]
                            },
                            "passingScore": 70
                        },
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

        const result = await this.genAI.models.generateContent({
            model: "gemini-2.0-flash-exp",
            contents: prompt
        });

        const text = result.text || "";

        try {
            console.log("Raw AI Response (Course):", text);
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const jsonStr = jsonMatch ? jsonMatch[0] : text;
            const data = JSON.parse(jsonStr);

            // Ensure unique ID to prevent collisions
            if (data.course) {
                data.course.id = `course-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            }

            return data;
        } catch (e) {
            console.error("Failed to parse JSON", e);
            console.error("Raw Text was:", text);
            throw new Error("Failed to generate course format. Please try again.");
        }
    }

    async generateNextLesson(
        courseContext: Course,
        previousLesson: Lesson,
        comprehensionScore: number,
        nextLessonRoadmap: LessonRoadmap,
        settings: UserSettings
    ): Promise<{ lesson: Lesson; reasoning: string }> {
        if (!this.genAI) throw new Error("API Key not set");

        const performanceLevel = comprehensionScore < 70 ? 'struggling' : comprehensionScore < 85 ? 'adequate' : 'excellent';

        const prompt = `
        You are an expert curriculum designer creating the next lesson in a course.
        
        Course: ${courseContext.title}
        Previous Lesson: ${previousLesson.title}
        Student Performance: ${comprehensionScore}/100 (${performanceLevel})
        Student: ${settings.userName}
        
        Next Lesson Plan (from roadmap):
        - Title: ${nextLessonRoadmap.title}
        - Description: ${nextLessonRoadmap.description}
        
            You are an expert educational content creator.
            Create the next lesson for the course "${courseContext.title}".
            
            Previous Lesson Context:
            - Title: ${previousLesson.title}
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
                    "activity": {
                        "type": "multiple-choice" | "short-response" | "drawing",
                        "passingScore": 70,
                        "config": {
                            // For multiple-choice:
                            "questions": [
                                {
                                    "question": "...",
                                    "options": ["..."],
                                    "correctIndex": 0,
                                    "explanation": "Neutral explanation..."
                                }
                            ]
                            // OR for short-response:
                            // "question": "Explain the concept of...",
                            // "rubric": "Look for keywords X, Y, Z..."
                            
                            // OR for drawing:
                            // "prompt": "Draw a diagram of...",
                            // "referenceDescription": "The drawing should show..."
                        }
                    },
                    "isCompleted": false,
                    "isGenerated": true,
                    "attempts": 0
                },
                "reasoning": "How this lesson adapts to student's performance"
            }
            
            IMPORTANT:
            - Content should be engaging and educational.
            - Choose the activity type that best fits the topic.
            - For abstract concepts, "short-response" or "drawing" might be better than multiple-choice.
            - Ensure the JSON is valid.
            `;

        const result = await this.genAI.models.generateContent({
            model: "gemini-2.0-flash-exp",
            contents: prompt
        });

        const text = result.text || "";

        try {
            console.log("Raw AI Response (Next Lesson):", text);
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const jsonStr = jsonMatch ? jsonMatch[0] : text;
            const data = JSON.parse(jsonStr);

            // Validate that the lesson has an activity
            if (!data.lesson || !data.lesson.activity) {
                console.error("Generated lesson missing activity:", data);
                throw new Error("Generated lesson is missing the required activity section.");
            }

            return data;
        } catch (e) {
            console.error("Failed to parse JSON", e);
            console.error("Raw Text was:", text);
            throw new Error("Failed to generate next lesson. Please try again.");
        }
    }

    async generateRemedialActivity(
        lesson: Lesson,
        previousScore: number,
        attemptNumber: number
    ): Promise<{ activity: LessonActivity; reasoning: string }> {
        if (!this.genAI) throw new Error("API Key not set");

        const prompt = `
        You are an expert educator creating a remedial learning activity.
        
        Lesson: ${lesson.title}
        Lesson Content: ${lesson.content}
        Student's Previous Score: ${previousScore}/100
        Attempt Number: ${attemptNumber}
        
        Task: Create a NEW interactive activity that:
        1. Reviews the key concepts from the lesson
        2. Teaches while assessing (not just testing)
        3. Provides more scaffolding and examples
        4. Is different from the previous attempt
        
        The activity should be a multiple-choice format with 3-5 questions.
        Each question should include clear explanations to help the student learn.
        IMPORTANT: Explanations must be NEUTRAL. Do NOT start with "Correct", "Yes", "That's right", etc. Just explain the fact.
        
        Output JSON format:
        {
            "activity": {
                "type": "multiple-choice",
                "config": {
                    "questions": [
                        {
                            "question": "Question with teaching context...",
                            "options": ["A", "B", "C", "D"],
                            "correctIndex": 0,
                            "explanation": "Neutral detailed explanation that teaches the concept"
                        }
                    ]
                },
                "passingScore": 70,
                "attemptNumber": ${attemptNumber}
            },
            "reasoning": "How this activity helps the student learn"
        }
        
        CRITICAL: Return ONLY valid JSON. No markdown code blocks.
        `;

        // Use smaller model for remedial activities
        const result = await this.genAI.models.generateContent({
            model: "gemini-1.5-flash",
            contents: prompt
        });

        const text = result.text || "";

        try {
            console.log("Raw AI Response (Remedial Activity):", text);
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const jsonStr = jsonMatch ? jsonMatch[0] : text;
            const data = JSON.parse(jsonStr);
            return data;
        } catch (e) {
            console.error("Failed to parse JSON", e);
            console.error("Raw Text was:", text);
            throw new Error("Failed to generate remedial activity. Please try again.");
        }
    }

    async assessActivity(
        type: 'short-response' | 'drawing',
        prompt: string,
        input: string, // text response or base64 image
        context?: string // rubric or reference description
    ): Promise<{ score: number; feedback: string }> {
        if (!this.genAI) throw new Error("API Key not set");

        try {
            let parts: any[] = [];

            if (type === 'short-response') {
                parts = [
                    { text: `You are an expert teacher grading a student's short response.` },
                    { text: `Question: ${prompt}` },
                    { text: `Rubric/Context: ${context || 'Grade based on accuracy and clarity.'}` },
                    { text: `Student Response: ${input}` },
                    { text: `Evaluate the response and provide a score from 0 to 100 and constructive feedback. Return JSON: { "score": number, "feedback": "string" }` }
                ];
            } else if (type === 'drawing') {
                parts = [
                    { text: `You are an expert teacher grading a student's drawing.` },
                    { text: `Prompt: ${prompt}` },
                    { text: `Reference Description: ${context || 'Evaluate if the drawing represents the concept accurately.'}` },
                    { text: `Evaluate the attached drawing and provide a score from 0 to 100 and constructive feedback. Return JSON: { "score": number, "feedback": "string" }` },
                    {
                        inlineData: {
                            mimeType: "image/jpeg",
                            data: input
                        }
                    }
                ];
            }

            // Use smaller model for assessment
            const result = await this.genAI.models.generateContent({
                model: "gemini-1.5-flash",
                contents: [{ role: "user", parts }],
                config: { responseMimeType: "application/json" }
            });

            const text = result.text || "";
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
