# 更新日志

本仓库的变更日志，每次代码修改后追加。日期为本地时区（Asia/Shanghai）。

## 2026-05-20

### 调整：移除底部 tabBar，跳转改走页面内入口
**动机**：home/profile 已经在自身页面内布好了「个人」「管理」入口按钮，底部那条「订餐 / 我的 / 管理」的 tab 完全重复，占屏且冗余。

**改动**：
- `miniprogram/app.json`：删除整个 `tabBar` 段。
- 删除 `miniprogram/custom-tab-bar/` 目录（含 `index.{js,wxml,wxss,json}`），自定义 tabBar 组件不再使用。
- `miniprogram/pages/home/index.js`：移除 `syncTabBar` 函数与 `onShow`、`applyProfile` 里的两处调用；`goProfile` / `goManage` 改用 `wx.navigateTo`。
- `miniprogram/pages/profile/index.js`：移除 `syncTabBar` 函数与 `onShow`、`_ensureAuthInternal` 里的两处调用；`goManage` 改用 `wx.navigateTo`。
- `miniprogram/pages/admin-stats/index.js`：移除 `syncTabBar` 函数与 `onShow`、`_ensureAccessInternal` 里的两处调用；没有外部 switchTab。
- `miniprogram/pages/login/index.js`：3 处登录成功后跳 home 由 `wx.switchTab` 改为 `wx.reLaunch`（home 不再是 tab 页，需 reLaunch 清空登录页栈）。

**注意**：
- 现在 home → profile / admin-stats、profile → admin-stats 都是 `navigateTo`，左上角自带返回按钮；admin-stats 没有「我的」入口，需返回 home 后再点「个人」（与改动前一致，按钮入口本来就在 home）。
- 退出登录仍走 `wx.reLaunch` 到 login，与原行为一致。
- 自定义 tabBar 组件已删除，若历史镜像引用 `custom-tab-bar/*` 资源会 404，需重新构建小程序包发布。

## 2026-05-19

### 调整：个人中心改为"按钮入口 + 最近订单列表"，修改密码独立成页
**动机**：原"个人中心"页底部直接铺了一张修改密码表单，使用频率低却占了主屏；同时民警查询订单要进二级页太麻烦。

**改动**：
- 新增 `miniprogram/pages/change-password/`：把原表单整体迁过来，标题"修改密码"，成功后 600ms 自动 `navigateBack`。
- `miniprogram/app.json`：注册 `pages/change-password/index`。
- `miniprogram/pages/profile/`：
  - WXML 移除密码表单卡片，新增"最近订单"卡片（展示最多 10 笔，标题右侧"查看全部"跳 `my-orders`）。
  - 顶部操作行新增"修改密码"按钮，与原"我的订单"并列。
  - JS 删掉所有密码 state 与 `submitChangePassword`；新增 `loadRecentOrders`（查询 `addDays(-29)..today`、客户端截取前 10），加 `goChangePassword`。
  - `onPullDownRefresh` 用 `utils/pull-refresh.withPullDownRefresh` 包裹，下拉同时刷新 profile 与最近订单。
  - `index.json` 启用 `enablePullDownRefresh: true`；新增 `.recent-order-row`、`.link` 样式。
- **后端**：`OrderOut` 增加 `meal_type`、`meal_date` 字段；`_to_order_out` 从 `order.slot` 读取；`POST /orders`、`GET /orders/my` 查询都加 `joinedload(Order.slot)` 避免 N+1。这让最近订单卡片不需要再像 my-orders 页那样按日期拉 slot 字典。

**部署注意**：后端 schema/接口字段为新增向后兼容，但 `OrderOut` 返回结构有变化，需要重建镜像并 bump `docker-compose.yml` 的 `backend.image` tag 才能让小程序拿到新字段；旧镜像跑起来字段为空时，前端会回退显示 `slotLabel = "—"`，不会崩。

### 新增：tabBar 按角色隐藏 — 普通民警不再看到"管理"入口
**动机**：普通民警（officer）没有管理权限，进入"管理"tab 后只看到一句"无权限"，体验差。

**改动**：
- `miniprogram/app.json`：tabBar 切到 `"custom": true`，由自定义组件接管渲染（`list` 仍保留供 `switchTab` 校验路由）。
- 新增 `miniprogram/custom-tab-bar/`（`index.{js,wxml,wxss,json}`）：组件按角色过滤要展示的 tab，"管理"仅 `kitchen/admin/super_admin` 可见；点击调用 `wx.switchTab`。
- `miniprogram/pages/{home,profile,admin-stats}/index.js`：`onShow` 中调用 `this.getTabBar()?.refresh(path)` 同步选中态；在 profile 同步完成后再触发一次，确保角色变化（如新登录、API 返回新角色）后 tabBar 立即更新。

**注意**：
- admin-meals / admin-users 不在 tabBar 中（管理中心二级页面），仍由各自页面的 `ensureAccess` 守卫，officer 通过深链进入会看到"无权限"。
- 角色升降需要刷新页面或重新切换 tab 才会体现到 tabBar；如果业务需要后台变更后立即生效，可在 profile sync 成功后再触发一次 `syncTabBar`（已在 3 个 tab 页内布点）。

### 重构：下拉刷新逻辑抽到 `utils/pull-refresh.js`
**动机**：上一条新增下拉刷新时，4 个页面分别写了 `try/finally + wx.stopPullDownRefresh()` 样板，且部分页面还要处理 `guard`（如 `admin-meals` 的 `_pickingImage`）。重复且容易遗漏 `stopPullDownRefresh` 导致 loading 卡死。

**改动**：
- 新增 `miniprogram/utils/pull-refresh.js`，导出 `withPullDownRefresh(refresh, { guard })`：
  - `refresh` 可以是 Page 上的方法名（字符串）或函数（绑定到 Page `this`）。
  - 可选 `guard()` 返回真值时跳过本次刷新（例如选图过程中不刷新）。
  - 内部统一 `try/finally`，保证异常路径也会 `wx.stopPullDownRefresh()`。
- 4 个页面改造为声明式用法：
  - `home`：`withPullDownRefresh(function () { return this.initAndLoad({ force: true, silent: false }); })`
  - `my-orders`：`withPullDownRefresh("loadOrders")`
  - `admin-meals`：传函数 + `guard() { return !!this._pickingImage; }`
  - `admin-users`：传函数（含 `ensureAccess` + `loadUsers`）
- 之前对 home/my-orders 的"已有 handler 维持原状"也一并统一替换，便于后续维护。

### 新增：4 个数据页支持下拉刷新
**问题**：`home`、`my-orders` 两页虽然写了 `onPullDownRefresh` handler，但对应 JSON 配置里没开 `enablePullDownRefresh`，所以下拉手势根本不会触发；`admin-meals`、`admin-users` 两页连 handler 都没有。

**改动**：
- `miniprogram/pages/{home,my-orders,admin-meals,admin-users}/index.json`：均加上 `"enablePullDownRefresh": true` 与 `"backgroundTextStyle": "dark"`（深色三点指示器，深底背景下更清晰）。
- `miniprogram/pages/admin-meals/index.js`：新增 `onPullDownRefresh`，复用 `_pickingImage` 守卫避免回到页面时清掉草稿表单；`try/finally` 包住，异常也能停掉下拉 loading。
- `miniprogram/pages/admin-users/index.js`：同上模式，新增 `onPullDownRefresh`。
- `home`、`my-orders` 两页已有的 handler 维持原状（逻辑可用，错误均在内部捕获）。

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
