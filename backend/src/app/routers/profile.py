from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db.models import LearnerProfile, User
from app.db.session import get_db_session
from app.schemas.profile import ProfileResponse, ProfileUpdateRequest

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("", response_model=ProfileResponse)
async def get_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    if not user.learner_profile:
        profile = LearnerProfile(user_id=user.id)
        db.add(profile)
        await db.flush()
        user.learner_profile = profile

    p = user.learner_profile
    return ProfileResponse(
        display_name=p.display_name,
        experience_level=p.experience_level,
        learning_goals=p.learning_goals,
        interests=p.interests,
        learning_style=p.learning_style,
        tone_preference=p.tone_preference,
        skill_signals=p.skill_signals,
        version=p.version,
    )


@router.put("", response_model=ProfileResponse)
async def update_profile(
    req: ProfileUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    if not user.learner_profile:
        profile = LearnerProfile(user_id=user.id)
        db.add(profile)
        await db.flush()
        user.learner_profile = profile

    p = user.learner_profile
    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(p, field, value)
    p.version += 1

    await db.flush()

    return ProfileResponse(
        display_name=p.display_name,
        experience_level=p.experience_level,
        learning_goals=p.learning_goals,
        interests=p.interests,
        learning_style=p.learning_style,
        tone_preference=p.tone_preference,
        skill_signals=p.skill_signals,
        version=p.version,
    )
