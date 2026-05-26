from pydantic import BaseModel, Field, model_validator


class AdminUserCreateRequest(BaseModel):
    police_no: str | None = Field(default=None, min_length=4, max_length=32)
    real_name: str = Field(min_length=2, max_length=64)
    dept_name: str = Field(default="祁门县公安局", max_length=128)
    role: str = Field(pattern="^(officer|kitchen|admin|super_admin)$")
    mobile: str | None = Field(default=None, min_length=4, max_length=20)
    init_password: str = Field(default="123456", min_length=6, max_length=64)

    @model_validator(mode="after")
    def _require_account(self) -> "AdminUserCreateRequest":
        police_no = (self.police_no or "").strip()
        mobile = (self.mobile or "").strip()
        if not police_no and not mobile:
            raise ValueError("警号与手机号至少填写其一")
        self.police_no = police_no or None
        self.mobile = mobile or None
        return self


class AdminUserRoleUpdateRequest(BaseModel):
    role: str = Field(pattern="^(officer|kitchen|admin|super_admin)$")


class AdminUserStatusUpdateRequest(BaseModel):
    status: str = Field(pattern="^(active|disabled)$")


class AdminUserOut(BaseModel):
    id: int
    police_no: str | None
    real_name: str
    dept_name: str
    mobile: str | None
    role: str
    status: str

    model_config = {"from_attributes": True}


class AdminBulkImportResult(BaseModel):
    created: int
    skipped: int
    errors: list[str] = []

