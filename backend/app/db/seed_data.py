from __future__ import annotations

from sqlalchemy import select

from app.core.config import settings
from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models import (
    RoleEnum,
    User,
    UserStatusEnum,
)


DEFAULT_DEPT_NAME = "祁门县公安局"


def _ensure_user(
    db,
    *,
    police_no: str,
    real_name: str,
    role: RoleEnum,
    password: str,
    dept_name: str = DEFAULT_DEPT_NAME,
) -> User:
    user = db.scalar(select(User).where(User.police_no == police_no))
    if not user:
        user = User(
            police_no=police_no,
            real_name=real_name,
            dept_name=dept_name,
            role=role,
            status=UserStatusEnum.ACTIVE,
            password_hash=get_password_hash(password),
        )
        db.add(user)
        db.flush()
        return user

    # Do not override existing account profile/password during scheduled sync.
    return user


def seed_dev_users() -> None:
    """Dev-only: create the four test accounts (900001..900004)."""
    if settings.app_env.lower() in {"prod", "production"}:
        return

    with SessionLocal() as db:
        _ensure_user(
            db,
            police_no="900001",
            real_name="superadmin",
            role=RoleEnum.SUPER_ADMIN,
            password="123456",
        )
        _ensure_user(
            db,
            police_no="900002",
            real_name="adminuser",
            role=RoleEnum.ADMIN,
            password="123456",
        )
        _ensure_user(
            db,
            police_no="900003",
            real_name="kitchenuser",
            role=RoleEnum.KITCHEN,
            password="123456",
        )
        _ensure_user(
            db,
            police_no="900004",
            real_name="officeruser",
            role=RoleEnum.OFFICER,
            password="123456",
        )
        db.commit()
