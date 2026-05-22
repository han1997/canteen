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

导出文件下载：
- 列表/详情/创建接口（`POST /api/v1/stats/export`、`GET /api/v1/stats/export/{job_no}`）的返回体新增 `file_name`、`download_url` 字段；当 `status == "done"` 时 `download_url` 形如 `/stats/export/{job_no}/download`。
- 下载接口：`GET /api/v1/stats/export/{job_no}/download`（需 `kitchen`/`admin`/`super_admin` 角色，携带 `Authorization: Bearer <token>`），通过 `FileResponse` 流式返回 xlsx，附带 `Content-Disposition`。
- 小程序侧使用 `wx.downloadFile` + `wx.openDocument` 实现"下载/查看"，在手机微信里可通过右上角菜单转发或保存；PC 微信会直接调用系统 Excel/WPS 打开。
- 上线前需在微信公众平台把后端域名加入 **downloadFile 合法域名**。

开发环境自动初始化（`APP_ENV != production`）：
- 启动时会自动为未来 `BOOKING_SEED_DAYS` 天创建早/中/晚三个时段（slot），**不再写入任何默认菜品**，菜品需由食堂/管理员在"菜品管理"中手动维护。
- 菜品按 `meal_type` 维护一份模板（早/中/晚各一份），与日期解耦：管理员任何时候新增/修改/删除一个菜品，所有日期的同餐次都立即生效。
- 菜品支持软删除（`meal_packages.is_deleted`）：删除后用户端/统计/下单均不可见。删除时同步处理「同餐次、未截止、未核销且未取消」的订单——按菜品名移除对应 `OrderItem`；若订单因此变空，自动置为 `CANCELLED` 并写入「菜品已下架，订单自动取消」备注。已核销/已取消订单保留不动。
- 默认仅今明两天的早/中/晚开启订餐（`BOOKING_AUTO_OPEN_DAYS=2`），其他日期保持未开放订餐状态。
- 服务启动后会注册每日定时任务（凌晨 00:01）自动补齐未来订餐窗口的 slot，保持时段框架持续可用；已有菜品不会被覆盖。
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

## 7. 镜像构建与发布（内网 CI）
镜像由一个独立的"工具人"容器（`git-docker-builder`）构建并推送到内网仓库 `192.168.10.4:51001`。
通过挂载宿主机 `/var/run/docker.sock` 复用宿主机 Docker 守护进程，无需 `--privileged`，
也不需要 DinD，速度快且可命中宿主机镜像缓存。

### 7.1 工具镜像 `git-docker-builder`
Alpine + git + docker-cli + jq，仅用作"跑脚本的壳"。

`builder/Dockerfile`：
```dockerfile
FROM alpine:3.18
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories
RUN apk add --no-cache bash git docker-cli openssh-client jq
WORKDIR /workspace
CMD ["/bin/bash"]
```
构建（一次性）：
```bash
docker build -t git-docker-builder:v1 .
```

### 7.2 构建并推送脚本 `build-and-push.sh`
放在项目根目录（被挂载为 `/workspace`），由工具镜像执行。时间戳即镜像 TAG：
```bash
#!/bin/bash
set -e
REGISTRY="192.168.10.4:51001"
IMAGE_NAME="canteen_backend"
TAG=$(date +%Y%m%d%H%M%S)   # 例：20260518035155

docker build -t ${REGISTRY}/${IMAGE_NAME}:${TAG} ./backend
docker tag  ${REGISTRY}/${IMAGE_NAME}:${TAG} ${REGISTRY}/${IMAGE_NAME}:latest

docker push ${REGISTRY}/${IMAGE_NAME}:${TAG}
docker push ${REGISTRY}/${IMAGE_NAME}:latest

echo "已发布镜像: ${REGISTRY}/${IMAGE_NAME}:${TAG}"
```

### 7.3 实际执行命令
项目代码放在宿主机 `/home/hhy/docker_build`，目录里含 `backend/`、`build-and-push.sh`：
```bash
sudo docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /home/hhy/docker_build:/workspace \
  -e http_proxy="http://192.168.10.48:7890" \
  -e https_proxy="http://192.168.10.48:7890" \
  -e no_proxy="localhost,127.0.0.1,192.168.0.0/16,local.com" \
  git-docker-builder:v1 \
  /bin/bash ./build-and-push.sh
```

### 7.4 避坑提示
- **内网仓库走 HTTP**：宿主机 `/etc/docker/daemon.json` 需把 `192.168.10.4:51001` 加入 `insecure-registries`，重启 docker 后生效。
- **代理只用于外网依赖**：`http_proxy / https_proxy` 用来拉 `pip` / `apk` 包；推送到内网仓库走 `no_proxy` 直连，所以 `192.168.0.0/16` 必须在 `no_proxy` 里，否则 push 会被代理拦截。
- **登录凭据复用**：仓库需登录时，宿主机先 `docker login`，工具容器追加 `-v ~/.docker/config.json:/root/.docker/config.json` 即可免重复登录。
- **Git SSH 密钥**：若脚本里走 SSH `git clone`，追加 `-v ~/.ssh:/root/.ssh`。
- **时区一致**：TAG 由 `date` 生成，建议追加 `-v /etc/localtime:/etc/localtime:ro`，避免容器时区与宿主机错位导致 TAG 跳变。
- **`sudo` 是必要的**：因为要写 `/var/run/docker.sock`；如已将用户加入 `docker` 组可去掉。

### 7.5 部署
推送完成后，部署端通过仓库根目录的 `docker-compose.yml` 拉取并启动：
```bash
docker compose pull && docker compose up -d
```
镜像 TAG 升级时更新 `docker-compose.yml` 里 `backend.image` 的 TAG，或在 compose 文件中用 `${BACKEND_TAG}` 占位。
