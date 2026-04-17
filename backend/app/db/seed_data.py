from __future__ import annotations

from datetime import date, datetime, time, timedelta

from sqlalchemy import select

from app.core.config import settings
from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models import (
    Department,
    MealCategoryEnum,
    MealPackage,
    MealPackageItem,
    MealSlot,
    MealTypeEnum,
    RoleEnum,
    User,
    UserStatusEnum,
)


def _ensure_root_department(db) -> Department:
    dept = db.scalar(select(Department).where(Department.dept_code == "ROOT"))
    if dept:
        return dept

    dept = Department(dept_code="ROOT", dept_name="机关本部", is_active=True)
    db.add(dept)
    db.flush()
    return dept


def _ensure_user(
    db,
    *,
    police_no: str,
    real_name: str,
    dept_id: int,
    role: RoleEnum,
    password: str,
) -> User:
    user = db.scalar(select(User).where(User.police_no == police_no))
    if not user:
        user = User(
            police_no=police_no,
            real_name=real_name,
            dept_id=dept_id,
            role=role,
            status=UserStatusEnum.ACTIVE,
            password_hash=get_password_hash(password),
        )
        db.add(user)
        db.flush()
        return user

    # Do not override existing account profile/password during scheduled sync.
    return user


def _upsert_package_with_single_item(
    db,
    *,
    slot_id: int,
    code: str,
    name: str,
    price: float,
    calories: int,
    item_type: str,
    sort_order: int,
) -> None:
    pkg = db.scalar(
        select(MealPackage).where(MealPackage.slot_id == slot_id, MealPackage.package_code == code)
    )
    if not pkg:
        pkg = MealPackage(
            slot_id=slot_id,
            package_code=code,
            package_name=name,
            meal_category=MealCategoryEnum.NORMAL,
            is_selectable=True,
            price=price,
            calories=calories,
            protein_g=None,
            carbs_g=None,
            fat_g=None,
            sort_order=sort_order,
        )
        db.add(pkg)
        db.flush()
    else:
        pkg.package_name = name
        pkg.meal_category = MealCategoryEnum.NORMAL
        pkg.is_selectable = True
        pkg.price = price
        pkg.calories = calories
        pkg.protein_g = None
        pkg.carbs_g = None
        pkg.fat_g = None
        pkg.sort_order = sort_order

    existing_items = db.scalars(select(MealPackageItem).where(MealPackageItem.package_id == pkg.id)).all()
    if existing_items:
        existing_items[0].item_name = name
        existing_items[0].quantity = 1
        existing_items[0].unit = "份"
        existing_items[0].item_type = item_type
        existing_items[0].sort_order = 1
        for extra in existing_items[1:]:
            db.delete(extra)
        return

    db.add(
        MealPackageItem(
            package_id=pkg.id,
            item_name=name,
            quantity=1,
            unit="份",
            item_type=item_type,
            sort_order=1,
        )
    )


def _upsert_main_meal_package(
    db,
    *,
    slot_id: int,
    category: MealCategoryEnum,
    code: str,
    name: str,
    price: float,
    nutrition: dict,
    items: list[tuple[str, float, str, str]],
    sort_order: int,
) -> None:
    pkg = db.scalar(
        select(MealPackage).where(MealPackage.slot_id == slot_id, MealPackage.package_code == code)
    )
    if not pkg:
        pkg = MealPackage(
            slot_id=slot_id,
            package_code=code,
            package_name=name,
            meal_category=category,
            is_selectable=True,
            price=price,
            calories=nutrition["calories"],
            protein_g=nutrition["protein_g"],
            carbs_g=nutrition["carbs_g"],
            fat_g=nutrition["fat_g"],
            sort_order=sort_order,
        )
        db.add(pkg)
        db.flush()
    else:
        pkg.package_name = name
        pkg.meal_category = category
        pkg.is_selectable = True
        pkg.price = price
        pkg.calories = nutrition["calories"]
        pkg.protein_g = nutrition["protein_g"]
        pkg.carbs_g = nutrition["carbs_g"]
        pkg.fat_g = nutrition["fat_g"]
        pkg.sort_order = sort_order

    db.query(MealPackageItem).filter(MealPackageItem.package_id == pkg.id).delete()
    for item_index, (item_name, quantity, unit, item_type) in enumerate(items, start=1):
        db.add(
            MealPackageItem(
                package_id=pkg.id,
                item_name=item_name,
                quantity=quantity,
                unit=unit,
                item_type=item_type,
                sort_order=item_index,
            )
        )


def _ensure_slot_with_packages(
    db,
    *,
    meal_date: date,
    meal_type: MealTypeEnum,
    created_by: int,
    default_is_open: bool,
) -> None:
    slot = db.scalar(select(MealSlot).where(MealSlot.meal_date == meal_date, MealSlot.meal_type == meal_type))
    if not slot:
        slot = MealSlot(
            meal_date=meal_date,
            meal_type=meal_type,
            booking_deadline=datetime.combine(meal_date, time(23, 59, 59)),
            is_open=default_is_open,
            created_by=created_by,
        )
        db.add(slot)
        db.flush()
    else:
        # Keep manual open/close settings, but for untouched auto-generated slots
        # align to current default window policy.
        if slot.updated_at == slot.created_at and slot.is_open != default_is_open:
            slot.is_open = default_is_open

    if meal_type == MealTypeEnum.BREAKFAST:
        breakfast_items = [
            ("baozi", "包子", 2.50, 110, "snack"),
            ("youtiao", "油条", 3.00, 210, "snack"),
            ("ciba", "糍粑", 4.00, 190, "snack"),
            ("doujiang", "豆浆", 2.00, 95, "drink"),
        ]
        desired_codes = {code for code, _, _, _, _ in breakfast_items}

        existing_packages = db.scalars(select(MealPackage).where(MealPackage.slot_id == slot.id)).all()
        for pkg in existing_packages:
            if pkg.package_code not in desired_codes:
                pkg.is_selectable = False

        for idx, (code, name, price, calories, item_type) in enumerate(breakfast_items, start=1):
            _upsert_package_with_single_item(
                db,
                slot_id=slot.id,
                code=code,
                name=name,
                price=price,
                calories=calories,
                item_type=item_type,
                sort_order=idx,
            )
        return

    main_meal_templates = [
        (
            MealCategoryEnum.NORMAL,
            "normal",
            "普通套餐",
            18.00,
            {"calories": 820, "protein_g": 42, "carbs_g": 98, "fat_g": 28},
            [("米饭", 1, "份", "staple"), ("时蔬", 1, "份", "vegetable"), ("蛋白主菜", 1, "份", "protein")],
        ),
        (
            MealCategoryEnum.FAT_LOSS,
            "fat_loss",
            "减脂套餐",
            22.00,
            {"calories": 560, "protein_g": 48, "carbs_g": 52, "fat_g": 18},
            [("糙米", 1, "份", "staple"), ("鸡胸肉", 1, "份", "protein"), ("西兰花", 1, "份", "vegetable")],
        ),
    ]

    desired_codes = {code for _, code, _, _, _, _ in main_meal_templates}
    existing_packages = db.scalars(select(MealPackage).where(MealPackage.slot_id == slot.id)).all()
    for pkg in existing_packages:
        if pkg.package_code not in desired_codes:
            pkg.is_selectable = False

    for idx, (category, code, name, price, nutrition, items) in enumerate(main_meal_templates, start=1):
        _upsert_main_meal_package(
            db,
            slot_id=slot.id,
            category=category,
            code=code,
            name=f"{name}-{meal_type.value}",
            price=price,
            nutrition=nutrition,
            items=items,
            sort_order=idx,
        )


def seed_dev_data() -> None:
    if settings.app_env.lower() in {"prod", "production"}:
        return

    with SessionLocal() as db:
        dept = _ensure_root_department(db)

        super_admin = _ensure_user(
            db,
            police_no="900001",
            real_name="superadmin",
            dept_id=dept.id,
            role=RoleEnum.SUPER_ADMIN,
            password="123456",
        )
        _ensure_user(
            db,
            police_no="900002",
            real_name="adminuser",
            dept_id=dept.id,
            role=RoleEnum.ADMIN,
            password="123456",
        )
        _ensure_user(
            db,
            police_no="900003",
            real_name="kitchenuser",
            dept_id=dept.id,
            role=RoleEnum.KITCHEN,
            password="123456",
        )
        _ensure_user(
            db,
            police_no="900004",
            real_name="officeruser",
            dept_id=dept.id,
            role=RoleEnum.OFFICER,
            password="123456",
        )

        today = date.today()
        seed_days = max(1, int(settings.booking_seed_days))
        auto_open_days = max(0, int(settings.booking_auto_open_days))
        for offset in range(0, seed_days):
            target_day = today + timedelta(days=offset)
            default_is_open = offset < auto_open_days
            _ensure_slot_with_packages(
                db,
                meal_date=target_day,
                meal_type=MealTypeEnum.BREAKFAST,
                created_by=super_admin.id,
                default_is_open=default_is_open,
            )
            _ensure_slot_with_packages(
                db,
                meal_date=target_day,
                meal_type=MealTypeEnum.LUNCH,
                created_by=super_admin.id,
                default_is_open=default_is_open,
            )
            _ensure_slot_with_packages(
                db,
                meal_date=target_day,
                meal_type=MealTypeEnum.DINNER,
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
            dept = _ensure_root_department(db)
            super_admin = _ensure_user(
                db,
                police_no="900001",
                real_name="superadmin",
                dept_id=dept.id,
                role=RoleEnum.SUPER_ADMIN,
                password="123456",
            )

        today = date.today()
        seed_days = max(1, int(settings.booking_seed_days))
        auto_open_days = max(0, int(settings.booking_auto_open_days))
        for offset in range(0, seed_days):
            target_day = today + timedelta(days=offset)
            default_is_open = offset < auto_open_days
            _ensure_slot_with_packages(
                db,
                meal_date=target_day,
                meal_type=MealTypeEnum.BREAKFAST,
                created_by=super_admin.id,
                default_is_open=default_is_open,
            )
            _ensure_slot_with_packages(
                db,
                meal_date=target_day,
                meal_type=MealTypeEnum.LUNCH,
                created_by=super_admin.id,
                default_is_open=default_is_open,
            )
            _ensure_slot_with_packages(
                db,
                meal_date=target_day,
                meal_type=MealTypeEnum.DINNER,
                created_by=super_admin.id,
                default_is_open=default_is_open,
            )

        db.commit()
