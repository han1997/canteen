# 数据库设计说明

## 核心表
- `departments`：部门主数据。
- `users`：人员账户（警号唯一），含角色与状态。
- `meal_slots`：某天某餐次（早餐/中餐/晚餐）和订餐截止时间。
- `meal_packages`：对应时段可选套餐（普通/减脂）。
- `meal_package_items`：套餐菜品明细。
- `orders`：订餐主表（用户 + 时段唯一）。
- `order_items`：订单快照菜品，防止后改菜单影响历史数据。

## 管理与审计
- `audit_logs`：关键操作日志（登录、下单、核销、导出、权限变更）。
- `export_jobs`：导出任务状态与文件路径。
- `reminder_tasks`：订餐提醒任务记录。

## 关键约束
- `uk_orders_user_slot`：同一用户同一时段仅一单。
- `uk_meal_slots_date_type`：同一天同餐次仅一个时段配置。
- `uk_meal_packages_slot_code`：时段内套餐编码唯一。
- 外键完整性：订单、菜单、用户、部门全链路可追溯。

## 建议索引
已在 `schema.sql` 内提供：
- 高并发查询：`orders(slot_id, status)`、`orders(user_id, status)`
- 审计检索：`audit_logs(actor_user_id, created_at)`
- 导出任务：`export_jobs(status, created_at)`
