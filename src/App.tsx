import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { ChatTerminal } from "./components/ChatTerminal";
import { FileTree } from "./components/FileTree";
import { Dashboard } from "./components/Dashboard";
import { SquareTerminal, Play } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { EmployeeStatus } from "./types";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("chat");
  const [employees, setEmployees] = useState<EmployeeStatus[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);

  const selectedEmployee = employees.find((e) => e.id === selectedId) ?? null;
  const isRunning = selectedEmployee?.status === "running";

  const refreshEmployees = useCallback(async () => {
    try {
      const list = await invoke<EmployeeStatus[]>("list_employees");
      setEmployees(list);
      setSelectedId((prev) => {
        if (!prev && list.length > 0) return list[0].id;
        return prev;
      });
    } catch (e) {
      console.error("Failed to load employees:", e);
    }
  }, []);

  useEffect(() => {
    refreshEmployees();
    const interval = setInterval(refreshEmployees, 5000);
    return () => clearInterval(interval);
  }, [refreshEmployees]);

  const toggleSandbox = async () => {
    if (!selectedEmployee) return;
    try {
      if (isRunning) {
        await invoke("stop_sandbox", { instanceId: selectedEmployee.id });
      } else {
        await invoke("start_sandbox", {
          instanceId: selectedEmployee.id,
          memoryLimit: selectedEmployee.memory_limit,
          cpuLimit: selectedEmployee.cpu_limit,
        });
      }
      await refreshEmployees();
    } catch (e) {
      console.error("Failed to toggle sandbox:", e);
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#1e1e1e] text-gray-300 overflow-hidden font-sans">
      <Sidebar
        employees={employees}
        selectedId={selectedId}
        onSelect={(id) => { setSelectedId(id); setShowDashboard(false); }}
        setShowDashboard={setShowDashboard}
        onRefresh={refreshEmployees}
      />

      {showDashboard ? (
        <Dashboard onRefresh={refreshEmployees} />
      ) : (
        <div className="flex-1 flex flex-col h-full bg-[#1e1e1e] min-w-0">
          {/* Top bar */}
          <div className="h-12 border-b border-[#333333] bg-[#252526] flex items-center px-4 justify-between shrink-0">
            <div className="flex items-center gap-3 overflow-hidden">
              {selectedEmployee ? (
                <>
                  <span className="font-medium text-sm text-gray-200 truncate">
                    {selectedEmployee.name}
                  </span>
                  <span className="text-xs text-gray-500 truncate hidden sm:block">
                    {selectedEmployee.role}
                  </span>
                  {isRunning ? (
                    <span className="px-2 py-0.5 rounded text-xs bg-green-500/10 text-green-400 border border-green-500/20 shrink-0">
                      Running
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-xs bg-gray-500/10 text-gray-400 border border-gray-500/20 shrink-0">
                      Stopped
                    </span>
                  )}
                </>
              ) : (
                <span className="text-sm text-gray-500">No employee selected</span>
              )}
            </div>

            <div className="flex bg-[#1e1e1e] rounded-md p-0.5 border border-[#333333] shrink-0 mx-2">
              <button
                className={`px-3 py-1 text-xs font-medium rounded ${activeTab === "chat" ? "bg-[#37373d] text-white shadow-sm" : "text-gray-400 hover:text-gray-200"}`}
                onClick={() => setActiveTab("chat")}
              >
                Chat & Terminal
              </button>
              <button
                className={`px-3 py-1 text-xs font-medium rounded ${activeTab === "files" ? "bg-[#37373d] text-white shadow-sm" : "text-gray-400 hover:text-gray-200"}`}
                onClick={() => setActiveTab("files")}
              >
                Files & Editor
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {selectedEmployee && (
                <button
                  onClick={toggleSandbox}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                    isRunning
                      ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      : "bg-[#333333] text-gray-200 hover:bg-[#444]"
                  }`}
                >
                  {isRunning ? (
                    <><SquareTerminal size={14} /> Stop</>
                  ) : (
                    <><Play size={14} /> Start</>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex overflow-hidden">
            {selectedEmployee ? (
              activeTab === "chat" ? (
                <ChatTerminal instanceId={selectedEmployee.id} isRunning={isRunning} />
              ) : (
                <FileTree instanceId={selectedEmployee.id} />
              )
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-600">
                <p className="text-sm">No employees yet.</p>
                <button
                  className="text-xs text-blue-400 hover:text-blue-300 underline"
                  onClick={() => setShowDashboard(true)}
                >
                  Open Dashboard to create one
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
