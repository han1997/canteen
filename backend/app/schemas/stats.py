from datetime import date, datetime

from pydantic import BaseModel, Field


class PackageStatOut(BaseModel):
    meal_type: str = Field(pattern="^(lunch|dinner)$")
    package_name: str = Field(min_length=1, max_length=128)
    total_quantity: float = Field(ge=0)


class StatsSummaryOut(BaseModel):
    total_orders: int
    breakfast_orders: int
    lunch_orders: int
    dinner_orders: int
    package_stats: list[PackageStatOut] = Field(default_factory=list)


class BreakfastItemStatOut(BaseModel):
    item_name: str
    total_quantity: float
    unit_price: float
    total_amount: float


class ExportRequest(BaseModel):
    from_date: date
    to_date: date
    meal_type: str = Field(default="all", pattern="^(all|breakfast|lunch|dinner)$")
    meal_category: str = Field(default="all", pattern="^(all|normal|fat_loss)$")


class ExportJobOut(BaseModel):
    id: int
    job_no: str
    request_user_id: int
    from_date: date
    to_date: date
    meal_type: str
    meal_category: str
    status: str
    file_path: str | None
    file_name: str | None = None
    download_url: str | None = None
    error_msg: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
