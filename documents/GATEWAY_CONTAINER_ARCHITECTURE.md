# OpenClaw 容器内运行 Gateway 部署架构方案

本方案旨在解决 OpenClaw Gateway 在隔离隔离沙箱（Docker 容器）中的独立部署与运行问题。其核心思路是：**OpenClaw 本质上是一个跨平台的 Node.js 程序，只要容器内准备好了 Node.js 环境并将包文件静态拷入，即可直接在容器内无网络依赖地运行。**

---

## 1. 包的交付与打包方式 (Package Delivery)

我们**不再通过 npm registry 在线安装**，而是直接在 `docker build` 之前，把宿主机上已经安装好的 OpenClaw 包资源物理拷贝到构建上下文中。

**构建预处理 (build.sh)：**
```bash
# 构建前，先从宿主机全局 npm 目录拷贝 openclaw 本体
cp -r $(npm root -g)/openclaw openclaw_build/openclaw-pkg/
docker build -t openclaw-base .
```

**Dockerfile 适配：**
在 Dockerfile 中将其复制到镜像内部并建立可执行链接：
```dockerfile
# 将本体拷贝至运行时目录
COPY openclaw-pkg/ /opt/openclaw-runtime/

# 验证可用性
RUN node /opt/openclaw-runtime/openclaw.mjs --version

# 生成全局可执行垫片
RUN echo '#!/bin/sh\nexec node /opt/openclaw-runtime/openclaw.mjs "$@"' > /usr/local/bin/openclaw \
    && chmod +x /usr/local/bin/openclaw
```
**优点**：
- **完全离线**：构建过程不依赖外网 npm 源。
- **版本绝对锁定**：容器内的版本与宿主机当前使用的版本 100% 字节级一致。

---

## 2. 容器启动与 Gateway 拉起 (entrypoint.sh)

当容器启动初始化完独立工作区后，直接在后台驻留 OpenClaw Gateway 进程：

```bash
# 启动 gateway 并将日志输出到卷挂载目录中
openclaw gateway run --allow-unconfigured >> /workspace/.openclaw/logs/daemon.log 2>&1 &
```
由于在此之前 `/root/.openclaw` 已经被 symlink 到了 `/workspace/.openclaw`，因此 Gateway 会准确读取到由宿主机 Rust 底层为其“按需注入”的员工专属配置文件（含 API Key 与通道鉴权）。

---

## 3. 端口冲突问题分析 (Port Allocation)

**结论：完全不存在端口冲突问题。**

每个拉起的员工沙箱（容器）都拥有自己完全独立的 Linux 网络命名空间（Network Namespace）。在容器内监听的 `localhost:18000` 端口只会暴露在容器内部，不会映射到宿主机，因此即使同时拉起 100 个员工容器，它们各自内部的 Gateway 也绝不会发生端口干涉。

---

## 4. 外部联络通道 (Channels: Feishu / Discord)

各种第三方聊天工具（飞书、Discord 等）均是通过 WebSocket 的形式向外（Outbound）主动发起连接的。
只要当前员工容器依然挂载在 `openclaw-internet` 网桥上，它就能主动连通外网进行通信。**不需要向宿主机或公网暴露任何监听端口**。

---

## 5. 核心生命周期与配置时序 (Lifecycle & Timing)

整个员工的诞生到工作，时序如下：

1. **`add_employee` (前端下发创建指令)**
   - Rust 后台线程触发。
   - 拷贝基础模板至映射目录。
   - 执行清理脱敏（Clean）。
   - 注入特定大模型的 API Key 及 Feishu/Discord Channels 配置。

2. **`start_sandbox` (前端点击 Start 启动员工)**
   - 触发 `docker run` 拉起容器，挂载数据卷。
   - `entrypoint.sh` 接管执行：
     - **判断 A**：若 `/workspace/.openclaw` 已存在（说明宿主机已经注入好配置），直接复用。
     - **判断 B**：若不存在，则从 `/opt/openclaw` 初始化内置模板兜底。
   - 执行 `openclaw gateway run &`（守护进程读取配置并启动 Gateway）。
   - 执行 `exec tail -f /dev/null`（主进程将容器无限保活）。

---

## 6. 开发环境与源码管理注意事项

为了防止巨大的 Node 依赖包和二进制文件污染 Git 仓库源码，必须执行以下约束：

- **忽略构建产物**：在项目根目录和 `openclaw_build/` 下的 `.gitignore` 中，必须添加 `openclaw_build/openclaw-pkg/`。
- **构建自动化**：整个 `cp` 和 `docker build` 流程必须封装到 `openclaw_build/build.sh` 中，屏蔽前端与宿主环境手动打包导致的环境不一致。
