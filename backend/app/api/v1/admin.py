from datetime import date, datetime, time
from random import randint
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.security import get_current_user, get_password_hash, role_required
from app.db.session import get_db
from app.models import (
    MealCategoryEnum,
    MealPackage,
    MealPackageItem,
    MealSlot,
    MealTypeEnum,
    Order,
    OrderItem,
    OrderStatusEnum,
    RoleEnum,
    User,
    UserStatusEnum,
)
from app.schemas.admin import (
    AdminUserCreateRequest,
    AdminUserOut,
    AdminUserRoleUpdateRequest,
    AdminUserStatusUpdateRequest,
)
from app.schemas.admin_meal import (
    AdminMealItemOut,
    AdminMealPackageCreateRequest,
    AdminMealPackageOut,
    AdminMealPackageUpdateRequest,
    AdminMealSlotCreateRequest,
    AdminMealSlotOut,
    AdminMealSlotStatusUpdateRequest,
)
from app.schemas.common import ApiMessage
from app.services.audit_service import write_audit


router = APIRouter(prefix="/admin", tags=["admin"])

USER_MANAGE_DEPS = [Depends(role_required(RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN))]
MEAL_MANAGE_DEPS = [Depends(role_required(RoleEnum.KITCHEN, RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN))]


def _query_lunch_dinner_package_stats(
    db: Session,
    *,
    from_date: date,
    to_date: date,
) -> list[dict]:
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

    result: list[dict] = []
    for row in rows:
        meal_type = row.meal_type.value if hasattr(row.meal_type, "value") else str(row.meal_type)
        result.append(
            {
                "meal_type": meal_type,
                "package_name": row.package_name,
                "total_quantity": float(row.total_quantity or 0),
            }
        )
    return result


def _to_meal_package_out(pkg: MealPackage) -> AdminMealPackageOut:
    return AdminMealPackageOut(
        id=pkg.id,
        slot_id=pkg.slot_id,
        package_code=pkg.package_code,
        package_name=pkg.package_name,
        meal_category=pkg.meal_category.value,
        is_selectable=pkg.is_selectable,
        price=float(pkg.price) if pkg.price is not None else None,
        calories=pkg.calories,
        protein_g=float(pkg.protein_g) if pkg.protein_g is not None else None,
        carbs_g=float(pkg.carbs_g) if pkg.carbs_g is not None else None,
        fat_g=float(pkg.fat_g) if pkg.fat_g is not None else None,
        sort_order=pkg.sort_order,
        items=[
            AdminMealItemOut(
                id=item.id,
                item_name=item.item_name,
                quantity=float(item.quantity),
                unit=item.unit,
                item_type=item.item_type,
            )
            for item in sorted(pkg.items, key=lambda value: value.sort_order)
        ],
    )


def _to_meal_slot_out(slot: MealSlot) -> AdminMealSlotOut:
    return AdminMealSlotOut(
        id=slot.id,
        meal_date=slot.meal_date,
        meal_type=slot.meal_type.value,
        booking_deadline=slot.booking_deadline,
        is_open=slot.is_open,
        packages=[_to_meal_package_out(pkg) for pkg in sorted(slot.packages, key=lambda value: value.sort_order)],
    )


def _default_deadline(meal_date: date) -> datetime:
    return datetime.combine(meal_date, time(23, 59, 59))


def _generate_package_code() -> str:
    return f"pkg{datetime.utcnow().strftime('%H%M%S')}{randint(100, 999)}"


def _package_code_exists(db: Session, slot_id: int, package_code: str) -> bool:
    return db.scalar(
        select(MealPackage.id).where(MealPackage.slot_id == slot_id, MealPackage.package_code == package_code)
    ) is not None


def _pick_available_package_code(db: Session, slot_id: int, preferred_code: str | None = None) -> str:
    if preferred_code and not _package_code_exists(db, slot_id, preferred_code):
        return preferred_code

    for _ in range(10):
        candidate = _generate_package_code()
        if not _package_code_exists(db, slot_id, candidate):
            return candidate

    raise HTTPException(status_code=409, detail="套餐编码冲突，请重试")


def _is_slot_package_code_conflict(exc: IntegrityError) -> bool:
    message = str(exc.orig) if exc.orig is not None else str(exc)
    return "uk_meal_packages_slot_code" in message


def _load_slot(db: Session, slot_id: int) -> MealSlot:
    slot = db.scalar(
        select(MealSlot).where(MealSlot.id == slot_id).options(joinedload(MealSlot.packages).joinedload(MealPackage.items))
    )
    if not slot:
        raise HTTPException(status_code=404, detail="订餐时段不存在")
    return slot


@router.get("/users", response_model=list[AdminUserOut], dependencies=USER_MANAGE_DEPS)
def list_users(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    keyword: str | None = Query(default=None),
):
    _ = current_user
    stmt = select(User)
    if keyword:
        stmt = stmt.where((User.police_no.like(f"%{keyword}%")) | (User.real_name.like(f"%{keyword}%")))
    return db.scalars(stmt.order_by(User.id.desc())).all()


@router.post("/users", response_model=AdminUserOut, dependencies=USER_MANAGE_DEPS)
def create_user(
    payload: AdminUserCreateRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    exists = db.scalar(select(User).where(User.police_no == payload.police_no))
    if exists:
        raise HTTPException(status_code=400, detail="警号已存在")

    user = User(
        police_no=payload.police_no,
        real_name=payload.real_name,
        dept_id=payload.dept_id,
        mobile=payload.mobile,
        role=RoleEnum(payload.role),
        status=UserStatusEnum.ACTIVE,
        password_hash=get_password_hash(payload.init_password),
    )
    db.add(user)
    db.flush()

    write_audit(
        db,
        actor_user_id=current_user.id,
        action="CREATE_USER",
        target_type="user",
        target_id=str(user.id),
        request_ip=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/role", response_model=ApiMessage, dependencies=USER_MANAGE_DEPS)
def update_role(
    user_id: int,
    payload: AdminUserRoleUpdateRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    user.role = RoleEnum(payload.role)
    write_audit(
        db,
        actor_user_id=current_user.id,
        action="UPDATE_USER_ROLE",
        target_type="user",
        target_id=str(user.id),
        request_ip=request.client.host if request.client else None,
        detail_json={"role": payload.role},
    )
    db.commit()
    return ApiMessage(message="角色已更新")


@router.patch("/users/{user_id}/status", response_model=ApiMessage, dependencies=USER_MANAGE_DEPS)
def update_status(
    user_id: int,
    payload: AdminUserStatusUpdateRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    user.status = UserStatusEnum(payload.status)
    write_audit(
        db,
        actor_user_id=current_user.id,
        action="UPDATE_USER_STATUS",
        target_type="user",
        target_id=str(user.id),
        request_ip=request.client.host if request.client else None,
        detail_json={"status": payload.status},
    )
    db.commit()
    return ApiMessage(message="状态已更新")


@router.get("/dashboard/today", dependencies=MEAL_MANAGE_DEPS)
def today_dashboard(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    target_date: date = Query(default_factory=date.today),
):
    _ = current_user
    order_stmt = (
        select(
            func.count(Order.id).label("total_orders"),
            func.sum(case((MealSlot.meal_type == MealTypeEnum.BREAKFAST, 1), else_=0)).label("breakfast_orders"),
            func.sum(case((MealSlot.meal_type == MealTypeEnum.LUNCH, 1), else_=0)).label("lunch_orders"),
            func.sum(case((MealSlot.meal_type == MealTypeEnum.DINNER, 1), else_=0)).label("dinner_orders"),
        )
        .select_from(Order)
        .join(MealSlot, MealSlot.id == Order.slot_id)
        .where(
            MealSlot.meal_date == target_date,
            Order.status != OrderStatusEnum.CANCELLED,
        )
    )
    order_row = db.execute(order_stmt).one()
    package_stats = _query_lunch_dinner_package_stats(db, from_date=target_date, to_date=target_date)

    return {
        "date": target_date,
        "total_orders": int(order_row.total_orders or 0),
        "breakfast_orders": int(order_row.breakfast_orders or 0),
        "lunch_orders": int(order_row.lunch_orders or 0),
        "dinner_orders": int(order_row.dinner_orders or 0),
        "package_stats": package_stats,
    }


@router.get("/meal-slots", response_model=list[AdminMealSlotOut], dependencies=MEAL_MANAGE_DEPS)
def list_meal_slots(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    meal_date: date = Query(...),
):
    _ = current_user
    stmt = (
        select(MealSlot)
        .where(MealSlot.meal_date == meal_date)
        .options(joinedload(MealSlot.packages).joinedload(MealPackage.items))
        .order_by(MealSlot.meal_type)
    )
    slots = db.scalars(stmt).unique().all()
    return [_to_meal_slot_out(slot) for slot in slots]


@router.post("/meal-slots", response_model=AdminMealSlotOut, dependencies=MEAL_MANAGE_DEPS)
def create_or_update_meal_slot(
    payload: AdminMealSlotCreateRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    meal_type = MealTypeEnum(payload.meal_type)
    slot = db.scalar(
        select(MealSlot).where(MealSlot.meal_date == payload.meal_date, MealSlot.meal_type == meal_type)
    )
    if not slot:
        slot = MealSlot(
            meal_date=payload.meal_date,
            meal_type=meal_type,
            booking_deadline=payload.booking_deadline or _default_deadline(payload.meal_date),
            is_open=payload.is_open,
            created_by=current_user.id,
        )
        db.add(slot)
        db.flush()
    else:
        slot.booking_deadline = payload.booking_deadline or slot.booking_deadline or _default_deadline(
            payload.meal_date
        )
        slot.is_open = payload.is_open

    write_audit(
        db,
        actor_user_id=current_user.id,
        action="UPSERT_MEAL_SLOT",
        target_type="meal_slot",
        target_id=str(slot.id),
        request_ip=request.client.host if request.client else None,
        detail_json={"meal_date": str(payload.meal_date), "meal_type": payload.meal_type, "is_open": payload.is_open},
    )
    db.commit()
    slot = _load_slot(db, slot.id)
    return _to_meal_slot_out(slot)


@router.patch("/meal-slots/{slot_id}/status", response_model=ApiMessage, dependencies=MEAL_MANAGE_DEPS)
def update_slot_status(
    slot_id: int,
    payload: AdminMealSlotStatusUpdateRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    slot = db.get(MealSlot, slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="订餐时段不存在")
    slot.is_open = payload.is_open

    write_audit(
        db,
        actor_user_id=current_user.id,
        action="UPDATE_MEAL_SLOT_STATUS",
        target_type="meal_slot",
        target_id=str(slot.id),
        request_ip=request.client.host if request.client else None,
        detail_json={"is_open": payload.is_open},
    )
    db.commit()
    return ApiMessage(message="时段状态已更新")


@router.post("/meal-slots/{slot_id}/packages", response_model=AdminMealPackageOut, dependencies=MEAL_MANAGE_DEPS)
def create_meal_package(
    slot_id: int,
    payload: AdminMealPackageCreateRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    slot = db.get(MealSlot, slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="订餐时段不存在")

    meal_category = MealCategoryEnum.NORMAL if slot.meal_type == MealTypeEnum.BREAKFAST else MealCategoryEnum(payload.meal_category)
    max_sort = db.scalar(select(func.max(MealPackage.sort_order)).where(MealPackage.slot_id == slot_id)) or 0

    pkg: MealPackage | None = None
    preferred_code = payload.package_code
    for _ in range(5):
        package_code = _pick_available_package_code(db, slot_id, preferred_code=preferred_code)
        preferred_code = None
        try:
            with db.begin_nested():
                candidate_pkg = MealPackage(
                    slot_id=slot_id,
                    package_code=package_code,
                    package_name=payload.package_name,
                    meal_category=meal_category,
                    is_selectable=payload.is_selectable,
                    price=payload.price,
                    calories=payload.calories,
                    protein_g=payload.protein_g,
                    carbs_g=payload.carbs_g,
                    fat_g=payload.fat_g,
                    sort_order=int(max_sort) + 1,
                )
                db.add(candidate_pkg)
                db.flush()
            pkg = candidate_pkg
            break
        except IntegrityError as exc:
            if not _is_slot_package_code_conflict(exc):
                raise

    if pkg is None:
        raise HTTPException(status_code=409, detail="套餐编码冲突，请重试")

    db.add(
        MealPackageItem(
            package_id=pkg.id,
            item_name=payload.package_name,
            quantity=1,
            unit="份",
            item_type="snack" if slot.meal_type == MealTypeEnum.BREAKFAST else "other",
            sort_order=1,
        )
    )

    write_audit(
        db,
        actor_user_id=current_user.id,
        action="CREATE_MEAL_PACKAGE",
        target_type="meal_package",
        target_id=str(pkg.id),
        request_ip=request.client.host if request.client else None,
        detail_json={"slot_id": slot_id, "package_name": payload.package_name},
    )
    db.commit()

    pkg = db.scalar(select(MealPackage).where(MealPackage.id == pkg.id).options(joinedload(MealPackage.items)))
    return _to_meal_package_out(pkg)


@router.patch("/meal-packages/{package_id}", response_model=AdminMealPackageOut, dependencies=MEAL_MANAGE_DEPS)
def update_meal_package(
    package_id: int,
    payload: AdminMealPackageUpdateRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    pkg = db.scalar(
        select(MealPackage)
        .where(MealPackage.id == package_id)
        .options(joinedload(MealPackage.items), joinedload(MealPackage.slot))
    )
    if not pkg:
        raise HTTPException(status_code=404, detail="菜品不存在")

    if payload.package_name is not None:
        pkg.package_name = payload.package_name
        if pkg.items:
            pkg.items[0].item_name = payload.package_name
            for extra in pkg.items[1:]:
                db.delete(extra)
        else:
            db.add(
                MealPackageItem(
                    package_id=pkg.id,
                    item_name=payload.package_name,
                    quantity=1,
                    unit="份",
                    item_type="snack" if pkg.slot.meal_type == MealTypeEnum.BREAKFAST else "other",
                    sort_order=1,
                )
            )

    if payload.price is not None:
        pkg.price = payload.price
    if payload.calories is not None:
        pkg.calories = payload.calories
    if payload.protein_g is not None:
        pkg.protein_g = payload.protein_g
    if payload.carbs_g is not None:
        pkg.carbs_g = payload.carbs_g
    if payload.fat_g is not None:
        pkg.fat_g = payload.fat_g
    if payload.is_selectable is not None:
        pkg.is_selectable = payload.is_selectable

    if pkg.slot.meal_type == MealTypeEnum.BREAKFAST:
        pkg.meal_category = MealCategoryEnum.NORMAL
    elif payload.meal_category is not None:
        pkg.meal_category = MealCategoryEnum(payload.meal_category)

    write_audit(
        db,
        actor_user_id=current_user.id,
        action="UPDATE_MEAL_PACKAGE",
        target_type="meal_package",
        target_id=str(pkg.id),
        request_ip=request.client.host if request.client else None,
    )
    db.commit()
    pkg = db.scalar(select(MealPackage).where(MealPackage.id == pkg.id).options(joinedload(MealPackage.items)))
    return _to_meal_package_out(pkg)
