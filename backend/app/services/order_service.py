from datetime import datetime
from random import randint

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import MealPackage, MealSlot, Order, OrderItem, OrderStatusEnum


def _build_order_no() -> str:
    return f"OD{datetime.utcnow().strftime('%Y%m%d%H%M%S')}{randint(1000, 9999)}"


def _normalize_selections(selections: list[dict]) -> dict[int, float]:
    normalized: dict[int, float] = {}
    for selection in selections:
        package_id = int(selection["package_id"])
        quantity = float(selection["quantity"])
        if quantity <= 0:
            continue
        normalized[package_id] = normalized.get(package_id, 0) + quantity
    return normalized


def create_or_replace_order(
    db: Session,
    user_id: int,
    slot_id: int,
    selections: list[dict],
    note: str | None,
) -> Order:
    slot = db.get(MealSlot, slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="订餐时段不存在")

    if not slot.is_open:
        raise HTTPException(status_code=400, detail="当前时段已关闭订餐")

    # 如果设置了截止时间，检查是否已过期
    if slot.booking_deadline:
        now = datetime.utcnow()
        if now > slot.booking_deadline:
            raise HTTPException(status_code=400, detail="当前时段已截止订餐")

    quantity_by_package = _normalize_selections(selections)
    if not quantity_by_package:
        raise HTTPException(status_code=400, detail="请至少选择 1 份菜品")

    package_ids = list(quantity_by_package.keys())
    package_list = db.scalars(
        select(MealPackage)
        .options(joinedload(MealPackage.meal_type_associations))
        .where(MealPackage.id.in_(package_ids), MealPackage.is_deleted.is_(False))
    ).unique().all()
    package_map = {pkg.id: pkg for pkg in package_list}
    if len(package_map) != len(package_ids):
        raise HTTPException(status_code=400, detail="部分菜品不存在")

    for pkg in package_map.values():
        # 检查菜品是否关联到当前时段的餐别
        if slot.meal_type not in pkg.meal_types:
            raise HTTPException(status_code=400, detail="部分菜品不属于当前时段")
        if pkg.is_deleted or not pkg.is_selectable:
            raise HTTPException(status_code=400, detail="部分菜品不可选")

    primary_package_id = sorted(package_ids)[0]
    primary_package = package_map[primary_package_id]

    existing_stmt = select(Order).where(Order.user_id == user_id, Order.slot_id == slot_id)
    existing = db.scalar(existing_stmt)

    if existing:
        if existing.status == OrderStatusEnum.VERIFIED:
            raise HTTPException(status_code=400, detail="已完成订单不可修改")
        existing.package_id = primary_package.id
        existing.meal_category = primary_package.meal_category
        existing.note = note
        existing.status = OrderStatusEnum.BOOKED
        order = existing
        db.query(OrderItem).filter(OrderItem.order_id == existing.id).delete()
    else:
        order = Order(
            order_no=_build_order_no(),
            user_id=user_id,
            slot_id=slot_id,
            package_id=primary_package.id,
            meal_category=primary_package.meal_category,
            note=note,
        )
        db.add(order)
        db.flush()

    for pkg_id in sorted(package_ids):
        pkg = package_map[pkg_id]
        qty = quantity_by_package[pkg_id]
        db.add(
            OrderItem(
                order_id=order.id,
                item_name=pkg.package_name,
                quantity=qty,
                unit_price=float(pkg.price or 0),
                unit="份",
            )
        )

    return order


def cancel_order(db: Session, order: Order, reason: str | None = None) -> None:
    if order.status == OrderStatusEnum.VERIFIED:
        raise HTTPException(status_code=400, detail="已完成订单不可取消")

    order.status = OrderStatusEnum.CANCELLED
    order.cancelled_at = datetime.utcnow()
    if reason:
        order.note = reason
