# OpenClaw Build 打包修复审查指引 (交给 Claude Code 执行)

Claude，你好。在当前项目的 `openclaw_build` 目录中，用于打包数字员工基础沙箱环境 (`openclaw-base:latest`) 的脚本和模板结构存在 4 个必须立即修复的致命隐患，否则拉起的沙箱将携带宿主隐私且无法运行底层指令。

请按照以下 4 个阶段，严格审核并修改 `openclaw_build` 目录下的相关文件：

## 阶段 1. 修复脏状态污染与路径缺失 (Clean State & Path Fix)
**当前问题**：直接拷贝 `~/.openclaw` 作为模板，导致把开发者的历史对话记录、记忆库全部打进了公共镜像。并且缺少 Rust 底层需要挂载的注入点。
**行动指南**：
创建一个名为 `openclaw_build/build.sh` 的自动化 Bash 脚本（并赋予 `+x` 权限），逻辑如下：
1. `rm -rf template/.openclaw` 然后 `cp -r ~/.openclaw template/`
2. **[关键]** 必须执行 `rm -rf template/.openclaw/logs template/.openclaw/memory template/.openclaw/agents/main/sessions template/.openclaw/workspace` 清空所有私有历史状态。
3. **[关键]** 必须由脚本强行创建 `mkdir -p template/.openclaw/agents/main/agent`，并写入一个基础的 `{ "providers": {} }` 到 `models.json`，为 Rust 的注入接口铺路。

## 阶段 2. 修复配置脱敏逻辑侧漏 (Key Leakage Fix)
**当前问题**：现有的 `clean_config.py` 只清洗了 `openclaw.json`。但实际上用户的真实大模型 Key 也保存在 `agents/main/agent/models.json` 里，导致密钥随镜像泄露。
**行动指南**：
修改 `openclaw_build/clean_config.py`，增加对 `template/.openclaw/agents/main/agent/models.json` 这个文件的读取。如果该文件存在，必须同样遍历其中的 `providers` 字典，把所有 `apiKey` 字段的值清空为 `""`。

## 阶段 3. 修复环境软骨病 (Path Disconnect Fix)
**当前问题**：`entrypoint.sh` 把模板展开到了 `/workspace/.openclaw`，但在容器内，CLI 工具启动时强制寻找 `/root/.openclaw`。
**行动指南**：
修改 `openclaw_build/entrypoint.sh`，在 `exec "$@"` 指令之前，加入软链接逻辑：
```bash
if [ -d "$WORKSPACE_DIR/.openclaw" ] && [ ! -L /root/.openclaw ]; then
    ln -s "$WORKSPACE_DIR/.openclaw" /root/.openclaw
fi
```

## 阶段 4. 注入灵魂主程序 (Missing Binary Fix)
**当前问题**：容器虽然装了 Python 和 NodeJS，但根本没有把 `openclaw` (或 `claude-code`) 的 CLI 本体装进去。配好了运行环境但没有任何活物可以跑。
**行动指南**：
修改 `openclaw_build/Dockerfile`，找到 NodeJS `RUN` 安装的那一块，在最后追加相应的 `npm install -g` 步骤。
如果你（Claude Code）就是被魔改后的产品或原生本体，请在此处植入正确的全局安装指令（如 `npm install -g @anthropic-ai/claude-code` 或从本地传入的 `.tgz`），确保容器拥有物理发声器官。

---
> 提示：执行完以上 4 步后，请直接在终端运行 `./build.sh`，确保成功打出修复完毕、纯净且能实际干活的 `openclaw-base:latest` 镜像。
