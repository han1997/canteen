from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class LoginRequest(BaseModel):
    account: str = Field(min_length=4, max_length=32, description="警号或手机号")
    password: str = Field(min_length=6, max_length=64)


class WechatBindRequest(BaseModel):
    police_no: str | None = Field(default=None, min_length=4, max_length=32)
    mobile: str | None = Field(default=None, min_length=4, max_length=20)
    real_name: str = Field(min_length=2, max_length=64)
    wechat_code: str = Field(min_length=4, max_length=128)

    @model_validator(mode="after")
    def _require_account(self) -> "WechatBindRequest":
        police_no = (self.police_no or "").strip()
        mobile = (self.mobile or "").strip()
        if not police_no and not mobile:
            raise ValueError("警号与手机号至少填写其一")
        self.police_no = police_no or None
        self.mobile = mobile or None
        return self


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(min_length=6, max_length=64)
    new_password: str = Field(min_length=6, max_length=64)


class UserProfile(BaseModel):
    id: int
    police_no: str | None
    real_name: str
    dept_name: str
    mobile: str | None
    role: str
    status: str
    last_login_at: datetime | None

    model_config = {"from_attributes": True}

