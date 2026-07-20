import { useEffect, useState } from "react";

/* Minimal WebGPU type declarations — avoids `any` without requiring @webgpu/types */
interface MinimalGPU {
  requestAdapter(): Promise<MinimalGPUAdapter | null>;
}
interface MinimalGPUAdapter {
  readonly info: Record<string, unknown>;
}

interface WebGPUCheckResult {
  supported: boolean;
  adapterInfo?: string;
  error?: string;
}

export default function WebGPUCheck({ children }: { children: React.ReactNode }) {
  const [result, setResult] = useState<WebGPUCheckResult | null>(null);

  useEffect(() => {
    checkWebGPU().then(setResult);
  }, []);

  if (!result) {
    return (
      <div className="webgpu-check-loading">
        <div className="webgpu-spinner" />
        <p>正在检测 WebGPU 支持...</p>
      </div>
    );
  }

  if (!result.supported) {
    return (
      <div className="webgpu-check-error">
        <div className="webgpu-error-icon">!</div>
        <h3>WebGPU 不可用</h3>
        <p>{result.error || "您的浏览器或设备不支持 WebGPU。"}</p>
        <p className="webgpu-error-hint">
          请使用 Chrome 113+、Edge 113+ 或其他支持 WebGPU 的浏览器。
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

async function checkWebGPU(): Promise<WebGPUCheckResult> {
  try {
    const gpu = (navigator as Navigator & { gpu?: MinimalGPU }).gpu;
    if (!gpu) {
      return { supported: false, error: "navigator.gpu 未定义 — 浏览器不支持 WebGPU。" };
    }
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return { supported: false, error: "无法获取 WebGPU 适配器。" };
    }
    const info = adapterInfoString(adapter);
    return { supported: true, adapterInfo: info };
  } catch (err) {
    return { supported: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function adapterInfoString(adapter: MinimalGPUAdapter): string {
  try {
    const info = adapter.info;
    if (info && typeof info === "object") {
      const parts: string[] = [];
      if ("vendor" in info) parts.push(String(info.vendor));
      if ("architecture" in info) parts.push(String(info.architecture));
      if ("device" in info) parts.push(String(info.device));
      if ("description" in info) parts.push(String(info.description));
      return parts.join(" / ") || "未知适配器";
    }
  } catch {
    // ignore
  }
  return "未知适配器";
}
