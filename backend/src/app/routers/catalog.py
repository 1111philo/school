from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db.models import CourseInstance, User
from app.db.session import get_db_session
from app.services.catalog import get_catalog, get_course

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("")
async def list_catalog(
    search: str | None = None,
    tag: str | None = None,
):
    catalog = get_catalog()
    courses = list(catalog.values())

    if search:
        search_lower = search.lower()
        courses = [
            c
            for c in courses
            if search_lower in c.name.lower() or search_lower in c.description.lower()
        ]

    if tag:
        courses = [c for c in courses if tag in c.tags]

    return [c.model_dump() for c in courses]


@router.post("/{course_id}/start", response_model=dict)
async def start_predefined_course(
    course_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    predefined = get_course(course_id)
    if not predefined:
        raise HTTPException(status_code=404, detail="Course not found in catalog")

    course = CourseInstance(
        user_id=user.id,
        source_type="predefined",
        source_course_id=course_id,
        input_description=predefined.description,
        input_objectives=predefined.learning_objectives,
        status="draft",
    )
    db.add(course)
    await db.flush()

    return {"id": course.id, "status": course.status}
