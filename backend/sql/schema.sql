-- Canteen mini-program — MySQL 8.0 单文件部署脚本
-- 新部署：导入本文件，自动建库、建表、写入默认超管账号。
-- 已有旧部署（meal_packages.slot_id 模型）：本文件包含幂等迁移段，会自动
--   TRUNCATE meal_packages + meal_package_items，drop 旧 FK/UK/列、加 meal_type 列与新 UK。
--   注意：迁移会清空所有菜品数据（OrderItem 的 item_name 是快照，订单聚合不受影响；
--   但 orders.package_id 会变为悬空，仅适用于开发环境）。
--
-- 默认超管：警号 900001 / 密码 123456（pbkdf2_sha256 哈希）
-- 部门字段：直接保存名称，默认 "祁门县公安局"。
--
-- 字符集统一 utf8mb4，所有外键引用收敛到 users / meal_slots / meal_packages / orders。

CREATE DATABASE IF NOT EXISTS canteen_db
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_general_ci;

USE canteen_db;

-- ===========================================================
-- users
-- ===========================================================
CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  police_no VARCHAR(32) NOT NULL UNIQUE,
  real_name VARCHAR(64) NOT NULL,
  dept_name VARCHAR(128) NOT NULL DEFAULT '祁门县公安局',
  mobile VARCHAR(20) NULL,
  wechat_openid VARCHAR(64) NULL UNIQUE,
  role ENUM('officer','kitchen','admin','super_admin') NOT NULL DEFAULT 'officer',
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  password_hash VARCHAR(255) NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role_status (role, status)
) ENGINE=InnoDB;

-- ===========================================================
-- meal_slots
-- ===========================================================
CREATE TABLE IF NOT EXISTS meal_slots (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  meal_date DATE NOT NULL,
  meal_type ENUM('breakfast','lunch','dinner') NOT NULL,
  booking_deadline DATETIME NOT NULL,
  is_open TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_meal_slots_date_type (meal_date, meal_type),
  CONSTRAINT fk_meal_slots_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- ===========================================================
-- meal_packages
-- ===========================================================
CREATE TABLE IF NOT EXISTS meal_packages (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  meal_type ENUM('breakfast','lunch','dinner') NOT NULL,
  package_code VARCHAR(64) NOT NULL,
  package_name VARCHAR(128) NOT NULL,
  meal_category ENUM('normal','fat_loss','self_pick') NOT NULL,
  is_selectable TINYINT(1) NOT NULL DEFAULT 1,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  image_url VARCHAR(255) NULL,
  price DECIMAL(10,2) NULL DEFAULT 0,
  calories INT NULL,
  protein_g DECIMAL(8,2) NULL,
  carbs_g DECIMAL(8,2) NULL,
  fat_g DECIMAL(8,2) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_meal_packages_type_code (meal_type, package_code),
  INDEX idx_meal_packages_category (meal_category)
) ENGINE=InnoDB;

-- ===========================================================
-- meal_package_items
-- ===========================================================
CREATE TABLE IF NOT EXISTS meal_package_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  package_id BIGINT NOT NULL,
  item_name VARCHAR(128) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit VARCHAR(16) NOT NULL DEFAULT '份',
  item_type ENUM('staple','protein','vegetable','drink','snack','other') NOT NULL DEFAULT 'other',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_meal_package_items_package_id FOREIGN KEY (package_id) REFERENCES meal_packages(id),
  INDEX idx_meal_package_items_package_id (package_id)
) ENGINE=InnoDB;

-- ===========================================================
-- orders
-- ===========================================================
CREATE TABLE IF NOT EXISTS orders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_no VARCHAR(40) NOT NULL UNIQUE,
  user_id BIGINT NOT NULL,
  slot_id BIGINT NOT NULL,
  meal_category ENUM('normal','fat_loss','self_pick') NOT NULL,
  package_id BIGINT NOT NULL,
  status ENUM('booked','verified','cancelled') NOT NULL DEFAULT 'booked',
  source ENUM('mini_program','admin') NOT NULL DEFAULT 'mini_program',
  note VARCHAR(255) NULL,
  booked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at DATETIME NULL,
  verified_at DATETIME NULL,
  verified_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_orders_user_slot (user_id, slot_id),
  CONSTRAINT fk_orders_user_id FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_orders_slot_id FOREIGN KEY (slot_id) REFERENCES meal_slots(id),
  CONSTRAINT fk_orders_package_id FOREIGN KEY (package_id) REFERENCES meal_packages(id),
  CONSTRAINT fk_orders_verified_by FOREIGN KEY (verified_by) REFERENCES users(id),
  INDEX idx_orders_slot_status (slot_id, status),
  INDEX idx_orders_user_status (user_id, status)
) ENGINE=InnoDB;

-- ===========================================================
-- order_items
-- ===========================================================
CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id BIGINT NOT NULL,
  item_name VARCHAR(128) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  unit VARCHAR(16) NOT NULL DEFAULT '份',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_items_order_id FOREIGN KEY (order_id) REFERENCES orders(id),
  INDEX idx_order_items_order_id (order_id)
) ENGINE=InnoDB;

-- ===========================================================
-- reminder_tasks
-- ===========================================================
CREATE TABLE IF NOT EXISTS reminder_tasks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  task_name VARCHAR(128) NOT NULL,
  target_date DATE NOT NULL,
  meal_type ENUM('breakfast','lunch','dinner') NOT NULL,
  send_at DATETIME NOT NULL,
  status ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
  sent_count INT NOT NULL DEFAULT 0,
  fail_count INT NOT NULL DEFAULT 0,
  created_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_reminder_tasks_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_reminder_tasks_send_at (send_at, status)
) ENGINE=InnoDB;

-- ===========================================================
-- export_jobs
-- ===========================================================
CREATE TABLE IF NOT EXISTS export_jobs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  job_no VARCHAR(40) NOT NULL UNIQUE,
  request_user_id BIGINT NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  meal_type ENUM('breakfast','lunch','dinner','all') NOT NULL DEFAULT 'all',
  meal_category ENUM('normal','fat_loss','self_pick','all') NOT NULL DEFAULT 'all',
  status ENUM('queued','running','done','failed') NOT NULL DEFAULT 'queued',
  file_path VARCHAR(255) NULL,
  error_msg VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_export_jobs_request_user_id FOREIGN KEY (request_user_id) REFERENCES users(id),
  INDEX idx_export_jobs_status_created_at (status, created_at)
) ENGINE=InnoDB;

-- ===========================================================
-- audit_logs
-- ===========================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  actor_user_id BIGINT NULL,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(64) NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  request_ip VARCHAR(64) NULL,
  detail_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_logs_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users(id),
  INDEX idx_audit_logs_actor_created (actor_user_id, created_at),
  INDEX idx_audit_logs_action_created (action, created_at)
) ENGINE=InnoDB;

-- ===========================================================
-- 幂等迁移：meal_packages 从 per-slot 改为 per-meal_type 模板
-- 新部署：所有探测条件均不成立，整段跳过；不会修改新建出的表。
-- 旧部署：探测到 slot_id 列残留，会 TRUNCATE + DROP 旧 FK/UK/列、ADD 新列与 UK。
-- ===========================================================
SET FOREIGN_KEY_CHECKS = 0;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'meal_packages'
    AND CONSTRAINT_NAME = 'fk_meal_packages_slot_id'
);
SET @sql = IF(@fk_exists > 0,
  'ALTER TABLE meal_packages DROP FOREIGN KEY fk_meal_packages_slot_id',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @uk_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'meal_packages'
    AND INDEX_NAME = 'uk_meal_packages_slot_code'
);
SET @sql = IF(@uk_exists > 0,
  'ALTER TABLE meal_packages DROP INDEX uk_meal_packages_slot_code',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_slot_id = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'meal_packages'
    AND COLUMN_NAME = 'slot_id'
);
SET @sql = IF(@has_slot_id > 0, 'TRUNCATE TABLE meal_package_items', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(@has_slot_id > 0, 'TRUNCATE TABLE meal_packages', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(@has_slot_id > 0, 'ALTER TABLE meal_packages DROP COLUMN slot_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_meal_type = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'meal_packages'
    AND COLUMN_NAME = 'meal_type'
);
SET @sql = IF(@has_meal_type = 0,
  "ALTER TABLE meal_packages ADD COLUMN meal_type ENUM('breakfast','lunch','dinner') NOT NULL",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @new_uk_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'meal_packages'
    AND INDEX_NAME = 'uk_meal_packages_type_code'
);
SET @sql = IF(@new_uk_exists = 0,
  'ALTER TABLE meal_packages ADD UNIQUE KEY uk_meal_packages_type_code (meal_type, package_code)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS = 1;

-- ===========================================================
-- 默认超级管理员
-- 警号 900001 / 密码 123456（pbkdf2_sha256）
-- 首次登录后请立即在"修改密码"里更换。
-- ===========================================================
INSERT INTO users (police_no, real_name, dept_name, role, status, password_hash)
SELECT '900001', '超级管理员', '祁门县公安局', 'super_admin', 'active',
       '$pbkdf2-sha256$29000$kNIag/AeY6z1npMyJiSEEA$9Q9wgrmtxCXO855VxzGA3BscAvqUO82NMNIDeEFaegQ'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE police_no = '900001');
