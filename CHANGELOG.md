# 更新日志

本仓库的变更日志，每次代码修改后追加。日期为本地时区（Asia/Shanghai）。

## 2026-05-19

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
