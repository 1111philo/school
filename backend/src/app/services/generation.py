import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.logging import AgentContext
from app.agents.lesson_planner import run_lesson_planner
from app.agents.lesson_writer import run_lesson_writer
from app.agents.activity_creator import run_activity_creator
from app.db.models import CourseInstance, Lesson, Activity
from app.db.session import get_background_session
from app.services.generation_tracker import broadcast
from app.services.progression import transition_course

logger = logging.getLogger(__name__)


async def generate_course(
    db: AsyncSession,
    course: CourseInstance,
    learner_profile: dict | None = None,
) -> CourseInstance:
    """Run the full generation pipeline: for each objective, plan -> write -> create activity.

    This is the original synchronous-style entry point. It still works when called
    directly with an existing session (e.g. from tests), but does NOT broadcast SSE
    events or manage its own session.
    """
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
        plan = await run_lesson_planner(ctx, objective, description, objectives, learner_profile)

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


async def generate_course_background(
    course_id: str,
    user_id: str,
    objectives: list[str],
    description: str,
    learner_profile: dict | None = None,
) -> None:
    """Background wrapper that manages its own DB session and broadcasts SSE events.

    This is intended to be spawned as an asyncio.Task via the generation tracker.
    All arguments are plain data (no ORM objects) so the task is decoupled from
    the request session.
    """
    lessons_created = 0

    try:
        async with get_background_session() as db:
            # Re-load the course within this session
            from sqlalchemy import select
            from sqlalchemy.orm import selectinload

            result = await db.execute(
                select(CourseInstance)
                .where(CourseInstance.id == course_id)
                .options(
                    selectinload(CourseInstance.lessons).selectinload(Lesson.activities)
                )
            )
            course = result.scalar_one()

            ctx = AgentContext(
                db=db,
                user_id=user_id,
                course_instance_id=course_id,
            )

            # Build index of already-completed lessons for incremental retry
            existing_lessons = {
                lesson.objective_index: lesson for lesson in course.lessons
            }

            for i, objective in enumerate(objectives):
                # Skip objectives that already have a complete lesson + activity
                existing = existing_lessons.get(i)
                if existing and existing.lesson_content and existing.activities:
                    logger.info(
                        "Skipping objective %d for course %s (already generated)", i, course_id
                    )
                    await broadcast(course_id, "lesson_planned", {
                        "objective_index": i,
                        "lesson_title": None,
                        "skipped": True,
                    })
                    await broadcast(course_id, "lesson_written", {
                        "objective_index": i,
                        "skipped": True,
                    })
                    await broadcast(course_id, "activity_created", {
                        "objective_index": i,
                        "activity_id": existing.activities[0].id,
                        "skipped": True,
                    })
                    lessons_created += 1
                    continue

                try:
                    # 1. Plan the lesson
                    plan = await run_lesson_planner(ctx, objective, description, objectives, learner_profile)

                    await broadcast(course_id, "lesson_planned", {
                        "objective_index": i,
                        "lesson_title": plan.lesson_title,
                    })

                    # 2. Write the lesson content
                    # Re-use existing lesson record if it exists but is incomplete
                    if existing and existing.lesson_content:
                        lesson = existing
                        logger.info(
                            "Re-using existing lesson content for objective %d", i
                        )
                    else:
                        content = await run_lesson_writer(ctx, plan, description, learner_profile)
                        if existing:
                            # Lesson record exists but has no content — update it
                            existing.lesson_content = content.lesson_body
                            lesson = existing
                        else:
                            lesson = Lesson(
                                course_instance_id=course_id,
                                objective_index=i,
                                lesson_content=content.lesson_body,
                                status="unlocked" if i == 0 else "locked",
                            )
                            db.add(lesson)
                        await db.flush()
                        # Commit so the lesson row is visible to other sessions
                        await db.commit()

                    await broadcast(course_id, "lesson_written", {
                        "objective_index": i,
                    })

                    # 3. Create the activity (only if lesson doesn't already have one)
                    if not existing or not existing.activities:
                        activity_spec = await run_activity_creator(
                            ctx, plan.suggested_activity, objective, plan.mastery_criteria, learner_profile
                        )
                        activity = Activity(
                            lesson_id=lesson.id,
                            activity_spec=activity_spec.model_dump(),
                        )
                        db.add(activity)
                        await db.flush()
                        # Commit so the activity row is visible to other sessions
                        await db.commit()
                    else:
                        activity = existing.activities[0]

                    await broadcast(course_id, "activity_created", {
                        "objective_index": i,
                        "activity_id": activity.id,
                    })

                    lessons_created += 1

                except Exception:
                    logger.exception(
                        "Error generating lesson %d for course %s", i, course_id
                    )
                    await broadcast(course_id, "generation_error", {
                        "objective_index": i,
                        "error": f"Failed to generate lesson for objective {i}",
                    })
                    # Continue with remaining objectives

            # Finalize course status
            course.generated_description = description

            if lessons_created > 0:
                # Refresh lessons relationship so the guard check sees them
                await db.refresh(course, ["lessons"])
                await transition_course(db, course, "active")
                await transition_course(db, course, "in_progress")
            else:
                await transition_course(db, course, "generation_failed")

        # Broadcast AFTER the session commits (async-with exit) so that
        # any SSE subscriber re-querying the DB sees committed data.
        await broadcast(course_id, "generation_complete", {
            "course_id": course_id,
            "lesson_count": lessons_created,
        })

    except Exception:
        logger.exception("Fatal error in background generation for course %s", course_id)
        # Try to mark the course as failed
        try:
            async with get_background_session() as db:
                from sqlalchemy import select

                result = await db.execute(
                    select(CourseInstance).where(CourseInstance.id == course_id)
                )
                course = result.scalar_one_or_none()
                if course and course.status == "generating":
                    await transition_course(db, course, "generation_failed")
        except Exception:
            logger.exception("Could not mark course %s as generation_failed", course_id)

        await broadcast(course_id, "generation_error", {
            "objective_index": -1,
            "error": "Fatal generation error",
        })
        await broadcast(course_id, "generation_complete", {
            "course_id": course_id,
            "lesson_count": lessons_created,
        })
