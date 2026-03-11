# OpenClaw Enterprise 需求与研发记录追踪 (Requirement & Development Log)

**文档状态**: 进行中 (WIP)
**创建日期**: 2026-03-10
**记录原则**: 严格遵循软件工程规范，追踪需求变更与各阶段交付物。

---

## 1. 原始需求定义 (Requirements Definition)

根据 `require.md` 的初始输入，本项目 (OpenClaw Enterprise 版本) 的核心需求归纳为以下 5 点：
1. **[REQ-01] 多实例沙箱隔离**：支持多实例并行运行，每个 OpenClaw 实例被完全隔离在一个 Docker 容器沙箱内。
2. **[REQ-02] 沙箱超级权限**：在沙箱内，数字员工拥有宿操作系统的最高权限 (`root`/`sudo`)，允许执行底层代码、修改系统结构及上传/下载文件，但需确保不会危害宿主机。
3. **[REQ-03] 统一配置台 (Dashboard)**：提供一个全局控制面板，用于集中管理所有员工池，统一配置 API Keys 和应用接入权限。
4. **[REQ-04] GUI 文件卷浏览器**：为每个沙箱挂载独立的 Data Volume，并在应用 (App) 端提供原生级的、可视化的图形文件操作界面。
5. **[REQ-05] 跨平台支持**：要求 App 客户端能够跨主流桌面平台 (Windows/macOS/Linux) 运行。

---

## 2. 系统技术架构 (System Architecture)

- **前端/客户端 (Frontend/Client)**：采用 **Tauri + React + TypeScript + TailwindCSS**。Tauri 确保了出色的跨平台能力，同时极大地降低了应用体积和内存占用，符合高并发宿主机运维的初衷。组件化拆分以 `Sidebar`, `Dashboard`, `ChatTerminal`, `FileTree` 为核心。
- **本地后端 IPC (Backend/Rust)**：利用 Rust 编写原生系统调用接口，封装 Docker CLI 命令供前端界面调用，负责控制 Docker 容器的生命周期与执行交互。
- **底层驱动 (Infrastructure)**：宿主机的 Docker Daemon 服务。

---

## 3. 研发进度追踪 (Development Changelog)

### Phase 1: 基础框架与静态 UI 搭建 (✅ 已完成)
- **完成内容**:
  - `[Feat]` 初始化了标准 Tauri + React 项目框架，打通双端编译链路。
  - `[Style]` 引入无头 Tailwind CSS v4，定义全局深色工作站主题 (Dark Mode)。
  - `[UI]` 开发出基础的“三栏式”极客风界面原型 (Left-Sidebar, Center-Terminal, Right-FileTree)。
- **交付代码**: `src/App.tsx`, `src/App.css`, `vite.config.ts`

### Phase 2: 核心业务视图组件化重构 (✅ 已完成)
- **完成内容**:
  - `[Refactor]` 将臃肿的 `App.tsx` 按职责边界拆分至 `src/components/` 目录。
  - `[Feat]` 实现 `Sidebar.tsx` (全局导航与员工连接池切换)。
  - `[Feat]` 实现 `Dashboard.tsx` (资源利用率监控与 API Key 集中配置界面)。
  - `[Feat]` 实现 `ChatTerminal.tsx` (类似终端的命令行对话区结构)。
  - `[Feat]` 实现 `FileTree.tsx` (独立的文件浏览器组件壳)。
- **交付代码**: `/src/components/*.tsx`

### Phase 3: 本地 IPC 通信与 Docker 集成 (🔄 进行中)
- **已完成部分**:
  - `[IPC/Rust]` 开发了三个核心的 Tauri Command：`start_sandbox`, `stop_sandbox`, `exec_sandbox`，实现通过 Rust `std::process::Command` 直接操纵本地 Docker 守护进程。
  - `[Frontend]` 在 `ChatTerminal.tsx` 组件中挂载 React Hook 与 `invoke` 指令，打通了前端输入框到终端回显的完整联调链路。
- **未完成部分**:
  - 文件系统 (`FileTree.tsx`) 真实数据卷映射与文件读写接口的 Rust 侧开发。

### Phase 4: 实时性增强与高级功能优化 (⏳ 待启动)
- **规划内容**: 
  - 本地 File Watcher 集成，实现容器内变动实时推送到文件树。
  - 拖拽式系统文件上传到 Volume 通道。
  - Monaco Editor 高亮编辑器集成。
