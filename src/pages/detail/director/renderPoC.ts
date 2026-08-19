import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { getAssetDir, getAssetSrc, isTauri } from "../../../lib/assets";

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

export interface Poc2Result {
  ok: boolean;
  frames: number;
  /** 平均单帧（视口渲染+离屏渲染+读回）耗时 ms */
  avgFrameMs: number;
  maxFrameMs: number;
  /** 平均纯 render 耗时 ms */
  renderOnlyMs: number;
  /** 平均 toDataURL 读回耗时 ms（每 5 帧采样一次） */
  readbackMs: number;
  /** 循环期间 rAF 最大间隔 ms（主线程被阻塞的上限） */
  uiMaxGapMs: number;
  /** rAF 间隔 >32ms 的长帧数（用户感知卡顿） */
  uiLongFrames: number;
  pngPath?: string;
  error?: string;
}

export interface Poc3Result {
  ok: boolean;
  glbName?: string;
  meshCount?: number;
  replacedMaterials?: number;
  durationMs?: number;
  sizeBytes?: number;
  pngPath?: string;
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

/**
 * PoC 验收点 2（方案 §10）：双渲染器共存 + 连续 20 帧读回 + rAF 采样实测主线程阻塞。
 * 视口渲染器模拟实时视口（与 Orillusion 视口共存等价），离屏渲染器逐帧读回；
 * rAF 间隔采样器量化渲染循环对 UI 的卡顿程度。
 */
export async function runMultiFramePoC(
  projectId: string,
  frames = 20,
  width = 960,
  height = 540,
): Promise<Poc2Result> {
  try {
    // 视口渲染器（模拟实时视口）+ 离屏渲染器（逐帧读回）——共享同一场景/相机
    const viewportRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    viewportRenderer.setSize(width, height);
    const offscreenRenderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true, antialias: true, alpha: false });
    offscreenRenderer.setSize(width, height);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101418);
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(2.5, 1.8, 3.2);
    camera.lookAt(0, 0.2, 0);

    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.05 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), whiteMat);
    box.position.y = 0.2;
    scene.add(box);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f47, 1.6));
    const dir = new THREE.DirectionalLight(0xffffff, 2.2);
    dir.position.set(3, 5, 2);
    scene.add(dir);

    // rAF 间隔采样器：测量主线程被渲染循环阻塞的程度
    const gaps: number[] = [];
    let rafId = 0;
    let last = performance.now();
    const sampler = () => {
      const now = performance.now();
      gaps.push(now - last);
      last = now;
      rafId = requestAnimationFrame(sampler);
    };
    rafId = requestAnimationFrame(sampler);

    const frameMs: number[] = [];
    const renderMs: number[] = [];
    const readbackMs: number[] = [];
    let lastPngPath = "";

    const writePng = async (idx: number) => {
      const dataUrl = offscreenRenderer.domElement.toDataURL("image/png");
      const blob = await (await fetch(dataUrl)).blob();
      if (isTauri()) {
        const baseDir = await getAssetDir();
        if (baseDir) {
          const { mkdir, writeFile } = await import("@tauri-apps/plugin-fs");
          const dir = `${baseDir}/${projectId}/render/poc`;
          await mkdir(dir, { recursive: true });
          const name = `frame-multi-${String(idx).padStart(3, "0")}.png`;
          await writeFile(`${dir}/${name}`, new Uint8Array(await blob.arrayBuffer()));
          lastPngPath = `${projectId}/render/poc/${name}`;
        }
      }
    };

    for (let i = 0; i < frames; i++) {
      box.rotation.y += 0.05;

      const t0 = performance.now();
      viewportRenderer.render(scene, camera);
      const t1 = performance.now();
      offscreenRenderer.render(scene, camera);
      const t2 = performance.now();
      if (i % 5 === 0) await writePng(i); // 每 5 帧写盘一次，readback 耗时单独记录
      const t3 = performance.now();

      renderMs.push(t1 - t0);
      readbackMs.push(i % 5 === 0 ? t3 - t2 : 0);
      frameMs.push(t3 - t0);
    }

    cancelAnimationFrame(rafId);

    viewportRenderer.dispose();
    offscreenRenderer.dispose();
    whiteMat.dispose();
    box.geometry.dispose();

    const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const sampledReadbacks = readbackMs.filter((v) => v > 0);
    return {
      ok: true,
      frames,
      avgFrameMs: Math.round(avg(frameMs) * 10) / 10,
      maxFrameMs: Math.round(Math.max(...frameMs) * 10) / 10,
      renderOnlyMs: Math.round(avg(renderMs) * 10) / 10,
      readbackMs: Math.round(avg(sampledReadbacks) * 10) / 10,
      uiMaxGapMs: Math.round(Math.max(...gaps) * 10) / 10,
      uiLongFrames: gaps.filter((g) => g > 32).length,
      pngPath: lastPngPath,
    };
  } catch (err) {
    return {
      ok: false, frames: 0, avgFrameMs: 0, maxFrameMs: 0,
      renderOnlyMs: 0, readbackMs: 0, uiMaxGapMs: 0, uiLongFrames: 0,
      error: String(err),
    };
  }
}

/**
 * PoC 验收点 3（方案 §10）：Tripo GLB 加载 → 白色 PBR 材质替换 → 渲染一帧。
 * GLB 经 Tauri asset 协议加载（fetch 不支持绝对路径）；Draco 解码器打包在
 * public/draco（离线可用）。取景：包围盒自动 fitView。
 */
export async function runGlbRenderPoC(
  projectId: string,
  width = 1280,
  height = 720,
): Promise<Poc3Result> {
  const t0 = performance.now();
  try {
    const baseDir = await getAssetDir();
    if (!baseDir) return { ok: false, error: "非 Tauri 环境" };

    // 扫描 models 目录找第一个 .glb
    const { readDir } = await import("@tauri-apps/plugin-fs");
    let entries;
    try {
      entries = await readDir(`${baseDir}/${projectId}/models`);
    } catch {
      return { ok: false, error: `未找到 models 目录（${projectId}/models）——先右键图片节点 → 转为3D模型` };
    }
    const glb = entries.find((e) => e.name?.toLowerCase().endsWith(".glb"));
    if (!glb) return { ok: false, error: "models 目录中未找到 .glb 文件" };

    // 加载（Draco 离线解码）
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath("draco/");
    loader.setDRACOLoader(draco);
    const url = await getAssetSrc(`${projectId}/models/${glb.name}`);
    if (!url) return { ok: false, error: "getAssetSrc 返回空 URL（检查 assetProtocol scope）" };
    const gltf = await loader.loadAsync(url);

    // 白色 PBR 材质替换（白模）
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.05 });
    let meshCount = 0;
    let replacedMaterials = 0;
    gltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshCount++;
      if (Array.isArray(mesh.material)) {
        replacedMaterials += mesh.material.length;
        mesh.material = mesh.material.map(() => white);
      } else {
        replacedMaterials++;
        mesh.material = white;
      }
    });

    // 场景与灯光
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101418);
    scene.add(gltf.scene);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f47, 1.6));
    const dir = new THREE.DirectionalLight(0xffffff, 2.2);
    dir.position.set(3, 5, 2);
    scene.add(dir);

    // 包围盒取景（fitView）
    const box3 = new THREE.Box3().setFromObject(gltf.scene);
    const center = box3.getCenter(new THREE.Vector3());
    const size = box3.getSize(new THREE.Vector3()).length();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, size * 10);
    const dist = size / (2 * Math.tan((45 * Math.PI) / 360)) * 1.2;
    camera.position.set(center.x + dist * 0.6, center.y + dist * 0.45, center.z + dist);
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    // 渲染 + 导出
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true, antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(1);
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL("image/png");
    const blob = await (await fetch(dataUrl)).blob();

    let pngPath = "";
    if (isTauri() && baseDir) {
      const { mkdir, writeFile } = await import("@tauri-apps/plugin-fs");
      const dir = `${baseDir}/${projectId}/render/poc`;
      await mkdir(dir, { recursive: true });
      await writeFile(`${dir}/frame-glb-0001.png`, new Uint8Array(await blob.arrayBuffer()));
      pngPath = `${projectId}/render/poc/frame-glb-0001.png`;
    }

    renderer.dispose();
    white.dispose();
    draco.dispose();

    return {
      ok: true,
      glbName: glb.name,
      meshCount,
      replacedMaterials,
      durationMs: Math.round(performance.now() - t0),
      sizeBytes: blob.size,
      pngPath,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
