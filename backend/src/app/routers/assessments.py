from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import get_current_user
from app.db.models import Assessment, CourseInstance, Lesson, User
from app.db.session import get_db_session
from app.agents.logging import AgentContext
from app.agents.assessment import run_assessment_creator, run_assessment_reviewer
from app.schemas.assessment import AssessmentResponse, AssessmentSubmitRequest
from app.services.progression import transition_course, InvalidTransitionError

router = APIRouter(prefix="/api/assessments", tags=["assessments"])


@router.post("/{course_id}/generate", response_model=AssessmentResponse)
async def generate_assessment(
    course_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
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
        raise HTTPException(status_code=400, detail=f"Course is in '{course.status}' state, not ready for assessment")

    ctx = AgentContext(db=db, user_id=user.id, course_instance_id=course.id)

    # Gather activity scores for the assessment creator
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

    # Get learner profile (already eagerly loaded via get_current_user)
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

    spec = await run_assessment_creator(
        ctx,
        objectives=course.input_objectives,
        course_description=course.input_description or "",
        activity_scores=activity_scores or None,
        learner_profile=profile_dict,
    )

    assessment = Assessment(
        course_instance_id=course.id,
        assessment_spec=spec.model_dump(),
        status="pending",
    )
    db.add(assessment)
    await db.flush()

    # Refresh assessments relationship so the guard sees the new assessment
    await db.refresh(course, ["assessments"])

    # Transition to assessment_ready
    try:
        await transition_course(db, course, "assessment_ready")
    except InvalidTransitionError:
        pass  # Already in assessment_ready (retry case)

    return AssessmentResponse(
        id=assessment.id,
        status=assessment.status,
        score=assessment.score,
        passed=assessment.passed,
        feedback=assessment.feedback,
        assessment_spec=assessment.assessment_spec,
    )


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
