import * as THREE from "three";
import { getAssetDir, isTauri } from "../../../lib/assets";

export interface PocResult {
  ok: boolean;
  /** PNG 相对路径（assets/{projectId}/render/poc/frame-0001.png） */
  pngPath?: string;
  /** 端到端总耗时（ms） */
  durationMs?: number;
  /** render() 单帧耗时（ms） */
  frameMs?: number;
  /** PNG 字节数 */
  sizeBytes?: number;
  /** WebGL 版本（WebGL2/WebGL1） */
  webglVersion?: string;
  error?: string;
}

/**
 * PoC 验收点 1（方案 §10）：three.js 离屏渲染一帧 → toDataURL → PNG 端到端。
 * 验证主路径存亡：preserveDrawingBuffer + toDataURL 在 Tauri WKWebView 中可用性
 * 与单帧耗时。白模先用白色 PBR 盒子占位（M0 替换为 GLB 加载 + 材质覆盖）。
 */
export async function runOffscreenRenderPoC(
  projectId: string,
  width = 1920,
  height = 1080,
): Promise<PocResult> {
  const t0 = performance.now();
  try {
    // 离屏渲染器：canvas 不挂 DOM
    const renderer = new THREE.WebGLRenderer({
      preserveDrawingBuffer: true,
      antialias: true,
      alpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101418);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(2.5, 1.8, 3.2);
    camera.lookAt(0, 0.2, 0);

    // 白模占位：白色 PBR 盒子（M0 后为 GLB 加载 + traverse 材质替换）
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.05 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), whiteMat);
    box.position.y = 0.2;
    scene.add(box);

    // 灯光：半球光 + 平行光
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f47, 1.6));
    const dir = new THREE.DirectionalLight(0xffffff, 2.2);
    dir.position.set(3, 5, 2);
    scene.add(dir);

    const frameT0 = performance.now();
    renderer.render(scene, camera);
    const frameMs = performance.now() - frameT0;

    // 像素导出：成熟截图路径（依赖 preserveDrawingBuffer）
    const dataUrl = renderer.domElement.toDataURL("image/png");
    const blob = await (await fetch(dataUrl)).blob();

    // 写盘：assets/{projectId}/render/poc/frame-0001.png
    let pngPath = "";
    if (isTauri()) {
      const baseDir = await getAssetDir();
      if (baseDir) {
        const { mkdir, writeFile } = await import("@tauri-apps/plugin-fs");
        const dir = `${baseDir}/${projectId}/render/poc`;
        await mkdir(dir, { recursive: true });
        const buf = new Uint8Array(await blob.arrayBuffer());
        await writeFile(`${dir}/frame-0001.png`, buf);
        pngPath = `${projectId}/render/poc/frame-0001.png`;
      }
    }

    // 释放 GPU 资源
    renderer.dispose();
    whiteMat.dispose();
    box.geometry.dispose();

    return {
      ok: true,
      pngPath,
      durationMs: Math.round(performance.now() - t0),
      frameMs: Math.round(frameMs * 10) / 10,
      sizeBytes: blob.size,
      webglVersion: renderer.capabilities.isWebGL2 ? "WebGL2" : "WebGL1",
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
