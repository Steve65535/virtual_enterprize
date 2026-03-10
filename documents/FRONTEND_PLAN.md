# OpenClaw Enterprise 桌面客户端前端开发计划

本文档基于 `require.md` 的需求，针对在本地运行的 **OpenClaw Enterprise 桌面客户端**（前端及内嵌后端）制定详细的开发架构与实施计划。

## 1. 技术栈选型

为了兼顾跨平台能力、本地系统级操作权限（如调用本地 Docker CLI）以及优异的用户体验（文件树与实时拖拽交互），建议采用以下技术栈打造桌面端应用：

*   **跨平台框架**：**Tauri (Rust)** 或 **Electron (Node.js)**
    *   *推荐 Tauri*：得益于 Rust 的底层能力，Tauri 应用资源占用更少（这对于需要大量运行 Docker 的宿主宿主机非常关键），安全性更高，并且更容易调用底层操作。
    *   *备选 Electron*：如果团队更侧重于快速开发，并在前端直接利用丰富的 Node.js IPC 生态，可选择 Electron。
*   **前端核心框架**：**React 18** 或 **Vue 3** (搭配 TypeScript)
    *   提供组件化的视图开发，方便构建复杂的 Dashboard 与交互式文件管理树。
*   **UI 组件库**：**Shadcn UI** (搭配 Tailwind CSS) 
    *   现代、专业且极具极客风格的无头组件库，非常适合 ToB/ToD 的深色模式控制台界面（类似 Vercel 或 VS Code 风格）。
*   **状态管理**：**Zustand** (React) 或 **Pinia** (Vue)
    *   用于全局管理“当前选中的数字员工实例”、“应用配置”与“全局实时日志”。

## 2. 核心界面布局设计 (UI/UX)

应用将采用经典的 **左-中-右** 三栏结构或 **类似 IDE (VS Code)** 的极客风布局：

### 2.1 全局侧边栏 / 导航栏 (Sidebar)
*   **员工池列表 (Employee Roster)**：显示所有创建的数字员工。
    *   状态指示灯：🟢运行中 (Running) | 🔴已停止 (Stopped) | 🟡挂起/错误 (Error)。
    *   快捷操作按钮：启动、销毁、配置。
*   **全局设置与 Dashboard 入口**：管理 API Key、系统参数。

### 2.2 工作区选项卡 (Workspace View)
当在侧边栏选中某个“数字员工”时，主内容区呈现该员工的专属工作台。工作台分为两大核心面：

*   **A面：交互终端 (Chat & Terminal)**
    *   核心聊天窗口：用于向数字员工下发自然语言指令（例如：“帮我写一个 python 的爬虫”）。
    *   实时命令回显与日志流：以类似 Terminal 或日志滚动的方式，实时展示他在 Docker 沙箱中敲击的代码指令、`stdout/stderr` 编译输出。
*   **B面：可视化文件系统 (File Explorer)**
    *   左侧/右侧边栏（可折叠）展示该 Docker Volume 下的真实文件系统树。
    *   **交互支持**：
        1.  文件树的实时刷新（数字员工在沙箱里创建文件，UI 立刻出现）。
        2.  拖拽上传文件直接传入容器。
        3.  点击文件预览内容（内置一个轻量级的 Monaco Editor 实例或只读视图）。

---

## 3. 前端与本地系统联调架构 (Local IPC)

由于是纯本地运行项目，前端 App 不能只做展示，还需要和本地操作系统及 Docker 进行通讯。

*   **本地调用链路**：`Frontend UI` -> `Tauri/Electron IPC` -> `Invoke Local Docker CLI / Socket`。
*   **文件监控 (File Watching)**：通过 Tauri 后端 (Rust `notify` crate) 或 Node.js 的 `chokidar` 库，直接监听映射在这台电脑上的 Docker Volume 物理路径，当文件发生变化时，通过 WebSocket 或 IPC 事件推送到前端更新文件树。

## 4. 详细开发推进计划 (Roadmap)

### 阶段一：基础框架搭建与静态 UI 还原 (Week 1)
- [x] 1. 使用脚手架初始化 Tauri + React 项目骨架
- [x] 2. 引入 Tailwind CSS 并配置深色主题配色
- [x] 3. 开发全局侧边导航栏组件
- [x] 4. 开发工作区的主页面框架

### 阶段二：核心业务组件开发 (Week 2)
- [x] 1. Chat 视图组件
- [x] 2. 文件树资源管理器组件
- [x] 3. Dashboard 设置页

### 阶段三：本地 IPC 通信与 Docker 集成 (Week 3)
- [ ] 1. 生命期打通 (Docker run/start/stop)
- [ ] 2. 文件映射与读取

### 阶段四：实时性增强与交互优化 (Week 4)
- [ ] 1. 接入本地 File Watcher
- [ ] 2. 集成拖放 (Drag & Drop) API
- [ ] 3. 集成 Monaco Editor 组件
