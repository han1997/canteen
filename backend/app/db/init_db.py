from sqlalchemy import inspect, text

from app.db.seed_data import seed_dev_users
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
    are already present, skip.

    WARNING: alter_sql must be a trusted constant string (hardcoded in this module).
    Never pass user input or dynamically constructed SQL to this function.
    The parameter is passed directly to text() without validation.

    alter_sql must be a full `ALTER TABLE ... MODIFY COLUMN ... ENUM(...) ...` statement."""
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
    _ensure_column(
        "meal_packages",
        "unit",
        "ALTER TABLE meal_packages ADD COLUMN unit VARCHAR(16) NOT NULL DEFAULT '份'",
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
    _relax_users_police_no()
    _ensure_users_mobile_unique()
    _relax_meal_slots_booking_deadline()


def _relax_users_police_no() -> None:
    """Make users.police_no nullable so a user can register with only a mobile."""
    with engine.connect() as connection:
        row = connection.execute(
            text(
                "SELECT IS_NULLABLE FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' "
                "AND COLUMN_NAME = 'police_no'"
            )
        ).first()
    if row is None or row[0] == "YES":
        return
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE users MODIFY COLUMN police_no VARCHAR(32) NULL"))


def _ensure_users_mobile_unique() -> None:
    """Add a UNIQUE index on users.mobile if missing. MySQL allows multiple NULLs
    in a UNIQUE column, so existing rows without a mobile are unaffected."""
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    for index in inspector.get_indexes("users"):
        cols = [c.lower() for c in index.get("column_names", []) if c]
        if cols == ["mobile"] and index.get("unique"):
            return
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE users ADD UNIQUE KEY uk_users_mobile (mobile)"))


def _relax_meal_slots_booking_deadline() -> None:
    """Make meal_slots.booking_deadline nullable so slots can be controlled purely by is_open."""
    with engine.connect() as connection:
        row = connection.execute(
            text(
                "SELECT IS_NULLABLE FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meal_slots' "
                "AND COLUMN_NAME = 'booking_deadline'"
            )
        ).first()
    if row is None or row[0] == "YES":
        return
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE meal_slots MODIFY COLUMN booking_deadline DATETIME NULL"))


def _migrate_meal_packages_to_multi_meal_types() -> None:
    """One-shot migration: switch meal_packages from single meal_type column to
    multi-meal-types association table. Migrates existing data, drops old column
    and constraint. Idempotent.

    注意：MySQL DDL（ALTER TABLE）会隐式提交事务，因此无法做到真正的"全或无"
    回滚。本函数将所有 DDL 操作集中在一个 with 块中以提高代码可读性，并通过幂等
    检查保证可重复执行。
    """
    inspector = inspect(engine)
    if "meal_packages" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("meal_packages")}
    has_meal_type = "meal_type" in columns

    # 确保关联表存在
    if "meal_package_meal_types" not in inspector.get_table_names():
        with engine.begin() as connection:
            connection.execute(text("""
                CREATE TABLE meal_package_meal_types (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    package_id BIGINT NOT NULL,
                    meal_type ENUM('breakfast','lunch','dinner') NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    CONSTRAINT fk_mpm_package_id FOREIGN KEY (package_id) REFERENCES meal_packages(id) ON DELETE CASCADE,
                    UNIQUE KEY uk_package_meal_type (package_id, meal_type),
                    INDEX idx_mpm_meal_type (meal_type)
                ) ENGINE=InnoDB COMMENT='菜品-餐别多对多关联表'
            """))

    # 如果还有旧的 meal_type 列，执行数据迁移和约束调整
    if not has_meal_type:
        return

    # 重新读取索引信息（关联表可能刚创建）
    inspector = inspect(engine)
    index_names = {idx["name"] for idx in inspector.get_indexes("meal_packages")}

    with engine.begin() as connection:
        # 1. 迁移数据：仅在关联表为空时执行
        count = connection.execute(
            text("SELECT COUNT(*) FROM meal_package_meal_types")
        ).scalar()
        if count == 0:
            connection.execute(text("""
                INSERT INTO meal_package_meal_types (package_id, meal_type)
                SELECT id, meal_type FROM meal_packages WHERE is_deleted = 0
            """))

        # 2. 删除旧的唯一约束
        if "uk_meal_packages_type_code" in index_names:
            connection.execute(text("ALTER TABLE meal_packages DROP INDEX uk_meal_packages_type_code"))

        # 3. 添加新的唯一约束
        if "uk_meal_packages_code" not in index_names:
            connection.execute(text("ALTER TABLE meal_packages ADD UNIQUE KEY uk_meal_packages_code (package_code)"))

        # 4. 将 meal_type 改为可空（暂时保留作为备份，后续迭代可删除）
        connection.execute(text("ALTER TABLE meal_packages MODIFY COLUMN meal_type ENUM('breakfast','lunch','dinner') NULL"))


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_legacy_columns()
    _migrate_meal_packages_to_multi_meal_types()
    seed_dev_users()
