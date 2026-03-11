# OpenClaw Enterprise — 当前实现功能总结

## 项目概述

Tauri 2 + React 桌面应用，用于管理多个 AI Agent Docker 沙箱（"数字员工"）。每个数字员工是一个独立的 Docker 容器，内部运行完整的 openclaw gateway 实例，通过飞书/Discord 等渠道对外提供 AI 服务。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React + TypeScript + Tailwind CSS |
| 后端 | Rust (Tauri 2) |
| 沙箱 | Docker (自定义镜像 `openclaw-base`) |
| AI Runtime | openclaw 2026.x (Node.js，容器内运行) |

---

## 一、Docker 镜像 (`openclaw-base`)

**构建方式：**
```bash
cd openclaw_build && ./build.sh
```

`build.sh` 自动完成：
1. 从宿主机 npm 同步 openclaw 包到 `openclaw-pkg/`（不含 node_modules）
2. 执行 `docker build`

**镜像内容：**
- 基础：`node:22-bookworm-slim`（Node.js 22 原生，满足 openclaw >= 22.12.0 要求）
- 办公工具：LibreOffice (Writer/Calc/Impress)、poppler-utils、ghostscript、pandoc
- OCR：tesseract-ocr + 中文简繁体包
- 图像处理：imagemagick + fonts-noto-cjk
- Python 库：python-docx、openpyxl、python-pptx、pypdf、reportlab、pandas 等
- openclaw runtime：从宿主机拷贝源码，容器内 `npm install --omit=dev --legacy-peer-deps`（Linux 原生依赖）
- 内置模板：`openclaw_build/template/` 烤入镜像作为 fallback

**entrypoint.sh 启动流程：**
```
容器启动
  ├── /workspace/.openclaw 已存在（宿主机预注入）→ 跳过，直接用
  └── 不存在 → 从 /opt/openclaw 内置模板初始化（fallback）
  ├── ln -sf /workspace/.openclaw /root/.openclaw
  ├── openclaw gateway run --allow-unconfigured &  ← 后台启动
  └── exec tail -f /dev/null  ← 容器保活
```

---

## 二、员工生命周期

### 创建员工 (`add_employee`)

**完全同步执行，返回前全部完成：**

1. 生成唯一 ID（毫秒时间戳）
2. 写入 `config.json`
3. 拷贝 `openclaw_build/template/` → `/tmp/openclaw_{id}/`
   - 自动寻找模板路径：用户配置 > 打包资源 > 编译时相对路径（`CARGO_MANIFEST_DIR/../openclaw_build/template`）
4. `clean_employee_workspace()`：
   - 删除继承的 session 历史（`.jsonl` 文件）
   - 清空 cron run 历史
   - 清空日志
   - 重置飞书 dedup 状态
   - 生成全新 Ed25519 设备身份（keypair + deviceId），写入 `identity/device.json`
5. `inject_openclaw_config()`：
   - 按 hostname 匹配，将 Dashboard 中配置的 API key 注入 `openclaw.json` 和 `models.json`
   - 此时渠道配置为空（channels disabled）

### 配置渠道 (`save_gateways`)

用户在 Gateway 向导中启用飞书/Discord 后：
- 写入 `config.json`
- 重新执行 `inject_openclaw_config()`，将渠道凭证写入员工 volume 的配置文件

### 启动员工 (`start_sandbox`)

```
docker run -d \
  --name openclaw_{id} \
  --memory {limit} --cpus {limit} \
  -v /tmp/openclaw_{id}:/workspace \
  -v /tmp/openclaw_enterprise_shared:/enterprise_shared \
  --network openclaw-intranet \
  --network-alias {员工名} \
  --env OPENCLAW_EMPLOYEE_NAME={名字} \
  --env {渠道凭证...} \
  openclaw-base \
  tail -f /dev/null
```

启动后若未设置 `internet_blocked`，自动连接 `openclaw-internet` 网络。

### 停止员工 (`stop_sandbox`)

`docker rm -f openclaw_{id}`，同时清理文件系统 watcher。

### 删除员工 (`remove_employee`)

停止容器 + 从 `config.json` 移除记录（volume 数据保留在 `/tmp/openclaw_{id}/`）。

---

## 三、企业内网

### 网络架构

| 网络 | 类型 | 用途 |
|------|------|------|
| `openclaw-intranet` | Docker internal bridge | 员工间互通，无外网出口 |
| `openclaw-internet` | 普通 bridge | 有外网访问权限 |

- 所有员工默认同时挂两个网络
- 可通过 Dashboard 对单个员工切换 `internet_blocked`，实时 `docker network connect/disconnect`

### 企业共享存储

挂载路径：`/tmp/openclaw_enterprise_shared:/enterprise_shared`

### 消息总线 (Local.Bus)

员工间通过 `claw_msg` 脚本互发消息：
```bash
claw_msg <目标员工名> "消息内容"
```
写入 `/enterprise_shared/.bus/{timestamp}_{from}_{to}.json`。

Tauri 后端提供 `list_enterprise_messages` / `clear_enterprise_messages` 命令，前端 BusMonitor 面板每 2 秒轮询展示。

---

## 四、配置注入（策略模式）

### LLM Provider 注入

`inject_llm_in_providers()`：遍历模板中的 provider slot，按 `baseUrl` hostname 匹配 Dashboard 中配置的 API Provider，写入 `apiKey`。

示例：Dashboard 填 `https://api.deepseek.com/v1` → 匹配模板中 `openai` slot 的 baseUrl → 注入 apiKey。

### 渠道注入（Strategy Pattern）

| Strategy | gateway_type | 写入字段 |
|----------|-------------|---------|
| `FeishuStrategy` | `"feishu"` | `channels.feishu.{appId, appSecret}` |
| `LarkStrategy` | `"lark"` | `channels.lark.{appId, appSecret}` |
| `DiscordStrategy` | `"discord"` | `channels.discord.token` |

注入目标文件：
- `/tmp/openclaw_{id}/.openclaw/openclaw.json`
- `/tmp/openclaw_{id}/.openclaw/agents/main/agent/models.json`

---

## 五、设备身份隔离

每个员工创建时生成独立的 Ed25519 keypair：
- 手动编码 SPKI DER（公钥）和 PKCS#8 DER（私钥）
- 转为 PEM 格式
- 生成 32 字节随机 deviceId
- 写入 `identity/device.json`

保证每个员工有唯一的加密身份，不会与其他员工或宿主机身份冲突。

---

## 六、前端功能

### Dashboard 标签
- API Provider 管理（增删改，支持多个 LLM 服务商）
- 沙箱设置（默认镜像、模板路径）
- 企业内网拓扑图（SVG，实时展示员工网络状态）
- 单员工互联网访问开关

### Sidebar（员工列表）
- 3 步创建向导：
  - Step 1：基本信息（名字、角色、内存、CPU）
  - Step 2：展示全局 API Provider（只读确认）
  - Step 3：配置渠道（飞书/Lark/Discord，凭证字段带显示/隐藏切换）
- Local.Bus 监听面板开关

### Chat & Terminal 标签
- 在运行中的容器内执行任意命令（`docker exec`）
- 实时输出

### Files & Editor 标签
- 文件树浏览（实时 FS watcher，通过 `notify` crate + Tauri event 推送）
- 文件读写编辑

### Gateways 标签
- 每个员工的渠道配置（8 个预设）

### BusMonitor 面板
- 侧边栏浮层，展示 Local.Bus 消息流
- 自动滚动到最新消息
- 新消息闪烁动画
- 一键清空

---

## 七、模板管理

### 母本来源
`openclaw_build/template/` — 从宿主机 `~/.openclaw` 同步而来，清理后的干净版本：
- 无 session 历史
- 无 API key（运行时注入）
- 所有渠道 disabled（运行时注入）
- 空的 feishu dedup / cron runs / logs

### 烤入镜像 vs 宿主机拷贝

| 路径 | 说明 |
|------|------|
| `/opt/openclaw/`（镜像内） | 内置 fallback，容器第一次启动且 volume 为空时使用 |
| `/tmp/openclaw_{id}/`（宿主机） | 主路径，创建员工时从 `openclaw_build/template/` 拷贝并注入配置 |

容器挂载 `/tmp/openclaw_{id}:/workspace`，entrypoint 优先使用 `/workspace/.openclaw`（已注入配置），fallback 到 `/opt/openclaw`（内置模板）。

---

## 八、验证命令

```bash
# 确认 gateway 在容器内运行
docker logs openclaw_{员工ID}

# 检查进程
docker exec openclaw_{员工ID} ps aux | grep openclaw

# gateway 健康检查
docker exec openclaw_{员工ID} openclaw health

# 查看 gateway 日志
docker exec openclaw_{员工ID} cat /workspace/.openclaw/logs/daemon.log
```
