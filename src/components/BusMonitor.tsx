import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { EnterpriseMessage } from "../types";
import { Radio, X, Trash2 } from "lucide-react";

interface Props {
  onClose: () => void;
}

function ts(epoch: number): string {
  return new Date(epoch * 1000).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function BusMonitor({ onClose }: Props) {
  const [messages, setMessages] = useState<EnterpriseMessage[]>([]);
  const [flash, setFlash] = useState(false);
  const prevLen = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const msgs = await invoke<EnterpriseMessage[]>("list_enterprise_messages");
        if (msgs.length > prevLen.current) {
          setFlash(true);
          setTimeout(() => setFlash(false), 600);
          prevLen.current = msgs.length;
        }
        setMessages(msgs);
      } catch {}
    };
    poll();
    const timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const clearAll = async () => {
    await invoke("clear_enterprise_messages");
    setMessages([]);
    prevLen.current = 0;
  };

  return (
    <div className="w-72 bg-[#080808] border-r border-[#1c1c1c] flex flex-col shrink-0 h-full select-none">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="h-12 border-b border-[#1c1c1c] flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <Radio
            size={13}
            className={`transition-colors ${flash ? "text-green-300" : "text-green-600"}`}
          />
          <span className="text-xs font-mono font-bold tracking-widest text-green-500">
            LOCAL.BUS
          </span>
          {messages.length > 0 && (
            <span className="text-[10px] font-mono text-gray-700">
              [{messages.length}]
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {messages.length > 0 && (
            <button
              onClick={clearAll}
              className="p-1.5 text-gray-700 hover:text-red-500 transition-colors"
              title="Clear all"
            >
              <Trash2 size={11} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-gray-700 hover:text-gray-400 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* ── Feed ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 font-mono text-xs">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center pb-8">
            <Radio size={22} className="text-gray-800" />
            <p className="text-gray-700 text-[11px] leading-relaxed">
              Monitoring inter-agent bus.
              <br />
              No transmissions yet.
            </p>
            <p className="text-gray-800 text-[10px]">
              Agents use <span className="text-gray-600">claw_msg</span> to broadcast.
            </p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className="border-l border-green-900 pl-2.5 pb-0.5"
            >
              {/* Timestamp */}
              <span className="text-[10px] text-gray-700 block mb-1">
                {ts(msg.timestamp)}
              </span>
              {/* Route */}
              <div className="flex items-center gap-1 mb-1 flex-wrap">
                <span className="text-blue-500 font-bold">{msg.from}</span>
                <span className="text-gray-700">→</span>
                <span className="text-purple-500 font-bold">{msg.to}</span>
              </div>
              {/* Content */}
              <p className="text-gray-300 leading-relaxed break-all whitespace-pre-wrap">
                {msg.message}
              </p>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Footer status ────────────────────────────────────────── */}
      <div className="h-8 border-t border-[#1c1c1c] flex items-center px-3 shrink-0">
        <span className="text-[10px] font-mono text-gray-800 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-800 inline-block" />
          /enterprise_shared/.bus · polling 2s
        </span>
      </div>
    </div>
  );
}
