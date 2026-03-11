# OpenClaw Runtime Config Reference

> 本文档列举一个 OpenClaw Agent 实例启动时所有需要注入的配置字段。
> 配置分布在两个核心文件中，路径均相对于 Agent 的 home 目录（容器内为 `/root/.openclaw/`）。

---

## 文件结构

```
/root/.openclaw/
├── openclaw.json                  ← 主配置文件（channels、gateway、tools、agents 行为）
└── agents/
    └── main/
        └── agent/
            ├── models.json        ← LLM Provider 完整配置 + API Keys（运行时权威来源）
            └── auth.json          ← Agent 级别的认证覆盖（通常为空 {}）
```

---

## 一、`openclaw.json` — 主配置

### 1.1 LLM Providers（`models.providers`）

每个 provider 是一个具名 key，可以有多个。

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `models.providers.{name}.baseUrl` | string | API Base URL | `https://api.deepseek.com/v1` |
| `models.providers.{name}.apiKey` | string ⚠️ | API 密钥 | `sk-xxx` |
| `models.providers.{name}.api` | string | 接口协议 | `openai-completions` |
| `models.providers.{name}.models[].id` | string | 模型 ID | `deepseek-chat` |
| `models.providers.{name}.models[].name` | string | 显示名称 | `DeepSeek Chat` |

**目前配置的 providers：**
- `openai` → 指向 DeepSeek (`https://api.deepseek.com/v1`)
- `minimax` → 指向 MiniMax (`https://api.minimax.chat/v1`)

### 1.2 Agent 默认行为（`agents.defaults`）

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `agents.defaults.model.primary` | string | 主用模型 | `openai/deepseek-chat` |
| `agents.defaults.model.fallbacks[]` | string[] | 降级模型链 | `["minimax/abab6.5s-chat"]` |
| `agents.defaults.imageModel.primary` | string | 图像模型 | `minimax/abab6.5s-chat` |
| `agents.defaults.compaction.mode` | string | 上下文压缩策略 | `safeguard` |
| `agents.defaults.memorySearch.enabled` | bool | 记忆检索开关 | `false` |

### 1.3 Tools（`tools`）

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `tools.exec.security` | string | 执行权限级别 | `full`（沙箱内 root，保持此值） |
| `tools.exec.ask` | string | 执行前是否询问 | `off` |
| `tools.media.image.enabled` | bool | 图像生成开关 | `true` |

### 1.4 Channels（`channels`）— 通信渠道

#### 飞书（Feishu 中国版）

| 字段 | 类型 | 说明 |
|------|------|------|
| `channels.feishu.enabled` | bool | 开关 |
| `channels.feishu.appId` | string | 飞书开放平台 App ID |
| `channels.feishu.appSecret` | string ⚠️ | 飞书 App Secret |
| `channels.feishu.connectionMode` | string | `websocket`（推荐）或 `polling` |

#### Discord

| 字段 | 类型 | 说明 |
|------|------|------|
| `channels.discord.enabled` | bool | 开关 |
| `channels.discord.token` | string ⚠️ | Discord Bot Token |
| `channels.discord.groupPolicy` | string | `open` / `allowlist` |
| `channels.discord.dmPolicy` | string | `allowlist` / `open` |
| `channels.discord.allowFrom[]` | string[] | 允许的用户 ID 白名单 |
| `channels.discord.streaming` | string | `off` / `on` |

### 1.5 Gateway（`gateway`）

| 字段 | 类型 | 说明 |
|------|------|------|
| `gateway.mode` | string | `local`（当前）/ 其他模式 |
| `gateway.auth.mode` | string | `token` / `none` |
| `gateway.auth.token` | string ⚠️ | Gateway 访问令牌 |

### 1.6 Plugins（`plugins`）

| 字段 | 类型 | 说明 |
|------|------|------|
| `plugins.entries.feishu.enabled` | bool | 飞书插件是否加载 |
| `plugins.entries.discord.enabled` | bool | Discord 插件是否加载 |

### 1.7 Commands（`commands`）

| 字段 | 类型 | 说明 |
|------|------|------|
| `commands.native` | bool | 启用原生命令 |
| `commands.nativeSkills` | bool | 启用原生 skills |
| `commands.restart` | bool | 允许 restart 指令 |
| `commands.ownerDisplay` | string | `raw` |

---

## 二、`agents/main/agent/models.json` — 模型完整配置

这个文件是运行时 LLM 调用的权威来源，包含比 `openclaw.json` 更详细的模型参数。

| 字段 | 类型 | 说明 |
|------|------|------|
| `providers.{name}.baseUrl` | string | API Base URL |
| `providers.{name}.apiKey` | string ⚠️ | API 密钥（此处为运行时实际使用值） |
| `providers.{name}.api` | string | 接口协议 |
| `providers.{name}.models[].id` | string | 模型 ID |
| `providers.{name}.models[].contextWindow` | number | 上下文窗口大小 |
| `providers.{name}.models[].maxTokens` | number | 最大输出 token |
| `providers.{name}.models[].cost` | object | 计费参数（input/output/cacheRead/cacheWrite） |
| `providers.{name}.models[].reasoning` | bool | 是否为推理模型 |
| `providers.{name}.models[].input[]` | string[] | 支持的输入类型（`text`/`image`） |

---

## 三、需要注入的机密汇总（⚠️ 标记字段）

每次创建新员工时，Enterprise 控制台需要将以下值写入对应配置文件：

| # | 字段路径 | 所在文件 | 对应 GUI 字段 |
|---|---------|----------|--------------|
| 1 | `models.providers.{p}.apiKey` | `openclaw.json` | API Providers → API Key |
| 2 | `providers.{p}.apiKey` | `models.json` | 同上（需同步写入） |
| 3 | `channels.feishu.appId` | `openclaw.json` | Gateways → 飞书 App ID |
| 4 | `channels.feishu.appSecret` | `openclaw.json` | Gateways → 飞书 App Secret |
| 5 | `channels.discord.token` | `openclaw.json` | Gateways → Discord Bot Token |
| 6 | `gateway.auth.token` | `openclaw.json` | （可选）Gateway Auth Token |

---

## 四、注入时序

```
add_employee()
    └── 复制 template → /tmp/openclaw_{id}/
            └── [后台线程] 注入配置
                    ├── 读取 Enterprise 中该员工的 API Providers 配置
                    ├── 写入 .openclaw/openclaw.json（apiKey、channel tokens）
                    ├── 写入 .openclaw/agents/main/agent/models.json（apiKey）
                    └── 写入 .openclaw.env（env var 形式备用）

start_sandbox()
    └── docker run 时通过 --env 再注入一份（保证容器内进程可读）
```

---

## 五、当前模板预配置情况

| 项目 | 状态 |
|------|------|
| 主模型 | DeepSeek Chat（通过 openai 兼容接口） |
| 降级模型 | MiniMax abab6.5s |
| 飞书渠道 | ✅ 已启用，需注入 `appSecret` |
| Discord 渠道 | ⬜ 已禁用，需注入 `token` 后启用 |
| 执行权限 | `full`（容器内 root，无需修改） |
| 上下文压缩 | `safeguard` 模式 |
| 记忆检索 | 已关闭 |
