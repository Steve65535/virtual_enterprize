# OpenClaw Enterprise 产品计划

基于 `require.md` 中的需求，以下是针对 **OpenClaw Enterprise（企业版）** 打造的详细产品计划与架构设计。

---

## 1. 产品定位与目标

OpenClaw Enterprise 是一款**面向企业级的数字员工（AI Agent）管理与调度平台**。
与普通的、在用户本地直接受限运行的 OpenClaw 不同，企业版致力于提供一个**高度隔离、支持并发、具备顶层权限且易于集中管理**的数字员工矩阵。每个“员工”都在自己专属的、拥有完整操作系统权限的沙箱中执行文件处理、代码研发和高权限操作，且相互并不会产生物理干扰。

---

## 2. 核心功能模块划分 (Core Features)

### 2.1 隔离的沙箱环境机制 (Docker Sandbox Isolation)

- **实现机制**：全面拥抱 Docker 容器化技术。每次启动一个 OpenClaw 实例，即拉起一个独立的容器沙箱。
- **上帝权限 (God Mode)**：每个数字员工在其容器内部拥有 `root/sudo` 权限。它们可以自由安装依赖、编写并执行危险代码、进行系统级操作，甚至破坏系统，而**绝对不会影响宿主机或其他实例**。
- **生命周期管理**：支持实例的随时启动、挂起、重启和销毁。

### 2.2 统一配置的控制中心 (Centralized Dashboard)

- **员工池资源管理 (Employee Pool)**：全局鸟瞰所有处于运行、闲置、离线状态的数字员工。
- **统一资源配置**：
  - **API 密钥管理**：集中配置大模型（LLM）的 API Keys，方便企业统一计费、控制速率限制和分配资源。
  - **App 接入管理**：配置各项外部应用、WebHooks 的接入权限，实现不同数字员工对接不同业务应用的可视化追踪。

### 2.3 实例专属的可视化文件系统 (GUI File Explorer)

- **独立物理存储 (Docker Volumes)**：每个容器挂载独享的 Docker Volume，确保数据的持久化和实例间文件隔离。
- **图形化文件交互 UI**：在客户端 App 层面嵌入可视化文件管理器模块，用户可像使用本地操作系统一样，直接对某个 OpenClaw 实例内部的文件空间进行：
  - 查看、预览文件内容。
  - 上传/下载文件、拖拽式传入业务数据。
  - 数字员工生成或修改的文件实时同步展示在此视图中。

### 2.4 跨平台客户端 (Cross-Platform Application)

- **多端一致性体验**：全面支持 Windows、macOS 和 Linux。
- **统一交互载体**：在此客户端 App 中整合所有交互——兼具类似“企业微信”的数字员工聊天窗口、沙箱资源监视器和文件管理器。

---

## 3. 技术架构选型建议 (Technical Architecture)

为了最高效地实现这些需求，推荐以下技术栈：

1. **前端应用程序 / 跨平台客户端**
   - **Tauri + React/Vue** 或 **Electron + TypeScript**：确保跨平台兼容性。Tauri 打包体积更小、更轻量；Electron 生态更为成熟。
   - 包含模块：聊天/问答终端、Dashboard 控制面板、类 VSCode 左侧边栏的文件树浏览器。
2. **中心化管控后端 (Control Plane)**
   - **Golang / Node.js**：轻量级且具备极佳的高并发调度能力。
   - 调用并封装底层 **Docker REST API** 或 **Docker CLI**。
   - **数据库**：使用 SQLite (单机版) 或 PostgreSQL (分布式/全内网版) 缓存各个实例的数据模型及统一配置。
3. **沙箱镜像底层 (Sandbox Image Base)**
   - 构建定制化的 OpenClaw 基础 Docker Image（例：`Ubuntu 22.04` + `Python 3.10` + `Node.js` + 常用开发及构建工具链）。
   - 内置 Daemon 进程，负责实时对接收发执行指令，并将日志透传给控制面。

---

## 4. 阶段研发路线图 (Roadmap)

### 第一阶段：核心沙箱与权限流打通 (Phase 1: God-Mode Sandbox MVP)

- [ ] 编写定制化的 OpenClaw Dockerfile，测试在容器内开启 Root 权限下的代码执行与文件管理。
- [ ] 开发 Controller（调度器），实现基础的 Docker API 对接（动态 Create/Start/Stop 容器）。
- [ ] 挂载及验证隔离的 Docker Volume，并确保外部可读写。

### 第二阶段：控制台与API/配置集中化 (Phase 2: Dashboard Server)

- [ ] 搭建后端数据库架构，管理 `Instances`（实例）与 `Settings`（统一配置/密钥）。
- [ ] 开发 Dashboard 核心管理接口，实现“数字员工连接池”。

### 第三阶段：跨平台 App 与可视化基建 (Phase 3: Cross-Platform GUI)

- [ ] 初始化跨平台 App （Tauri / Electron 项目基础）。
- [ ] 开发集成式 UI：将聊天会话（Chat）、仪表盘和多实例切换侧边栏无缝整合。
- [ ] **重难点研发**：实现可视化文件树模块，通过 HTTP 或 IPC 方式挂载和展示容器内的文件结构（实时同步机制）。

### 第四阶段：整合测试与企业级发布 (Phase 4: Release & Security Audit)

- [ ] 安全性审计与沙箱逃逸测试。
- [ ] 跨平台可执行文件的 CI/CD 自动打包发布构建。
- [ ] Beta 版本内部分发，测试多数字员工并发工作负载表现。
