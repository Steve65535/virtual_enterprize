import {
  Bot, Plus, Settings, TerminalSquare, X,
  Eye, EyeOff, ChevronRight, ChevronLeft, Check, AlertCircle,
} from "lucide-react";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { EmployeeStatus, AppGateway, ApiProvider, AppConfig, EmployeeConfig } from "../types";

interface Props {
  employees: EmployeeStatus[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  setShowDashboard: (show: boolean) => void;
  onRefresh: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  running: "bg-green-500",
  paused: "bg-yellow-500",
  exited: "bg-gray-500",
  stopped: "bg-gray-500",
};

// Channel presets shown in step 3
const CHANNEL_PRESETS = [
  {
    type: "feishu",
    label: "飞书 Feishu",
    fields: [
      { key: "FEISHU_APP_ID", label: "App ID" },
      { key: "FEISHU_APP_SECRET", label: "App Secret" },
    ],
  },
  {
    type: "lark",
    label: "Lark (International)",
    fields: [
      { key: "LARK_APP_ID", label: "App ID" },
      { key: "LARK_APP_SECRET", label: "App Secret" },
    ],
  },
  {
    type: "discord",
    label: "Discord",
    fields: [{ key: "DISCORD_BOT_TOKEN", label: "Bot Token" }],
  },
];

function initGateways(): AppGateway[] {
  return CHANNEL_PRESETS.map((p) => ({
    gateway_type: p.type,
    enabled: false,
    credentials: Object.fromEntries(p.fields.map((f) => [f.key, ""])),
  }));
}

// ── Step indicators ────────────────────────────────────────────────────────────
function StepBar({ step }: { step: number }) {
  const steps = ["Identity", "Providers", "Channels"];
  return (
    <div className="flex items-center gap-2 mb-6">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <div key={n} className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${done
                  ? "bg-blue-600 text-white"
                  : active
                    ? "bg-blue-600 text-white ring-2 ring-blue-400/40"
                    : "bg-[#3c3c3c] text-gray-500"
                }`}
            >
              {done ? <Check size={12} /> : n}
            </div>
            <span
              className={`text-xs ${active ? "text-gray-200" : done ? "text-blue-400" : "text-gray-600"}`}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-1 ${done ? "bg-blue-600/50" : "bg-[#3c3c3c]"}`} style={{ width: 24 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Masked credential field ────────────────────────────────────────────────────
function SecretField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded-md px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500/50 pr-8"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          onClick={() => setShow((s) => !s)}
        >
          {show ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>
    </div>
  );
}

// ── Main Sidebar component ─────────────────────────────────────────────────────
export function Sidebar({ employees, selectedId, onSelect, setShowDashboard, onRefresh }: Props) {
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [memory, setMemory] = useState("512m");
  const [cpu, setCpu] = useState("1.0");

  // Step 2
  const [providers, setProviders] = useState<ApiProvider[]>([]);

  // Step 3
  const [gateways, setGateways] = useState<AppGateway[]>(initGateways());

  const [creating, setCreating] = useState(false);

  // Load providers when entering step 2
  useEffect(() => {
    if (showWizard && step === 2) {
      invoke<AppConfig>("load_config")
        .then((c) => setProviders(c.api_providers))
        .catch(() => setProviders([]));
    }
  }, [showWizard, step]);

  const openWizard = () => {
    setStep(1);
    setName("");
    setRole("");
    setMemory("512m");
    setCpu("1.0");
    setGateways(initGateways());
    setShowWizard(true);
  };

  const closeWizard = () => {
    setShowWizard(false);
    setCreating(false);
  };

  const updateGateway = (type: string, update: Partial<AppGateway>) => {
    setGateways((prev) =>
      prev.map((g) => (g.gateway_type === type ? { ...g, ...update } : g))
    );
  };

  const updateCredential = (type: string, key: string, val: string) => {
    setGateways((prev) =>
      prev.map((g) =>
        g.gateway_type === type
          ? { ...g, credentials: { ...g.credentials, [key]: val } }
          : g
      )
    );
  };

  const handleCreate = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const emp = await invoke<EmployeeConfig>("add_employee", {
        name: name.trim(),
        role: role.trim() || "Assistant",
        memoryLimit: memory.trim() || "512m",
        cpuLimit: cpu.trim() || "1.0",
      });

      const enabledGateways = gateways.filter((g) => g.enabled);
      if (enabledGateways.length > 0) {
        await invoke("save_gateways", {
          employeeId: emp.id,
          gateways: enabledGateways,
        });
      }

      await onRefresh();
      onSelect(emp.id);
      closeWizard();
    } catch (e) {
      console.error("Failed to create employee:", e);
      setCreating(false);
    }
  };

  return (
    <>
      <div className="w-16 bg-[#252526] border-r border-[#333333] flex flex-col items-center py-4 justify-between z-10 shadow-lg shrink-0">
        <div className="flex flex-col gap-6 w-full items-center">
          <div
            className="p-2 bg-blue-600/20 text-blue-400 rounded-xl cursor-pointer hover:bg-blue-600/40 transition-colors"
            onClick={() => setShowDashboard(false)}
            title="Chat"
          >
            <Bot size={24} />
          </div>

          <div className="w-8 h-px bg-[#3c3c3c]" />

          <div className="w-full flex flex-col items-center gap-3">
            {employees.map((emp) => (
              <div
                key={emp.id}
                className={`relative p-2 rounded-lg cursor-pointer transition-all ${selectedId === emp.id
                    ? "bg-[#37373d] text-white"
                    : "text-gray-500 hover:text-gray-300 hover:bg-[#2d2d2d]"
                  }`}
                onClick={() => onSelect(emp.id)}
                title={`${emp.name} · ${emp.role}`}
              >
                <TerminalSquare size={22} />
                <span
                  className={`absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full border-2 border-[#252526] ${STATUS_COLOR[emp.status] ?? "bg-gray-500"
                    }`}
                />
              </div>
            ))}

            <div
              className="p-2 text-gray-500 hover:text-white cursor-pointer transition-colors border border-dashed border-gray-600 rounded-lg hover:border-gray-400"
              title="New Employee"
              onClick={openWizard}
            >
              <Plus size={20} />
            </div>
          </div>
        </div>

        <div
          className="text-gray-400 cursor-pointer hover:text-white transition-colors"
          title="Dashboard & Settings"
          onClick={() => setShowDashboard(true)}
        >
          <Settings size={22} />
        </div>
      </div>

      {/* ── Wizard Modal ────────────────────────────────────────────────────── */}
      {showWizard && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
          onClick={closeWizard}
        >
          <div
            className="bg-[#252526] border border-[#3c3c3c] rounded-xl p-6 shadow-2xl flex flex-col"
            style={{ width: 480, maxHeight: "85vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white font-semibold text-sm">New Digital Employee</h3>
              <button onClick={closeWizard} className="text-gray-500 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <StepBar step={step} />

            {/* ── Step 1: Identity ─────────────────────────────────────────── */}
            {step === 1 && (
              <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Name *</label>
                  <input
                    className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded-md px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500/50"
                    placeholder="e.g. Alice"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && name.trim() && setStep(2)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Role</label>
                  <input
                    className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded-md px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500/50"
                    placeholder="e.g. Web Developer"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Memory Limit</label>
                    <input
                      className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded-md px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500/50"
                      placeholder="512m"
                      value={memory}
                      onChange={(e) => setMemory(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">CPU Limit</label>
                    <input
                      className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded-md px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500/50"
                      placeholder="1.0"
                      value={cpu}
                      onChange={(e) => setCpu(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-600">Memory: 256m / 512m / 1g — CPU: 0.5 / 1.0 / 2.0</p>
              </div>
            )}

            {/* ── Step 2: LLM Providers ─────────────────────────────────────── */}
            {step === 2 && (
              <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
                <p className="text-xs text-gray-500">
                  These providers are configured globally and will be injected into the employee's runtime automatically.
                </p>
                {providers.length === 0 ? (
                  <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <AlertCircle size={14} className="text-yellow-400 shrink-0" />
                    <span className="text-xs text-yellow-300">
                      No providers configured. Go to Dashboard → API Providers to add one.
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {providers.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between px-3 py-2.5 bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-gray-200 font-medium truncate">{p.name}</p>
                          <p className="text-xs text-gray-500 truncate">{p.base_url}</p>
                        </div>
                        <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded ml-3 shrink-0">
                          {p.api_key ? "Key set" : "No key"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Step 3: Channels ──────────────────────────────────────────── */}
            {step === 3 && (
              <div className="flex flex-col gap-3 flex-1 overflow-y-auto pr-1">
                <p className="text-xs text-gray-500">
                  Enable channels and enter credentials. These will be injected into the employee's config.
                </p>
                {CHANNEL_PRESETS.map((preset) => {
                  const gw = gateways.find((g) => g.gateway_type === preset.type)!;
                  return (
                    <div
                      key={preset.type}
                      className={`border rounded-lg transition-colors ${gw.enabled ? "border-blue-500/30 bg-blue-500/5" : "border-[#3c3c3c] bg-[#1e1e1e]"
                        }`}
                    >
                      {/* Channel header */}
                      <div
                        className="flex items-center justify-between px-3 py-2.5 cursor-pointer"
                        onClick={() => updateGateway(preset.type, { enabled: !gw.enabled })}
                      >
                        <span className="text-sm text-gray-200 font-medium">{preset.label}</span>
                        <div
                          className={`w-9 h-5 rounded-full transition-colors relative ${gw.enabled ? "bg-blue-600" : "bg-[#555]"
                            }`}
                        >
                          <div
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${gw.enabled ? "left-4" : "left-0.5"
                              }`}
                          />
                        </div>
                      </div>
                      {/* Credential fields */}
                      {gw.enabled && (
                        <div className="px-3 pb-3 flex flex-col gap-2 border-t border-[#333]">
                          <div className="h-1" />
                          {preset.fields.map((f) => (
                            <SecretField
                              key={f.key}
                              label={f.label}
                              value={gw.credentials[f.key] ?? ""}
                              onChange={(v) => updateCredential(preset.type, f.key, v)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                <p className="text-xs text-gray-600">
                  You can also configure channels later via the Gateways tab.
                </p>
              </div>
            )}

            {/* ── Navigation ───────────────────────────────────────────────── */}
            <div className="flex gap-2 mt-5 shrink-0">
              {step > 1 ? (
                <button
                  onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                  className="flex items-center gap-1 px-3 py-2 text-sm text-gray-400 hover:text-white border border-[#3c3c3c] rounded-md transition-colors"
                >
                  <ChevronLeft size={14} /> Back
                </button>
              ) : (
                <button
                  onClick={closeWizard}
                  className="px-3 py-2 text-sm text-gray-400 hover:text-white border border-[#3c3c3c] rounded-md transition-colors"
                >
                  Cancel
                </button>
              )}

              <div className="flex-1" />

              {step < 3 ? (
                <button
                  onClick={() => setStep((s) => (s + 1) as 2 | 3)}
                  disabled={step === 1 && !name.trim()}
                  className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md transition-colors font-medium"
                >
                  Next <ChevronRight size={14} />
                </button>
              ) : (
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md transition-colors font-medium"
                >
                  {creating ? (
                    "Creating..."
                  ) : (
                    <><Check size={14} /> Create Employee</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
