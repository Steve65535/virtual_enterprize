#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "[build] Syncing openclaw package from host npm..."
OPENCLAW_SRC=$(npm root -g)/openclaw
if [ ! -d "$OPENCLAW_SRC" ]; then
    echo "[build] ERROR: openclaw not found in global npm. Run: npm install -g openclaw"
    exit 1
fi

# Copy package source (no node_modules — container does npm install for Linux)
rm -rf openclaw-pkg
rsync -a --exclude='node_modules' --exclude='.cache' "$OPENCLAW_SRC/" openclaw-pkg/
echo "[build] Synced: $(cat openclaw-pkg/package.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["version"])')"

echo "[build] Building Docker image..."
docker build -t openclaw-base .
echo "[build] Done: openclaw-base"
