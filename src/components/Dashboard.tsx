import { Box, Check, Edit3, HardDrive, Key, Network, Plus, Radio, Trash2, Users, X, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ApiProvider, AppConfig, EmployeeStatus } from "../types";

interface Props {
  onRefresh: () => void;
}

const DEFAULT_CONFIG: AppConfig = {
  api_providers: [],
  employees: [],
};

// Common providers for quick-fill
const PRESETS = [
  { name: "OpenAI", base_url: "https://api.openai.com/v1" },
  { name: "Anthropic", base_url: "https://api.anthropic.com" },
  { name: "DeepSeek", base_url: "https://api.deepseek.com/v1" },
  { name: "OpenRouter", base_url: "https://openrouter.ai/api/v1" },
  { name: "Moonshot", base_url: "https://api.moonshot.cn/v1" },
  { name: "Zhipu", base_url: "https://open.bigmodel.cn/api/paas/v4" },
  { name: "Ollama", base_url: "http://localhost:11434/v1" },
  { name: "Custom", base_url: "" },
];

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function maskKey(key: string) {
  if (!key) return "—";
  if (key.length <= 8) return "•".repeat(key.length);
  return key.slice(0, 4) + "•".repeat(Math.min(key.length - 8, 20)) + key.slice(-4);
}

interface ProviderRowProps {
  provider: ApiProvider;
  onSave: (p: ApiProvider) => void;
  onDelete: (id: string) => void;
}

function ProviderRow({ provider, onSave, onDelete }: ProviderRowProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ApiProvider>(provider);
  const [showKey, setShowKey] = useState(false);

  const cancel = () => { setForm(provider); setEditing(false); };
  const save = () => { onSave(form); setEditing(false); };

  if (editing) {
    return (
      <div className="bg-[#1e1e1e] border border-blue-500/30 rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Provider Name</label>
            <input
              className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2.5 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500/60"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. OpenAI"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Base URL</label>
            <input
              className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2.5 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500/60 font-mono"
              value={form.base_url}
              onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
              placeholder="https://api.example.com/v1"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-xs text-gray-500 mb-1">API Key</label>
            <input
              type={showKey ? "text" : "password"}
              className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2.5 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500/60 font-mono"
              value={form.api_key}
              onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
              placeholder="sk-..."
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
            <input type="checkbox" checked={showKey} onChange={(e) => setShowKey(e.target.checked)} className="accent-blue-500" />
            Show key
          </label>
          <div className="flex gap-2">
            <button onClick={cancel} className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-[#3c3c3c] rounded transition-colors">
              <X size={12} /> Cancel
            </button>
            <button onClick={save} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors">
              <Check size={12} /> Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#1e1e1e] border border-[#333333] rounded-lg px-4 py-3 flex items-center gap-4 group">
      {/* Color dot */}
      <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />

      {/* Name */}
      <div className="w-28 shrink-0">
        <span className="text-sm font-medium text-white">{provider.name || "—"}</span>
      </div>

      {/* Base URL */}
      <div className="flex-1 min-w-0">
        <span className="text-xs text-gray-500 font-mono truncate block">
          {provider.base_url || "—"}
        </span>
      </div>

      {/* API Key (masked) */}
      <div className="w-44 shrink-0 hidden md:block">
        <span className="text-xs text-gray-600 font-mono tracking-wider">
          {maskKey(provider.api_key)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => setEditing(true)} className="p-1.5 text-gray-500 hover:text-blue-400 transition-colors" title="Edit">
          <Edit3 size={14} />
        </button>
        <button onClick={() => onDelete(provider.id)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors" title="Delete">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

interface EmployeeEditForm {
  name: string;
  role: string;
  memory_limit: string;
  cpu_limit: string;
}

// ── Sandbox Settings sub-component ────────────────────────────────────────────

function SandboxSettings({
  defaultImage,
  templatePath,
  onSaved,
}: {
  defaultImage?: string;
  templatePath?: string;
  onSaved: () => void;
}) {
  const [image, setImage] = useState(defaultImage ?? "ubuntu:22.04");
  const [tpl, setTpl] = useState(templatePath ?? "");
  const [saved, setSaved] = useState(false);

  // Sync if parent config reloads
  useEffect(() => { setImage(defaultImage ?? "ubuntu:22.04"); }, [defaultImage]);
  useEffect(() => { setTpl(templatePath ?? ""); }, [templatePath]);

  const save = async () => {
    await invoke("save_sandbox_settings", { defaultImage: image, templatePath: tpl });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onSaved();
  };

  return (
    <div className="bg-[#252526] border border-[#333333] rounded-xl p-6">
      <div className="flex items-center gap-3 mb-3">
        <Box className="text-orange-400" size={18} />
        <h2 className="text-base font-medium text-white">Sandbox Image & Template</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Configure the Docker image and the local template directory copied into every new employee's workspace on creation.
      </p>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Base Image Tag</label>
          <input
            type="text"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            className="w-full bg-[#1e1e1e] border border-[#333333] rounded-md px-3 py-2 text-sm text-gray-300 font-mono outline-none focus:border-orange-500/50 transition-colors"
            placeholder="ubuntu:22.04"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Template Directory{" "}
            <span className="text-gray-600 font-normal">(copied into volume on employee creation)</span>
          </label>
          <input
            type="text"
            value={tpl}
            onChange={(e) => setTpl(e.target.value)}
            className="w-full bg-[#1e1e1e] border border-[#333333] rounded-md px-3 py-2 text-sm text-gray-300 font-mono outline-none focus:border-orange-500/50 transition-colors"
            placeholder="/path/to/openclaw_build/template"
          />
        </div>
        <button
          onClick={save}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            saved ? "bg-green-600 text-white" : "bg-orange-600 hover:bg-orange-500 text-white"
          }`}
        >
          {saved && <Check size={14} />}
          {saved ? "Saved" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

function sanitizeAlias(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

// ── Network Topology SVG ───────────────────────────────────────────────────────

function NetworkTopologyMap({ employees }: { employees: EmployeeStatus[] }) {
  const W = 600;
  const H = 210;
  const hubX = W / 2;
  const hubY = 78;
  const inetX = W - 64;
  const inetY = 28;

  const count = employees.length;
  const spread = Math.min(W - 100, Math.max(count * 88, 88));
  const startX = (W - spread) / 2;
  const empY = 162;
  const ex = (i: number) => (count <= 1 ? hubX : startX + (i / (count - 1)) * spread);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 210 }}>
      {/* Internet node */}
      <rect x={inetX - 52} y={inetY - 14} width={108} height={28} rx={6}
        fill="rgba(59,130,246,0.07)" stroke="rgba(59,130,246,0.25)" strokeWidth={1} />
      <text x={inetX} y={inetY + 5} textAnchor="middle" fill="rgb(147,197,253)" fontSize={11}>
        🌐 Internet
      </text>

      {/* Hub */}
      <rect x={hubX - 82} y={hubY - 18} width={164} height={36} rx={8}
        fill="rgba(6,182,212,0.07)" stroke="rgba(6,182,212,0.3)" strokeWidth={1} />
      <text x={hubX} y={hubY + 6} textAnchor="middle"
        fill="rgb(103,232,249)" fontSize={12} fontWeight="600">
        openclaw-intranet
      </text>

      {/* Per-employee connections + nodes */}
      {employees.map((emp, i) => {
        const x = ex(i);
        const running = emp.status === "running";
        const inet = !emp.internet_blocked;
        const nodeCol = !running ? "#4b5563" : inet ? "#4ade80" : "#fbbf24";
        const lineCol = running ? "rgba(6,182,212,0.22)" : "rgba(75,85,99,0.15)";

        return (
          <g key={emp.id}>
            {/* hub ↔ employee */}
            <line x1={hubX} y1={hubY + 18} x2={x} y2={empY - 18}
              stroke={lineCol} strokeWidth={1}
              strokeDasharray={running ? undefined : "4 3"} />
            {/* employee ↔ internet */}
            {running && inet && (
              <line x1={x} y1={empY - 18} x2={inetX} y2={inetY + 14}
                stroke="rgba(59,130,246,0.18)" strokeWidth={1} strokeDasharray="3 3" />
            )}
            {/* node box */}
            <rect x={x - 38} y={empY - 18} width={76} height={36} rx={6}
              fill="rgba(12,12,12,0.9)" stroke={nodeCol} strokeWidth={0.8} strokeOpacity={0.45} />
            {/* status dot */}
            <circle cx={x + 30} cy={empY - 10} r={3.5} fill={nodeCol} opacity={0.85} />
            {/* name */}
            <text x={x} y={empY - 2} textAnchor="middle" fontSize={11} fontWeight="600"
              fill={running ? "#e5e7eb" : "#6b7280"}>
              {emp.name.length > 9 ? emp.name.slice(0, 8) + "…" : emp.name}
            </text>
            {/* alias */}
            <text x={x} y={empY + 12} textAnchor="middle" fontSize={9} fontFamily="monospace"
              fill={running ? "rgba(103,232,249,0.65)" : "rgba(107,114,128,0.4)"}>
              {sanitizeAlias(emp.name).slice(0, 11)}
            </text>
          </g>
        );
      })}

      {/* Legend */}
      <circle cx={16} cy={H - 12} r={3.5} fill="#4ade80" opacity={0.85} />
      <text x={26} y={H - 8} fill="#4b5563" fontSize={9}>Running + Internet</text>
      <circle cx={138} cy={H - 12} r={3.5} fill="#fbbf24" opacity={0.85} />
      <text x={148} y={H - 8} fill="#4b5563" fontSize={9}>Running + Intranet only</text>
      <circle cx={282} cy={H - 12} r={3.5} fill="#4b5563" opacity={0.85} />
      <text x={292} y={H - 8} fill="#4b5563" fontSize={9}>Stopped</text>
    </svg>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

export function Dashboard({ onRefresh }: Props) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [employees, setEmployees] = useState<EmployeeStatus[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // Employee editing
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [empForm, setEmpForm] = useState<EmployeeEditForm>({ name: "", role: "", memory_limit: "", cpu_limit: "" });

  // Add-provider form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<Omit<ApiProvider, "id">>({ name: "", base_url: "", api_key: "" });
  const [showAddKey, setShowAddKey] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const presetsRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const [cfg, emps] = await Promise.all([
      invoke<AppConfig>("load_config"),
      invoke<EmployeeStatus[]>("list_employees"),
    ]);
    setConfig(cfg);
    setEmployees(emps);
  };

  useEffect(() => { load(); }, []);

  // Close presets dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (presetsRef.current && !presetsRef.current.contains(e.target as Node)) {
        setShowPresets(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const saveProviders = async (providers: ApiProvider[]) => {
    setSaving(true);
    try {
      await invoke("save_providers", { providers });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 1500);
    } catch (e) {
      console.error("Failed to save providers:", e);
    } finally {
      setSaving(false);
    }
  };

  const updateProvider = async (updated: ApiProvider) => {
    const providers = config.api_providers.map((p) => (p.id === updated.id ? updated : p));
    setConfig((c) => ({ ...c, api_providers: providers }));
    await saveProviders(providers);
  };

  const deleteProvider = async (id: string) => {
    const providers = config.api_providers.filter((p) => p.id !== id);
    setConfig((c) => ({ ...c, api_providers: providers }));
    await saveProviders(providers);
  };

  const addProvider = async () => {
    if (!addForm.name.trim()) return;
    const newProvider: ApiProvider = { id: newId(), ...addForm };
    const providers = [...config.api_providers, newProvider];
    setConfig((c) => ({ ...c, api_providers: providers }));
    setAddForm({ name: "", base_url: "", api_key: "" });
    setShowAddForm(false);
    setShowAddKey(false);
    await saveProviders(providers);
  };

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setAddForm((f) => ({ ...f, name: preset.name, base_url: preset.base_url }));
    setShowPresets(false);
    setShowAddForm(true);
  };

  // Employee actions
  const startEditEmp = (emp: EmployeeStatus) => {
    setEditingEmpId(emp.id);
    setEmpForm({ name: emp.name, role: emp.role, memory_limit: emp.memory_limit, cpu_limit: emp.cpu_limit });
  };

  const saveEmp = async () => {
    if (!editingEmpId) return;
    await invoke("update_employee", { id: editingEmpId, name: empForm.name, role: empForm.role, memoryLimit: empForm.memory_limit, cpuLimit: empForm.cpu_limit });
    setEditingEmpId(null);
    await load();
    onRefresh();
  };

  const removeEmployee = async (id: string) => {
    await invoke("remove_employee", { id });
    await load();
    onRefresh();
  };

  const toggleInternet = async (empId: string, currentlyBlocked: boolean) => {
    await invoke("set_internet_access", { employeeId: empId, blocked: !currentlyBlocked });
    await load();
    onRefresh();
  };

  const runningCount = employees.filter((e) => e.status === "running").length;

  return (
    <div className="flex-1 flex flex-col bg-[#1e1e1e] p-8 overflow-y-auto">
      <h1 className="text-2xl font-semibold text-white mb-6">Dashboard</h1>

      <div className="flex flex-col gap-6 max-w-5xl">

        {/* ── API Providers ──────────────────────────────────────── */}
        <div className="bg-[#252526] border border-[#333333] rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <Key className="text-blue-400" size={18} />
              <h2 className="text-base font-medium text-white">API Providers</h2>
              {savedOk && (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <Check size={12} /> Saved
                </span>
              )}
            </div>

            {/* Add button + presets dropdown */}
            <div className="flex items-center gap-2">
              <div className="relative" ref={presetsRef}>
                <button
                  onClick={() => setShowPresets((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-300 bg-[#333333] hover:bg-[#3c3c3c] border border-[#444] rounded-md transition-colors"
                >
                  Quick Add <ChevronDown size={12} />
                </button>
                {showPresets && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-[#2d2d2d] border border-[#444] rounded-lg shadow-2xl z-20 py-1 overflow-hidden">
                    {PRESETS.map((p) => (
                      <button
                        key={p.name}
                        className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#37373d] transition-colors flex items-center justify-between"
                        onClick={() => applyPreset(p)}
                      >
                        <span>{p.name}</span>
                        {p.base_url && (
                          <span className="text-xs text-gray-600 truncate max-w-28 font-mono">
                            {p.base_url.replace("https://", "").split("/")[0]}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => { setShowAddForm((v) => !v); setShowPresets(false); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors"
              >
                <Plus size={13} /> Add Provider
              </button>
            </div>
          </div>

          {/* Column header */}
          {config.api_providers.length > 0 && (
            <div className="flex items-center gap-4 px-4 mb-2 text-xs text-gray-600 uppercase tracking-wider">
              <div className="w-2 shrink-0" />
              <div className="w-28 shrink-0">Provider</div>
              <div className="flex-1">Base URL</div>
              <div className="w-44 hidden md:block">API Key</div>
              <div className="w-14 shrink-0" />
            </div>
          )}

          {/* Provider list */}
          <div className="space-y-2">
            {config.api_providers.length === 0 && !showAddForm && (
              <p className="text-sm text-gray-600 py-2">
                No providers configured. Use <span className="text-gray-400">Quick Add</span> or <span className="text-gray-400">Add Provider</span> to get started.
              </p>
            )}

            {config.api_providers.map((p) => (
              <ProviderRow key={p.id} provider={p} onSave={updateProvider} onDelete={deleteProvider} />
            ))}
          </div>

          {/* Inline add form */}
          {showAddForm && (
            <div className="mt-3 bg-[#1e1e1e] border border-blue-500/30 rounded-lg p-4 space-y-3">
              <p className="text-xs text-gray-400 font-medium">New Provider</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Provider Name *</label>
                  <input
                    className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2.5 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500/60"
                    value={addForm.name}
                    onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. OpenAI"
                    autoFocus
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Base URL</label>
                  <input
                    className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2.5 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500/60 font-mono"
                    value={addForm.base_url}
                    onChange={(e) => setAddForm((f) => ({ ...f, base_url: e.target.value }))}
                    placeholder="https://api.example.com/v1"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs text-gray-500 mb-1">API Key</label>
                  <input
                    type={showAddKey ? "text" : "password"}
                    className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2.5 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500/60 font-mono"
                    value={addForm.api_key}
                    onChange={(e) => setAddForm((f) => ({ ...f, api_key: e.target.value }))}
                    placeholder="sk-..."
                    onKeyDown={(e) => e.key === "Enter" && addProvider()}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
                  <input type="checkbox" checked={showAddKey} onChange={(e) => setShowAddKey(e.target.checked)} className="accent-blue-500" />
                  Show key
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowAddForm(false); setAddForm({ name: "", base_url: "", api_key: "" }); }}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-[#3c3c3c] rounded transition-colors"
                  >
                    <X size={12} /> Cancel
                  </button>
                  <button
                    onClick={addProvider}
                    disabled={!addForm.name.trim() || saving}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded transition-colors"
                  >
                    <Plus size={12} /> Add
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── System Resources ───────────────────────────────────── */}
        <div className="bg-[#252526] border border-[#333333] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <HardDrive className="text-green-400" size={18} />
            <h2 className="text-base font-medium text-white">System Resources</h2>
          </div>
          <div className="space-y-4">
            <div className="bg-[#1e1e1e] p-4 rounded-md border border-[#333333]">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Active Instances</span>
                <span className="text-white font-medium tabular-nums">
                  {runningCount} / {employees.length}
                </span>
              </div>
              <div className="w-full bg-[#3c3c3c] rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all"
                  style={{ width: employees.length ? `${(runningCount / employees.length) * 100}%` : "0%" }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {employees.map((emp) => (
                <div key={emp.id} className="bg-[#1e1e1e] p-3 rounded-md border border-[#333333] flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${emp.status === "running" ? "bg-green-500" : "bg-gray-500"}`} />
                    <span className="text-xs text-white truncate font-medium">{emp.name}</span>
                  </div>
                  <div className="text-xs text-gray-600 pl-3.5 space-y-0.5">
                    <div>MEM {emp.memory_limit}</div>
                    <div>CPU {emp.cpu_limit}</div>
                  </div>
                </div>
              ))}
              {employees.length === 0 && (
                <p className="text-xs text-gray-600 col-span-3">No employees configured yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Employee Management ────────────────────────────────── */}
        <div className="bg-[#252526] border border-[#333333] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Users className="text-purple-400" size={18} />
            <h2 className="text-base font-medium text-white">Employee Resource Management</h2>
          </div>

          {employees.length === 0 ? (
            <p className="text-sm text-gray-500">
              No employees yet. Click <span className="text-gray-300">+</span> in the sidebar to create one.
            </p>
          ) : (
            <div className="space-y-2">
              {employees.map((emp) => (
                <div key={emp.id} className="bg-[#1e1e1e] border border-[#333333] rounded-lg p-4">
                  {editingEmpId === emp.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {(["name", "role", "memory_limit", "cpu_limit"] as const).map((field) => (
                          <div key={field}>
                            <label className="block text-xs text-gray-500 mb-1 capitalize">
                              {field.replace("_", " ")}
                            </label>
                            <input
                              className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500/50"
                              value={empForm[field]}
                              onChange={(e) => setEmpForm((f) => ({ ...f, [field]: e.target.value }))}
                              placeholder={field === "memory_limit" ? "512m" : field === "cpu_limit" ? "1.0" : ""}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingEmpId(null)} className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-[#3c3c3c] rounded transition-colors">
                          <X size={12} /> Cancel
                        </button>
                        <button onClick={saveEmp} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors">
                          <Check size={12} /> Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${emp.status === "running" ? "bg-green-500" : "bg-gray-500"}`} />
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-white">{emp.name}</span>
                          <span className="text-xs text-gray-500 ml-2">{emp.role}</span>
                        </div>
                        <div className="hidden sm:flex gap-2 text-xs text-gray-500">
                          <span className="bg-[#252526] px-2 py-0.5 rounded border border-[#333333]">MEM {emp.memory_limit}</span>
                          <span className="bg-[#252526] px-2 py-0.5 rounded border border-[#333333]">CPU {emp.cpu_limit}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded border ${emp.status === "running" ? "text-green-400 border-green-500/20 bg-green-500/10" : "text-gray-500 border-gray-600/20 bg-gray-500/10"}`}>
                          {emp.status}
                        </span>
                        <button onClick={() => startEditEmp(emp)} className="p-1.5 text-gray-500 hover:text-blue-400 transition-colors" title="Edit">
                          <Edit3 size={14} />
                        </button>
                        <button onClick={() => removeEmployee(emp.id)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Sandbox Image & Template ───────────────────────────── */}
        <SandboxSettings defaultImage={config.default_image} templatePath={config.template_path} onSaved={load} />

        {/* ── Enterprise Intranet ────────────────────────────────── */}
        <div className="bg-[#252526] border border-[#333333] rounded-xl p-6">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <Network className="text-cyan-400" size={18} />
              <h2 className="text-base font-medium text-white">Network Topology</h2>
              <span className="text-xs text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20 font-mono">
                openclaw-intranet
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <Radio size={11} />
              <span>Monitor via Local.Bus in sidebar</span>
            </div>
          </div>
          <p className="text-xs text-gray-600 mb-4">
            Reach peers inside container:{" "}
            <code className="bg-[#1e1e1e] px-1 rounded text-cyan-400 font-mono">http://&lt;alias&gt;:port</code>
            {" · "}
            <code className="bg-[#1e1e1e] px-1 rounded text-cyan-400 font-mono">claw_msg &lt;to&gt; &lt;msg&gt;</code>
          </p>

          {/* SVG topology map */}
          <div className="bg-[#1a1a1a] rounded-lg p-2 mb-4 overflow-x-auto">
            <NetworkTopologyMap employees={employees} />
          </div>

          {/* Internet access toggles */}
          {employees.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {employees.map((emp) => (
                <div
                  key={emp.id}
                  className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-lg px-3 py-2 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-200 truncate">{emp.name}</p>
                    <p className="text-[10px] font-mono text-cyan-600 truncate">
                      {sanitizeAlias(emp.name)}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleInternet(emp.id, emp.internet_blocked)}
                    className={`w-8 h-4 rounded-full relative transition-colors shrink-0 ${
                      emp.internet_blocked ? "bg-red-700/50" : "bg-green-700/50"
                    }`}
                    title={emp.internet_blocked ? "Click to enable internet" : "Click to block internet"}
                  >
                    <div
                      className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${
                        emp.internet_blocked ? "left-0.5" : "left-4"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
          {employees.length === 0 && (
            <p className="text-xs text-gray-700 text-center py-4">No employees. Create one to see the network topology.</p>
          )}
        </div>

      </div>
    </div>
  );
}
