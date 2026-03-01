import asyncio
import json
import logging
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sse_starlette.sse import EventSourceResponse

from app.auth.dependencies import get_current_user
from app.db.models import Assessment, CourseInstance, Lesson, User
from app.db.session import get_background_session, get_db_session
from app.agents.logging import AgentContext
from app.agents.assessment import run_assessment_creator, run_assessment_reviewer
from app.schemas.assessment import AssessmentResponse, AssessmentSubmitRequest
from app.services.progression import transition_course, InvalidTransitionError
from app.services.generation_tracker import (
    broadcast,
    is_running,
    start_generation,
    subscribe,
    unsubscribe,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/assessments", tags=["assessments"])


def _assessment_key(course_id: str) -> str:
    return f"assessment-{course_id}"


async def generate_assessment_background(
    course_id: str,
    user_id: str,
    objectives: list[str],
    description: str,
    activity_scores: list[dict] | None,
    learner_profile: dict | None,
) -> None:
    """Background task that generates an assessment spec via LLM."""
    key = _assessment_key(course_id)

    try:
        async with get_background_session() as db:
            result = await db.execute(
                select(CourseInstance)
                .where(CourseInstance.id == course_id)
                .options(
                    selectinload(CourseInstance.lessons).selectinload(Lesson.activities),
                    selectinload(CourseInstance.assessments),
                )
            )
            course = result.scalar_one()

            ctx = AgentContext(db=db, user_id=user_id, course_instance_id=course_id)

            await broadcast(key, "generating_assessment", {})

            spec = await run_assessment_creator(
                ctx,
                objectives=objectives,
                course_description=description,
                activity_scores=activity_scores,
                learner_profile=learner_profile,
            )

            assessment = Assessment(
                course_instance_id=course_id,
                assessment_spec=spec.model_dump(),
                status="pending",
            )
            db.add(assessment)
            await db.flush()
            await db.commit()

            # Refresh so transition guard sees the new assessment
            await db.refresh(course, ["assessments"])

            try:
                await transition_course(db, course, "assessment_ready")
                await db.commit()
            except InvalidTransitionError:
                pass  # Already in assessment_ready (retry case)

        # Broadcast AFTER session commit
        await broadcast(key, "assessment_complete", {
            "assessment_id": assessment.id,
        })

    except Exception:
        logger.exception("Error generating assessment for course %s", course_id)
        # Try to roll back course status
        try:
            async with get_background_session() as db:
                result = await db.execute(
                    select(CourseInstance)
                    .where(CourseInstance.id == course_id)
                    .options(selectinload(CourseInstance.assessments))
                )
                course = result.scalar_one_or_none()
                if course and course.status == "generating_assessment":
                    await transition_course(db, course, "awaiting_assessment")
        except Exception:
            logger.exception("Could not roll back course %s status", course_id)

        await broadcast(key, "assessment_error", {
            "error": "Failed to generate assessment",
        })


@router.post("/{course_id}/generate", response_model=dict)
async def generate_assessment(
    course_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    key = _assessment_key(course_id)

    # Check if generation is already running
    if is_running(key):
        raise HTTPException(status_code=409, detail="Assessment generation already in progress")

    result = await db.execute(
        select(CourseInstance)
        .where(CourseInstance.id == course_id, CourseInstance.user_id == user.id)
        .options(
            selectinload(CourseInstance.lessons).selectinload(Lesson.activities),
            selectinload(CourseInstance.assessments),
        )
    )
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    if course.status not in ("awaiting_assessment", "assessment_ready"):
        raise HTTPException(
            status_code=400,
            detail=f"Course is in '{course.status}' state, not ready for assessment",
        )

    # Gather activity scores
    activity_scores = []
    for lesson in course.lessons:
        for activity in lesson.activities:
            if activity.latest_score is not None:
                activity_scores.append({
                    "objective": course.input_objectives[lesson.objective_index]
                    if lesson.objective_index < len(course.input_objectives)
                    else "",
                    "score": activity.latest_score,
                    "mastery": activity.mastery_decision,
                })

    # Build learner profile
    profile_dict = None
    if user.learner_profile:
        p = user.learner_profile
        profile_dict = {
            "experience_level": p.experience_level,
            "learning_goals": p.learning_goals,
            "interests": p.interests,
            "learning_style": p.learning_style,
            "tone_preference": p.tone_preference,
        }

    # Capture plain data
    objectives = list(course.input_objectives)
    description = course.input_description or ""

    # Transition to generating_assessment and commit
    await transition_course(db, course, "generating_assessment")
    await db.commit()

    # Spawn background task
    try:
        start_generation(
            key,
            generate_assessment_background(
                course_id=course_id,
                user_id=user.id,
                objectives=objectives,
                description=description,
                activity_scores=activity_scores or None,
                learner_profile=profile_dict,
            ),
        )
    except RuntimeError:
        raise HTTPException(status_code=409, detail="Assessment generation already in progress")

    return {"id": course_id, "status": "generating_assessment"}


@router.get("/{course_id}/assessment", response_model=AssessmentResponse)
async def get_assessment(
    course_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    result = await db.execute(
        select(CourseInstance)
        .where(CourseInstance.id == course_id, CourseInstance.user_id == user.id)
        .options(selectinload(CourseInstance.assessments))
    )
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Auto-heal zombie: stuck in generating_assessment with no active task
    key = _assessment_key(course_id)
    if course.status == "generating_assessment" and not is_running(key):
        course.status = "awaiting_assessment"
        await db.flush()
        await db.commit()

    # Find the latest assessment (query with explicit ordering)
    assess_result = await db.execute(
        select(Assessment)
        .where(Assessment.course_instance_id == course_id)
        .order_by(Assessment.id.desc())
        .limit(1)
    )
    assessment = assess_result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="No assessment generated yet")

    return AssessmentResponse(
        id=assessment.id,
        status=assessment.status,
        score=assessment.score,
        passed=assessment.passed,
        feedback=assessment.feedback,
        assessment_spec=assessment.assessment_spec,
    )


@router.get("/{course_id}/assessment-stream")
async def assessment_stream(
    course_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    user_id = user.id
    key = _assessment_key(course_id)

    # Verify course exists and belongs to user
    result = await db.execute(
        select(CourseInstance)
        .where(CourseInstance.id == course_id, CourseInstance.user_id == user_id)
        .options(selectinload(CourseInstance.assessments))
    )
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    generation_in_flight = is_running(key)

    # Catchup: if assessment already exists, send complete event immediately
    has_assessment = bool(course.assessments)

    async def event_generator() -> AsyncGenerator[dict, None]:
        if has_assessment:
            # Get latest assessment with explicit ordering
            assess_result = await db.execute(
                select(Assessment)
                .where(Assessment.course_instance_id == course_id)
                .order_by(Assessment.id.desc())
                .limit(1)
            )
            latest = assess_result.scalar_one()
            yield {
                "event": "assessment_complete",
                "data": json.dumps({"assessment_id": latest.id}),
            }
            return

        if not generation_in_flight and course.status != "generating_assessment":
            yield {
                "event": "assessment_error",
                "data": json.dumps({"error": "No assessment generation in progress"}),
            }
            return

        # Subscribe for live events
        queue = subscribe(key)
        try:
            while True:
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=5.0)
                except asyncio.TimeoutError:
                    if not is_running(key):
                        # Check if assessment was created while we waited
                        db.expire_all()
                        result_inner = await db.execute(
                            select(Assessment)
                            .where(Assessment.course_instance_id == course_id)
                            .order_by(Assessment.id.desc())
                            .limit(1)
                        )
                        latest = result_inner.scalar_one_or_none()
                        if latest:
                            yield {
                                "event": "assessment_complete",
                                "data": json.dumps({"assessment_id": latest.id}),
                            }
                            return
                        yield {
                            "event": "assessment_error",
                            "data": json.dumps({"error": "Assessment generation ended without result"}),
                        }
                        return
                    yield {"comment": "keepalive"}
                    continue

                yield {
                    "event": message["event"],
                    "data": json.dumps(message["data"]),
                }

                if message["event"] in ("assessment_complete", "assessment_error"):
                    return
        finally:
            unsubscribe(key, queue)

    return EventSourceResponse(event_generator())


@router.post("/{assessment_id}/submit", response_model=AssessmentResponse)
async def submit_assessment(
    assessment_id: str,
    req: AssessmentSubmitRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    result = await db.execute(
        select(Assessment)
        .where(Assessment.id == assessment_id)
        .options(selectinload(Assessment.course_instance))
    )
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    course = assessment.course_instance
    if course.user_id != user.id:
        raise HTTPException(status_code=404, detail="Assessment not found")

    ctx = AgentContext(db=db, user_id=user.id, course_instance_id=course.id)

    submissions = [{"objective": r.objective, "text": r.text} for r in req.responses]

    review = await run_assessment_reviewer(
        ctx,
        assessment_spec=assessment.assessment_spec,
        submissions=submissions,
    )

    assessment.submissions = submissions
    assessment.score = review.overall_score
    assessment.passed = review.pass_decision == "pass"
    assessment.feedback = {
        "overall_score": review.overall_score,
        "objective_scores": [s.model_dump() for s in review.objective_scores],
        "pass_decision": review.pass_decision,
        "next_steps": review.next_steps,
    }
    assessment.status = "reviewed"
    await db.flush()

    # Transition course if passed
    if assessment.passed:
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
            await transition_course(db, course, "completed")
        except InvalidTransitionError:
            pass

    return AssessmentResponse(
        id=assessment.id,
        status=assessment.status,
        score=assessment.score,
        passed=assessment.passed,
        feedback=assessment.feedback,
        assessment_spec=assessment.assessment_spec,
    )
