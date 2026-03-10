import { Check, ChevronDown, ChevronRight, Plug } from "lucide-react";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppGateway, EmployeeStatus } from "../types";

// ── Gateway preset definitions ─────────────────────────────────────────────────

interface GatewayField {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder: string;
  defaultValue?: string;
}

interface GatewayPreset {
  type: string;
  label: string;
  desc: string;
  accent: string;       // Tailwind text color
  dotColor: string;     // dot indicator color
  fields: GatewayField[];
}

const PRESETS: GatewayPreset[] = [
  {
    type: "feishu",
    label: "飞书",
    desc: "飞书机器人 / 开放平台（中国版）",
    accent: "text-blue-400",
    dotColor: "bg-blue-400",
    fields: [
      { key: "FEISHU_APP_ID",     label: "App ID",     type: "text",     placeholder: "cli_xxxxxxxxxxxxxxxx" },
      { key: "FEISHU_APP_SECRET", label: "App Secret", type: "password", placeholder: "" },
      { key: "FEISHU_BASE_URL",   label: "Base URL",   type: "text",     placeholder: "https://open.feishu.cn", defaultValue: "https://open.feishu.cn" },
    ],
  },
  {
    type: "slack",
    label: "Slack",
    desc: "Slack Bot / Workspace API",
    accent: "text-purple-400",
    dotColor: "bg-purple-400",
    fields: [
      { key: "SLACK_BOT_TOKEN", label: "Bot Token", type: "password", placeholder: "xoxb-..." },
      { key: "SLACK_APP_TOKEN", label: "App Token", type: "password", placeholder: "xapp-..." },
      { key: "SLACK_TEAM_ID",   label: "Team ID",   type: "text",     placeholder: "T0XXXXXXX" },
    ],
  },
  {
    type: "discord",
    label: "Discord",
    desc: "Discord Bot",
    accent: "text-indigo-400",
    dotColor: "bg-indigo-400",
    fields: [
      { key: "DISCORD_BOT_TOKEN",  label: "Bot Token",  type: "password", placeholder: "" },
      { key: "DISCORD_GUILD_ID",   label: "Guild ID",   type: "text",     placeholder: "" },
      { key: "DISCORD_CHANNEL_ID", label: "Channel ID", type: "text",     placeholder: "" },
    ],
  },
  {
    type: "github",
    label: "GitHub",
    desc: "GitHub CLI / Personal Access Token",
    accent: "text-gray-200",
    dotColor: "bg-gray-300",
    fields: [
      { key: "GITHUB_TOKEN", label: "Personal Access Token", type: "password", placeholder: "ghp_..." },
      { key: "GITHUB_OWNER", label: "Default Owner / Org",   type: "text",     placeholder: "your-org" },
    ],
  },
  {
    type: "notion",
    label: "Notion",
    desc: "Notion API Integration",
    accent: "text-white",
    dotColor: "bg-white",
    fields: [
      { key: "NOTION_TOKEN",       label: "Integration Token", type: "password", placeholder: "secret_..." },
      { key: "NOTION_DATABASE_ID", label: "Database ID",       type: "text",     placeholder: "" },
    ],
  },
  {
    type: "telegram",
    label: "Telegram",
    desc: "Telegram Bot API",
    accent: "text-sky-400",
    dotColor: "bg-sky-400",
    fields: [
      { key: "TELEGRAM_BOT_TOKEN", label: "Bot Token", type: "password", placeholder: "" },
      { key: "TELEGRAM_CHAT_ID",   label: "Chat ID",   type: "text",     placeholder: "" },
    ],
  },
  {
    type: "lark",
    label: "Lark",
    desc: "Lark / Feishu International",
    accent: "text-cyan-400",
    dotColor: "bg-cyan-400",
    fields: [
      { key: "LARK_APP_ID",     label: "App ID",     type: "text",     placeholder: "cli_xxxxxxxxxxxxxxxx" },
      { key: "LARK_APP_SECRET", label: "App Secret", type: "password", placeholder: "" },
      { key: "LARK_BASE_URL",   label: "Base URL",   type: "text",     placeholder: "https://open.larksuite.com", defaultValue: "https://open.larksuite.com" },
    ],
  },
  {
    type: "linear",
    label: "Linear",
    desc: "Linear Issue Tracker API",
    accent: "text-violet-400",
    dotColor: "bg-violet-400",
    fields: [
      { key: "LINEAR_API_KEY", label: "API Key",  type: "password", placeholder: "lin_api_..." },
      { key: "LINEAR_TEAM_ID", label: "Team ID",  type: "text",     placeholder: "" },
    ],
  },
];

// ── Toggle switch ──────────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(!on); }}
      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${on ? "bg-green-500" : "bg-gray-600"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0"}`}
      />
    </button>
  );
}

// ── Single gateway card ────────────────────────────────────────────────────────

interface CardProps {
  preset: GatewayPreset;
  gateway: AppGateway;
  onChange: (g: AppGateway) => void;
  onSave: () => void;
  saving: boolean;
}

function GatewayCard({ preset, gateway, onChange, onSave, saving }: CardProps) {
  const [expanded, setExpanded] = useState(gateway.enabled);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const creds = gateway.credentials;

  const setField = (key: string, value: string) => {
    onChange({ ...gateway, credentials: { ...creds, [key]: value } });
  };

  const toggleShow = (key: string) =>
    setShowKeys((s) => ({ ...s, [key]: !s[key] }));

  const allFilled = preset.fields.every((f) => (creds[f.key] ?? "").trim() !== "");

  return (
    <div
      className={`border rounded-xl overflow-hidden transition-all ${
        gateway.enabled
          ? "border-green-500/30 bg-[#1e2a1e]"
          : "border-[#333333] bg-[#1e1e1e]"
      }`}
    >
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${preset.dotColor} ${gateway.enabled ? "opacity-100" : "opacity-30"}`} />
        <div className="flex-1 min-w-0">
          <span className={`text-sm font-medium ${preset.accent}`}>{preset.label}</span>
          <p className="text-xs text-gray-600 truncate">{preset.desc}</p>
        </div>

        {gateway.enabled && (
          <span className="text-xs text-green-400 shrink-0">Active</span>
        )}

        <Toggle
          on={gateway.enabled}
          onChange={(v) => {
            onChange({ ...gateway, enabled: v });
            if (v) setExpanded(true);
          }}
        />

        <span className="text-gray-600 shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </div>

      {/* Expanded credential fields */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-[#2a2a2a] space-y-3 pt-4">
          {preset.fields.map((f) => (
            <div key={f.key}>
              <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
              <div className="relative">
                <input
                  type={showKeys[f.key] ? "text" : f.type}
                  value={creds[f.key] ?? f.defaultValue ?? ""}
                  onChange={(e) => setField(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className="w-full bg-[#252526] border border-[#3c3c3c] rounded-md px-3 py-1.5 text-sm text-gray-200 font-mono outline-none focus:border-blue-500/50 pr-16 transition-colors"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                />
                {f.type === "password" && (
                  <button
                    type="button"
                    onClick={() => toggleShow(f.key)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-600 hover:text-gray-400 transition-colors px-1"
                  >
                    {showKeys[f.key] ? "hide" : "show"}
                  </button>
                )}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between pt-1">
            {!allFilled && gateway.enabled && (
              <p className="text-xs text-yellow-500/80">Fill all fields to activate</p>
            )}
            <div className="ml-auto">
              <button
                onClick={onSave}
                disabled={saving}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  saving
                    ? "bg-green-600 text-white"
                    : "bg-blue-600 hover:bg-blue-500 text-white"
                } disabled:opacity-60`}
              >
                {saving && <Check size={12} />}
                {saving ? "Saved" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  employee: EmployeeStatus;
}

export function GatewayConfig({ employee }: Props) {
  const [gateways, setGateways] = useState<AppGateway[]>([]);
  const [savingType, setSavingType] = useState<string | null>(null);

  // Build initial gateway state from presets + existing config
  useEffect(() => {
    const existing = new Map((employee.app_gateways ?? []).map((g) => [g.gateway_type, g]));
    const merged: AppGateway[] = PRESETS.map((p) =>
      existing.get(p.type) ?? { gateway_type: p.type, enabled: false, credentials: {} }
    );
    setGateways(merged);
  }, [employee.id]);

  const updateGateway = (index: number, updated: AppGateway) => {
    setGateways((prev) => prev.map((g, i) => (i === index ? updated : g)));
  };

  const saveGateway = async (index: number) => {
    const gwType = gateways[index].gateway_type;
    setSavingType(gwType);
    try {
      await invoke("save_gateways", {
        employeeId: employee.id,
        gateways,
      });
    } catch (e) {
      console.error("Failed to save gateways:", e);
    } finally {
      setTimeout(() => setSavingType(null), 1200);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#1e1e1e]">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Plug size={18} className="text-gray-400" />
          <div>
            <h2 className="text-base font-medium text-white">App Gateways</h2>
            <p className="text-xs text-gray-500">
              Enabled gateways are injected as environment variables when this sandbox starts.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {PRESETS.map((preset, i) => {
            const gw = gateways[i];
            if (!gw) return null;
            return (
              <GatewayCard
                key={preset.type}
                preset={preset}
                gateway={gw}
                onChange={(updated) => updateGateway(i, updated)}
                onSave={() => saveGateway(i)}
                saving={savingType === preset.type}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
