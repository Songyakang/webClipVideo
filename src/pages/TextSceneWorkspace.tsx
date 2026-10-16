import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { errorMessage, platformOptions, platformRequest, useLlmPreference, usePlatforms } from "../lib/platforms";
import { Choice, scriptButton as button } from "./detail/script/ScriptControls";
import ScenePreview from "./text-scene/ScenePreview";
import type { BlenderResult, BlenderStatus, TextScene } from "./text-scene/types";

export default function TextSceneWorkspace() {
  return <main className="mx-auto max-w-[1440px] px-4 py-6">
    <Link to="/experiments" className="text-sm text-[#8b949e] no-underline hover:text-[#e6edf3]">← 返回体验功能</Link>
    <header className="my-6">
      <p className="mb-2 text-xs text-[#d2b9ff]">体验功能 · Blender 本地建模</p>
      <h1 className="m-0 text-2xl font-semibold text-[#e6edf3]">文本生成 3D 动画</h1>
      <p className="mt-3 text-sm leading-6 text-[#8b949e]">描述主体、环境和动作，由本地 Blender 搭建简化模型并生成动画，再加载生成的模型预览。当前支持几何组合、位移/旋转/缩放动画和镜头运动，暂不支持精细雕刻、骨骼动作或物理模拟。</p>
    </header>
    {isTauri() ? <ConnectedWorkspace /> : <section className="rounded-xl border border-[#30363d] bg-[#161b22] p-8 text-sm leading-7 text-[#b1bac4]">
      请在桌面应用中打开此功能，并在设置中配置文本平台。3D 预览需要当前环境支持 WebGPU。
    </section>}
  </main>;
}

function ConnectedWorkspace() {
  const { platforms, error: platformError, retry } = usePlatforms();
  const preference = useLlmPreference("llm-text-scene", "deepseek");
  const options = platformOptions(platforms, "chat");
  const available = options.some(o => o.value === preference.value);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<{ scene: TextScene; source: string; blender: BlenderResult } | null>(null);
  const [connection, setConnection] = useState<BlenderStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [phase, setPhase] = useState<"planning" | "building">("planning");
  const request = useRef<string | null>(null);
  const mounted = useRef(true);
  const settingsError = platformError || preference.error;
  const canGenerate = !!text.trim() && text.length <= 4000 && !busy && preference.loaded && available && !settingsError && connection?.available && !checking;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const id = request.current;
      request.current = null;
      if (id) void invoke("cancel_llm_request", { requestId: id }).catch(() => {});
    };
  }, []);

  const checkConnection = async () => {
    setChecking(true);
    try {
      const next = await invoke<BlenderStatus>("get_blender_status");
      if (mounted.current) setConnection(next);
      return next;
    } catch (reason) {
      const next = { available: false, version: null, message: errorMessage(reason) };
      if (mounted.current) setConnection(next);
      return next;
    } finally { if (mounted.current) setChecking(false); }
  };
  useEffect(() => { void checkConnection(); }, []);

  const generate = async () => {
    if (!canGenerate || request.current) return;
    const id = crypto.randomUUID();
    request.current = id;
    setBusy(true); setPhase("planning"); setError(""); setStatus("");
    try {
      const connected = await checkConnection();
      if (!mounted.current || request.current !== id) return;
      if (!connected.available) throw new Error(connected.message);
      const scene = await invoke<TextScene>("generate_text_scene", { ...platformRequest(preference.value), requestId: id, text: text.trim() });
      if (!mounted.current || request.current !== id) return;
      setPhase("building");
      const blender = await invoke<BlenderResult>("build_blender_scene", { scene });
      if (!mounted.current || request.current !== id) return;
      setResult({ scene, source: text.trim(), blender });
      setStatus("Blender 建模与动画导出完成，点击播放查看。");
    } catch (reason) {
      if (mounted.current && request.current === id) setError(errorMessage(reason));
    } finally {
      if (request.current === id) { request.current = null; if (mounted.current) setBusy(false); }
    }
  };
  const cancel = () => {
    if (phase === "building") return;
    const id = request.current;
    request.current = null; setBusy(false); setStatus("已取消生成。");
    if (id) void invoke("cancel_llm_request", { requestId: id }).catch(() => {
      if (mounted.current && !request.current) setStatus("无法停止远端请求，返回结果将被忽略。");
    });
  };

  return <div className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
    <section aria-label="场景创作" className="space-y-4 rounded-xl border border-[#30363d] bg-[#161b22] p-5">
      <div className="space-y-2 rounded-lg border border-[#30363d] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs ${connection?.available ? "text-[#7ee7b7]" : "text-[#8b949e]"}`}>{checking ? "正在检测 Blender…" : connection?.available ? `Blender ${connection.version || ""} 已连接` : "Blender 未连接"}</span>
          <button className={button} disabled={busy || checking} onClick={() => { void checkConnection(); }}>检测连接</button>
        </div>
        {connection && !connection.available && <p role="alert" className="m-0 text-xs leading-6 text-[#e3b341]">{connection.message}</p>}
      </div>
      <label htmlFor="scene-description" className="block text-sm font-medium text-[#e6edf3]">场景描述</label>
      <textarea id="scene-description" value={text} onChange={e => setText(e.target.value)} disabled={busy} maxLength={4000} rows={9}
        placeholder="例如：草地上有一棵树，一个红色小球从左向右滚动，到树旁停下。动画持续 8 秒。"
        className="w-full resize-y rounded-lg border border-[#30363d] bg-[#0d1117] p-3 text-sm leading-7 text-[#e6edf3] placeholder:text-[#6e7681] focus:border-[#b69aff] focus:outline-none disabled:opacity-60" />
      <p className="m-0 text-right text-xs text-[#8b949e]">{text.length} / 4000</p>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-[#b1bac4]">文本平台 / 模型</span>
        <Choice label="场景生成平台" value={preference.value} options={available ? options : [...options, {value: preference.value, label: "所选平台已不可用，请重新选择"}]} disabled={busy || !preference.loaded} onChange={v => { void preference.save(v); }} />
      </div>
      <Link to="/settings" className="inline-block text-xs text-[#b69aff]">配置文本平台 ↗</Link>
      {settingsError && <p role="alert" className="text-sm text-[#ffaba8]">平台配置加载或保存失败：{settingsError} <button className="underline" onClick={() => { retry(); preference.retry(); }}>重试加载配置</button></p>}
      {!available && <p role="alert" className="text-xs text-[#e3b341]">请选择可用的文本平台。</p>}
      {busy ? <div className="flex items-center justify-between gap-2"><span role="status" className="text-xs text-[#d2b9ff]">{phase === "building" ? "Blender 正在建模、烘焙动画并导出…" : "正在规划场景、模型与动作…"}</span>{phase === "planning" && <button className={button} onClick={cancel}>取消生成</button>}</div>
        : <button className={`${button} w-full !border-[#b69aff]/30 !bg-[#b69aff]/10 !text-[#d2b9ff]`} disabled={!canGenerate} onClick={generate}>{result ? "重新生成场景" : "生成 3D 场景与动画"}</button>}
      {busy && phase === "building" && <p className="text-xs leading-6 text-[#8b949e]">导出期间请保持 Blender 开启。此阶段无法中断；离开页面不会停止 Blender 任务。</p>}
      {error && <p role="alert" className="break-words text-sm leading-6 text-[#ffaba8]">{error}{result ? "。上一版场景已保留。" : ""}</p>}
      {status && <p role="status" className="text-sm leading-6 text-[#b1bac4]">{status}</p>}
      <p className="border-t border-[#30363d] pt-4 text-xs leading-6 text-[#8b949e]">生成时会将描述发送到所选文本平台。单场景最长 60 秒，最多 24 个物体。页面预览离开后清空；Blender 源文件和 GLB 会保存在应用资产目录，生成后可打开输出文件夹。</p>
    </section>
    <div className="min-w-0 space-y-4">
      {result ? <>
        {result.source !== text.trim() && <p className="rounded-lg border border-[#e3b341]/25 p-3 text-sm text-[#e3b341]">描述已修改，当前预览仍对应上一版描述。点击重新生成以更新。</p>}
        <ScenePreview scene={result.scene} blender={result.blender} />
        <section aria-label="生成结果" className="rounded-xl border border-[#30363d] bg-[#161b22] p-5">
          <button className={`${button} mb-3`} onClick={() => {
            void invoke("reveal_blender_output", { jobId: result.blender.jobId }).catch(reason => setError(errorMessage(reason)));
          }}>查看 Blender 源文件与 GLB</button>
          <h2 className="m-0 text-base font-medium text-[#e6edf3]">{result.scene.title}</h2>
          <p className="text-sm leading-6 text-[#b1bac4]">{result.scene.note}</p>
          <p className="text-xs text-[#8b949e]">{result.scene.objects.length} 个物体 · {result.scene.objects.reduce((sum,o) => sum + o.parts.length, 0)} 个几何零件 · {result.scene.objects.filter(o => o.keyframes.length > 0).length} 个动画物体 · {result.scene.duration} 秒 · {result.scene.camera.keyframes?.length ? "动态镜头" : "固定镜头"}</p>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">{result.scene.objects.map((o,i) => <li key={i} className="rounded-md border border-[#30363d] px-2 py-1 text-xs text-[#b1bac4]">{o.name} · {o.keyframes.length ? `${o.keyframes.length} 帧` : "静态"}</li>)}</ul>
        </section>
      </> : <section className="flex min-h-[460px] flex-col items-center justify-center rounded-xl border border-dashed border-[#30363d] bg-[#0d1117] p-10 text-center">
        <span aria-hidden="true" className="mb-5 text-5xl text-[#b69aff]">◇</span>
        <h2 className="m-0 text-lg font-medium text-[#e6edf3]">从一段描述开始搭建</h2>
        <p className="max-w-md text-sm leading-7 text-[#8b949e]">填写想看到的物体和动作。生成后，这里会显示实际 3D 场景，支持播放、暂停与拖动进度。</p>
      </section>}
    </div>
  </div>;
}
