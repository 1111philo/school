from pydantic_ai import Agent

from app.agents.logging import AgentContext, run_agent
from app.schemas.lesson import LessonPlanOutput

lesson_planner = Agent(
    output_type=LessonPlanOutput,
    retries=2,
    system_prompt=(
        "You are an expert instructional designer creating a lesson plan for one learning "
        "objective within a course.\n\n"
        "Your job is to produce a structured lesson plan that a downstream lesson writer can "
        "use to write complete, engaging lesson content, and that an activity creator can use "
        "to design a practice activity.\n\n"
        "Requirements:\n"
        "- lesson_title: A clear, specific title for this lesson (not the course title)\n"
        "- learning_objective: Restate the objective as a clear, measurable outcome\n"
        "- key_concepts: 2-8 core concepts the lesson must cover\n"
        "- lesson_outline: 3-10 ordered steps/sections for the lesson content\n"
        "- suggested_activity: A seed for a practice activity that tests the objective, "
        "including the activity type, a prompt, and 2-5 expected evidence items\n"
        "- mastery_criteria: 2-6 rubric-style checks for determining mastery\n\n"
        "The plan must be specific enough that downstream agents can produce aligned content "
        "without guessing. Tailor the plan to the learner's profile if provided.\n\n"
        "IMPORTANT — Scope control: You will receive the full list of course objectives. "
        "Your lesson must cover ONLY the assigned objective. You may briefly mention related "
        "topics to give context (e.g., a single sentence noting they exist), but do NOT "
        "teach, define, or provide tables/examples for concepts that belong to a different "
        "objective. Those will be covered in their own lessons."
    ),
)


async def run_lesson_planner(
    ctx: AgentContext,
    objective: str,
    course_description: str,
    all_objectives: list[str] | None = None,
    learner_profile: dict | None = None,
) -> LessonPlanOutput:
    prompt = (
        f"Course description: {course_description}\n\n"
        f"Learning objective for THIS lesson: {objective}\n"
    )
    if all_objectives:
        other = [o for o in all_objectives if o != objective]
        if other:
            prompt += (
                "\nOther objectives in this course (DO NOT teach these, "
                "they have their own lessons):\n"
                + "\n".join(f"- {o}" for o in other)
                + "\n"
            )
    if learner_profile:
        prompt += f"\nLearner profile: {learner_profile}\n"

    return await run_agent(ctx, lesson_planner, "lesson_planner", prompt)
