# OpenClaw Enterprise — 快速上手指南

## 可用性状态

| 组件 | 状态 | 备注 |
|------|------|------|
| Rust 后端 | ✅ | cargo check 通过 |
| TypeScript 前端 | ✅ | tsc 通过 |
| `openclaw-base` Docker 镜像 | ✅ | 需重建以包含 entrypoint + 办公工具 |
| `openclaw-intranet` 网络 | ✅ | 应用启动时自动创建 |
| `openclaw-internet` 网络 | ✅ | 应用启动时自动创建 |
| 共享目录 | ✅ | `/tmp/openclaw_enterprise_shared` |
| 模板母本 | ✅ | `openclaw_build/template/.openclaw/` 完整 |

---

## Step 0：重建 Docker 镜像（一次性）

每次更新 `openclaw_build/Dockerfile` 或 `entrypoint.sh` 后需要重建。

```bash
cd /Users/steve/Desktop/openclaw_enterprize/openclaw_build
docker build -t openclaw-base .
```

> 首次构建会安装 LibreOffice、Node.js 20、OCR 等，镜像约 2-3 GB，需要几分钟。

---

## Step 1：启动应用

```bash
cd /Users/steve/Desktop/openclaw_enterprize
npm run tauri dev
```

---

## Step 2：Dashboard 基础配置（首次使用，只做一次）

点击左侧边栏底部 **齿轮图标** 进入 Dashboard。

### 2a. API Providers

添加你的 LLM 提供商（至少一个，否则员工无法调用 AI）：

| 字段 | 示例 |
|------|------|
| Name | DeepSeek |
| Base URL | `https://api.deepseek.com/v1` |
| API Key | `sk-xxxxxxxxxxxxxxxx` |

点 **Quick Add** 可从预设列表快速填充 URL。

### 2b. Sandbox Image & Template

| 字段 | 值 |
|------|-----|
| Base Image | `openclaw-base` |
| Template Directory | `/Users/steve/Desktop/openclaw_enterprize/openclaw_build/template` |

点 **Save Settings**。

---

## Step 3：创建新数字员工

点击左侧边栏的 **＋** 按钮，进入三步向导：

### Step 3-1：Identity

| 字段 | 说明 |
|------|------|
| Name | 员工名，同时作为内网 DNS 别名（`alice` → `http://alice:port`）|
| Role | 岗位描述，仅用于展示 |
| Memory Limit | 推荐 `512m`，大模型任务可用 `1g` |
| CPU Limit | 推荐 `1.0`，密集任务可用 `2.0` |

### Step 3-2：Providers（只读确认）

显示当前全局配置的 LLM 提供商。若显示 "No providers"，需先在 Dashboard 配置。API Key 会在模板 copy 完成后自动注入到员工的 `.openclaw/openclaw.json` 和 `agents/main/agent/models.json`。

### Step 3-3：Channels（可选）

按需开启通讯渠道：

| 渠道 | 所需凭据 |
|------|---------|
| 飞书 (Feishu) | App ID + App Secret |
| Lark (国际版) | App ID + App Secret |
| Discord | Bot Token |

启用后凭据会在员工创建时自动注入 `channels` 配置。也可以之后在 **Gateways** 标签页随时修改。

点 **Create Employee**。

---

## Step 4：启动容器

选中左侧员工 → 右上角点 **▶ Start**。

### 后台发生的事

```
1. docker run
     --name openclaw_<id>
     --memory 512m --cpus 1.0
     --network openclaw-intranet --network-alias <alias>
     -v /tmp/openclaw_<id>:/workspace
     -v /tmp/openclaw_enterprise_shared:/enterprise_shared
     --env OPENCLAW_EMPLOYEE_NAME=<name>
     --env FEISHU_APP_ID=xxx ...
     openclaw-base

2. entrypoint.sh 检测 /workspace/.openclaw 是否存在：
   - 存在（Tauri 已异步 copy）→ 直接启动
   - 不存在（copy 尚未完成）→ 从镜像内 /opt/openclaw/ 自动初始化

3. 若未被 internet_blocked：
   docker network connect --alias <alias> openclaw-internet <container>

4. 状态变绿 → Running
```

---

## Step 5：验证

切换到 **Chat & Terminal** 标签，执行以下命令确认就绪：

```bash
# 确认模板已就位
ls /workspace/.openclaw/

# 确认 LLM key 已注入
cat /workspace/.openclaw/openclaw.json | python3 -m json.tool | grep apiKey

# 确认内网可达（如有其他员工在运行）
ping -c 1 <other_employee_alias>

# 发送内网消息
claw_msg "Bob" "Alice 已就绪，等待任务分配"
```

---

## 内网协作

所有员工共享 `openclaw-intranet` 私有网络，可通过员工名（小写化，特殊符号转 `-`）互相访问：

```bash
# Alice 的容器内访问 Bob 的 API 服务
curl http://bob:8000/api/status

# 向 Bob 发送消息（会出现在 Dashboard Local.Bus 面板）
claw_msg "bob" "数据处理完成，已存入 /enterprise_shared/result.json"
```

共享文件目录（所有员工均可读写）：

```
容器内路径：/enterprise_shared/
宿主机路径：/tmp/openclaw_enterprise_shared/
```

Dashboard → **Network Topology** 面板可实时查看网络拓扑与外网隔离状态。
侧边栏 **Local.Bus** 图标（📡）可监听所有 `claw_msg` 传输记录。

---

## 常见问题

**Q: 员工 volume 是空的，没有 `.openclaw/`**
A: 检查 Dashboard → Sandbox Image & Template 里 Template Directory 是否已填写并保存。

**Q: 启动时报 `docker: Error response from daemon: network openclaw-intranet not found`**
A: 重启应用，`.setup()` 会自动创建两个网络。或手动执行：
```bash
docker network create --internal openclaw-intranet
docker network create openclaw-internet
```

**Q: 飞书收不到消息**
A: 在 Gateways 标签页确认 App ID / App Secret 已填写并保存（保存时会重新注入配置）。然后重启容器。

**Q: 想重置某个员工的配置**
A: Stop 容器 → 在 Chat & Terminal 执行 `rm -rf /workspace/.openclaw` → 再 Start，entrypoint 会重新从镜像初始化干净模板。
