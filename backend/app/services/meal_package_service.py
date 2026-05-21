from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import MealPackage, MealPackageItem, MealSlot


def visible_packages(packages: list[MealPackage]) -> list[MealPackage]:
    return [pkg for pkg in packages if not pkg.is_deleted]


def clone_latest_packages_to_slot(db: Session, slot: MealSlot) -> int:
    if slot.packages:
        return 0

    template_slot_id = db.scalar(
        select(MealSlot.id)
        .join(MealPackage, MealPackage.slot_id == MealSlot.id)
        .where(
            MealSlot.id != slot.id,
            MealSlot.meal_type == slot.meal_type,
            MealSlot.meal_date < slot.meal_date,
            MealPackage.is_deleted.is_(False),
        )
        .group_by(MealSlot.id, MealSlot.meal_date)
        .order_by(MealSlot.meal_date.desc(), MealSlot.id.desc())
        .limit(1)
    )
    if template_slot_id is None:
        return 0

    template_slot = db.scalar(
        select(MealSlot)
        .where(MealSlot.id == template_slot_id)
        .options(joinedload(MealSlot.packages).joinedload(MealPackage.items))
    )
    if template_slot is None:
        return 0

    cloned_count = 0
    for template_pkg in sorted(template_slot.packages, key=lambda value: value.sort_order):
        if template_pkg.is_deleted:
            continue

        cloned_pkg = MealPackage(
            slot_id=slot.id,
            package_code=template_pkg.package_code,
            package_name=template_pkg.package_name,
            meal_category=template_pkg.meal_category,
            is_selectable=template_pkg.is_selectable,
            is_deleted=False,
            image_url=template_pkg.image_url,
            price=template_pkg.price,
            calories=template_pkg.calories,
            protein_g=template_pkg.protein_g,
            carbs_g=template_pkg.carbs_g,
            fat_g=template_pkg.fat_g,
            sort_order=template_pkg.sort_order,
        )
        db.add(cloned_pkg)
        db.flush()

        for template_item in sorted(template_pkg.items, key=lambda value: value.sort_order):
            db.add(
                MealPackageItem(
                    package_id=cloned_pkg.id,
                    item_name=template_item.item_name,
                    quantity=template_item.quantity,
                    unit=template_item.unit,
                    item_type=template_item.item_type,
                    sort_order=template_item.sort_order,
                )
            )
        cloned_count += 1

    return cloned_count
