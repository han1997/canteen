from datetime import datetime

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    police_no: str = Field(min_length=4, max_length=32)
    password: str = Field(min_length=6, max_length=64)


class WechatBindRequest(BaseModel):
    police_no: str = Field(min_length=4, max_length=32)
    real_name: str = Field(min_length=2, max_length=64)
    mobile: str | None = Field(default=None, max_length=20)
    wechat_code: str = Field(min_length=4, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(min_length=6, max_length=64)
    new_password: str = Field(min_length=6, max_length=64)


class UserProfile(BaseModel):
    id: int
    police_no: str
    real_name: str
    dept_name: str
    role: str
    status: str
    last_login_at: datetime | None

    model_config = {"from_attributes": True}

