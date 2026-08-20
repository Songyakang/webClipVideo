/**
 * 协作面板（P0）：宿主发起协作 / 客户端输码加入。
 * P0 简化：客户端需手动输入宿主 IP:端口（mDNS 发现 P1 补）。
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCollabSession, setCollabSession, subscribeCollabSession, type CollabSession } from "./hooks/collabSession";
import { showToast } from "../../lib/toast";

interface CollabStartInfo {
  code: string;
  port: number;
}

export default function CollabPanel() {
  const [session, setSession] = useState<CollabSession | null>(getCollabSession());
  const [addr, setAddr] = useState("127.0.0.1:48662");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeCollabSession(setSession), []);

  const startHost = async () => {
    setBusy(true);
    try {
      const info = await invoke<CollabStartInfo>("collab_start");
      setCollabSession({ role: "host", code: info.code, host: "127.0.0.1", port: info.port });
      showToast(`协作已发起，邀请码：${info.code}`, "success");
    } catch (err) {
      showToast(typeof err === "string" ? err : "发起协作失败", "error");
    } finally {
      setBusy(false);
    }
  };

  const joinClient = () => {
    const [host, portStr] = addr.split(":");
    const port = Number(portStr || "48662");
    if (!host || !code.trim()) {
      showToast("请输入宿主地址和邀请码", "error");
      return;
    }
    setCollabSession({ role: "client", code: code.trim().toUpperCase(), host, port });
  };

  const stop = async () => {
    if (session?.role === "host") {
      try { await invoke("collab_stop"); } catch { /* 忽略 */ }
    }
    setCollabSession(null);
    showToast("已退出协作", "info");
  };

  const inputStyle: React.CSSProperties = {
    background: "#161b22", border: "1px solid #30363d", color: "#e6edf3",
    borderRadius: 6, padding: "4px 8px", fontSize: 12, width: 150,
  };
  const btnStyle: React.CSSProperties = {
    background: "#161b22", border: "1px solid #30363d", color: "#e6edf3",
    borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer",
  };

  return (
    <div className="fixed top-16 right-4 z-10 flex flex-col gap-1.5 select-none items-end">
      {session ? (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "#161b22", border: "1px solid #30363d" }}>
          <span className="text-[12px]" style={{ color: "#4ade80" }}>
            ● {session.role === "host" ? "宿主" : "客户端"}
          </span>
          <span className="text-[12px]" style={{ color: "#8b949e" }}>
            邀请码 {session.code}
          </span>
          <button style={btnStyle} onClick={stop} disabled={busy}>退出</button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-lg px-3 py-2.5" style={{ background: "#161b22", border: "1px solid #30363d" }}>
          <button style={btnStyle} onClick={startHost} disabled={busy}>
            {busy ? "启动中..." : "发起协作（宿主）"}
          </button>
          <div className="flex items-center gap-1.5">
            <input style={inputStyle} placeholder="宿主 IP:端口" value={addr} onChange={(e) => setAddr(e.target.value)} />
          </div>
          <div className="flex items-center gap-1.5">
            <input style={{ ...inputStyle, width: 96 }} placeholder="邀请码" value={code} onChange={(e) => setCode(e.target.value)} />
            <button style={btnStyle} onClick={joinClient}>加入</button>
          </div>
        </div>
      )}
    </div>
  );
}
