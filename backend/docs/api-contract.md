# API 合同（v1）

Base URL: `/api/v1`

## 1. 登录与身份
### `POST /auth/login`
请求：`{ "police_no": "000001", "password": "******" }`
响应：`{ "access_token": "...", "token_type": "bearer" }`

### `POST /auth/wechat-bind`
首次绑定。内网环境可替换为统一身份认证网关。
请求：`{ "police_no": "000002", "real_name": "张三", "mobile": "138****", "wechat_code": "wx_code_xxx" }`

### `GET /auth/me`
获取当前登录人信息（Header: `Authorization: Bearer <token>`）。

### `POST /auth/change-password`
修改当前登录用户密码。请求：`{ "old_password": "旧密码", "new_password": "新密码" }`

## 2. 菜单与订餐
### `GET /meals/slots?meal_date=2026-04-14`
返回当天早餐/中餐/晚餐及普通/减脂套餐、菜品明细。

### `POST /orders`
请求：
```json
{
  "slot_id": 10,
  "selections": [
    { "package_id": 101, "quantity": 3 },
    { "package_id": 102, "quantity": 2 }
  ],
  "note": "少盐"
}
```
规则：同一时段可一次提交多种食物/套餐与数量；重复下单即覆盖旧订单（未核销前）。

### `GET /orders/my?from_date=2026-04-14&to_date=2026-04-20`
查询个人订单。

### `POST /orders/{order_id}/cancel`
取消未完成订单。

## 3. 管理后台
### `GET /admin/users`
用户列表（可按警号/姓名模糊检索）。

### `POST /admin/users`
新增用户并设置初始密码、角色。

### `PATCH /admin/users/{user_id}/role`
更新角色：`officer/kitchen/admin/super_admin`。

### `PATCH /admin/users/{user_id}/status`
启用/禁用账号。

### `GET /admin/dashboard/today`
今日订餐总数、早餐/中餐/晚餐订单数，以及中/晚餐按套餐名的份数明细（`package_stats`）。

### `GET /admin/meal-slots?meal_date=2026-04-14`
查询指定日期时段与菜品清单（含价格、可选状态）。

### `POST /admin/meal-slots`
发布/更新某日期某时段。请求：`{ "meal_date": "2026-04-14", "meal_type": "breakfast", "is_open": true }`

### `PATCH /admin/meal-slots/{slot_id}/status`
停止/开放订餐。请求：`{ "is_open": false }`

### `POST /admin/meal-slots/{slot_id}/packages`
新增菜品。请求：`{ "package_name": "包子", "price": 2.5, "meal_category": "normal" }`

### `PATCH /admin/meal-packages/{package_id}`
修改菜品名称、价格、类别、可选状态等。

## 4. 统计与导出
### `GET /stats/summary?from_date=2026-04-01&to_date=2026-04-14`
返回时间段总量、早餐/中餐/晚餐订单统计，以及中/晚餐按套餐名的份数明细（`package_stats`）。

### `GET /stats/breakfast-items?from_date=2026-04-01&to_date=2026-04-14`
早餐单品统计（每种食物份数、单价、总金额）。

### `POST /stats/export`
创建并执行导出任务，返回 `job_no` 与文件路径（导出文件包含订单下全部菜品、单价、份数、小计、订单总价）。

### `GET /stats/export/{job_no}`
查询导出任务状态。
