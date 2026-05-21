from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


def _enum_values(enum_cls: type[Enum]) -> list[str]:
    return [member.value for member in enum_cls]


class RoleEnum(str, Enum):
    OFFICER = "officer"
    KITCHEN = "kitchen"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"


class UserStatusEnum(str, Enum):
    ACTIVE = "active"
    DISABLED = "disabled"


class MealTypeEnum(str, Enum):
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    DINNER = "dinner"


class MealCategoryEnum(str, Enum):
    NORMAL = "normal"
    FAT_LOSS = "fat_loss"


class OrderStatusEnum(str, Enum):
    BOOKED = "booked"
    VERIFIED = "verified"
    CANCELLED = "cancelled"


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    police_no: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    real_name: Mapped[str] = mapped_column(String(64), nullable=False)
    dept_name: Mapped[str] = mapped_column(String(128), nullable=False, default="祁门县公安局")
    mobile: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    wechat_openid: Mapped[Optional[str]] = mapped_column(String(64), unique=True, nullable=True)
    role: Mapped[RoleEnum] = mapped_column(
        SAEnum(RoleEnum, values_callable=_enum_values, validate_strings=True),
        default=RoleEnum.OFFICER,
        nullable=False,
    )
    status: Mapped[UserStatusEnum] = mapped_column(
        SAEnum(UserStatusEnum, values_callable=_enum_values, validate_strings=True),
        default=UserStatusEnum.ACTIVE,
        nullable=False,
    )
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class MealSlot(Base, TimestampMixin):
    __tablename__ = "meal_slots"
    __table_args__ = (UniqueConstraint("meal_date", "meal_type", name="uk_meal_slots_date_type"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    meal_date: Mapped[date] = mapped_column(Date, nullable=False)
    meal_type: Mapped[MealTypeEnum] = mapped_column(
        SAEnum(MealTypeEnum, values_callable=_enum_values, validate_strings=True),
        nullable=False,
    )
    booking_deadline: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    is_open: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)

    packages = relationship("MealPackage", back_populates="slot")


class MealPackage(Base, TimestampMixin):
    __tablename__ = "meal_packages"
    __table_args__ = (UniqueConstraint("slot_id", "package_code", name="uk_meal_packages_slot_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    slot_id: Mapped[int] = mapped_column(ForeignKey("meal_slots.id"), nullable=False)
    package_code: Mapped[str] = mapped_column(String(64), nullable=False)
    package_name: Mapped[str] = mapped_column(String(128), nullable=False)
    meal_category: Mapped[MealCategoryEnum] = mapped_column(
        SAEnum(MealCategoryEnum, values_callable=_enum_values, validate_strings=True),
        nullable=False,
    )
    is_selectable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    image_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    price: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    calories: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    protein_g: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    carbs_g: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    fat_g: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    slot = relationship("MealSlot", back_populates="packages")
    items = relationship("MealPackageItem", back_populates="package")


class MealPackageItem(Base, TimestampMixin):
    __tablename__ = "meal_package_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    package_id: Mapped[int] = mapped_column(ForeignKey("meal_packages.id"), nullable=False)
    item_name: Mapped[str] = mapped_column(String(128), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=1, nullable=False)
    unit: Mapped[str] = mapped_column(String(16), default="份", nullable=False)
    item_type: Mapped[str] = mapped_column(String(32), default="other", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    package = relationship("MealPackage", back_populates="items")


class Order(Base, TimestampMixin):
    __tablename__ = "orders"
    __table_args__ = (UniqueConstraint("user_id", "slot_id", name="uk_orders_user_slot"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    order_no: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    slot_id: Mapped[int] = mapped_column(ForeignKey("meal_slots.id"), nullable=False)
    meal_category: Mapped[MealCategoryEnum] = mapped_column(
        SAEnum(MealCategoryEnum, values_callable=_enum_values, validate_strings=True),
        nullable=False,
    )
    package_id: Mapped[int] = mapped_column(ForeignKey("meal_packages.id"), nullable=False)
    status: Mapped[OrderStatusEnum] = mapped_column(
        SAEnum(OrderStatusEnum, values_callable=_enum_values, validate_strings=True),
        default=OrderStatusEnum.BOOKED,
    )
    source: Mapped[str] = mapped_column(String(32), default="mini_program", nullable=False)
    note: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    booked_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    verified_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)

    user = relationship("User", foreign_keys=[user_id])
    slot = relationship("MealSlot")
    package = relationship("MealPackage")
    items = relationship("OrderItem", back_populates="order")


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False)
    item_name: Mapped[str] = mapped_column(String(128), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=1, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    unit: Mapped[str] = mapped_column(String(16), default="份", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    order = relationship("Order", back_populates="items")


class ExportJob(Base, TimestampMixin):
    __tablename__ = "export_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_no: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    request_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    from_date: Mapped[date] = mapped_column(Date, nullable=False)
    to_date: Mapped[date] = mapped_column(Date, nullable=False)
    meal_type: Mapped[str] = mapped_column(String(16), default="all", nullable=False)
    meal_category: Mapped[str] = mapped_column(String(16), default="all", nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="queued", nullable=False)
    file_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    error_msg: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    target_type: Mapped[str] = mapped_column(String(64), nullable=False)
    target_id: Mapped[str] = mapped_column(String(64), nullable=False)
    request_ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    detail_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

