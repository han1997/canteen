# 更新日志

本仓库的变更日志，每次代码修改后追加。日期为本地时区（Asia/Shanghai）。

## 2026-05-19

### 修复：生产环境 slot 自动初始化未执行 + 加固
**问题**：上一次"项目初始化默认餐次保留"的改动里，`seed_dev_data()`、`maintain_booking_window()` 都在第一行 `if app_env in {"prod","production"}: return`，导致 `APP_ENV=production` 时 14 天 × 3 餐次的 slot 完全没创建，订餐页和菜品管理页都显示"暂无可订餐时段/请先点击发布"。

**改动**：
- `backend/app/db/seed_data.py`
  - 拆分职责：新增 `ensure_booking_slots()`（无环境门控、始终运行；建 slot、不灌菜品），`seed_dev_data` 重命名为 `seed_dev_users()`（dev-only，只创建 4 个测试账号）。`maintain_booking_window()` 委托给 `ensure_booking_slots()`，删除重复循环。
  - 新增 `_find_seed_owner_id()`：生产环境若无 `super_admin`，返回 `None` 让 `meal_slots.created_by` 落空（列本身 nullable），避免之前草稿里"生产环境意外创建默认密码 900001"的风险。
  - `_ensure_slot()` 增加唯一索引竞态保护：用 `db.begin_nested()` + `IntegrityError` 捕获，并发插入同一 `(meal_date, meal_type)` 时回退到已存在分支，不再让 startup 因竞态崩。
- `backend/app/db/init_db.py`：`init_db()` 中追加 `ensure_booking_slots()` 调用；导入随重命名更新。

**部署注意**：必须重新构建镜像并 bump `docker-compose.yml` 里的 `backend.image` tag，否则 `docker compose up -d` 会复用旧镜像（这就是上一轮"重新部署但症状未变"的原因）。

### 调整：项目初始化默认餐次保留，但不再自动写入测试菜品
**变更**：之前的开发环境种子会为每个 slot 自动补齐"普通套餐/减脂套餐"以及包子/油条/糍粑/豆浆等早餐单品。现改为：
- 仍自动为未来 `BOOKING_SEED_DAYS` 天创建早/中/晚三个 slot（保证下单页面有时段框架）。
- 不再写入任何默认菜品/套餐。新装环境的 slot 是"空菜品"状态，需食堂或管理员在"菜品管理"里手动添加。
- 默认仅今天、明天的早/中/晚开放订餐（`BOOKING_AUTO_OPEN_DAYS=2`），其他日期保持"未开放订餐"。
- 已存在的菜品记录不会被破坏（不再做自动 upsert），由管理员自行管理。

**改动文件**：
- `backend/app/db/seed_data.py`：删除 `_upsert_package_with_single_item`、`_upsert_main_meal_package`；`_ensure_slot_with_packages` → `_ensure_slot`（仅建/对齐 slot）；同步精简 `MealCategoryEnum / MealPackage / MealPackageItem` 等不再使用的 import。
- `backend/README.md`：更新"开发环境自动初始化"段落，去掉"测试菜品"字样并说明 slot 默认空菜品。

**部署注意**：重新构建后端镜像并更新 `docker-compose.yml` 中的 `backend.image` tag 后部署。已运行环境无 schema 改动，可以平滑升级。

### 新增：导出文件可由小程序直接下载查看
**问题**：原导出流程仅把 xlsx 文件保存到服务器 `backend/exports/`，前端只显示了一个服务器路径，小程序使用者无法实际拿到文件。

**改动**：
- 后端
  - `backend/app/schemas/stats.py`：`ExportJobOut` 增加 `file_name`、`download_url` 字段。
  - `backend/app/api/v1/stats.py`：新增辅助 `_serialize_export_job`，`POST /stats/export`、`GET /stats/export/{job_no}` 改用其返回；新增 `GET /stats/export/{job_no}/download`，鉴权后用 `FileResponse` 流式返回 xlsx。
- 小程序
  - `miniprogram/services/api.js`：新增 `downloadExportFile(jobNo)`，使用 `wx.downloadFile` 携带 `Authorization: Bearer <token>` 下载到临时文件。
  - `miniprogram/pages/admin-stats/index.js`：增加 `downloading` 状态和 `downloadExportFile` 方法（下载后调 `wx.openDocument({fileType:'xlsx', showMenu:true})`）。
  - `miniprogram/pages/admin-stats/index.wxml`：用"下载/查看文件"按钮取代原"file_path"纯文本，并加使用提示。

**部署注意**：
- 后端为 Docker 镜像部署，需重新构建并推送镜像（参考 `backend/README.md` §7），并在 `docker-compose.yml` 更新 `backend.image` tag 后 `docker compose pull && docker compose up -d backend`。
- 微信公众平台 → 小程序 → 开发管理 → 服务器域名，把 `https://hhycanteen.iepose.cn` 加入 **downloadFile 合法域名**，否则线上版 `wx.downloadFile` 会被拒绝。
