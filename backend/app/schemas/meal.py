from datetime import date, datetime

from pydantic import BaseModel


class MealItemOut(BaseModel):
    id: int
    item_name: str
    quantity: float
    unit: str
    item_type: str


class MealPackageOut(BaseModel):
    id: int
    package_code: str
    package_name: str
    meal_category: str
    price: float | None
    calories: int | None
    protein_g: float | None
    carbs_g: float | None
    fat_g: float | None
    items: list[MealItemOut]


class MealSlotOut(BaseModel):
    id: int
    meal_date: date
    meal_type: str
    booking_deadline: datetime
    is_open: bool
    packages: list[MealPackageOut]

