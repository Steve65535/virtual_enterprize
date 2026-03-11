#!/bin/bash
# OpenClaw Enterprise — container entrypoint

set -e

TEMPLATE_DIR="/opt/openclaw"
WORKSPACE_DIR="/workspace"

# ── Initialize workspace from baked-in template (first run only) ─────────────
if [ ! -d "$WORKSPACE_DIR/.openclaw" ]; then
    echo "[openclaw] First run — initializing workspace from template..."
    cp -r "$TEMPLATE_DIR/." "$WORKSPACE_DIR/"
    echo "[openclaw] Workspace initialized."
fi

# ── Link .openclaw 到 homedir，让 CLI 读 ~/.openclaw ─────────────────────────
if [ -d "$WORKSPACE_DIR/.openclaw" ] && [ ! -L /root/.openclaw ]; then
    ln -sf "$WORKSPACE_DIR/.openclaw" /root/.openclaw
fi

# ── 让 claw_msg 全局可用 ──────────────────────────────────────────────────────
if [ ! -f /usr/local/bin/claw_msg ]; then
    if [ -f "$WORKSPACE_DIR/claw_msg" ]; then
        ln -sf "$WORKSPACE_DIR/claw_msg" /usr/local/bin/claw_msg
    elif [ -f "$TEMPLATE_DIR/claw_msg" ]; then
        ln -sf "$TEMPLATE_DIR/claw_msg" /usr/local/bin/claw_msg
    fi
fi

# ── 注入员工身份 ──────────────────────────────────────────────────────────────
if [ -n "$OPENCLAW_EMPLOYEE_NAME" ]; then
    export OPENCLAW_EMPLOYEE_NAME
    echo "[openclaw] Employee: $OPENCLAW_EMPLOYEE_NAME"
fi

# ── 启动 openclaw gateway（带 watchdog，崩溃自动重启） ───────────────────────
mkdir -p "$WORKSPACE_DIR/.openclaw/logs"

if command -v openclaw &>/dev/null; then
    (
        while true; do
            echo "[openclaw] Starting gateway..."
            openclaw gateway run --allow-unconfigured \
                >> "$WORKSPACE_DIR/.openclaw/logs/daemon.log" 2>&1
            EXIT_CODE=$?
            echo "[openclaw] Gateway exited (code $EXIT_CODE), restarting in 3s..." \
                >> "$WORKSPACE_DIR/.openclaw/logs/daemon.log"
            sleep 3
        done
    ) &
    echo "[openclaw] Watchdog started (PID $!)"
else
    echo "[openclaw] WARNING: openclaw binary not found, gateway not started"
fi

# ── 保持容器存活 ──────────────────────────────────────────────────────────────
exec "$@"
