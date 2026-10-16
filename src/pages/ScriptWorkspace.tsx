import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { addClip } from "../lib/store";
import { loadCanvas, nodeToInput, saveCanvas } from "../lib/db";
import type { FlowNode } from "./detail/nodes/types";
import ScriptEditor from "./detail/script/ScriptEditor";
import { createExampleScript, createScript, type ScriptDocument } from "./detail/script/types";

export default function ScriptWorkspace() {
  const { id, nodeId } = useParams<{ id: string; nodeId: string }>();
  const navigate = useNavigate();
  const [example] = useState(createExampleScript);
  const [loaded, setLoaded] = useState<{ node: FlowNode; assets: FlowNode[] } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  // 保存失败后重试复用已创建的项目，避免重复创建。
  const createdProjectRef = useRef<string | null>(null);

  useEffect(() => {
    if (!id || !nodeId) return;
    let cancelled = false;
    setLoaded(null);
    setError("");
    loadCanvas(id).then(({ nodes }) => {
      if (cancelled) return;
      const node = nodes.find((item) => item.id === nodeId && item.type === "script") as FlowNode | undefined;
      if (!node) { setError("找不到这个脚本节点，它可能已被删除。"); return; }
      const assets = nodes.filter((item) => ["image", "image-upload", "video", "video-upload"].includes(item.type ?? "")) as FlowNode[];
      setLoaded({ node, assets });
    }).catch(() => { if (!cancelled) setError("脚本加载失败，请重试。"); });
    return () => { cancelled = true; };
  }, [id, nodeId, retry]);

  const save = async (script: ScriptDocument) => {
    if (!isTauri()) throw new Error("请在桌面应用中保存项目；浏览器内可体验编辑操作。");
    if (!id) {
      if (!createdProjectRef.current) {
        const project = await addClip({ title: script.title, description: "脚本节点体验项目", url: "", duration: 0, tags: ["脚本"] });
        createdProjectRef.current = project.id;
      }
      const projectId = createdProjectRef.current;
      await saveCanvas(projectId, [{ id: "node-1", type: "script", position: { x: 240, y: 180 }, data: { type: "script", content: script.source, script, w: 520, h: 360 } }], []);
      navigate(`/detail/${projectId}`);
      return;
    }
    // 重新读取节点，保留位置和其他属性；已删除的节点不能被保存操作复活。
    const current = await loadCanvas(id);
    const node = current.nodes.find((item) => item.id === nodeId && item.type === "script");
    if (!node) throw new Error("脚本节点已被删除，请返回画布。");
    await invoke("db_upsert_canvas_nodes", { clipId: id, nodes: [nodeToInput({ ...node, data: { ...node.data, content: script.source, script } })] });
  };

  if (id && !loaded) return <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0d1117] px-5 text-sm text-[#b1bac4]"><p role={error ? "alert" : "status"}>{error || "正在打开脚本…"}</p>{error && <button className="btn-primary" onClick={() => setRetry((value) => value + 1)}>重新加载</button>}<button className="btn-cancel" onClick={() => navigate(`/detail/${id}`)}>返回画布</button></main>;

  return <ScriptEditor key={`${id ?? "demo"}:${nodeId ?? "example"}`} initial={loaded?.node.data.script ?? (id ? createScript() : example)} assets={loaded?.assets} demo={!id} onSave={save} onClose={() => navigate(id ? `/detail/${id}` : "/experiments")} />;
}
