from sqlalchemy import inspect, text

from app.db.seed_data import ensure_booking_slots, seed_dev_users
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


def _ensure_enum_value(table_name: str, column_name: str, alter_sql: str) -> None:
    """Idempotently extend an ENUM column. Reads information_schema.COLUMNS to
    inspect the current ENUM definition; if all expected values from alter_sql
    are already present, skip. alter_sql must be a full `ALTER TABLE ... MODIFY
    COLUMN ... ENUM(...) ...` statement."""
    import re

    expected = re.findall(r"'([^']+)'", alter_sql)
    if not expected:
        return
    with engine.connect() as connection:
        row = connection.execute(
            text(
                "SELECT COLUMN_TYPE FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
            ),
            {"t": table_name, "c": column_name},
        ).first()
    if row is None:
        return
    existing_values = set(re.findall(r"'([^']+)'", row[0] or ""))
    if all(value in existing_values for value in expected):
        return
    with engine.begin() as connection:
        connection.execute(text(alter_sql))


def _migrate_meal_packages_to_template() -> None:
    """One-shot dev migration: switch meal_packages from per-slot to per-meal_type
    template. If slot_id column is still present, drops old FK/UK/column and
    truncates the table (data is discarded — dev only). Idempotent."""
    inspector = inspect(engine)
    if "meal_packages" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("meal_packages")}
    has_slot_id = "slot_id" in columns
    has_meal_type = "meal_type" in columns

    if not has_slot_id and has_meal_type:
        return  # already migrated

    with engine.begin() as connection:
        connection.execute(text("SET FOREIGN_KEY_CHECKS = 0"))

        fk_names = [fk["name"] for fk in inspector.get_foreign_keys("meal_packages")]
        if "fk_meal_packages_slot_id" in fk_names:
            connection.execute(text("ALTER TABLE meal_packages DROP FOREIGN KEY fk_meal_packages_slot_id"))

        index_names = {idx["name"] for idx in inspector.get_indexes("meal_packages")}
        if "uk_meal_packages_slot_code" in index_names:
            connection.execute(text("ALTER TABLE meal_packages DROP INDEX uk_meal_packages_slot_code"))

        if has_slot_id:
            connection.execute(text("TRUNCATE TABLE meal_package_items"))
            connection.execute(text("TRUNCATE TABLE meal_packages"))
            connection.execute(text("ALTER TABLE meal_packages DROP COLUMN slot_id"))

        if not has_meal_type:
            connection.execute(
                text("ALTER TABLE meal_packages ADD COLUMN meal_type ENUM('breakfast','lunch','dinner') NOT NULL")
            )

        post_index_names = {
            idx["name"]
            for idx in inspect(connection).get_indexes("meal_packages")
        }
        if "uk_meal_packages_type_code" not in post_index_names:
            connection.execute(
                text("ALTER TABLE meal_packages ADD UNIQUE KEY uk_meal_packages_type_code (meal_type, package_code)")
            )

        connection.execute(text("SET FOREIGN_KEY_CHECKS = 1"))


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
    _ensure_column(
        "meal_packages",
        "image_url",
        "ALTER TABLE meal_packages ADD COLUMN image_url VARCHAR(255) NULL",
    )
    _ensure_column(
        "meal_packages",
        "is_deleted",
        "ALTER TABLE meal_packages ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0",
    )
    _migrate_meal_packages_to_template()
    _ensure_enum_value(
        "meal_packages",
        "meal_category",
        "ALTER TABLE meal_packages MODIFY COLUMN meal_category ENUM('normal','fat_loss','self_pick') NOT NULL",
    )
    _ensure_enum_value(
        "orders",
        "meal_category",
        "ALTER TABLE orders MODIFY COLUMN meal_category ENUM('normal','fat_loss','self_pick') NOT NULL",
    )
    _ensure_enum_value(
        "export_jobs",
        "meal_category",
        "ALTER TABLE export_jobs MODIFY COLUMN meal_category ENUM('normal','fat_loss','self_pick','all') NOT NULL DEFAULT 'all'",
    )


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_legacy_columns()
    seed_dev_users()
    ensure_booking_slots()
