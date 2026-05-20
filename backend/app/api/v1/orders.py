from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import MealSlot, Order, OrderStatusEnum, User
from app.schemas.common import ApiMessage
from app.schemas.order import CancelOrderRequest, OrderCreateRequest, OrderOut
from app.services.audit_service import write_audit
from app.services.order_service import cancel_order, create_or_replace_order


router = APIRouter(prefix="/orders", tags=["orders"])


def _to_order_out(order: Order) -> OrderOut:
    items = []
    for item in order.items:
        unit_price = float(item.unit_price)
        quantity = float(item.quantity)
        items.append(
            {
                "item_name": item.item_name,
                "quantity": quantity,
                "unit": item.unit,
                "unit_price": unit_price,
                "amount": round(quantity * unit_price, 2),
            }
        )

    slot = order.slot
    return OrderOut(
        id=order.id,
        order_no=order.order_no,
        user_id=order.user_id,
        slot_id=order.slot_id,
        package_id=order.package_id,
        meal_category=order.meal_category.value,
        meal_type=slot.meal_type.value,
        meal_date=slot.meal_date,
        status=order.status.value,
        booked_at=order.booked_at,
        verified_at=order.verified_at,
        items=items,
    )


@router.post("", response_model=OrderOut)
def create_order(
    payload: OrderCreateRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    order = create_or_replace_order(
        db=db,
        user_id=current_user.id,
        slot_id=payload.slot_id,
        selections=[selection.model_dump() for selection in payload.selections],
        note=payload.note,
    )
    db.flush()
    db.refresh(order)

    write_audit(
        db,
        actor_user_id=current_user.id,
        action="UPSERT_ORDER",
        target_type="order",
        target_id=str(order.id),
        request_ip=request.client.host if request.client else None,
        detail_json={
            "slot_id": payload.slot_id,
            "selections": [selection.model_dump() for selection in payload.selections],
        },
    )
    db.commit()

    order = db.scalar(
        select(Order)
        .where(Order.id == order.id)
        .options(joinedload(Order.items), joinedload(Order.slot))
    )
    return _to_order_out(order)


@router.get("/my", response_model=list[OrderOut])
def my_orders(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    from_date: date = Query(...),
    to_date: date = Query(...),
):
    stmt = (
        select(Order)
        .join(MealSlot, MealSlot.id == Order.slot_id)
        .where(
            Order.user_id == current_user.id,
            MealSlot.meal_date >= from_date,
            MealSlot.meal_date <= to_date,
            Order.status != OrderStatusEnum.CANCELLED,
        )
        .options(joinedload(Order.items), joinedload(Order.slot))
        .order_by(Order.booked_at.desc())
    )
    orders = db.scalars(stmt).unique().all()
    return [_to_order_out(order) for order in orders]


@router.post("/{order_id}/cancel", response_model=ApiMessage)
def cancel(
    order_id: int,
    payload: CancelOrderRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    order = db.get(Order, order_id)
    if not order or order.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="订单不存在")

    cancel_order(db, order, payload.reason)
    write_audit(
        db,
        actor_user_id=current_user.id,
        action="CANCEL_ORDER",
        target_type="order",
        target_id=str(order.id),
        request_ip=request.client.host if request.client else None,
        detail_json={"reason": payload.reason},
    )
    db.commit()
    return ApiMessage(message="已取消")
