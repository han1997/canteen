from __future__ import annotations

from datetime import datetime
from pathlib import Path
from random import randint

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models import ExportJob, MealSlot, Order, OrderItem, User


BACKEND_ROOT = Path(__file__).resolve().parents[2]

MEAL_TYPE_LABEL = {
    "breakfast": "早餐",
    "lunch": "中餐",
    "dinner": "晚餐",
}

MEAL_CATEGORY_LABEL = {
    "normal": "普通套餐",
    "fat_loss": "减脂套餐",
}

ORDER_STATUS_LABEL = {
    "booked": "已下单",
    "verified": "已完成",
    "cancelled": "已取消",
}


def build_job_no() -> str:
    return f"EX{datetime.utcnow().strftime('%Y%m%d%H%M%S')}{randint(1000, 9999)}"


def create_export_job(
    db: Session,
    request_user_id: int,
    from_date,
    to_date,
    meal_type: str,
    meal_category: str,
) -> ExportJob:
    job = ExportJob(
        job_no=build_job_no(),
        request_user_id=request_user_id,
        from_date=from_date,
        to_date=to_date,
        meal_type=meal_type,
        meal_category=meal_category,
        status="queued",
    )
    db.add(job)
    db.flush()
    return job


def _normalize_enum_value(value) -> str:
    if hasattr(value, "value"):
        return str(value.value)
    return str(value)


def _to_cn_meal_type(value) -> str:
    raw = _normalize_enum_value(value)
    return MEAL_TYPE_LABEL.get(raw, raw)


def _to_cn_meal_category(value) -> str:
    raw = _normalize_enum_value(value)
    return MEAL_CATEGORY_LABEL.get(raw, raw)


def _to_cn_order_status(value) -> str:
    raw = _normalize_enum_value(value)
    return ORDER_STATUS_LABEL.get(raw, raw)


def _build_query(job: ExportJob) -> Select:
    stmt = (
        select(
            Order.id.label("order_id"),
            Order.order_no,
            User.police_no,
            User.real_name,
            MealSlot.meal_date,
            MealSlot.meal_type,
            Order.meal_category,
            Order.status,
            Order.booked_at,
            OrderItem.item_name,
            OrderItem.quantity,
            OrderItem.unit,
            OrderItem.unit_price,
        )
        .join(User, User.id == Order.user_id)
        .join(MealSlot, MealSlot.id == Order.slot_id)
        .outerjoin(OrderItem, OrderItem.order_id == Order.id)
        .where(
            MealSlot.meal_date >= job.from_date,
            MealSlot.meal_date <= job.to_date,
        )
    )

    if job.meal_type != "all":
        stmt = stmt.where(MealSlot.meal_type == job.meal_type)
    if job.meal_category != "all":
        stmt = stmt.where(Order.meal_category == job.meal_category)

    return stmt.order_by(MealSlot.meal_date, MealSlot.meal_type, Order.booked_at, OrderItem.id)


def _format_sheet(ws) -> None:
    ws.freeze_panes = "A2"
    ws.column_dimensions["A"].width = 24
    ws.column_dimensions["B"].width = 12
    ws.column_dimensions["C"].width = 12
    ws.column_dimensions["D"].width = 12
    ws.column_dimensions["E"].width = 10
    ws.column_dimensions["F"].width = 12
    ws.column_dimensions["G"].width = 12
    ws.column_dimensions["H"].width = 20
    ws.column_dimensions["I"].width = 12
    ws.column_dimensions["J"].width = 10
    ws.column_dimensions["K"].width = 8
    ws.column_dimensions["L"].width = 12
    ws.column_dimensions["M"].width = 13
    ws.column_dimensions["N"].width = 20

    header_fill = PatternFill(fill_type="solid", start_color="0B2A4A", end_color="0B2A4A")
    header_font = Font(color="FFFFFF", bold=True, size=11)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    thin = Side(style="thin", color="D8E2EF")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row, min_col=1, max_col=14):
        for cell in row:
            cell.border = border
            cell.alignment = Alignment(vertical="center")

    for col in ("I", "J", "L", "M"):
        for cell in ws[col][1:]:
            cell.number_format = "0.00"


def _group_rows(rows) -> list[dict]:
    grouped: list[dict] = []
    index_map: dict[int, int] = {}

    for row in rows:
        order_id = int(row.order_id)
        if order_id not in index_map:
            index_map[order_id] = len(grouped)
            grouped.append(
                {
                    "order_id": order_id,
                    "order_no": row.order_no,
                    "police_no": row.police_no,
                    "real_name": row.real_name,
                    "meal_date": row.meal_date,
                    "meal_type": row.meal_type,
                    "meal_category": row.meal_category,
                    "status": row.status,
                    "booked_at": row.booked_at,
                    "items": [],
                }
            )

        if row.item_name:
            grouped[index_map[order_id]]["items"].append(
                {
                    "item_name": row.item_name,
                    "quantity": float(row.quantity or 0),
                    "unit": row.unit or "份",
                    "unit_price": float(row.unit_price or 0),
                }
            )

    return grouped


def run_export_job(db: Session, job: ExportJob) -> ExportJob:
    export_dir = BACKEND_ROOT / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)

    job.status = "running"
    db.flush()

    rows = db.execute(_build_query(job)).all()
    grouped_orders = _group_rows(rows)

    wb = Workbook()
    ws = wb.active
    ws.title = "订餐明细"
    ws.append(
        [
            "订单号",
            "警号",
            "姓名",
            "日期",
            "餐别",
            "分类",
            "订单状态",
            "菜品",
            "单价(元)",
            "份数",
            "单位",
            "小计(元)",
            "订单总价(元)",
            "下单时间",
        ]
    )

    current_row = 2
    for order in grouped_orders:
        items = order["items"] or [{"item_name": "-", "quantity": 0.0, "unit": "份", "unit_price": 0.0}]
        order_total = round(sum(item["quantity"] * item["unit_price"] for item in items), 2)
        start_row = current_row

        for item in items:
            subtotal = round(item["quantity"] * item["unit_price"], 2)
            ws.append(
                [
                    order["order_no"],
                    order["police_no"],
                    order["real_name"],
                    order["meal_date"].strftime("%Y-%m-%d"),
                    _to_cn_meal_type(order["meal_type"]),
                    _to_cn_meal_category(order["meal_category"]),
                    _to_cn_order_status(order["status"]),
                    item["item_name"],
                    item["unit_price"],
                    item["quantity"],
                    item["unit"],
                    subtotal,
                    order_total,
                    order["booked_at"].strftime("%Y-%m-%d %H:%M:%S"),
                ]
            )
            current_row += 1

        end_row = current_row - 1
        if end_row > start_row:
            for col in ("A", "B", "C", "D", "E", "F", "G", "M", "N"):
                ws.merge_cells(f"{col}{start_row}:{col}{end_row}")
                ws[f"{col}{start_row}"].alignment = Alignment(horizontal="center", vertical="center")

    _format_sheet(ws)

    file_name = f"订餐统计_{job.from_date.strftime('%Y%m%d')}_{job.to_date.strftime('%Y%m%d')}_{job.job_no}.xlsx"
    output = (export_dir / file_name).resolve()
    wb.save(output)

    job.status = "done"
    job.file_path = str(output)
    return job
