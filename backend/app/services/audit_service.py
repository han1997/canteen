from sqlalchemy.orm import Session

from app.models import AuditLog


def write_audit(
    db: Session,
    actor_user_id: int | None,
    action: str,
    target_type: str,
    target_id: str,
    request_ip: str | None = None,
    detail_json: dict | None = None,
) -> None:
    log = AuditLog(
        actor_user_id=actor_user_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        request_ip=request_ip,
        detail_json=detail_json,
    )
    db.add(log)

