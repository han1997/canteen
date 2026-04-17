from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.security import get_current_user, role_required
from app.db.session import get_db
from app.models import (
    ExportJob,
    MealSlot,
    MealTypeEnum,
    Order,
    OrderItem,
    OrderStatusEnum,
    RoleEnum,
    User,
)
from app.schemas.stats import BreakfastItemStatOut, ExportJobOut, ExportRequest, PackageStatOut, StatsSummaryOut
from app.services.audit_service import write_audit
from app.services.export_service import create_export_job, run_export_job


router = APIRouter(
    prefix="/stats",
    tags=["stats"],
    dependencies=[Depends(role_required(RoleEnum.KITCHEN, RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN))],
)


def _query_lunch_dinner_package_stats(
    db: Session,
    *,
    from_date: date,
    to_date: date,
) -> list[PackageStatOut]:
    stmt = (
        select(
            MealSlot.meal_type.label("meal_type"),
            OrderItem.item_name.label("package_name"),
            func.sum(OrderItem.quantity).label("total_quantity"),
        )
        .select_from(Order)
        .join(MealSlot, MealSlot.id == Order.slot_id)
        .join(OrderItem, OrderItem.order_id == Order.id)
        .where(
            MealSlot.meal_date >= from_date,
            MealSlot.meal_date <= to_date,
            MealSlot.meal_type.in_((MealTypeEnum.LUNCH, MealTypeEnum.DINNER)),
            Order.status != OrderStatusEnum.CANCELLED,
        )
        .group_by(MealSlot.meal_type, OrderItem.item_name)
        .order_by(MealSlot.meal_type.asc(), func.sum(OrderItem.quantity).desc(), OrderItem.item_name.asc())
    )
    rows = db.execute(stmt).all()

    result: list[PackageStatOut] = []
    for row in rows:
        meal_type = row.meal_type.value if hasattr(row.meal_type, "value") else str(row.meal_type)
        result.append(
            PackageStatOut(
                meal_type=meal_type,
                package_name=row.package_name,
                total_quantity=float(row.total_quantity or 0),
            )
        )
    return result


@router.get("/summary", response_model=StatsSummaryOut)
def summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    from_date: date = Query(...),
    to_date: date = Query(...),
):
    _ = current_user
    order_stmt = (
        select(
            func.count(Order.id),
            func.sum(case((MealSlot.meal_type == MealTypeEnum.BREAKFAST, 1), else_=0)),
            func.sum(case((MealSlot.meal_type == MealTypeEnum.LUNCH, 1), else_=0)),
            func.sum(case((MealSlot.meal_type == MealTypeEnum.DINNER, 1), else_=0)),
        )
        .select_from(Order)
        .join(MealSlot, MealSlot.id == Order.slot_id)
        .where(
            MealSlot.meal_date >= from_date,
            MealSlot.meal_date <= to_date,
            Order.status != OrderStatusEnum.CANCELLED,
        )
    )
    total, breakfast, lunch, dinner = db.execute(order_stmt).one()
    package_stats = _query_lunch_dinner_package_stats(db, from_date=from_date, to_date=to_date)

    return StatsSummaryOut(
        total_orders=int(total or 0),
        breakfast_orders=int(breakfast or 0),
        lunch_orders=int(lunch or 0),
        dinner_orders=int(dinner or 0),
        package_stats=package_stats,
    )


@router.get("/breakfast-items", response_model=list[BreakfastItemStatOut])
def breakfast_item_stats(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    from_date: date = Query(...),
    to_date: date = Query(...),
):
    _ = current_user
    stmt = (
        select(
            OrderItem.item_name.label("item_name"),
            func.sum(OrderItem.quantity).label("total_quantity"),
            func.max(OrderItem.unit_price).label("unit_price"),
            func.sum(OrderItem.quantity * OrderItem.unit_price).label("total_amount"),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .join(MealSlot, MealSlot.id == Order.slot_id)
        .where(
            MealSlot.meal_date >= from_date,
            MealSlot.meal_date <= to_date,
            MealSlot.meal_type == MealTypeEnum.BREAKFAST,
            Order.status != OrderStatusEnum.CANCELLED,
        )
        .group_by(OrderItem.item_name)
        .order_by(func.sum(OrderItem.quantity * OrderItem.unit_price).desc(), OrderItem.item_name.asc())
    )
    rows = db.execute(stmt).all()
    return [
        BreakfastItemStatOut(
            item_name=row.item_name,
            total_quantity=float(row.total_quantity or 0),
            unit_price=float(row.unit_price or 0),
            total_amount=float(row.total_amount or 0),
        )
        for row in rows
    ]


@router.post("/export", response_model=ExportJobOut)
def export_data(
    payload: ExportRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    if payload.from_date > payload.to_date:
        raise HTTPException(status_code=400, detail="开始日期不能大于结束日期")

    job = create_export_job(
        db=db,
        request_user_id=current_user.id,
        from_date=payload.from_date,
        to_date=payload.to_date,
        meal_type=payload.meal_type,
        meal_category=payload.meal_category,
    )
    run_export_job(db, job)

    write_audit(
        db,
        actor_user_id=current_user.id,
        action="EXPORT_STATS",
        target_type="export_job",
        target_id=str(job.id),
        request_ip=request.client.host if request.client else None,
        detail_json={
            "from_date": str(payload.from_date),
            "to_date": str(payload.to_date),
            "meal_type": payload.meal_type,
            "meal_category": payload.meal_category,
        },
    )
    db.commit()
    db.refresh(job)
    return job


@router.get("/export/{job_no}", response_model=ExportJobOut)
def export_job_detail(
    job_no: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    _ = current_user
    stmt = select(ExportJob).where(ExportJob.job_no == job_no)
    job = db.scalar(stmt)
    if not job:
        raise HTTPException(status_code=404, detail="导出任务不存在")
    return job
