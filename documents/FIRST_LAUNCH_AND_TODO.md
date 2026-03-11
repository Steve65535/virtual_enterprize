# 首次启动流程 & 待办事项

## 当前用户使用流程（存在摩擦）

用户拿到 App + API Key 后，目前需要以下步骤才能跑起来一个数字员工：

```
1. 确保 Docker 已安装并运行
2. 手动执行 ./build.sh       ← 构建 openclaw-base 镜像（用户不应感知）
3. 打开 App → Dashboard
   → API Providers: 填入 base URL 和 API key
   → Sandbox Image: 手动填 "openclaw-base"（应该是默认值）
4. 侧边栏 → 创建员工（3步向导）
   → Step 1: 名字 / 角色 / 内存 / CPU 限制
   → Step 2: 确认 API Provider（只读）
   → Step 3: 可选配飞书 / Discord 渠道凭证
5. 点击员工卡片上的 Start
6. 验证：docker exec openclaw_{id} openclaw health
```

---

## 核心待办：首次启动自动引导

### 问题
`./build.sh` 步骤对普通用户完全不可见，他们不知道需要做这件事。

### 方案
App 启动时（`.setup()` hook）检查 `openclaw-base` 镜像是否存在：
- **存在** → 正常启动
- **不存在** → 触发自动构建流程

```rust
// 伪代码
fn check_or_build_image() {
    let exists = docker image inspect openclaw-base → success?
    if !exists {
        // 方案A：从 Docker Hub pull（需要发布镜像）
        docker pull openclaw/openclaw-base

        // 方案B：用打包进 app 的 build context 在本地 build
        // tauri resource 里打包 Dockerfile + openclaw-pkg + template
        // docker build -t openclaw-base {resource_dir}/docker-build/
    }
}
```

前端侧需要一个全屏初始化界面，显示构建进度（流式读取 docker build 输出）。

### 两种方案对比

| | 方案A：Docker Hub | 方案B：本地构建 |
|--|--|--|
| 用户体验 | pull 快（网速决定） | 构建慢（5-10分钟） |
| 依赖 | 需要发布镜像到 Hub | 不需要外部服务 |
| 版本管理 | 推送新 tag 即可更新 | 用户需重新安装 |
| 推荐 | 生产发布用 | 开发 / 私有部署用 |

---

## 其他待办

### UI 层
- [ ] 隐藏 `Sandbox Image` 输入框，默认使用 `openclaw-base`，不暴露给用户
- [ ] 首次启动引导页（Docker 检测 → 镜像构建/pull → 填 API key）
- [ ] 员工状态实时刷新（目前需要手动刷新）
- [ ] 容器内 gateway 健康状态显示（running / crashed / restarting）

### 功能层
- [ ] `save_gateways` 热重载后给用户显示"已重启 gateway"反馈
- [ ] 员工删除时同时删除 volume（`~/.openclaw_enterprise/volumes/{id}`）
- [ ] 多员工批量操作（全部启动 / 全部停止）

### 打包 / 发布层
- [ ] 确定镜像分发方式（Docker Hub vs 内置构建）
- [ ] Windows / Linux 适配测试（路径分隔符、HOME 变量等）
- [ ] App 自动更新机制

---

## 数据目录说明

| 路径 | 内容 |
|------|------|
| `~/.openclaw_enterprise/volumes/{id}/` | 每个员工的 openclaw 配置和工作区（持久化） |
| `~/Library/Application Support/com.openclaw.enterprise/config.json` | App 全局配置（API providers、员工列表等） |
| `/tmp/openclaw_enterprise_shared/` | 企业共享目录 + Local.Bus 消息（重启丢失，可接受） |
