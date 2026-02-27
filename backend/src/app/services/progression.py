from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import CourseInstance, Lesson


class InvalidTransitionError(Exception):
    pass


# Valid transitions and their guard conditions
TRANSITIONS: dict[tuple[str, str], str] = {
    ("draft", "generating"): "has_objectives",
    ("generating", "active"): "all_content_generated",
    ("active", "in_progress"): "always",
    ("in_progress", "awaiting_assessment"): "all_lessons_completed",
    ("awaiting_assessment", "assessment_ready"): "assessment_generated",
    ("assessment_ready", "completed"): "assessment_passed",
    ("assessment_ready", "assessment_ready"): "always",  # retry on fail
}


async def check_guard(db: AsyncSession, course: CourseInstance, guard: str) -> bool:
    if guard == "always":
        return True
    if guard == "has_objectives":
        return bool(course.input_objectives)
    if guard == "all_content_generated":
        return len(course.lessons) > 0 and all(
            lesson.lesson_content is not None for lesson in course.lessons
        )
    if guard == "all_lessons_completed":
        return len(course.lessons) > 0 and all(
            lesson.status == "completed" for lesson in course.lessons
        )
    if guard == "assessment_generated":
        return len(course.assessments) > 0
    if guard == "assessment_passed":
        return any(a.passed for a in course.assessments)
    return False


async def transition_course(
    db: AsyncSession, course: CourseInstance, target_status: str
) -> CourseInstance:
    key = (course.status, target_status)
    guard_name = TRANSITIONS.get(key)
    if guard_name is None:
        raise InvalidTransitionError(
            f"Cannot transition from '{course.status}' to '{target_status}'"
        )

    if not await check_guard(db, course, guard_name):
        raise InvalidTransitionError(
            f"Guard '{guard_name}' failed for transition "
            f"'{course.status}' → '{target_status}'"
        )

    course.status = target_status
    await db.flush()
    return course


async def unlock_next_lesson(db: AsyncSession, course_id: str) -> Lesson | None:
    """Find the next locked lesson and unlock it."""
    result = await db.execute(
        select(Lesson)
        .where(Lesson.course_instance_id == course_id, Lesson.status == "locked")
        .order_by(Lesson.objective_index)
        .limit(1)
    )
    lesson = result.scalar_one_or_none()
    if lesson:
        lesson.status = "unlocked"
        await db.flush()
    return lesson


async def check_all_lessons_completed(db: AsyncSession, course_id: str) -> bool:
    result = await db.execute(
        select(Lesson).where(Lesson.course_instance_id == course_id)
    )
    lessons = result.scalars().all()
    return len(lessons) > 0 and all(l.status == "completed" for l in lessons)
