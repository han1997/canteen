# 更新日志

本仓库的变更日志，每次代码修改后追加。日期为本地时区（Asia/Shanghai）。

## 2026-05-26

### 新增：用户管理支持编辑基础信息

**动机**：
- 之前用户管理页只能修改角色和启用/禁用状态，无法修改警号、姓名、部门、手机号等基础信息
- 录入错误时只能删除重建，体验差

**变更**：

1. **后端 schema**（`backend/app/schemas/admin.py`）：
   - 新增 `AdminUserUpdateRequest`：所有字段均可选（未提供则不更新；提供空串则清空）
   - 通过 `@model_validator` 自动 strip 字段，将空串归一化为 None

2. **后端接口**（`backend/app/api/v1/admin.py`）：
   - 新增 `PATCH /admin/users/{user_id}` 接口（需 `admin`/`super_admin` 角色）
   - 校验：
     - 警号与手机号至少保留一个非空
     - 警号/手机号唯一性（与其他用户冲突时返回 400）
     - 姓名/部门不能改为空
   - 审计日志记录每个字段的 old/new 值（action: `UPDATE_USER_INFO`）
   - 捕获 `IntegrityError` 兜底处理并发冲突

3. **小程序 API**（`miniprogram/services/api.js`）：
   - 新增 `updateAdminUser(userId, payload)` 方法

4. **小程序 UI**（`miniprogram/pages/admin-users/`）：
   - 用户卡片新增「编辑」按钮（与角色 picker、启用/禁用按钮并列）
   - 点击编辑后，卡片展开为编辑表单（4 个输入框 + 保存/取消）
   - 显示手机号字段（之前 UI 没显示）
   - `action-row` 改为 3 列 grid 布局，避免按钮换行
   - `picker-role` 加 `text-overflow: ellipsis` 防长角色名挤压
   - 警号若为空，标题显示「无警号」

**注意**：
- 编辑表单的输入框默认填充当前值；清空警号输入框后保存 = 清空警号
- 警号或手机号至少保留一个，否则提交时被服务端拒绝
- 修改警号会同时影响该用户的登录账号（前端已用 `user.id` 作为 JWT subject，旧 token 仍可用）

---

## 2026-05-26

### 代码审查修复：性能优化与 UX 改进

**动机**：
- 代码审查发现多餐别重构存在 N+1 查询风险和小处问题，需修复后再部署。

**修复内容**：

1. **N+1 查询优化**：
   - `backend/app/api/v1/meals.py`：将循环查询每个 meal_type 改为单次 JOIN 查询 + 内存分组（select tuple + defaultdict 分组）
   - `backend/app/services/order_service.py`：查询 package_list 时增加 `joinedload(MealPackage.meal_type_associations)`，避免后续 `pkg.meal_types not in` 检查触发懒加载
   - `backend/app/api/v1/admin.py`：新增辅助函数 `_load_package_with_relations(db, package_id)` 一次性预加载 `items` 和 `meal_type_associations`；替换 `create_meal_package` / `update_meal_package` / `delete_meal_package` 中的 `db.get()` + `db.refresh()` 调用

2. **update_meal_package 改用 diff 模式**：
   - 原逻辑：先 `db.query(MealPackageMealType).filter(...).delete()` 全删，再循环 add
   - 新逻辑：计算 `to_remove = current - new` 和 `to_add = new - current`，只操作变化的关联
   - 优点：减少 DB 写入，session 中残留对象更少，cascade delete-orphan 行为更可预期

3. **package_code 前缀通用化**：
   - 原：根据 `meal_type` 用 `BF` / `LU` / `DI` 前缀
   - 新：统一用 `MP`（Meal Package）前缀，多餐别菜品不再有歧义
   - `_generate_package_code()` 参数改为可选（暂保留向后兼容签名）

4. **init_db 迁移函数事务边界优化**：
   - 原：4 个独立 `with engine.begin()` 事务
   - 新：合并到单个事务（MySQL DDL 仍会隐式提交，但代码意图更清晰）
   - 添加文档说明 MySQL DDL 无法回滚的限制

5. **小程序 UX 改进**：
   - 菜品卡片显示「适用餐别」徽章（如「午晚餐」、「中餐」），避免用户误操作
   - 删除未使用的 `MEAL_TYPE_MULTI_OPTIONS` 常量
   - 新增 `.meal-type-badge` 样式（蓝色徽章，左上角显示）

**技术细节**：
- 修改文件：
  - `backend/app/api/v1/admin.py`（新增 `_load_package_with_relations`，重构 4 处查询）
  - `backend/app/api/v1/meals.py`（N+1 → 单次 JOIN）
  - `backend/app/services/order_service.py`（增加 joinedload）
  - `backend/app/db/init_db.py`（合并迁移事务）
  - `miniprogram/pages/admin-meals/index.js`（删除未用常量）
  - `miniprogram/pages/admin-meals/index.wxml`（菜品卡片显示徽章）
  - `miniprogram/pages/admin-meals/index.wxss`（新增徽章样式）

**影响**：
- 用户端 `/meals/slots` 接口查询数降低（一天 3 个时段从 3 次查询降为 1 次）
- 订餐验证不再触发懒加载
- 菜品 CRUD 响应不依赖 SQLAlchemy 懒加载机制
- 管理员一眼能看出每个菜品适用的餐别

---

## 2026-05-26

### 整理：合并 SQL 文件为单一初始化脚本

**动机**：
- 之前历经多次架构迁移，`schema.sql` 累积了大量幂等迁移代码（如 slot_id → meal_type、meal_type → 关联表等）
- 新部署不需要这些遗留迁移代码，应该一份干净的最终结构
- 独立的 `migration_meal_types.sql` 是临时迁移脚本，也应合并清理

**变更**：
- 重写 `backend/sql/schema.sql`：
  - 仅包含最终的表结构和默认超管账号
  - 移除所有 `SET @xxx_exists` / `PREPARE stmt` 等幂等迁移逻辑
  - 移除 `meal_packages.meal_type` 列（已迁移到关联表）
  - 表结构和字段添加详细的中文注释
- 删除 `backend/sql/migration_meal_types.sql`（独立迁移脚本，已合并到主脚本）
- 删除 `backend/fix_booking_deadline.py` / `fix_booking_deadline.sql`（临时修复脚本）

**说明**：
- 新部署：直接执行 `sql/schema.sql` 即可建库建表
- 升级现有数据库：仍依赖 `backend/app/db/init_db.py` 中的迁移函数自动执行升级
- 两条路径都能到达相同的最终状态

---

## 2026-05-26

### 重大变更：菜品支持多餐别关联（中餐和晚餐可共用菜单）

**动机**：
- 中餐和晚餐的菜品高度重合，分开维护造成大量重复工作。
- 业务方希望一个菜品可以同时关联到多个餐别（如午晚餐共用一份菜单）。

**架构变更**：
- 新建关联表 `meal_package_meal_types`，实现菜品与餐别的多对多关系
- 移除 `meal_packages.meal_type` 列上的唯一约束（`uk_meal_packages_type_code`）
- 新增 `uk_meal_packages_code`（仅 package_code 唯一）
- 旧的 `meal_type` 列保留为可空，便于回滚（后续迭代可删除）

**后端变更**：
- 数据库迁移：
  - `backend/sql/schema.sql`：新增 `meal_package_meal_types` 表
  - `backend/app/db/init_db.py`：新增 `_migrate_meal_packages_to_multi_meal_types()` 迁移函数，自动将现有 `meal_type` 数据迁移到关联表
  - `backend/sql/migration_meal_types.sql`：独立的迁移脚本，便于手动执行
- ORM 模型：
  - `backend/app/models/entities.py`：新增 `MealPackageMealType` 关联模型
  - `MealPackage` 增加 `meal_type_associations` 关系和 `meal_types` 属性
  - 移除 `MealPackage.meal_type` 列
- Pydantic Schemas (`backend/app/schemas/admin_meal.py`)：
  - `AdminMealPackageOut.meal_type` (str) → `meal_types` (list[str])
  - `AdminMealPackageCreateRequest.meal_type` → `meal_types` (list[str], 至少 1 个)
  - `AdminMealPackageUpdateRequest` 新增 `meal_types` 字段（可选）
- API 接口 (`backend/app/api/v1/admin.py`)：
  - `GET /admin/meal-packages` 按餐别过滤改为 JOIN 关联表
  - `POST /admin/meal-packages` 接受 `meal_types` 数组，自动创建关联记录
  - `PATCH /admin/meal-packages/{id}` 支持更新餐别关联（先删后插）
  - `POST /admin/meal-packages/bulk-import` Excel 表头「餐别」支持「午晚餐」「中餐/晚餐」等组合值
  - `DELETE /admin/meal-packages/{id}` 审计日志改用 `meal_types` 数组
- 用户端 (`backend/app/api/v1/meals.py`)：
  - 通过关联表 JOIN 查询每个餐别的菜品
- 订餐验证 (`backend/app/services/order_service.py`)：
  - 检查 `slot.meal_type in pkg.meal_types` 替代原来的相等判断

**小程序变更**：
- `miniprogram/pages/admin-meals/index.js`：
  - 菜品 tab 从「早/中/晚」改为「早餐/午晚餐」两个 tab
  - 早餐 tab 显示包含 breakfast 的菜品
  - 午晚餐 tab 显示包含 lunch 或 dinner 的菜品
  - 编辑/新增菜品时，通过 3 个复选框选择适用餐别（早餐/中餐/晚餐）
  - 保存时收集勾选的餐别提交给后端
- `miniprogram/pages/admin-meals/index.wxml`：
  - 菜品卡片增加「适用餐别」3 个复选框
  - 新增菜品区域增加「适用餐别」3 个复选框
- `miniprogram/pages/admin-meals/index.wxss`：新增 `.meal-type-row` / `.meal-type-check` 样式

**使用说明**：
- 新增菜品时勾选「中餐」和「晚餐」即可同时在中餐和晚餐使用
- 编辑现有菜品可调整其适用餐别（增减勾选项）
- 批量导入 Excel 的「餐别」列支持：早餐、中餐、晚餐、午晚餐、中晚餐、中餐/晚餐
- 重复菜品按 `package_name` 全局去重（不再按 `meal_type + package_name`）

**回滚方案**：
- `backend/sql/migration_meal_types.sql` 文件底部提供完整回滚 SQL
- 旧的 `meal_type` 列保留为可空，未真正删除
- 回滚步骤：先恢复 `meal_type` 为非空 → 删除 `uk_meal_packages_code` 约束 → 恢复 `uk_meal_packages_type_code` 约束 → 删除关联表

**风险**：
- 此变更涉及核心数据结构，建议先在测试环境完整测试
- 数据迁移会读取所有 `meal_packages` 数据，大数据量时需注意性能
- 旧版小程序客户端可能无法正确解析 `meal_types` 数组（需同步发版）

---

## 2026-05-26

### 修复：订餐开关更新时自动清除截止时间

**问题**：
- 虽然代码已支持 `booking_deadline` 可选，但通过小程序开关更新时段状态时，旧的截止时间仍然保留
- 导致即使开关打开，用户仍看到"已过截止时间"的提示

**修复**：
- `PATCH /api/v1/admin/meal-slots/{slot_id}/status` 接口在更新 `is_open` 状态时，同时将 `booking_deadline` 设为 `NULL`
- 确保通过小程序开关操作后，订餐完全由 `is_open` 控制，不受旧截止时间影响

**影响**：
- 管理员在小程序点击开关后，该时段的截止时间会被自动清除
- 已存在的旧时段数据会在下次开关操作时自动修复

---

## 2026-05-26

### 批量导入安全性与健壮性增强

**动机**：
- 代码审查发现批量导入功能存在多个安全和健壮性问题，需要修复以防止生产环境风险。

**修复内容**：
1. **输入验证增强**：
   - 新增 `_validate_police_no()` 和 `_validate_mobile()` 函数，验证警号长度（2-32）和手机号格式（11位数字）
   - 批量导入用户时检查警号和手机号格式，格式错误记入 errors 数组
   - 菜品导入增加价格负数检查

2. **行数限制**：
   - 新增配置项 `settings.bulk_import_max_rows = 1000`，防止超大文件导致内存问题
   - 文件大小和行数限制移至 `backend/app/core/config.py` 统一管理

3. **异常处理细化**：
   - 区分 `IntegrityError`（数据冲突）、`ValueError`（格式错误）和通用异常
   - IntegrityError 提供更明确的错误信息（重复警号/手机号）
   - 所有异常都触发 `db.rollback()`，确保数据一致性

4. **重复检测改进**：
   - 菜品批量导入新增重复检测：预加载现有菜品 `(meal_type, package_name)` 组合
   - 重复菜品跳过而非报错，与用户导入行为一致

5. **SQL 注入防护**：
   - 在 `_ensure_enum_value()` 函数添加安全警告注释，明确 `alter_sql` 必须是可信常量

**技术细节**：
- `backend/app/core/config.py`：新增 `bulk_import_max_file_size` 和 `bulk_import_max_rows` 配置
- `backend/app/api/v1/admin.py`：
  - 导入 `re` 模块用于正则验证
  - 新增验证函数 `_validate_police_no()` / `_validate_mobile()`
  - 批量导入接口增加行数检查、格式验证、细化异常处理
  - 菜品导入增加重复检测逻辑
- `backend/app/db/init_db.py`：`_ensure_enum_value()` 增加 SQL 注入警告注释

**影响**：
- 批量导入更安全，防止恶意或错误数据导致系统问题
- 错误信息更清晰，便于用户定位问题
- 配置集中管理，便于后续调整限制

---

## 2026-05-26

### 订餐截止时间改为可选，订餐开关完全由管理员控制

**动机**：
- 原有逻辑强制要求设置截止时间，但实际业务中希望通过 `is_open` 开关灵活控制订餐，不需要固定的截止时间。

**变更**：
- 数据库 `meal_slots.booking_deadline` 改为 `NULL` 可选（原为 `NOT NULL`）
- 后端 `AdminMealSlotCreateRequest.booking_deadline` 改为可选字段（原为必填）
- 订餐逻辑调整：
  - 优先检查 `is_open` 状态，关闭则不可订餐
  - 如果设置了 `booking_deadline`，则额外检查是否已过期
  - 如果未设置 `booking_deadline`，只要 `is_open=true` 就可以一直订餐
- 小程序「菜品管理」页面：点击开关可直接创建时段并开放/关闭订餐，无需设置截止时间
- 新增迁移函数 `_relax_meal_slots_booking_deadline()` 自动修改现有表结构

**影响**：
- 管理员可以通过开关灵活控制订餐，不受固定截止时间限制
- 如需截止时间控制，仍可通过 API 设置 `booking_deadline` 字段
- 现有数据的 `booking_deadline` 保持不变，仍会生效

---

## 2026-05-26

### 新增：登录支持警号/手机号二选一；批量导入就餐人员与菜品

**动机**：
- 部分用户无警号或警号未录入系统，希望用手机号作为账号登录。
- 首次部署或批量录入时，逐个手工创建用户/菜品效率低，需要 Excel 批量导入。

**改动**：
- 用户表 schema 调整：
  - `backend/app/models/entities.py`：`User.police_no` 改为 `nullable=True`；`User.mobile` 增加 `unique=True`。
  - `backend/sql/schema.sql`：同步 `police_no VARCHAR(32) NULL UNIQUE` / `mobile VARCHAR(20) NULL UNIQUE`。
  - `backend/app/db/init_db.py`：新增 `_relax_users_police_no()` 与 `_ensure_users_mobile_unique()` 迁移函数，幂等修改现有表结构。
- 登录与认证：
  - `backend/app/schemas/auth.py`：`LoginRequest.police_no` 改为 `account`（警号或手机号）；`WechatBindRequest` 的 `police_no` / `mobile` 均改为可选，增加 `@model_validator` 校验至少填一个；`UserProfile` 增加 `mobile` 字段，`police_no` 改为可选。
  - `backend/app/api/v1/auth.py`：`login` 用 `or_(User.police_no == account, User.mobile == account)` 查询；`wechat_bind` 先按 `police_no` 查，未找到再按 `mobile` 查，新建用户时默认密码改为 `123456`（常量 `DEFAULT_INITIAL_PASSWORD`）；JWT subject 改用 `str(user.id)` 替代 `police_no`。
  - `backend/app/core/security.py`：`_fetch_user_for_token` 兼容新旧 token（数字 subject 按 `user.id` 查，否则按 `police_no` 查）。
- 管理后台用户创建：
  - `backend/app/schemas/admin.py`：`AdminUserCreateRequest` 的 `police_no` / `mobile` 均改为可选，`init_password` 默认 `123456`，增加 `@model_validator` 校验至少填一个；`AdminUserOut` 增加 `mobile` 字段，`police_no` 改为可选；新增 `AdminBulkImportResult` schema。
  - `backend/app/api/v1/admin.py`：`list_users` 搜索条件增加 `User.mobile.like`；`create_user` 分别检查 `police_no` / `mobile` 冲突；新增 `POST /admin/users/bulk-import` 接口，读取 xlsx 表头「警号 / 姓名 / 手机号」，警号与手机号至少填一个，默认密码 `123456`、角色 `officer`、部门「祁门县公安局」。
  - 新增 `POST /admin/meal-packages/bulk-import` 接口，读取 xlsx 表头「餐别 / 菜品名称 / 分类 / 单价」，餐别映射 `早餐→breakfast / 中餐→lunch / 晚餐→dinner`，分类映射 `普通套餐→normal / 减脂套餐→fat_loss / 自选菜→self_pick`（默认 `normal`），自动生成 `package_code`。
- 小程序登录页：
  - `miniprogram/pages/login/index.wxml`：「警号登录」改为「账号登录」，输入框 placeholder 改为「警号或手机号」；「首次绑定」增加「手机号（可选）」输入框，提示「警号与手机号至少填写其一。首次绑定后默认密码为 123456」。
  - `miniprogram/pages/login/index.js`：`loginPoliceNo` 改为 `loginAccount`；`submitLogin` 传 `account` 字段；`submitBind` 增加 `bindMobile` 字段，校验至少填一个，提示文案改为「初始登录密码为 123456」。
  - `miniprogram/pages/login/index.wxss`：新增 `.hint-text` 样式。
- 小程序批量导入：
  - `miniprogram/services/api.js`：新增 `bulkImportUsers(filePath)` / `bulkImportMealPackages(filePath)`，通过 `wx.uploadFile` 上传 xlsx 到对应后端接口。
  - `miniprogram/pages/admin-users/index.wxml`：「新增用户」按钮旁增加「批量导入」按钮。
  - `miniprogram/pages/admin-users/index.js`：新增 `bulkImport()` 方法，调用 `wx.chooseMessageFile` 选择 xlsx，上传后弹窗显示 `created / skipped / errors`。
  - `miniprogram/pages/admin-meals/index.wxml`：「新增菜品」下方增加「批量导入菜品」按钮（`.full-btn` 占满行）。
  - `miniprogram/pages/admin-meals/index.js`：新增 `bulkImport()` 方法，逻辑同用户导入。
  - `miniprogram/pages/admin-meals/index.wxss`：新增 `.action-btn.full-btn { grid-column: 1 / -1; }`。

**注意**：
- 旧 token（subject 为 `police_no`）仍可用，`_fetch_user_for_token` 会自动兼容；新 token 全部使用 `user.id`。
- `police_no` / `mobile` 均可为 `NULL`，但至少一个非空由应用层校验（Pydantic validator）；数据库 UNIQUE 约束允许多个 `NULL`。
- 批量导入遇到重复账号（警号或手机号已存在）会跳过该行，不报错；表头缺失或必填字段为空会记入 `errors` 数组返回。
- Excel 模板格式见后端 API 注释：用户「警号 / 姓名 / 手机号」，菜品「餐别 / 菜品名称 / 分类 / 单价」。
- 批量导入安全增强：
  - 文件大小限制 10MB，防止内存溢出
  - 文件内容验证，捕获 openpyxl 异常防止上传非法文件
  - 事务回滚机制，导入失败时自动回滚所有变更
  - 性能优化：预加载现有 police_no/mobile，避免 N+1 查询问题
  - 审计日志：记录 `BULK_IMPORT_USERS` / `BULK_IMPORT_MEAL_PACKAGES` 操作及统计信息

## 2026-05-25

### 新增：订餐开关支持「今天 / 明天」切换；导出 Excel 简化列 + 新增「菜品订购人」sheet

**动机**：
- 之前小程序 admin-meals 顶部「今日订餐开关」只能开关**今天**的早/中/晚 slot，明天的 slot 只能调用后端 API 创建。需求方希望直接在小程序里就能切到「明天」、提前一天开放/关闭订餐通道，避免凌晨临时上后台。
- 导出的 xlsx 当前有 14 列（订单号/警号/姓名/日期/餐别/分类/订单状态/菜品/单价/份数/单位/小计/订单总价/下单时间），实际使用时只关心「姓名 / 菜品 / 份数 / 价格」；并希望按日期分块、每天一个清晰的日期标题。
- 后厨备餐时希望另一个视角的输出：每个菜品分别有哪些人订购，方便按菜品分发。

**改动**：
- 订餐开关增加「明天」：
  - `miniprogram/pages/admin-meals/index.js`：`data` 把原 `todayDate` / `todaySlotChips` 改为 `slotDayIndex` / `slotDayTabs`（`[{label:"今天",date},{label:"明天",date}]`）/ `slotChips`（当前 tab 的 3 个 chip）/ `slotChipsByDate`（两天缓存）。新方法 `activeSlotDate()` / `buildChipsForDate(date)` / `loadSlotChips()`（按 `slotDayTabs` 顺序逐个 `api.getAdminMealSlots(date)` 取，写入 cache 并刷新 `slotChips`） / `onSlotDayTabChange(e)` / `onToggleSlot(e)`（切换写入 `activeSlotDate()` 对应日期的 slot）。原 `loadTodaySlots` / `onToggleTodaySlot` 删除。
  - `miniprogram/pages/admin-meals/index.wxml`：`.today-slots` 标题文案改「订餐开关」、右上日期显示 `slotDayTabs[slotDayIndex].date`；标题与 chips 之间插入两列 grid 的「今天 / 明天」tab；chips 绑定 `slotChips` + `onToggleSlot`。
  - `miniprogram/pages/admin-meals/index.wxss`：新增 `.slot-day-tabs` / `.slot-day-tab` / `.slot-day-tab-active`（与 meal-tabs 同色调，高度 52rpx）。
- Excel 导出：
  - `backend/app/services/export_service.py`：删除未使用的 `MEAL_TYPE_LABEL` / `MEAL_CATEGORY_LABEL` / `ORDER_STATUS_LABEL` 三个字典及对应 `_to_cn_*` 与 `_normalize_enum_value` 辅助函数（简化后不再翻译餐别/分类/状态）。
  - 主 sheet「订餐明细」表头从 14 列缩为 4 列：`姓名 / 菜品 / 份数 / 价格(元)`。`_format_sheet` 列宽与边框范围同步缩到 4 列。
  - `run_export_job` 按 `meal_date` 把 grouped_orders 分桶，对每个日期先 `append` 一行作为日期横幅 → `merge_cells(1..4)` → 填浅蓝底色 (`E8F1FF`) + 蓝色加粗字（`DATE_BANNER_FILL` / `DATE_BANNER_FONT`） + 居中 + 4 列边框；横幅下方再 append 该日期的所有 OrderItem 行。`C` / `D` 列数字格式 `0.00`。
  - 新增 sheet「菜品订购人」：列 `菜品 / 姓名 / 份数`，按 `item_name` 字典序输出，每组的「菜品」列做纵向合并；同组内行按 `(meal_date, real_name)` 排序，确保前/后端日期内同名买家相邻。新增 `_format_item_sheet` 复用与主 sheet 相同的表头底色/边框风格。
- 文档：
  - `backend/README.md`：「订餐时段 slot」一句的 UI 入口名称更新为「菜品管理 → 订餐开关（今天 / 明天）」。「导出文件下载」段落补充 xlsx 现在含两个 sheet 及各自字段含义。

**注意**：
- 「明天」tab 仅触达 `+1 天`；如需开关更远的日期仍需走后端 `POST /api/v1/admin/meal-slots`。`slotDayTabs` 在 `data` 初始化时计算，页面驻留跨过午夜后日期不会自动滚动；目前订餐管理是一次性操作，可接受，必要时刷新页面即可。
- 「菜品订购人」按 `item_name` 字符串聚合，与「订餐明细」一致——历史上同名菜品（哪怕 `package_code` 不同）会被合并到同一组，匹配既有导出语义。
- `_normalize_enum_value` 已删，若以后再需要中文枚举展示需要重新引入；当前导出已无 enum 列。

## 2026-05-25

### 调整：移除 slot 自动创建（每日定时任务 + 启动 seed），改为完全手动

**动机**：之前后端有两条自动建 slot 的路径——启动时 `ensure_booking_slots()` 一次性补 14 天空 slot（今/明默认开放，其余关闭），并注册凌晨 00:01 的 asyncio 定时任务每日续 1 天。需求方反馈希望由管理员**完全**手动控制每天每餐次是否开放订餐，不再由后端代劳。

**改动**：
- `backend/app/main.py`：`lifespan` 只保留 `init_db()` 调用；删除 `asyncio.Event` / `asyncio.create_task(booking_window_scheduler(...))` 与对应的取消逻辑；连带删除 `import asyncio`、`from contextlib import suppress`、`from app.services.scheduler_service import booking_window_scheduler`。
- `backend/app/services/scheduler_service.py`：整个文件删除（`booking_window_scheduler` 已无引用）。
- `backend/app/db/init_db.py`：`init_db()` 末尾的 `ensure_booking_slots()` 调用移除；import 由 `from app.db.seed_data import ensure_booking_slots, seed_dev_users` 收窄为 `seed_dev_users`。
- `backend/app/db/seed_data.py`：删除 `_ensure_slot` / `_seed_booking_slots` / `_find_seed_owner_id` / `ensure_booking_slots` / `maintain_booking_window` 五个函数；连带清理 `date/datetime/time/timedelta`、`IntegrityError`、`MealSlot`、`MealTypeEnum` 等不再使用的 import。文件现在只剩 `_ensure_user` + `seed_dev_users`。
- `backend/app/core/config.py`：`Settings` 中删除 `booking_seed_days: int = 14`、`booking_auto_open_days: int = 2` 两项。
- `backend/.env.example`、`docker-compose.yml`：同步删除 `BOOKING_SEED_DAYS=14`、`BOOKING_AUTO_OPEN_DAYS=2`。
- `backend/README.md`：「开发环境自动初始化」段落改写——明确说明启动**不再创建任何 slot**，slot 由管理员在小程序「今日订餐开关」或 `POST /api/v1/admin/meal-slots` 手动创建并开启。

**注意**：
- 升级到本版本后，**已有数据库里的历史 slot 不会被清理**——之前已经自动播种的 14 天 slot 仍然保留，且其 `is_open` 状态由现有数据决定（管理员可以继续通过 PATCH 接口开关）。从今天起不再有新的自动 slot 生成。
- 管理员手动创建 slot 的入口：小程序 `admin-meals` 顶部「今日订餐开关」（5/25 已上线）只能管今天；其他日期目前仍需后端 API `POST /api/v1/admin/meal-slots`，body 含 `meal_date` / `meal_type` / `is_open` / 可选 `booking_deadline`（不传默认当天 23:59:59）。后续若有"按周/按月批量开放"诉求，可再加一个批量入口。
- 部署需重新构建后端镜像并 bump `docker-compose.yml` 的 `backend.image` tag；老镜像跑起来会继续按旧逻辑每日 00:01 创建 slot。

### 新增：菜品分类「自选菜」、admin-meals 顶部恢复"今日订餐开关"、隐藏订餐页备注栏
**动机**：
- 食堂菜品维护时除了"普通套餐 / 减脂套餐"还需要"自选菜"作为第三类标签。
- 之前 admin-meals 是按 slot 列表渲染的，每个 slot 自带「开放/停止订餐」开关；5/22 改成按 meal_type 模板后那个开关被一并删掉，食堂人员失去了"现场关掉某餐订餐通道"的能力。
- 订餐页菜品卡上方那条「备注（可选，如：少盐）」输入框暂时不需要，先隐藏。

**改动**：
- 后端 enum：`backend/app/models/entities.py` 中 `MealCategoryEnum` 增加 `SELF_PICK = "self_pick"`。
- 后端 schema：`backend/sql/schema.sql` 中 `meal_packages.meal_category` / `orders.meal_category` 的 ENUM 增加 `'self_pick'`；`export_jobs.meal_category` 同步增加（仍保留 `'all'`）。
- 后端迁移：`backend/app/db/init_db.py` 新增 `_ensure_enum_value(table, column, alter_sql)` 幂等工具——读 `information_schema.COLUMNS.COLUMN_TYPE` 解析现有 ENUM 值集合，全部覆盖则跳过、否则执行 `ALTER TABLE ... MODIFY COLUMN ... ENUM(...)`。在 `_ensure_legacy_columns` 末尾追加三次调用，把已部署库的三个 ENUM 列升级到含 `self_pick`。
- 前端常量与选项：
  - `miniprogram/utils/constants.js`：新增 `SELF_PICK = "self_pick"`、`CATEGORY_LABEL.self_pick = "自选菜"`。
  - `miniprogram/pages/admin-meals/index.js`：`CATEGORY_OPTIONS` 增加自选菜，picker 多一项可选。
  - `miniprogram/pages/admin-stats/index.js`：统计过滤的 `CATEGORY_OPTIONS` 也同步加上，便于按自选菜过滤。
- 今日订餐开关（admin-meals）：
  - `index.js`：`data` 新增 `todayDate`、`todaySlotChips` 三项（早/中/晚）。`loadTodaySlots()` 调 `api.getAdminMealSlots(todayString())`，按 `meal_type` 索引并合并到 chips；onShow 与 onPullDownRefresh 末尾追加调用。`onToggleTodaySlot(e)` 处理开关变更：若该餐次今日 slot 已存在则 `updateAdminMealSlotStatus`；否则 `createOrUpdateAdminMealSlot` 创建并直接设为期望状态。失败回滚 UI。
  - `index.wxml`：在 hero-card 内 `.hero-head` 下方、`.meal-tabs` 上方插入 `.today-slots` 块：标题行「今日订餐开关 + 日期」 + 3 列 grid 的开关 chip。
  - `index.wxss`：新增 `.today-slots*` 样式；开/关分别用绿色/橙色背景区分；switch 用 `transform: scale(0.7)` 缩到合适尺寸。
- 隐藏订餐页备注：`miniprogram/pages/home/index.wxml` 中订餐页菜品卡上方的备注 input 加 `wx:if="{{false}}"` 隐藏，保留代码以便后续恢复；对应 `onNoteInput` handler 保留不动。

**注意**：
- "今日订餐开关"操作的是**今天**的 slot；若需关闭明天某餐次，仍需用后端 API（小程序 UI 暂未提供）。
- 新增的 `_ensure_enum_value` 通过解析 `COLUMN_TYPE` 字符串做幂等判断，对 ENUM 顺序不敏感，对值名严格匹配；后续若再加新枚举值，直接复制现有调用即可。
- 备注栏只是 wxml 层 `wx:if="{{false}}"`，`onNoteInput` 仍在 page 上、提交订单时 `note` 字段仍按 `slot.note` 传给后端（默认空字符串）；如果要彻底删除可后续清理。

## 2026-05-22

### 调整：UI 排版打磨
**动机**：订餐页菜品卡的「kcal · 蛋白 · 碳水」一行信息密度过低、几乎都是 `-`，用户实际不看；管理页按钮文字「保存菜品/删除菜品/更换图片」挤一行频繁换行，「退出登录」按钮在顶栏被 helper-text 挤成竖列，视觉上很糟。

**改动**：
- `miniprogram/pages/home/index.wxml`：删除 `.nutrition-line`（`kcal · 蛋白 · 碳水`）整行。
- `miniprogram/pages/admin-meals/index.wxml`：菜品卡的 `.pkg-actions` 重组——「可选开关」单独一行靠右；下方 3 个按钮（更换图片 / 删除菜品 / 保存菜品）用 grid 等分一行。「新增菜品」区把 `.new-tip` 提示文字提到按钮行上方独占一行，按钮（上传图片 / 新增菜品）等分两列。
- `miniprogram/pages/admin-meals/index.wxss`：
  - `.hero-head` 加 `gap: 12rpx`，左侧 `view:first-child { flex: 1; min-width: 0 }`；`.ghost-btn` 改为 `flex: 0 0 auto; white-space: nowrap`，固定 56rpx 高度——防止 helper-text 把退出登录按钮挤到下一行。
  - `.pkg-actions` 改 `flex-direction: column`；新增 `.action-row` (grid 3 列等分) 与 `.action-row.two-cols` (2 列)；`.action-btn` 加 `white-space: nowrap; min-width: 0`、统一 64rpx 高度与 24rpx 字号、`::after { border: none }` 抹除默认边框扰动。
  - 移除已废弃的 `.delete-btn { white-space: nowrap }` 规则。

### 调整：菜品从「按日期 slot」改为「按 meal_type 模板」
**动机**：菜品原本绑定到具体 slot（meal_date + meal_type），导致每天都要单独维护一份菜单；从「今天录入的菜品自动同步到未来 slot」一路改到「打开管理页时按需补齐」越改越绕。需求实际上是「早/中/晚各一份模板，每天复用」，没有按日切换菜单的诉求。

**改动**：
- 数据模型：`meal_packages.slot_id` → `meal_packages.meal_type`（ENUM）；唯一约束 `(slot_id, package_code)` → `(meal_type, package_code)`，名称 `uk_meal_packages_slot_code` → `uk_meal_packages_type_code`。`meal_slots` 表结构、关系字段（`is_open` / `booking_deadline` / `meal_date`）保留——订单仍按日期 slot 记录，slot 仍是订单的容器。
- 迁移：开发环境直接 `TRUNCATE meal_package_items + meal_packages` → drop 旧 FK/UK/column → add 新列与 UK。两种触发路径任选其一：
  - 后端 `backend/app/db/init_db.py` 中的 `_migrate_meal_packages_to_template()` 会在启动时探测、幂等执行。
  - 或手动重跑 `backend/sql/schema.sql`：脚本头部增加了幂等迁移段，新部署直接跳过，旧部署原地升级。
- 模型层（`backend/app/models/entities.py`）：`MealPackage` 删 `slot_id` / `slot` 关系，加 `meal_type` 列；`MealSlot.packages` 关系删除。
- 后端 API：
  - 新增 `GET /admin/meal-packages?meal_type=` — 列出所有未删除模板菜品，可按餐次过滤。
  - 原 `POST /admin/meal-slots/{slot_id}/packages` → `POST /admin/meal-packages`，body 必带 `meal_type`。
  - `PATCH /admin/meal-packages/{id}` / `DELETE /admin/meal-packages/{id}` 路径不变；其中 DELETE 联动订单的查询条件改为「`MealSlot.meal_type == pkg.meal_type` 且 `meal_date >= today` 且 `booking_deadline > now` 且 status NOT IN (VERIFIED, CANCELLED)」——只影响未来仍可改的订单，按 `OrderItem.item_name` 匹配清理。
  - `GET /admin/meal-slots` 不再返回 packages 字段（slot 与菜品解耦）。
  - 用户端 `GET /meals/slots?meal_date=` 响应形状不变：后端按 slot.meal_type 查模板填入 packages；前端无须改动。
  - `order_service.create_or_replace_order` 校验由 `pkg.slot_id != slot_id` 改为 `pkg.meal_type != slot.meal_type`。
- 后端废弃 `app.services.meal_package_service` 整个模块（克隆/合并补齐逻辑全部不再需要）；admin.py 移除相关 import。
- Schema（`backend/sql/schema.sql`）：`meal_packages` 表 DDL 同步更新；保留 idx_meal_packages_category 索引。
- 前端：
  - `miniprogram/services/api.js`：新增 `getAdminMealPackages(mealType?)`；`createAdminMealPackage(payload)` 签名改为单参数（body 带 meal_type）。
  - `miniprogram/pages/admin-meals/`：完全重写为 3 个 meal_type tab；删去日期 picker、`发布早/中/晚` 按钮、`onSlotOpenChange` 时段开关。每次切 tab 显示对应模板列表与独立的「新增菜品」draft；逻辑上不再涉及任何 slot。
  - 用户端 `home/index` / `my-orders` / `profile` / 用户端订餐流程：完全不动——后端响应形状保持兼容。

**注意**：
- 删除一个模板菜品会取消「未来所有同餐次未核销的相关订单」（前一版只取消「同 slot 内」），这是模板模型的必然——若不希望影响其他日期，需要先把订单核销或手动改单。
- 历史订单（已核销 / 已取消）保留不动；OrderItem 里 item_name 是字符串快照，统计 / 导出 不依赖 meal_packages 行。
- 一次性迁移会清空 meal_packages + meal_package_items；旧 orders 的 package_id 在迁移后将悬空（外键不再有对应 row），但 schema 上 ON DELETE 没设 CASCADE，约束本身允许悬空（FK 仅在 INSERT/UPDATE 时检查）。开发环境可接受；线上需另外处理。
- 「时段开/关」UI 暂时从 admin-meals 页面移除；后端 `PATCH /admin/meal-slots/{slot_id}/status` 接口仍保留。若后续需要 UI，可单开「时段管理」页面。

## 2026-05-21

### 调整：菜品复用从「首次建 slot 克隆」改为「按 package_code 合并补齐」，删除菜品级联未核销订单
**动机**：
- 上一版克隆只在「管理员首次创建 slot」分支触发；但 slot 由启动任务/每日定时任务提前播种为空记录后，管理员后续在「最早一天」录入的新菜品就再也进不去未来已存在的同餐次 slot——「今天新增的菜，明天看不到」。
- 同时上一版没考虑：删除菜品时，已有用户已下单且未核销的订单仍残留该菜品，会出现「订单里有但备餐已下架」的不一致。

**改动**：
- `backend/app/services/meal_package_service.py`：
  - 把 `clone_latest_packages_to_slot` 重构为 `sync_packages_from_latest_template(db, slot)`：以 `package_code` 为去重键（同 slot 唯一），对「同餐次、`meal_date` 严格早于本 slot、含未删除菜品」中的最新一份 slot，将其未删除菜品中**本 slot 缺失**的逐项追加（含 `MealPackageItem`），`sort_order` 在当前最大值之后递增。本 slot 已有菜品不会被覆盖、不会被删除，只补齐缺失。
  - 拆出 `_find_template_slot` 私有函数；模板查询条件与之前一致（同餐次、日期严格早于本日、含非删除菜品）。
- `backend/app/api/v1/admin.py`：
  - `list_meal_slots` 中对查询日期 `>= today` 的每个 slot 调用 `sync_packages_from_latest_template`，每次包在 `db.begin_nested()` 中并捕获 `IntegrityError`（防并发同 `(slot_id, package_code)` 重复插入）；若整体新增了条目则 `commit` 并重读。这样「管理员每次打开菜品管理页」都会被动地补齐缺失菜品。
  - 取消 `create_or_update_meal_slot` 中先前的「首次建 slot 时克隆」逻辑——避免与 list 路径重复触发；slot 创建保持纯 upsert 行为。
  - `delete_meal_package` 联动同步：定位本 slot 内「未核销且未取消」的所有 Order，按 `OrderItem.item_name == pkg.package_name` 删除匹配条目；若 Order 因此空了，置 `status=CANCELLED`、`cancelled_at=utcnow()`、`note="菜品已下架，订单自动取消"`。审计 `detail_json` 增加 `cancelled_order_ids`、`trimmed_order_ids` 便于追溯。

**注意**：
- 合并语义是「**仅补齐缺失**」：未来 slot 已有的菜品（哪怕是从更早历史克隆来的旧条目）不会被新菜单覆盖，价格/图片/营养字段也不会被刷新。如需更新某个未来 slot 的现有菜品，仍需走 PATCH。
- 删除菜品对已核销订单（`VERIFIED`）和已取消订单（`CANCELLED`）不动，保留历史凭证。
- `OrderItem` 匹配按字符串 `item_name == pkg.package_name`：若历史上有重名菜品，匹配会同时命中——目前 `(slot_id, package_code)` 唯一但 `package_name` 没有唯一约束，理论上同一 slot 内允许重名；接受这个语义（重名等同同一个菜）。
- `list_meal_slots` 是 GET 但有写入副作用，已通过 `begin_nested` + `IntegrityError` 容错保护并发；用户端 `meals.list_slots` 仍保持纯读，不触发合并。

### 新增：菜品软删除 + 新时段自动复用历史菜品
**动机**：
- 食堂常常想下架某个菜品但保留其历史订单关联，原来只能用「不可选」开关藏起来，列表里仍堆积大量陈旧菜品。
- 新建一天的时段后，菜品需要从零手动录入，而绝大多数日子的菜单结构与最近一次同餐次几乎一致，重复劳动。

**改动**：
- `backend/app/models/entities.py`、`backend/sql/schema.sql`、`backend/app/db/init_db.py`：`meal_packages` 新增 `is_deleted TINYINT(1) NOT NULL DEFAULT 0`；启动时自动补列，方便已部署环境无感升级。
- `backend/app/services/meal_package_service.py`（新文件）：
  - `visible_packages(packages)`：内存层面过滤掉 `is_deleted`。
  - `clone_latest_packages_to_slot(db, slot)`：若 `slot` 当前没有任何菜品，复制「同餐次、`meal_date` 严格早于当前 slot」中最近一份模板的所有非删除菜品及其 `MealPackageItem`，sort_order/价格/图片/营养字段全量拷贝。返回克隆的菜品数。
- `backend/app/api/v1/admin.py`：
  - `_to_meal_slot_out` 使用 `visible_packages` 过滤已删除菜品。
  - `create_meal_package` 计算 `max_sort` 时排除已删除菜品；新建 `MealPackage` 显式 `is_deleted=False`。
  - `update_meal_package` 对已删除菜品返回 404（防止前端绕过列表过滤直接 PATCH）。
  - `create_or_update_meal_slot`：仅在「确实是首次创建」该 slot 时调用 `clone_latest_packages_to_slot`，写入与本身的 upsert 同一事务一次性提交。
  - 新增 `DELETE /admin/meal-packages/{package_id}`：把 `is_deleted` 置 1、`is_selectable` 置 0，写审计日志（`detail_json` 含 `slot_id`/`meal_date`/`package_name`，便于追溯）。
- `backend/app/api/v1/meals.py`：`list_slots` 在序列化时过滤 `pkg.is_deleted or not pkg.is_selectable`。**不在 GET 中触发克隆副作用**——克隆只在管理员显式创建新 slot 时发生，避免用户列表查询并发触发竞态/重复写入。
- `backend/app/services/order_service.py`：下单时 `select(MealPackage)` 增加 `is_deleted.is_(False)` 过滤；循环校验中追加 `pkg.is_deleted` 检查（双保险），错误信息维持原有「部分菜品不可选或不属于当前时段」。
- `miniprogram/services/api.js`：新增 `deleteAdminMealPackage(packageId)`，走 `DELETE /admin/meal-packages/{id}`。
- `miniprogram/pages/admin-meals/index.{js,wxml,wxss}`：菜品卡新增「删除菜品」按钮，点击后 `wx.showModal` 红色确认；提示文案补充「可复用历史菜品」一句，并增加 `.delete-btn { white-space: nowrap }` 样式微调。
- `miniprogram/pages/admin-stats/index.{wxml,wxss}`：顶部 action 行由内联按钮改为 2 列 `grid` 网格，统一按钮高度与间距，新增 `.top-action-logout` 暖色调突出退出。

**注意**：
- `clone_latest_packages_to_slot` 选模板时已用 `MealSlot.meal_date < slot.meal_date` 过滤，回填历史日期的 slot 不会克隆到未来 slot 的菜品。
- 软删除依赖代码层过滤；任何新增 `select(MealPackage)` 的位置都需要主动加 `is_deleted.is_(False)`，否则会把幽灵菜品漏出。已审计目前所有调用点：admin 列表（经 `visible_packages`）、用户列表（`meals.list_slots`）、下单（`order_service`）、`max_sort` 取值——均已覆盖。
- 数据库 `meal_packages` 没有 `(slot_id, package_code) WHERE is_deleted=0` 的部分唯一索引，目前依赖 `_pick_available_package_code` 重试避免冲突；若后续把唯一约束改为不区分 `is_deleted`，将出现「复活」编码冲突，届时需要再处理。

## 2026-05-20

### 修复：代码评审打回的 5 处小问题
**动机**：上面"移除 tabBar / 个人中心改造"两条上线前的自审，发现 5 处一致性/可读性瑕疵，集中修掉。

**改动**：
- `backend/app/api/v1/orders.py`：`_to_order_out` 中 `meal_type` 去掉 `hasattr` 防御与 `if slot is not None` 空判，直接 `slot.meal_type.value` / `slot.meal_date`，和同函数 `meal_category.value` 风格一致；`Order.slot` 为非空外键且调用方都已 `joinedload(Order.slot)`，no defensive checks beyond boundaries。
- `backend/app/schemas/order.py`：`OrderOut.meal_type` / `meal_date` 由 `Optional` 改为 required（`str` / `date`），契约与实现一致。前端兼容性：字段为新增，旧客户端不读，无影响。
- `miniprogram/pages/admin-stats/{index.wxml,index.js}`：顶部 action 行新增「返回首页」按钮，`goHome` 走 `wx.reLaunch('/pages/home/index')`，清栈到 home（管理员在 home → profile → admin-stats 多层栈时也能一步到位）。
- `miniprogram/pages/change-password/index.js`：成功后自动返回的 600ms 抽成 `SUCCESS_BACK_DELAY_MS` 具名常量，并注释说明"等 toast 显示完再退回"。
- `miniprogram/app.wxss`：新增 `.status-unknown`（中性灰：`#475569` 文字 / `#e2e8f0` 背景），用于未知订单状态的安全 fallback。
- `miniprogram/pages/profile/index.js`、`miniprogram/pages/my-orders/index.js`：`STATUS_CLASS[order.status]` fallback 由 `STATUS_CLASS.booked`（蓝色"已预约"，会误导）改为新增的 `STATUS_CLASS_UNKNOWN`（中性灰），未知状态视觉上不再伪装成已预约。
- `miniprogram/pages/profile/index.wxss`：`.recent-order-row` 边线规则改用相邻兄弟选择器 `.recent-order-row + .recent-order-row { border-top }`，去掉对 `:first-of-type`（隐式依赖兄弟元素类型）的依赖；插入/移除"加载中..."等兄弟节点不会再影响第一条边线显隐。

**注意**：
- `OrderOut` schema 字段由 Optional 收紧为 required 是契约层面的"破坏性"变更，但前提是后端总会传非空（已确认）。若未来引入不带 `slot` 的 Order 来源，pydantic 校验会直接报错——这是有意为之，迫使调用方修自己的 joinedload。

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
