from pydantic import BaseModel, Field


class AdminUserCreateRequest(BaseModel):
    police_no: str = Field(min_length=4, max_length=32)
    real_name: str = Field(min_length=2, max_length=64)
    dept_name: str = Field(default="祁门县公安局", max_length=128)
    role: str = Field(pattern="^(officer|kitchen|admin|super_admin)$")
    mobile: str | None = Field(default=None, max_length=20)
    init_password: str = Field(min_length=6, max_length=64)


class AdminUserRoleUpdateRequest(BaseModel):
    role: str = Field(pattern="^(officer|kitchen|admin|super_admin)$")


class AdminUserStatusUpdateRequest(BaseModel):
    status: str = Field(pattern="^(active|disabled)$")


class AdminUserOut(BaseModel):
    id: int
    police_no: str
    real_name: str
    dept_name: str
    role: str
    status: str

    model_config = {"from_attributes": True}

