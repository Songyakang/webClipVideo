import { useEffect, useRef, useState, type ReactNode } from "react";
import type { FlowNode } from "../nodes/types";
import { getAssetSrc } from "../../../lib/assets";
import ScriptIcon from "./ScriptIcon";
import { createShot, type ScriptDocument, type ScriptShot } from "./types";
import { Choice, scriptButton as button } from "./ScriptControls";
import ScriptAiPanel from "./ScriptAiPanel";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as ToggleGroup from "@radix-ui/react-toggle-group";

const field = "w-full min-w-0 !rounded-lg !border-[#30363d] !bg-[#0d1117] !text-sm !leading-6 focus:!border-[#b69aff]";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-2 text-[13px] text-[#b1bac4]"><span>{label}</span>{children}</label>;
}

function AssetPreview({ node }: { node?: FlowNode }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let cancelled = false;
    setSrc("");
    // 只从持久化路径恢复，避免使用失效的 blob URL 或将大视频读入内存。
    if (node?.data.assetPath) getAssetSrc(node.data.assetPath).then((url) => { if (!cancelled) setSrc(url); }).catch(() => {});
    return () => { cancelled = true; };
  }, [node?.data.assetPath]);
  if (!src) return <span className="text-xs text-[#8b949e]">{node ? "素材预览暂不可用" : "关联画布素材后，在这里预览"}</span>;
  return node?.type?.includes("video")
    ? <video src={src} controls preload="metadata" className="max-h-40 w-full rounded-lg object-contain" />
    : <img src={src} alt={node?.data.label || "关联的镜头素材"} className="max-h-40 w-full rounded-lg object-contain" />;
}

interface Props {
  initial: ScriptDocument;
  assets?: FlowNode[];
  demo?: boolean;
  onSave: (script: ScriptDocument) => Promise<void>;
  onClose: () => void;
}

export default function ScriptEditor({ initial, assets = [], demo = false, onSave, onClose }: Props) {
  const [history, setHistory] = useState({ past: [] as ScriptDocument[], present: initial, future: [] as ScriptDocument[] });
  const doc = history.present;
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [activeId, setActiveId] = useState<string | null>(initial.shots[0]?.id ?? null);
  const [workspace, setWorkspace] = useState("source");
  const [view, setView] = useState("current");
  const [hasDraft, setHasDraft] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<HTMLDivElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [notice, setNotice] = useState("");
  const savingRef = useRef(false);
  const lastEditRef = useRef({ key: "", time: 0 });
  const dirty = saved !== JSON.stringify(doc);
  const duration = doc.shots.reduce((total, shot) => total + shot.duration, 0);
  const linked = doc.shots.filter((shot) => assets.some((asset) => asset.id === shot.assetNodeId)).length;

  const change = (next: ScriptDocument, key = "") => {
    if (savingRef.current) return;
    const now = Date.now();
    const merge = !!key && lastEditRef.current.key === key && now - lastEditRef.current.time < 700;
    lastEditRef.current = { key, time: now };
    setHistory((current) => ({ past: merge ? current.past : [...current.past, current.present].slice(-50), present: next, future: [] }));
    setError("");
    setNotice("");
  };
  const updateShot = (id: string, patch: Partial<ScriptShot>, key = "") => change({ ...doc, shots: doc.shots.map((shot) => shot.id === id ? { ...shot, ...patch } : shot) }, `${id}:${key}`);
  const addShot = () => {
    const shot = createShot();
    change({ ...doc, shots: [...doc.shots, shot] });
    setActiveId(shot.id);
  };
  const reorder = (index: number, offset: number) => {
    const shots = [...doc.shots];
    const target = index + offset;
    if (target < 0 || target >= shots.length) return;
    [shots[index], shots[target]] = [shots[target], shots[index]];
    change({ ...doc, shots });
  };
  const travel = (direction: "undo" | "redo") => {
    lastEditRef.current = { key: "", time: 0 };
    setHistory((current) => {
      if (direction === "undo") {
        const previous = current.past[current.past.length - 1];
        return previous ? { past: current.past.slice(0, -1), present: previous, future: [current.present, ...current.future] } : current;
      }
      const next = current.future[0];
      return next ? { past: [...current.past, current.present], present: next, future: current.future.slice(1) } : current;
    });
    setNotice("");
  };

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  const save = async () => {
    if (savingRef.current) return;
    if (!doc.title.trim()) { setError("请先为脚本填写一个标题。"); return; }
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave(doc);
      setSaved(JSON.stringify(doc));
      setNotice("已保存到画布");
    } catch (reason) {
      setError(`保存失败，草稿仍保留在当前页面，请重试。${reason instanceof Error ? ` ${reason.message}` : ""}`);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0d1117] text-[#e6edf3]">
      <header className="sticky top-0 z-20 border-b border-[#30363d] bg-[#0d1117]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-4">
            <button className={button} disabled={saving} onClick={() => dirty ? setConfirmLeave(true) : onClose()} aria-label={demo ? "返回体验功能" : "返回画布"}>← <span className="hidden sm:inline">{demo ? "体验功能" : "返回画布"}</span></button>
            <span className="h-5 w-px bg-[#30363d]" />
            <span className="flex items-center gap-2 font-semibold"><span className="text-[#d2b9ff]"><ScriptIcon /></span>脚本工作台</span>
            <span className="rounded-full border border-[#d2b9ff]/20 px-2 py-0.5 text-[10px] text-[#d2b9ff]">体验版</span>
          </div>
          <div className="flex items-center gap-3">
            <span role="status" className="text-xs text-[#8b949e]">{saving ? "正在保存…" : dirty ? "有未保存的修改" : demo && saved === JSON.stringify(initial) ? "示例草稿" : "已保存"}</span>
            <button onClick={save} disabled={saving} className={`${button} !border-[#b69aff] !bg-[#b69aff] !px-4 !font-semibold !text-[#181124] hover:!bg-[#c8b0ff]`}>{saving ? "保存中…" : demo ? "保存为新项目" : "保存到画布"} <span aria-hidden="true">↗</span></button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-5 pb-10 pt-7 lg:px-8">
        {confirmLeave && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e3b341]/30 bg-[#e3b341]/5 p-4 text-sm"><span>有未保存的修改，离开后将丢失。</span><div className="flex gap-2"><button className={button} onClick={() => setConfirmLeave(false)}>继续编辑</button><button className={button} onClick={onClose}>放弃修改并返回</button></div></div>}
        {error && <p role="alert" className="mb-5 rounded-xl border border-[#f85149]/30 bg-[#f85149]/10 p-4 text-sm text-[#ffaba8]">{error}</p>}
        <fieldset disabled={saving} className="m-0 min-w-0 border-0 p-0 disabled:opacity-70">
          <div className="mb-7 flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
            <div className="min-w-0 flex-1">
              <p className="mb-2 mt-0 text-[11px] tracking-[0.2em] text-[#b69aff]">从想法，到每一个镜头</p>
              <h1 className="m-0"><input aria-label="脚本标题" value={doc.title} onChange={(e) => change({ ...doc, title: e.target.value }, "title")} placeholder="为这个故事起个名字" className="w-full !rounded-none !border-0 !border-b !border-transparent !bg-transparent !px-0 !py-2 !text-2xl !font-semibold !tracking-tight focus:!border-[#b69aff] sm:!text-3xl" /></h1>
              <p className="mb-0 mt-2 text-xs leading-6 text-[#8b949e]">{demo ? "这是一份可编辑的示例。试着修改原稿、编排镜头，再保存为自己的项目。" : "编写故事，安排镜头，为每一段画面找到合适的素材。"}</p>
            </div>
            <div className="flex shrink-0 items-end gap-3">
              <Field label="目标时长"><div className="relative w-28"><input type="number" min="1" max="36000" aria-label="目标时长（秒）" value={doc.targetDuration} onChange={(e) => change({ ...doc, targetDuration: Math.min(36000, Math.max(1, Number(e.target.value) || 1)) }, "targetDuration")} className={`${field} !pr-8`} /><span className="absolute right-3 top-3 text-xs text-[#8b949e]">秒</span></div></Field>
              <div className="flex w-36 flex-col gap-2 text-[13px] text-[#b1bac4]"><span>画面比例</span><Choice label="画面比例" value={doc.aspectRatio} options={[{ value: "16:9", label: "16:9 横屏" }, { value: "9:16", label: "9:16 竖屏" }, { value: "1:1", label: "1:1 方形" }]} onChange={(aspectRatio) => change({ ...doc, aspectRatio })} /></div>
            </div>
          </div>

          <ToggleGroup.Root type="single" value={workspace} onValueChange={(value) => { if (value) setWorkspace(value); }} aria-label="工作区域" className="mb-5 flex rounded-xl bg-[#161b22] p-1 lg:hidden">
            <ToggleGroup.Item value="source" className="flex-1 rounded-lg px-4 py-3 text-sm text-[#b1bac4] data-[state=on]:bg-[#30363d] data-[state=on]:text-white">故事原稿</ToggleGroup.Item>
            <ToggleGroup.Item value="shots" className="flex-1 rounded-lg px-4 py-3 text-sm text-[#b1bac4] data-[state=on]:bg-[#30363d] data-[state=on]:text-white">分镜编排{hasDraft ? " · 新草稿" : ""}</ToggleGroup.Item>
          </ToggleGroup.Root>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.5fr)] xl:gap-8">
            <aside className={`${workspace === "source" ? "block" : "hidden"} min-w-0 rounded-2xl bg-[#161b22] lg:block lg:sticky lg:top-24`}>
              <div className="flex items-center justify-between border-b border-[#30363d] px-5 py-4"><h2 className="m-0 flex items-center gap-2 text-sm font-semibold"><span className="text-[#b69aff]">01</span> 故事原稿</h2><span className="text-xs text-[#9da7b3]">{doc.source.replace(/\s/g, "").length} 字</span></div>
              <div className="space-y-5 p-5">
                <ScriptAiPanel document={doc} disabled={saving} previewTarget={previewTarget} onDraftChange={(available) => {
                  setHasDraft(available);
                  setView(available ? "draft" : "current");
                  if (available) setWorkspace("shots");
                }} onApply={(shots, mode) => {
                  change({ ...doc, shots: mode === "append" ? [...doc.shots, ...shots] : shots });
                  setActiveId(shots[0]?.id ?? null);
                  setView("current");
                  setWorkspace("shots");
                  setNotice("AI 分镜已采用，可继续编辑或撤销；请保存到画布。");
                }} />
                <details className="group border-b border-[#30363d] pb-4"><summary className="mb-3 cursor-pointer text-sm text-[#b1bac4]">创作要求 <span className="ml-2 text-xs text-[#8b949e]">风格、受众与表达方向</span></summary><Field label="创作要求"><textarea rows={3} className={field} value={doc.brief} placeholder="这支短片要讲什么？希望带来什么感受？" onChange={(e) => change({ ...doc, brief: e.target.value }, "brief")} /></Field></details>
                <Field label="原稿内容"><textarea rows={10} className={`${field} !leading-8`} value={doc.source} placeholder="写下你的故事、口播文案或创作想法……" onChange={(e) => change({ ...doc, source: e.target.value }, "source")} /></Field>

              </div>
            </aside>

            <section aria-labelledby="shots-heading" className={`${workspace === "shots" ? "block" : "hidden"} min-w-0 lg:block`}>
              <div className="mb-5 flex items-center justify-between gap-3 border-b border-[#30363d] pb-4">
                <ToggleGroup.Root type="single" value={view} onValueChange={(value) => { if (value) setView(value); }} aria-label="分镜视图" className="flex gap-1 rounded-lg bg-[#161b22] p-1">
                  <ToggleGroup.Item value="current" className="rounded-md px-4 py-2 text-sm text-[#b1bac4] data-[state=on]:bg-[#30363d] data-[state=on]:text-white">当前分镜 · {doc.shots.length}</ToggleGroup.Item>
                  <ToggleGroup.Item value="draft" disabled={!hasDraft} className="rounded-md px-4 py-2 text-sm text-[#b1bac4] disabled:opacity-40 data-[state=on]:bg-[#b69aff]/15 data-[state=on]:text-[#d2b9ff]">AI 草稿{hasDraft ? " ●" : ""}</ToggleGroup.Item>
                </ToggleGroup.Root>
                <span className="hidden text-xs text-[#8b949e] sm:inline">先编排，再创作</span>
              </div>
              <div ref={setPreviewTarget} hidden={view !== "draft"} />
              <div hidden={view !== "current"}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="shots-heading" className="m-0 flex items-center gap-2 text-sm font-semibold"><span className="text-[#b69aff]">02</span> 分镜编排 <span className="rounded-md bg-[#21262d] px-2 py-0.5 text-xs font-normal text-[#8b949e]">{doc.shots.length}</span></h2><div className="flex gap-2"><button className={button} disabled={!history.past.length} onClick={() => travel("undo")} aria-label="撤销编辑">↶ 撤销</button><button className={button} disabled={!history.future.length} onClick={() => travel("redo")} aria-label="重做编辑">↷ 重做</button><button className={button} onClick={addShot}>＋ 添加镜头</button></div></div>
              <div className="mb-5 rounded-xl bg-[#161b22] px-4 py-3"><div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="text-[#b1bac4]">预计 <strong className="text-[#e6edf3]">{duration} 秒</strong><span className="mx-2 text-[#484f58]">/</span>目标 {doc.targetDuration} 秒</span><span className={duration > doc.targetDuration ? "text-[#e3b341]" : "text-[#8b949e]"}>{duration > doc.targetDuration ? `超出 ${duration - doc.targetDuration} 秒` : `${linked} / ${doc.shots.length} 个镜头已关联素材`}</span></div><div className="h-1 overflow-hidden rounded-full bg-[#30363d]"><div className={`h-full rounded-full ${duration > doc.targetDuration ? "bg-[#e3b341]" : "bg-[#b69aff]"}`} style={{ width: `${Math.min(100, duration / doc.targetDuration * 100)}%` }} /></div></div>

              <ol className="m-0 list-none space-y-3 p-0">
                {doc.shots.map((shot, index) => {
                  const expanded = activeId === shot.id;
                  const asset = assets.find((node) => node.id === shot.assetNodeId);
                  const missing = !!shot.assetNodeId && !asset;
                  return <li key={shot.id}>
                    <article aria-label={`镜头 ${index + 1}`} className={`overflow-hidden rounded-xl border bg-[#161b22] transition-colors ${expanded ? "border-[#b69aff]/50" : "border-[#30363d]"}`}>
                      <div className="flex items-center gap-2 p-4">
                        <button onClick={() => setActiveId(expanded ? null : shot.id)} aria-expanded={expanded} aria-controls={`shot-${shot.id}`} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b69aff]">
                          <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg font-mono text-sm ${expanded ? "bg-[#b69aff]/15 text-[#d2b9ff]" : "bg-[#21262d] text-[#8b949e]"}`}>{String(index + 1).padStart(2, "0")}</span>
                          <span className="min-w-0 flex-1"><span className="block truncate text-base font-medium">{shot.title || "未命名镜头"}</span><span className="mt-1 block truncate text-xs text-[#9da7b3]">{shot.camera || "待补充镜头语言"} · {shot.duration} 秒 <span className={missing ? "text-[#e3b341]" : asset ? "text-[#7ee7b7]" : ""}>· {missing ? "素材已移除" : asset ? "已关联素材" : "待关联素材"}</span></span></span>
                          <span aria-hidden="true" className="px-1 text-[#8b949e]">{expanded ? "⌃" : "⌄"}</span>
                        </button>
                        <div className="flex shrink-0 gap-1">
                          <button className={`${button} !px-2`} aria-label={`上移镜头 ${index + 1}`} title="上移" disabled={index === 0} onClick={() => reorder(index, -1)}>↑</button>
                          <button className={`${button} !px-2`} aria-label={`下移镜头 ${index + 1}`} title="下移" disabled={index === doc.shots.length - 1} onClick={() => reorder(index, 1)}>↓</button>
                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild><button className={`${button} !px-3`} aria-label={`镜头 ${index + 1} 更多操作`}>···</button></DropdownMenu.Trigger>
                            <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={6} className="z-[1200] min-w-36 rounded-xl border border-[#30363d] bg-[#161b22] p-1.5 shadow-xl">
                          <DropdownMenu.Item className="cursor-pointer rounded-md px-3 py-2 text-sm text-[#e6edf3] outline-none data-[highlighted]:bg-[#30363d]" aria-label={`复制镜头 ${index + 1}`} title="复制" onSelect={() => { const copy = { ...shot, id: crypto.randomUUID(), title: `${shot.title || "未命名镜头"}（副本）` }; change({ ...doc, shots: [...doc.shots.slice(0, index + 1), copy, ...doc.shots.slice(index + 1)] }); setActiveId(copy.id); }}>复制镜头</DropdownMenu.Item>
                          <DropdownMenu.Item className="cursor-pointer rounded-md px-3 py-2 text-sm text-[#ffaba8] outline-none data-[highlighted]:bg-[#30363d]" aria-label={`删除镜头 ${index + 1}`} title="删除（可撤销）" onSelect={() => { change({ ...doc, shots: doc.shots.filter((item) => item.id !== shot.id) }); setActiveId(doc.shots[index + 1]?.id ?? doc.shots[index - 1]?.id ?? null); setNotice("已删除镜头，可点击撤销恢复"); }}>删除镜头</DropdownMenu.Item>
                            </DropdownMenu.Content></DropdownMenu.Portal>
                          </DropdownMenu.Root>
                        </div>
                      </div>
                      {!expanded && <p className="mb-5 mt-0 line-clamp-2 px-5 text-sm leading-6 text-[#b1bac4]">{shot.description || "补充画面描述，让故事更具体。"}</p>}
                      {expanded && <div id={`shot-${shot.id}`} className="space-y-4 border-t border-[#30363d] p-4 sm:p-5">
                        <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-3"><Field label="镜头标题"><input className={field} value={shot.title} placeholder="给这个镜头一个简短标题" onChange={(e) => updateShot(shot.id, { title: e.target.value }, "title")} /></Field><Field label="时长（秒）"><input className={field} type="number" min="1" max="3600" value={shot.duration} onChange={(e) => updateShot(shot.id, { duration: Math.min(3600, Math.max(1, Number(e.target.value) || 1)) }, "duration")} /></Field></div>
                        <Field label="画面描述"><textarea rows={3} className={field} value={shot.description} placeholder="谁，在什么地方，做了什么？" onChange={(e) => updateShot(shot.id, { description: e.target.value }, "description")} /></Field>
                        <Field label="旁白 / 对白"><textarea rows={2} className={field} value={shot.dialogue} placeholder="这个镜头里要说的话，可注明说话人" onChange={(e) => updateShot(shot.id, { dialogue: e.target.value }, "dialogue")} /></Field>
                        <details className="rounded-lg bg-[#0d1117]/50 p-3"><summary className="cursor-pointer text-sm text-[#b1bac4]">镜头与声音 <span className="ml-2 text-xs text-[#8b949e]">{shot.camera || "补充运镜、音乐和音效"}</span></summary><div className="mt-4">                        <div className="grid gap-4 sm:grid-cols-2"><Field label="景别与运镜"><input className={field} value={shot.camera} placeholder="如：特写 · 缓慢推进" onChange={(e) => updateShot(shot.id, { camera: e.target.value }, "camera")} /></Field><Field label="声音说明"><input className={field} value={shot.sound} placeholder="音乐、环境音或音效" onChange={(e) => updateShot(shot.id, { sound: e.target.value }, "sound")} /></Field></div>
</div></details>
                        <details className="rounded-lg bg-[#0d1117]/50 p-3"><summary className="cursor-pointer text-[13px] text-[#b1bac4]">生成提示词 <span className="ml-2 text-[#8b949e]">为后续素材生成做准备</span></summary><textarea aria-label="生成提示词" rows={3} className={`${field} mt-3`} value={shot.prompt} placeholder="主体、环境、光影、风格等关键词" onChange={(e) => updateShot(shot.id, { prompt: e.target.value }, "prompt")} /></details>
                        <details className="rounded-lg bg-[#0d1117]/50 p-3"><summary className="cursor-pointer text-sm text-[#b1bac4]">画面素材 <span className={`ml-2 text-xs ${asset ? "text-[#7ee7b7]" : missing ? "text-[#e3b341]" : "text-[#8b949e]"}`}>{asset ? "● 已关联" : missing ? "素材已移除" : "关联参考图或视频"}</span></summary><div className="mt-4"><div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><span className="text-[13px] text-[#b1bac4]">画面素材</span><Choice label={`镜头 ${index + 1} 关联素材`} value={shot.assetNodeId || "none"} options={[{ value: "none", label: "暂不关联素材" }, ...(missing ? [{ value: shot.assetNodeId!, label: "素材已移除，请重新选择" }] : []), ...assets.map((node) => ({ value: node.id, label: `${node.type?.includes("video") ? "视频" : "图片"} · ${node.data.label || node.id}` }))]} onChange={(value) => updateShot(shot.id, { assetNodeId: value === "none" ? undefined : value }, "asset")} /></div><div className="flex min-h-16 items-center justify-center rounded-lg bg-[#0d1117]"><AssetPreview node={asset} /></div>{!assets.length && <p className="mb-0 mt-3 text-[11px] leading-5 text-[#8b949e]">{demo ? "保存为项目后，上传图片或视频到画布，即可回来关联素材。" : "画布中还没有图片或视频，添加素材后即可在这里选择。"}</p>}</div></details>
                      </div>}
                    </article>
                  </li>;
                })}
              </ol>
              {!doc.shots.length && <div className="mb-4 rounded-xl border border-dashed border-[#30363d] px-6 py-12 text-center"><div className="mb-4 flex justify-center text-[#b69aff]"><ScriptIcon width="32" height="32" /></div><h3 className="text-base">故事，从第一个镜头开始</h3><p className="text-sm leading-6 text-[#8b949e]">想好开场的画面，再逐步补充旁白、时长和素材。</p></div>}
              <button onClick={addShot} className="mt-4 w-full cursor-pointer rounded-xl border border-dashed border-[#484f58] py-4 text-sm text-[#8b949e] transition-colors hover:border-[#b69aff] hover:bg-[#b69aff]/5 hover:text-[#d2b9ff] focus-visible:outline-2 focus-visible:outline-[#b69aff]">＋ 添加下一个镜头</button>
              <p aria-live="polite" className="mb-0 mt-4 min-h-5 text-center text-xs text-[#8b949e]">{notice || "镜头顺序代表叙事顺序，实际成片节奏可在剪辑台中调整。"}</p>
              </div>
            </section>
          </div>
        </fieldset>
      </div>
    </main>
  );
}
