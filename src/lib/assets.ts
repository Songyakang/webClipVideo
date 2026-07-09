import { isTauri as checkTauri } from "@tauri-apps/api/core";

const ASSET_DIR = "editor-tarui/assets";

export function isTauri(): boolean {
  try { return checkTauri(); } catch { return false; }
}

async function ensureAssetDir(): Promise<string | null> {
  if (!isTauri()) return null;
  const { documentDir } = await import("@tauri-apps/api/path");
  const { mkdir, exists } = await import("@tauri-apps/plugin-fs");
  const base = await documentDir();
  const dir = `${base}${ASSET_DIR}`;
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

export async function saveAsset(nodeId: string, file: File): Promise<string> {
  if (!isTauri()) {
    // Browser fallback: return object URL
    return URL.createObjectURL(file);
  }
  const baseDir = await ensureAssetDir();
  if (!baseDir) return URL.createObjectURL(file);
  const { mkdir } = await import("@tauri-apps/plugin-fs");
  const { writeFile } = await import("@tauri-apps/plugin-fs");
  const nodeDir = `${baseDir}/${nodeId}`;
  await mkdir(nodeDir, { recursive: true });
  const ext = file.name.split(".").pop() || "bin";
  const filename = `${Date.now()}.${ext}`;
  const filePath = `${nodeDir}/${filename}`;
  const buf = await file.arrayBuffer();
  await writeFile(filePath, new Uint8Array(buf));
  return `${nodeId}/${filename}`; // relative path
}

export async function loadAssetUrl(relativePath: string): Promise<string> {
  if (!isTauri() || !relativePath) return "";
  const baseDir = await ensureAssetDir();
  if (!baseDir) return "";
  const { convertFileSrc } = await import("@tauri-apps/api/core");
  const fullPath = `${baseDir}/${relativePath}`;
  return convertFileSrc(fullPath);
}

export async function deleteAssetDir(nodeId: string): Promise<void> {
  if (!isTauri()) return;
  const baseDir = await ensureAssetDir();
  if (!baseDir) return;
  const { remove, exists } = await import("@tauri-apps/plugin-fs");
  const nodeDir = `${baseDir}/${nodeId}`;
  if (await exists(nodeDir)) {
    await remove(nodeDir, { recursive: true });
  }
}
