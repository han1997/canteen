from datetime import date, datetime

from pydantic import BaseModel, Field


class AdminMealItemOut(BaseModel):
    id: int
    item_name: str
    quantity: float
    unit: str
    item_type: str


class AdminMealPackageOut(BaseModel):
    id: int
    meal_types: list[str]  # 改为列表，支持多餐别
    package_code: str
    package_name: str
    meal_category: str
    is_selectable: bool
    image_url: str
    price: float | None
    calories: int | None
    protein_g: float | None
    carbs_g: float | None
    fat_g: float | None
    sort_order: int
    items: list[AdminMealItemOut]


class AdminMealSlotOut(BaseModel):
    id: int
    meal_date: date
    meal_type: str
    booking_deadline: datetime | None
    is_open: bool


class AdminMealSlotCreateRequest(BaseModel):
    meal_date: date
    meal_type: str = Field(pattern="^(breakfast|lunch|dinner)$")
    booking_deadline: datetime | None = None
    is_open: bool = True


class AdminMealSlotStatusUpdateRequest(BaseModel):
    is_open: bool


class AdminMealPackageCreateRequest(BaseModel):
    meal_types: list[str] = Field(min_length=1, max_length=3)  # 改为列表，至少选一个餐别
    package_name: str = Field(min_length=1, max_length=128)
    package_code: str | None = Field(default=None, max_length=64)
    meal_category: str = Field(default="normal", pattern="^(normal|fat_loss|self_pick)$")
    image_url: str | None = Field(default=None, max_length=255)
    price: float = Field(default=0, ge=0, le=9999)
    calories: int | None = Field(default=None, ge=0)
    protein_g: float | None = Field(default=None, ge=0)
    carbs_g: float | None = Field(default=None, ge=0)
    fat_g: float | None = Field(default=None, ge=0)
    is_selectable: bool = True


class AdminMealPackageUpdateRequest(BaseModel):
    meal_types: list[str] | None = Field(default=None, min_length=1, max_length=3)  # 支持更新餐别
    package_name: str | None = Field(default=None, min_length=1, max_length=128)
    meal_category: str | None = Field(default=None, pattern="^(normal|fat_loss|self_pick)$")
    image_url: str | None = Field(default=None, max_length=255)
    price: float | None = Field(default=None, ge=0, le=9999)
    calories: int | None = Field(default=None, ge=0)
    protein_g: float | None = Field(default=None, ge=0)
    carbs_g: float | None = Field(default=None, ge=0)
    fat_g: float | None = Field(default=None, ge=0)
    is_selectable: bool | None = None
