import { isTauri as checkTauri } from "@tauri-apps/api/core";

const ASSET_DIR = "editor-tarui/assets";

let cachedBaseDir: string | null = null;

export function isTauri(): boolean {
  try { return checkTauri(); } catch { return false; }
}

async function ensureAssetDir(): Promise<string | null> {
  if (!isTauri()) return null;
  if (cachedBaseDir) return cachedBaseDir;
  const { documentDir, join } = await import("@tauri-apps/api/path");
  const { mkdir, exists } = await import("@tauri-apps/plugin-fs");
  const base = await documentDir();
  const dir = await join(base, ASSET_DIR);
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  cachedBaseDir = dir;
  return dir;
}

export async function getAssetDir(): Promise<string> {
  if (!isTauri()) return "";
  const baseDir = await ensureAssetDir();
  return baseDir || "";
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
  const { readFile } = await import("@tauri-apps/plugin-fs");
  const fullPath = `${baseDir}/${relativePath}`;
  try {
    const data = await readFile(fullPath);
    const ext = relativePath.split(".").pop()?.toLowerCase() || "bin";
    const mimeMap: Record<string, string> = {
      mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    };
    const blob = new Blob([data], { type: mimeMap[ext] || "application/octet-stream" });
    return URL.createObjectURL(blob);
  } catch {
    return "";
  }
}

export async function resolveAssetPath(relativePath: string): Promise<string> {
  if (!isTauri() || !relativePath) return "";
  const baseDir = await ensureAssetDir();
  if (!baseDir) return "";
  return `${baseDir}/${relativePath}`;
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
