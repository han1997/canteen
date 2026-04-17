from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token,
    get_current_user,
    get_password_hash,
    verify_password,
)
from app.db.session import get_db
from app.models import Department, RoleEnum, User, UserStatusEnum
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    TokenResponse,
    UserProfile,
    WechatBindRequest,
)
from app.schemas.common import ApiMessage
from app.services.audit_service import write_audit


router = APIRouter(prefix="/auth", tags=["auth"])


def _resolve_bind_department(db: Session) -> Department:
    # Prefer ROOT department if exists.
    root_dept = db.scalar(select(Department).where(Department.dept_code == "ROOT"))
    if root_dept:
        return root_dept

    # Fallback to first active department.
    active_dept = db.scalar(
        select(Department).where(Department.is_active.is_(True)).order_by(Department.id.asc())
    )
    if active_dept:
        return active_dept

    # Bootstrap one default department when DB has no department records.
    dept = Department(dept_code="ROOT", dept_name="机关本部", is_active=True)
    db.add(dept)
    db.flush()
    return dept


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Annotated[Session, Depends(get_db)]):
    stmt = select(User).where(User.police_no == payload.police_no)
    user = db.scalar(stmt)
    if not user or user.status != UserStatusEnum.ACTIVE or not user.password_hash:
        raise HTTPException(status_code=401, detail="账号或密码错误")

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="账号或密码错误")

    user.last_login_at = datetime.utcnow()
    write_audit(
        db,
        actor_user_id=user.id,
        action="LOGIN",
        target_type="user",
        target_id=str(user.id),
        request_ip=request.client.host if request.client else None,
    )
    db.commit()

    token = create_access_token(subject=user.police_no)
    return TokenResponse(access_token=token)


@router.post("/wechat-bind", response_model=TokenResponse)
def wechat_bind(payload: WechatBindRequest, request: Request, db: Annotated[Session, Depends(get_db)]):
    # In police intranet deployments, this should be replaced by trusted SSO/openid gateway.
    dept = _resolve_bind_department(db)

    user = db.scalar(select(User).where(User.police_no == payload.police_no))
    if user:
        if user.real_name != payload.real_name:
            raise HTTPException(status_code=400, detail="姓名与警号不匹配")
        user.wechat_openid = f"mock_openid_{payload.wechat_code[-8:]}"
        user.mobile = payload.mobile
        user.status = UserStatusEnum.ACTIVE
    else:
        user = User(
            police_no=payload.police_no,
            real_name=payload.real_name,
            dept_id=dept.id,
            mobile=payload.mobile,
            wechat_openid=f"mock_openid_{payload.wechat_code[-8:]}",
            role=RoleEnum.OFFICER,
            status=UserStatusEnum.ACTIVE,
            password_hash=get_password_hash(payload.police_no[-6:]),
            last_login_at=datetime.utcnow(),
        )
        db.add(user)
        db.flush()

    write_audit(
        db,
        actor_user_id=user.id,
        action="BIND_WECHAT",
        target_type="user",
        target_id=str(user.id),
        request_ip=request.client.host if request.client else None,
    )
    db.commit()

    token = create_access_token(subject=user.police_no)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserProfile)
def me(current_user: Annotated[User, Depends(get_current_user)]):
    return current_user


@router.post("/change-password", response_model=ApiMessage)
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    if not verify_password(payload.old_password, current_user.password_hash or ""):
        raise HTTPException(status_code=400, detail="原密码不正确")
    if payload.old_password == payload.new_password:
        raise HTTPException(status_code=400, detail="新密码不能与原密码相同")

    current_user.password_hash = get_password_hash(payload.new_password)
    write_audit(
        db,
        actor_user_id=current_user.id,
        action="CHANGE_PASSWORD",
        target_type="user",
        target_id=str(current_user.id),
        request_ip=request.client.host if request.client else None,
    )
    db.commit()
    return ApiMessage(message="密码修改成功")

