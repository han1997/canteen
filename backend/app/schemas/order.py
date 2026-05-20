from datetime import date, datetime

from pydantic import BaseModel, Field


class OrderSelectionIn(BaseModel):
    package_id: int
    quantity: float = Field(ge=0.1, le=99)


class OrderCreateRequest(BaseModel):
    slot_id: int
    selections: list[OrderSelectionIn] = Field(min_length=1, max_length=20)
    note: str | None = Field(default=None, max_length=255)


class OrderItemOut(BaseModel):
    item_name: str
    quantity: float
    unit: str
    unit_price: float
    amount: float


class OrderOut(BaseModel):
    id: int
    order_no: str
    user_id: int
    slot_id: int
    package_id: int
    meal_category: str
    meal_type: str | None = None
    meal_date: date | None = None
    status: str
    booked_at: datetime
    verified_at: datetime | None
    items: list[OrderItemOut] = []


class CancelOrderRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=255)
