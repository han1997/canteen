from sqlalchemy import inspect, text

from app.db.seed_data import seed_dev_data
from app.db.session import engine
from app.models import Base  # noqa: F401
from app.models import entities  # noqa: F401


def _ensure_column(table_name: str, column_name: str, ddl_sql: str) -> None:
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns(table_name)}
    if column_name in columns:
        return

    with engine.begin() as connection:
        connection.execute(text(ddl_sql))


def _ensure_legacy_columns() -> None:
    _ensure_column(
        "meal_packages",
        "price",
        "ALTER TABLE meal_packages ADD COLUMN price DECIMAL(10,2) NULL DEFAULT 0",
    )
    _ensure_column(
        "order_items",
        "unit_price",
        "ALTER TABLE order_items ADD COLUMN unit_price DECIMAL(10,2) NOT NULL DEFAULT 0",
    )


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_legacy_columns()
    seed_dev_data()
