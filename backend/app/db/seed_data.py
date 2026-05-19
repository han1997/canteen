from __future__ import annotations

from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

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
    created_by: int | None,
    default_is_open: bool,
) -> None:
    slot = db.scalar(select(MealSlot).where(MealSlot.meal_date == meal_date, MealSlot.meal_type == meal_type))
    if not slot:
        try:
            with db.begin_nested():
                db.add(
                    MealSlot(
                        meal_date=meal_date,
                        meal_type=meal_type,
                        booking_deadline=datetime.combine(meal_date, time(23, 59, 59)),
                        is_open=default_is_open,
                        created_by=created_by,
                    )
                )
        except IntegrityError:
            # Another process inserted the same (meal_date, meal_type) concurrently.
            # Re-fetch and fall through to the existing-slot branch.
            slot = db.scalar(
                select(MealSlot).where(MealSlot.meal_date == meal_date, MealSlot.meal_type == meal_type)
            )
            if slot is None:
                raise
        else:
            return

    # Keep manual open/close settings, but for untouched auto-generated slots
    # align to current default window policy.
    if slot.updated_at == slot.created_at and slot.is_open != default_is_open:
        slot.is_open = default_is_open


def _seed_booking_slots(db, *, created_by: int | None) -> None:
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
                created_by=created_by,
                default_is_open=default_is_open,
            )


def _find_seed_owner_id(db) -> int | None:
    """Pick an owner id for auto-created slots. Returns None in production when no super_admin exists yet — created_by is nullable."""
    owner = db.scalar(select(User).where(User.role == RoleEnum.SUPER_ADMIN).order_by(User.id.asc()))
    return owner.id if owner else None


def ensure_booking_slots() -> None:
    """Always-on: guarantee future booking slots (breakfast/lunch/dinner) exist.

    Runs in every environment (including production). Today and tomorrow are open
    by default; the rest stays closed until staff opens them manually. No menu
    items are seeded — slots start empty.
    """
    with SessionLocal() as db:
        owner_id = _find_seed_owner_id(db)
        _seed_booking_slots(db, created_by=owner_id)
        db.commit()


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


def maintain_booking_window() -> None:
    """Run daily to keep future booking slots within configured window. Always-on."""
    ensure_booking_slots()
