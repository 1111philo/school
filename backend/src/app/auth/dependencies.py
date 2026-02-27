from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import User
from app.db.session import get_db_session


DEV_USER_ID = "dev-user-001"
DEV_USER_EMAIL = "dev@1111.school"


async def get_current_user(db: AsyncSession = Depends(get_db_session)) -> User:
    """Stubbed auth: returns a dev user, creating one if it doesn't exist."""
    result = await db.execute(
        select(User)
        .where(User.id == DEV_USER_ID)
        .options(selectinload(User.learner_profile))
    )
    user = result.scalar_one_or_none()
    if user is None:
        user = User(id=DEV_USER_ID, email=DEV_USER_EMAIL)
        db.add(user)
        await db.flush()
    return user
