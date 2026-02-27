from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.logging import AgentContext
from app.agents.lesson_planner import run_lesson_planner
from app.agents.lesson_writer import run_lesson_writer
from app.agents.activity_creator import run_activity_creator
from app.db.models import CourseInstance, Lesson, Activity
from app.services.progression import transition_course


async def generate_course(
    db: AsyncSession,
    course: CourseInstance,
    learner_profile: dict | None = None,
) -> CourseInstance:
    """Run the full generation pipeline: for each objective, plan → write → create activity."""
    await transition_course(db, course, "generating")

    ctx = AgentContext(
        db=db,
        user_id=course.user_id,
        course_instance_id=course.id,
    )

    objectives: list[str] = course.input_objectives
    description = course.input_description or ""

    for i, objective in enumerate(objectives):
        # 1. Plan the lesson
        plan = await run_lesson_planner(ctx, objective, description, learner_profile)

        # 2. Write the lesson content
        content = await run_lesson_writer(ctx, plan, description, learner_profile)

        # 3. Create the lesson record
        lesson = Lesson(
            course_instance_id=course.id,
            objective_index=i,
            lesson_content=content.lesson_body,
            status="unlocked" if i == 0 else "locked",
        )
        db.add(lesson)
        await db.flush()

        # 4. Create the activity
        activity_spec = await run_activity_creator(
            ctx, plan.suggested_activity, objective, plan.mastery_criteria, learner_profile
        )
        activity = Activity(
            lesson_id=lesson.id,
            activity_spec=activity_spec.model_dump(),
        )
        db.add(activity)
        await db.flush()

    # Update course with generated description
    course.generated_description = description
    await transition_course(db, course, "active")
    # Auto-transition to in_progress since the first lesson is already unlocked
    await transition_course(db, course, "in_progress")

    return course
