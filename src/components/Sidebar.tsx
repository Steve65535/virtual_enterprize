import { Bot, Plus, Settings, TerminalSquare, X } from "lucide-react";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { EmployeeStatus } from "../types";

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

export function Sidebar({ employees, selectedId, onSelect, setShowDashboard, onRefresh }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [memory, setMemory] = useState("512m");
  const [cpu, setCpu] = useState("1.0");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      await invoke("add_employee", {
        name: name.trim(),
        role: role.trim() || "Assistant",
        memoryLimit: memory.trim() || "512m",
        cpuLimit: cpu.trim() || "1.0",
      });
      setName("");
      setRole("");
      setMemory("512m");
      setCpu("1.0");
      setShowModal(false);
      onRefresh();
    } catch (e) {
      console.error("Failed to create employee:", e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="w-16 bg-[#252526] border-r border-[#333333] flex flex-col items-center py-4 justify-between z-10 shadow-lg shrink-0">
        <div className="flex flex-col gap-6 w-full items-center">
          {/* Home */}
          <div
            className="p-2 bg-blue-600/20 text-blue-400 rounded-xl cursor-pointer hover:bg-blue-600/40 transition-colors"
            onClick={() => setShowDashboard(false)}
            title="Chat"
          >
            <Bot size={24} />
          </div>

          <div className="w-8 h-px bg-[#3c3c3c]" />

          {/* Employee list */}
          <div className="w-full flex flex-col items-center gap-3">
            {employees.map((emp) => (
              <div
                key={emp.id}
                className={`relative p-2 rounded-lg cursor-pointer transition-all ${
                  selectedId === emp.id
                    ? "bg-[#37373d] text-white"
                    : "text-gray-500 hover:text-gray-300 hover:bg-[#2d2d2d]"
                }`}
                onClick={() => onSelect(emp.id)}
                title={`${emp.name} · ${emp.role}`}
              >
                <TerminalSquare size={22} />
                <span
                  className={`absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full border-2 border-[#252526] ${
                    STATUS_COLOR[emp.status] ?? "bg-gray-500"
                  }`}
                />
              </div>
            ))}

            {/* Add employee */}
            <div
              className="p-2 text-gray-500 hover:text-white cursor-pointer transition-colors border border-dashed border-gray-600 rounded-lg hover:border-gray-400"
              title="New Employee"
              onClick={() => setShowModal(true)}
            >
              <Plus size={20} />
            </div>
          </div>
        </div>

        {/* Settings / Dashboard */}
        <div
          className="text-gray-400 cursor-pointer hover:text-white transition-colors"
          title="Dashboard & Settings"
          onClick={() => setShowDashboard(true)}
        >
          <Settings size={22} />
        </div>
      </div>

      {/* New Employee Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-[#252526] border border-[#3c3c3c] rounded-xl p-6 w-84 shadow-2xl"
            style={{ width: 340 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold">New Digital Employee</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Name *</label>
                <input
                  className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded-md px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500/50"
                  placeholder="e.g. Alice"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
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

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-3 py-2 text-sm text-gray-400 hover:text-white border border-[#3c3c3c] rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || creating}
                className="flex-1 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md transition-colors font-medium"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
