from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

from app.auth.dependencies import get_current_user
from app.db.models import Activity, CourseInstance, Lesson, User
from app.db.session import get_db_session
from app.agents.logging import AgentContext
from app.agents.activity_reviewer import run_activity_reviewer
from app.schemas.activity import ActivitySubmitRequest, ActivitySubmitResponse
from app.services.progression import unlock_next_lesson, check_all_lessons_completed, transition_course

router = APIRouter(prefix="/api/activities", tags=["activities"])


@router.post("/{activity_id}/submit", response_model=ActivitySubmitResponse)
async def submit_activity(
    activity_id: str,
    req: ActivitySubmitRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    # Load activity with its lesson and course
    result = await db.execute(
        select(Activity)
        .where(Activity.id == activity_id)
        .options(
            selectinload(Activity.lesson).selectinload(Lesson.course_instance)
        )
    )
    activity = result.scalar_one_or_none()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    lesson = activity.lesson
    course = lesson.course_instance

    # Verify user owns this course
    if course.user_id != user.id:
        raise HTTPException(status_code=404, detail="Activity not found")

    spec = activity.activity_spec or {}
    objective = course.input_objectives[lesson.objective_index] if lesson.objective_index < len(course.input_objectives) else ""

    ctx = AgentContext(db=db, user_id=user.id, course_instance_id=course.id)

    # Run the reviewer
    review = await run_activity_reviewer(
        ctx,
        submission_text=req.text,
        objective=objective,
        activity_prompt=spec.get("prompt", ""),
        scoring_rubric=spec.get("scoring_rubric", []),
    )

    # Update activity record
    submissions = list(activity.submissions or [])
    submissions.append({
        "text": req.text,
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    })
    activity.submissions = submissions
    flag_modified(activity, "submissions")
    activity.latest_score = review.score
    activity.latest_feedback = {
        "rationale": review.rationale,
        "strengths": review.strengths,
        "improvements": review.improvements,
        "tips": review.tips,
    }
    activity.mastery_decision = review.mastery_decision
    activity.attempt_count += 1

    # Mark lesson as completed and unlock next
    if lesson.status != "completed":
        lesson.status = "completed"
        await unlock_next_lesson(db, course.id)

        # Check if all lessons are now completed
        if await check_all_lessons_completed(db, course.id):
            # Reload course with assessments for guard check
            result = await db.execute(
                select(CourseInstance)
                .where(CourseInstance.id == course.id)
                .options(
                    selectinload(CourseInstance.lessons),
                    selectinload(CourseInstance.assessments),
                )
            )
            course = result.scalar_one()
            try:
                await transition_course(db, course, "awaiting_assessment")
            except Exception:
                pass  # Not critical if transition fails here

    await db.flush()

    return ActivitySubmitResponse(
        score=review.score,
        mastery_decision=review.mastery_decision,
        rationale=review.rationale,
        strengths=review.strengths,
        improvements=review.improvements,
        tips=review.tips,
    )
