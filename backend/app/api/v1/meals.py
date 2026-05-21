from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.security import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models import MealPackage, MealSlot, User
from app.schemas.meal import MealItemOut, MealPackageOut, MealSlotOut


router = APIRouter(prefix="/meals", tags=["meals"])


@router.get("/slots", response_model=list[MealSlotOut])
def list_slots(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    meal_date: date = Query(..., description="查询日期，例如 2026-04-14"),
):
    _ = current_user
    slot_stmt = (
        select(MealSlot)
        .where(MealSlot.meal_date == meal_date)
        .options(joinedload(MealSlot.packages).joinedload(MealPackage.items))
        .order_by(MealSlot.meal_type)
    )
    slots = db.scalars(slot_stmt).unique().all()

    result: list[MealSlotOut] = []
    for slot in slots:
        packages: list[MealPackageOut] = []
        for pkg in sorted(slot.packages, key=lambda p: p.sort_order):
            if pkg.is_deleted or not pkg.is_selectable:
                continue
            items = [
                MealItemOut(
                    id=item.id,
                    item_name=item.item_name,
                    quantity=float(item.quantity),
                    unit=item.unit,
                    item_type=item.item_type,
                )
                for item in sorted(pkg.items, key=lambda i: i.sort_order)
            ]
            packages.append(
                MealPackageOut(
                    id=pkg.id,
                    package_code=pkg.package_code,
                    package_name=pkg.package_name,
                    meal_category=pkg.meal_category.value,
                    image_url=pkg.image_url or settings.default_meal_image_url,
                    price=float(pkg.price) if pkg.price is not None else None,
                    calories=pkg.calories,
                    protein_g=float(pkg.protein_g) if pkg.protein_g is not None else None,
                    carbs_g=float(pkg.carbs_g) if pkg.carbs_g is not None else None,
                    fat_g=float(pkg.fat_g) if pkg.fat_g is not None else None,
                    items=items,
                )
            )

        result.append(
            MealSlotOut(
                id=slot.id,
                meal_date=slot.meal_date,
                meal_type=slot.meal_type.value,
                booking_deadline=slot.booking_deadline,
                is_open=slot.is_open,
                packages=packages,
            )
        )
    return result

