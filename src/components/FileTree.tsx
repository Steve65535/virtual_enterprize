import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileText,
  FolderOpen,
  FolderTree,
  RefreshCw,
  Save,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileNode[] | null;
}

// Map extensions to Tailwind color classes
const EXT_COLORS: Record<string, string> = {
  ts: "text-blue-400",
  tsx: "text-blue-400",
  js: "text-yellow-400",
  jsx: "text-yellow-400",
  py: "text-green-400",
  rs: "text-orange-400",
  html: "text-orange-300",
  css: "text-purple-400",
  json: "text-yellow-300",
  md: "text-gray-300",
  sh: "text-green-300",
  yml: "text-pink-400",
  yaml: "text-pink-400",
  toml: "text-red-400",
  txt: "text-gray-400",
};

function fileColor(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_COLORS[ext] ?? "text-gray-400";
}

function isTextFile(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const binary = new Set(["png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "pdf", "zip", "tar", "gz", "exe", "bin", "wasm"]);
  return !binary.has(ext);
}

interface TreeNodeProps {
  node: FileNode;
  level?: number;
  selectedPath: string | null;
  onFileClick: (path: string, name: string) => void;
}

function TreeNode({ node, level = 0, selectedPath, onFileClick }: TreeNodeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isSelected = selectedPath === node.path;

  return (
    <div className="flex flex-col w-full">
      <div
        className={`flex items-center gap-1.5 py-0.5 px-2 rounded cursor-pointer transition-colors text-xs ${
          isSelected && !node.is_dir
            ? "bg-[#094771] text-white"
            : "hover:bg-[#37373d] text-gray-300"
        }`}
        style={{ paddingLeft: `${level * 10 + 8}px` }}
        onClick={() => {
          if (node.is_dir) {
            setIsOpen((v) => !v);
          } else {
            onFileClick(node.path, node.name);
          }
        }}
      >
        {node.is_dir ? (
          <>
            <span className="shrink-0 text-gray-500 w-3">
              {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            {isOpen ? (
              <FolderOpen size={14} className="text-blue-400 shrink-0" />
            ) : (
              <FolderTree size={14} className="text-blue-400 shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <FileCode2 size={14} className={`${fileColor(node.name)} shrink-0`} />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </div>

      {node.is_dir && isOpen && node.children && (
        <div className="flex flex-col w-full">
          {node.children.map((child, i) => (
            <TreeNode
              key={`${child.path}-${i}`}
              node={child}
              level={level + 1}
              selectedPath={selectedPath}
              onFileClick={onFileClick}
            />
          ))}
          {node.children.length === 0 && (
            <div
              className="text-xs text-gray-600 italic"
              style={{ paddingLeft: `${(level + 1) * 10 + 8 + 18}px` }}
            >
              empty
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  instanceId: string;
}

export function FileTree({ instanceId }: Props) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ path: string; name: string } | null>(null);
  const [content, setContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchTree = useCallback(async () => {
    try {
      setLoading(true);
      const nodes = await invoke<FileNode[]>("read_sandbox_dir", { instanceId });
      setTree(nodes);
    } catch (e) {
      console.error("Failed to fetch tree:", e);
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  // Reset file view when switching employees
  useEffect(() => {
    setSelectedFile(null);
    setContent("");
    setIsDirty(false);
  }, [instanceId]);

  useEffect(() => {
    const unlisten = listen("fs-event", (event: any) => {
      try {
        const payload = JSON.parse(event.payload as string);
        if (payload.instance_id === instanceId) fetchTree();
      } catch {}
    });
    return () => { unlisten.then((f) => f()); };
  }, [instanceId, fetchTree]);

  const openFile = async (path: string, name: string) => {
    if (!isTextFile(name)) {
      setSelectedFile({ path, name });
      setContent("[Binary file — cannot display]");
      setIsDirty(false);
      return;
    }
    setLoadingFile(true);
    try {
      const text = await invoke<string>("read_file", { instanceId, filePath: path });
      setSelectedFile({ path, name });
      setContent(text);
      setIsDirty(false);
      setSaveError(null);
    } catch (e: any) {
      console.error("Failed to read file:", e);
    } finally {
      setLoadingFile(false);
    }
  };

  const saveFile = async () => {
    if (!selectedFile || !isDirty || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await invoke("write_file", {
        instanceId,
        filePath: selectedFile.path,
        content,
      });
      setIsDirty(false);
    } catch (e: any) {
      setSaveError(String(e));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* File tree panel */}
      <div className="w-56 bg-[#252526] flex flex-col shrink-0 border-r border-[#333333]">
        <div className="h-10 flex items-center px-3 border-b border-[#333333] justify-between shrink-0">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
            <FolderTree size={12} /> Explorer
          </span>
          <button
            onClick={fetchTree}
            disabled={loading}
            className="p-1 text-gray-500 hover:text-white transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1 font-mono">
          {tree.length === 0 ? (
            <div className="text-gray-600 text-xs text-center py-6 px-3 leading-relaxed">
              No files yet.
              <br />
              Start the sandbox and run commands to create files.
            </div>
          ) : (
            tree.map((node, i) => (
              <TreeNode
                key={`${node.path}-${i}`}
                node={node}
                selectedPath={selectedFile?.path ?? null}
                onFileClick={openFile}
              />
            ))
          )}
        </div>
      </div>

      {/* Editor panel */}
      <div className="flex-1 flex flex-col bg-[#1e1e1e] min-w-0">
        {selectedFile ? (
          <>
            {/* Editor top bar */}
            <div className="h-10 flex items-center px-4 border-b border-[#333333] bg-[#252526] justify-between shrink-0 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileCode2 size={14} className={fileColor(selectedFile.name)} />
                <span className="text-xs text-gray-300 font-mono truncate">{selectedFile.path}</span>
                {isDirty && (
                  <span
                    className="w-2 h-2 rounded-full bg-orange-400 shrink-0"
                    title="Unsaved changes"
                  />
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {saveError && (
                  <span className="text-xs text-red-400 truncate max-w-48" title={saveError}>
                    {saveError}
                  </span>
                )}
                <button
                  onClick={saveFile}
                  disabled={!isDirty || isSaving || !isTextFile(selectedFile.name)}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded transition-colors"
                >
                  <Save size={12} />
                  {isSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>

            {/* Textarea editor */}
            {loadingFile ? (
              <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                Loading…
              </div>
            ) : (
              <textarea
                value={content}
                onChange={(e) => {
                  if (!isTextFile(selectedFile.name)) return;
                  setContent(e.target.value);
                  setIsDirty(true);
                }}
                readOnly={!isTextFile(selectedFile.name)}
                className="flex-1 w-full bg-[#1e1e1e] text-gray-300 font-mono text-xs p-4 resize-none outline-none leading-relaxed caret-white"
                spellCheck={false}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                    e.preventDefault();
                    saveFile();
                  }
                }}
              />
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-600">
            <FileText size={32} className="opacity-40" />
            <p className="text-sm">Select a file to view or edit</p>
            <p className="text-xs text-gray-700">Cmd/Ctrl+S to save</p>
          </div>
        )}
      </div>
    </div>
  );
}
