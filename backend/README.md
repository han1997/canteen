# 后端服务说明（公安内网版）

## 1. 技术选型
- 框架：FastAPI + SQLAlchemy 2.0
- 数据库：MySQL 8.0（见 `sql/schema.sql`）
- 鉴权：JWT（警号登录 + 绑定流程）
- 导出：OpenPyXL 生成 Excel
- 菜品图片：后端静态目录 `/static`（默认图与上传图）

## 2. 启动步骤
```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# 先在 MySQL 执行 sql/schema.sql
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

访问：
- 健康检查：`GET /healthz`
- Swagger：`/docs`

默认菜品图：
- 路径：`backend/static/default-meal.png`
- 环境变量：`DEFAULT_MEAL_IMAGE_URL`（默认值 `/static/default-meal.png`）

菜品图片上传：
- 接口：`POST /api/v1/admin/uploads/meal-image`
- 字段：`image`（`jpg/png/webp`，最大 `3MB`）
- 返回：`{"image_url": "/static/uploads/meals/xxx.png"}`

开发环境自动初始化（`APP_ENV != production`）：
- 启动时会自动补齐未来 `BOOKING_SEED_DAYS` 天餐次（早/中/晚）与测试菜品。
- 默认仅今明两天开启订餐（`BOOKING_AUTO_OPEN_DAYS=2`），其他日期默认关闭，需食堂人员/管理员在“菜品管理”手动开启。
- 服务启动后会注册每日定时任务（凌晨 00:01）自动补齐未来订餐窗口，保持数据持续可用。
- 启动时会自动补齐测试账号（密码均为 `123456`）：
  - `900001`（`super_admin`）
  - `900002`（`admin`）
  - `900003`（`kitchen`）
  - `900004`（`officer`）

## 3. 目录结构
- `app/api/v1/`：接口路由（auth/meals/orders/admin/stats）
- `app/models/`：ORM 模型与枚举
- `app/services/`：业务逻辑（下单、导出、审计）
- `app/core/`：配置与安全模块
- `sql/schema.sql`：生产可用建表脚本

## 4. 角色与权限
- `officer`：订餐、取消、查询个人订单
- `kitchen`：核销、查看统计、导出
- `admin`：用户管理 + 全量统计
- `super_admin`：最高权限

## 5. 关键业务规则
- 同一用户同一时段只能有 1 笔有效订单（数据库唯一约束）。
- 同一时段可一次提交多种食物/套餐及数量（重复提交会覆盖旧订单）。
- 早餐为单点模式（如包子、油条、糍粑、豆浆），不走普通/减脂套餐二选一。
- 食堂人员/管理员可按时段执行“停止订餐/恢复订餐”。
- 早餐统计支持按单品汇总份数与金额（基于下单时单价）。
- 过截止时间或时段关闭后不可下单/改单。
- 全部关键操作写入 `audit_logs`（登录、下单、导出、权限调整、菜品发布/停订）。

## 6. 生产部署建议
- 内网网关后置部署，强制 HTTPS 与 IP 白名单。
- JWT 密钥存放到专网密钥管理系统，不写死在代码里。
- 导出文件目录设置定期清理任务，防止磁盘堆积。
- 如需短信/微信提醒，将 `reminder_tasks` 对接内部消息网关定时任务。
