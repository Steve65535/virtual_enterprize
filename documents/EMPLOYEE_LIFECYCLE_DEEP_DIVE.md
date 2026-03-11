# 员工创建与启动生命周期深度剖析 (Lifecycle of a Digital Employee)

当我们通过 OpenClaw Enterprise 前端点击“创建新员工”并“启动沙箱”时，底层会发生一条极其精密、安全且高度自动化的流水线：

## 1. 员工档案注册 (Rust `add_employee`)
- **后台异步处理**：创建员工只做配置档的落地（向 `config.json` 追加记录），重活全部推入后台线程执行，前端界面 0 卡顿。
- **模板克隆**：Rust 底层将我们刚刚打包好在 `openclaw_build/template/` 下的基础档案库，全量完整拷贝到 macOS 宿主机的专属隔离卷 `/tmp/openclaw_<uuid>` 中。

## 2. 记忆洗脑与重新投胎 (Workspace Sanitization & Re-Identity)
这是系统中最精妙的安全网之一，哪怕模板里本身带脏数据，在克隆后也会被 Rust 强行洗炼 (`clean_employee_workspace`)：
- **记忆清空**：强行删除 `agents/main/sessions/*.jsonl`、`cron/runs/`、`logs/`。员工一出生就是一张绝对白纸，没有前世记忆。
- **肉身重铸**：重新调用 `ed25519_dalek::SigningKey::generate`，为这个新员工现场生成一套全新的**公私钥对密码学凭证**，并附带全新的随机 `deviceId`，盖章写入 `identity/device.json` 中。每一个数字员工的灵魂（密码学指纹）都是绝对唯一且合法的。

## 3. 大脑皮层接入 (LLM Configuration Injection)
- **精准狙击**：系统读取您在 Dashboard 全局配置的大模型凭据（比如 DeepSeek 的 URL 和 Token）。
- **静态覆写**：无视模型配置文件原有的内容，Rust 利用基于域名的正则匹配，强行覆写新员工卷下 `.openclaw/openclaw.json` 和 `models.json` 里的 `apiKey` 参数。这个操作完全在前端本地完成，密码绝对不会暴露在代码内，真正实现“凭据下放”。

## 4. 沙箱点火与网络插拔 (Sandbox Ignition — `start_sandbox`)
当您点击播放键，启动该员工沙箱时：
- **活体挂载**：拉起刚才您打好的 `openclaw-base:latest` 镜像。通过 `-v /tmp/openclaw_<uuid>:/workspace` 把洗脑完毕的目录挂成它的主躯干，再拉入 `-v /tmp/.../.bus:/enterprise_shared` 把它连入局域网对话总线。
- **动态环境变量**：如果是飞书或 Discord，此时才将您的真实通信 Token 转化为 `--env` 传给 Docker，并向卷内写入一层脱敏的 `.openclaw.env`，提供给脚本双底保险。
- **降维打击的网络隔离**：沙箱初始拉起时**强制只连通内部网桥 `openclaw-intranet`**。它只能通过 `claw_msg` 跟同事内耗。除非您在网页上放开了外网开关，底层才会调用 `docker network connect` 给他接上 `openclaw-internet` 的宽带。物理层网络割断，杜绝数据外逃。

## 5. 灵魂指令复苏 (Gateway Auto-Run)
沙箱一通电，容器的 `entrypoint.sh` 立刻发车：
- **伪装中枢**：发现宿主机挂载的 `/workspace/.openclaw`，反手敲一个软连接映射给本机的 `/root/.openclaw`，欺骗并喂饱将要启动的核心进程。
- **哨兵挂载**：以后台常驻的形式，拉起我们塞进镜像的 `openclaw gateway run --allow-unconfigured` 守护进程，并在 `daemon.log` 里留下痕迹。
- **永不宕机**：末尾调用 `tail -f /dev/null` 挂住容器主命脉，稳稳当当地等候主人的差遣。

---
**一句话总结目前的这套架构**：这是一个拥有绝对自主生杀大权、军事化管控密钥下发、物理级防数据投毒、且对底层模型零妥协的微服务黑盒工厂。
