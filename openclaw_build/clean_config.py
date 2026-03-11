import json
import os

# ── 1. Clean openclaw.json ────────────────────────────────────────────────────
config_path = "template/.openclaw/openclaw.json"
if os.path.exists(config_path):
    with open(config_path, "r") as f:
        data = json.load(f)

    # Clear API keys in model providers
    if "models" in data and "providers" in data["models"]:
        for provider, p_data in data["models"]["providers"].items():
            if "apiKey" in p_data:
                p_data["apiKey"] = ""

    # Clear channel tokens and secrets
    if "channels" in data:
        for channel, c_data in data["channels"].items():
            if "token" in c_data:
                c_data["token"] = ""
            if "appSecret" in c_data:
                c_data["appSecret"] = ""

    # Clear gateway auth token
    if "gateway" in data and "auth" in data["gateway"]:
        if "token" in data["gateway"]["auth"]:
            data["gateway"]["auth"]["token"] = ""

    with open(config_path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"  Cleaned: {config_path}")

# ── 2. Clean agents/main/agent/models.json ────────────────────────────────────
models_path = "template/.openclaw/agents/main/agent/models.json"
if os.path.exists(models_path):
    with open(models_path, "r") as f:
        data = json.load(f)

    if "providers" in data:
        for provider, p_data in data["providers"].items():
            if "apiKey" in p_data:
                p_data["apiKey"] = ""

    with open(models_path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"  Cleaned: {models_path}")

# ── 3. Clean credentials directory ────────────────────────────────────────────
creds_dir = "template/.openclaw/credentials"
if os.path.isdir(creds_dir):
    for fname in os.listdir(creds_dir):
        fpath = os.path.join(creds_dir, fname)
        if os.path.isfile(fpath):
            os.remove(fpath)
    print(f"  Cleaned: {creds_dir}/")

print("Configuration cleaned successfully!")
