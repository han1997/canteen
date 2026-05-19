from __future__ import annotations

from datetime import date, datetime, time, timedelta

from sqlalchemy import select

from app.core.config import settings
from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models import (
    MealSlot,
    MealTypeEnum,
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


def _ensure_slot(
    db,
    *,
    meal_date: date,
    meal_type: MealTypeEnum,
    created_by: int,
    default_is_open: bool,
) -> None:
    slot = db.scalar(select(MealSlot).where(MealSlot.meal_date == meal_date, MealSlot.meal_type == meal_type))
    if not slot:
        db.add(
            MealSlot(
                meal_date=meal_date,
                meal_type=meal_type,
                booking_deadline=datetime.combine(meal_date, time(23, 59, 59)),
                is_open=default_is_open,
                created_by=created_by,
            )
        )
        db.flush()
        return

    # Keep manual open/close settings, but for untouched auto-generated slots
    # align to current default window policy.
    if slot.updated_at == slot.created_at and slot.is_open != default_is_open:
        slot.is_open = default_is_open


def seed_dev_data() -> None:
    if settings.app_env.lower() in {"prod", "production"}:
        return

    with SessionLocal() as db:
        super_admin = _ensure_user(
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

        today = date.today()
        seed_days = max(1, int(settings.booking_seed_days))
        auto_open_days = max(0, int(settings.booking_auto_open_days))
        for offset in range(0, seed_days):
            target_day = today + timedelta(days=offset)
            default_is_open = offset < auto_open_days
            for meal_type in (MealTypeEnum.BREAKFAST, MealTypeEnum.LUNCH, MealTypeEnum.DINNER):
                _ensure_slot(
                    db,
                    meal_date=target_day,
                    meal_type=meal_type,
                    created_by=super_admin.id,
                    default_is_open=default_is_open,
                )

        db.commit()


def maintain_booking_window() -> None:
    """Run daily to keep future booking slots within configured window."""
    if settings.app_env.lower() in {"prod", "production"}:
        return

    with SessionLocal() as db:
        super_admin = db.scalar(select(User).where(User.role == RoleEnum.SUPER_ADMIN).order_by(User.id.asc()))
        if not super_admin:
            super_admin = _ensure_user(
                db,
                police_no="900001",
                real_name="superadmin",
                role=RoleEnum.SUPER_ADMIN,
                password="123456",
            )

        today = date.today()
        seed_days = max(1, int(settings.booking_seed_days))
        auto_open_days = max(0, int(settings.booking_auto_open_days))
        for offset in range(0, seed_days):
            target_day = today + timedelta(days=offset)
            default_is_open = offset < auto_open_days
            for meal_type in (MealTypeEnum.BREAKFAST, MealTypeEnum.LUNCH, MealTypeEnum.DINNER):
                _ensure_slot(
                    db,
                    meal_date=target_day,
                    meal_type=meal_type,
                    created_by=super_admin.id,
                    default_is_open=default_is_open,
                )

        db.commit()
