import { Bot, Loader2, Play, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  instanceId: string;
  isRunning: boolean;
}

interface LogEntry {
  type: "cmd" | "out" | "err";
  text: string;
}

export function ChatTerminal({ instanceId, isRunning }: Props) {
  const [input, setInput] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Reset logs when switching employee
  useEffect(() => {
    setLogs([]);
    setHistory([]);
    setHistoryIdx(-1);
    setInput("");
  }, [instanceId]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleSend = async () => {
    if (!input.trim() || isExecuting) return;
    if (!isRunning) {
      setLogs((prev) => [...prev, { type: "err", text: "Sandbox is not running. Start it first." }]);
      return;
    }

    const cmd = input.trim();
    setInput("");
    setHistoryIdx(-1);
    setHistory((prev) => [cmd, ...prev.slice(0, 99)]);
    setLogs((prev) => [...prev, { type: "cmd", text: cmd }]);
    setIsExecuting(true);

    try {
      const out = await invoke<string>("exec_sandbox", { instanceId, cmd });
      if (out.trim()) {
        setLogs((prev) => [...prev, { type: "out", text: out }]);
      }
    } catch (e: any) {
      setLogs((prev) => [...prev, { type: "err", text: String(e) }]);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(next);
      setInput(history[next] ?? "");
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = historyIdx - 1;
      if (next < 0) {
        setHistoryIdx(-1);
        setInput("");
      } else {
        setHistoryIdx(next);
        setInput(history[next] ?? "");
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col border-r border-[#333333] min-w-0">
      {/* Header */}
      <div className="h-10 flex items-center px-4 border-b border-[#333333] bg-[#252526] justify-between shrink-0">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Bot size={14} className="text-blue-400" />
          <span>Terminal</span>
          {isExecuting && <Loader2 size={12} className="text-blue-400 animate-spin" />}
        </div>
        <button
          onClick={() => setLogs([])}
          className="p-1 text-gray-600 hover:text-gray-300 transition-colors"
          title="Clear"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Log output */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed bg-[#1e1e1e]">
        {logs.length === 0 ? (
          <div className="text-gray-600 select-none">
            {isRunning
              ? "Sandbox ready. Enter a command below."
              : "Sandbox is stopped. Click Start to launch the container."}
          </div>
        ) : (
          logs.map((entry, i) => (
            <div key={i} className="mb-0.5">
              {entry.type === "cmd" && (
                <div className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0 select-none">$</span>
                  <span className="text-gray-200 break-all">{entry.text}</span>
                </div>
              )}
              {entry.type === "out" && (
                <div className="text-gray-400 whitespace-pre-wrap break-all pl-4">{entry.text}</div>
              )}
              {entry.type === "err" && (
                <div className="text-red-400 whitespace-pre-wrap break-all pl-4">{entry.text}</div>
              )}
            </div>
          ))
        )}
        {isExecuting && (
          <div className="flex items-center gap-2 text-gray-600 mt-1">
            <Play size={10} className="animate-pulse" />
            <span>executing…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 bg-[#252526] border-t border-[#333333] shrink-0">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isExecuting}
            className="w-full bg-[#1e1e1e] border border-[#3c3c3c] focus:border-blue-500/50 rounded-lg pl-4 pr-12 py-2.5 text-sm text-gray-200 outline-none resize-none transition-colors font-mono disabled:opacity-50"
            placeholder={isRunning ? "Enter a bash command... (↑↓ history)" : "Start the sandbox to run commands"}
            rows={2}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            onClick={handleSend}
            disabled={isExecuting || !input.trim()}
            className="absolute right-2.5 bottom-2.5 p-1.5 rounded-md transition-colors bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
