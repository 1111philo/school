from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import get_current_user
from app.db.models import CourseInstance, Lesson, User
from app.db.session import get_db_session
from app.schemas.course import CourseCreateRequest, CourseListItem, CourseResponse
from app.services.generation import generate_course
from app.services.progression import InvalidTransitionError, transition_course

router = APIRouter(prefix="/api/courses", tags=["courses"])


@router.post("", response_model=dict)
async def create_course(
    req: CourseCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    course = CourseInstance(
        user_id=user.id,
        source_type="custom",
        input_description=req.description,
        input_objectives=req.objectives,
        status="draft",
    )
    db.add(course)
    await db.flush()
    return {"id": course.id, "status": course.status}


@router.post("/{course_id}/generate", response_model=dict)
async def trigger_generation(
    course_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    result = await db.execute(
        select(CourseInstance)
        .where(CourseInstance.id == course_id, CourseInstance.user_id == user.id)
        .options(selectinload(CourseInstance.lessons))
    )
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Get learner profile if it exists (already eagerly loaded via get_current_user)
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

    await generate_course(db, course, profile_dict)
    return {"id": course.id, "status": course.status}


@router.get("", response_model=list[CourseListItem])
async def list_courses(
    status: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    query = (
        select(CourseInstance)
        .where(CourseInstance.user_id == user.id)
        .options(selectinload(CourseInstance.lessons))
    )
    if status:
        query = query.where(CourseInstance.status == status)
    result = await db.execute(query.order_by(CourseInstance.created_at.desc()))
    courses = result.scalars().all()

    return [
        CourseListItem(
            id=c.id,
            source_type=c.source_type,
            input_description=c.input_description,
            status=c.status,
            lesson_count=len(c.lessons),
            lessons_completed=sum(1 for l in c.lessons if l.status == "completed"),
        )
        for c in courses
    ]


@router.get("/{course_id}", response_model=CourseResponse)
async def get_course(
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

    from app.schemas.course import ActivityResponse, AssessmentSummary, LessonResponse

    return CourseResponse(
        id=course.id,
        source_type=course.source_type,
        input_description=course.input_description,
        input_objectives=course.input_objectives,
        generated_description=course.generated_description,
        status=course.status,
        lessons=[
            LessonResponse(
                id=l.id,
                objective_index=l.objective_index,
                lesson_content=l.lesson_content,
                status=l.status,
                activity=ActivityResponse(
                    id=l.activities[0].id,
                    activity_spec=l.activities[0].activity_spec,
                    latest_score=l.activities[0].latest_score,
                    latest_feedback=l.activities[0].latest_feedback,
                    mastery_decision=l.activities[0].mastery_decision,
                    attempt_count=l.activities[0].attempt_count,
                )
                if l.activities
                else None,
            )
            for l in course.lessons
        ],
        assessments=[
            AssessmentSummary(
                id=a.id, status=a.status, score=a.score, passed=a.passed
            )
            for a in course.assessments
        ],
    )


@router.patch("/{course_id}/state", response_model=dict)
async def update_course_state(
    course_id: str,
    target_state: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    result = await db.execute(
        select(CourseInstance)
        .where(CourseInstance.id == course_id, CourseInstance.user_id == user.id)
        .options(
            selectinload(CourseInstance.lessons),
            selectinload(CourseInstance.assessments),
        )
    )
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    try:
        await transition_course(db, course, target_state)
    except InvalidTransitionError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"id": course.id, "status": course.status}


@router.delete("/{course_id}")
async def delete_course(
    course_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    result = await db.execute(
        select(CourseInstance)
        .where(CourseInstance.id == course_id, CourseInstance.user_id == user.id)
    )
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    await db.delete(course)
    return {"deleted": True}
