# Asset File Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist uploaded canvas assets (images, videos) as real files under `~/Documents/editor-tarui/assets/` instead of IndexedDB Blobs.

**Architecture:** Add Tauri `plugin-fs` for filesystem access. Create `src/lib/assets.ts` as the asset I/O layer. Update `db.ts` to store relative file paths instead of Blobs. Update `Detail.tsx` upload/load flow to use the new asset service. Keep backwards compatibility by auto-migrating existing IndexedDB Blob data to files on first load.

**Tech Stack:** Tauri v2 + @tauri-apps/plugin-fs + @tauri-apps/api (path) + existing React/TypeScript stack

## Global Constraints

- Asset directory: `~/Documents/editor-tarui/assets/`
- File naming: `<nodeId>/<original-filename>` or `<nodeId>/<uuid>.<ext>`
- Must handle both Tauri (native fs) and browser (fallback to IndexedDB) environments
- Existing IndexedDB blob data auto-migrates on first load

---

### Task 1: Install Tauri plugin-fs

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `package.json`
- Modify: `src-tauri/capabilities/default.json`
- Run: `pnpm install`

**Interfaces:**
- Produces: Tauri `plugin-fs` Rust crate and `@tauri-apps/plugin-fs` npm package available at runtime

- [ ] **Step 1: Add Rust dependency**

In `src-tauri/Cargo.toml`, add under `[dependencies]`:
```toml
tauri-plugin-fs = "2"
```

- [ ] **Step 2: Add npm dependency and install**

```bash
cd /Users/songyakang/Desktop/奇思妙想/webVideoClip
pnpm add @tauri-apps/plugin-fs
```

- [ ] **Step 3: Register plugin in Rust lib**

Read `src-tauri/src/lib.rs` and add the plugin registration:
```rust
tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    // ... existing plugins
```

- [ ] **Step 4: Add filesystem permissions in capabilities**

In `src-tauri/capabilities/default.json`, add to permissions array:
```json
"fs:allow-write-text-file",
"fs:allow-read-text-file",
"fs:allow-exists",
"fs:allow-mkdir",
"fs:allow-read-file",
"fs:allow-write-file",
{
  "identifier": "fs:scope",
  "allow": [
    { "path": "$DOCUMENT/editor-tarui/**" }
  ]
}
```

- [ ] **Step 5: Verify build**

```bash
cd src-tauri && cargo check
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/capabilities/default.json package.json pnpm-lock.yaml
git commit -m "feat: add Tauri plugin-fs for filesystem access"
```

---

### Task 2: Create asset storage service

**Files:**
- Create: `src/lib/assets.ts`

**Interfaces:**
- Produces:
  - `saveAsset(nodeId: string, file: File): Promise<string>` — copies file to assets dir, returns relative path
  - `loadAsset(relativePath: string): Promise<string>` — reads file from assets dir, returns blob URL or asset URL
  - `deleteAsset(nodeId: string): Promise<void>` — removes directory for a node
  - `getAssetDir(): Promise<string>` — returns full asset directory path
  - `isTauri(): boolean` — detects Tauri runtime vs browser

- [ ] **Step 1: Create `src/lib/assets.ts`**

```typescript
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
```

- [ ] **Step 2: Verify type check**

```bash
npx tsc --noEmit --pretty
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/assets.ts
git commit -m "feat: add asset storage service for file persistence"
```

---

### Task 3: Update db.ts to store paths instead of Blobs

**Files:**
- Modify: `src/lib/db.ts`

**Interfaces:**
- Consumes: `saveAsset`, `loadAssetUrl`, `deleteAssetDir` from `assets.ts`
- Produces: Updated `saveCanvas` (stores paths, not Blobs), `loadCanvas` (converts paths to URLs)
- Removes: `STORE_FILES` object store; `fileBlobs` Map from save/load signatures

- [ ] **Step 1: Remove `STORE_FILES` from db.ts**

In `src/lib/db.ts`:
- Delete line `const STORE_FILES = "files";`
- Remove the `STORE_FILES` creation block in `onupgradeneeded`
- Remove file-related logic from `saveCanvas`:
  - Remove `files: Map<string, Blob>` parameter
  - Remove the `STORE_FILES` write section
- Update `saveCanvas` signature:

```typescript
export async function saveCanvas(nodes: Node[], edges: Edge[]) {
  // Keep nodes and edges save logic as-is, remove STORE_FILES section
}
```

- [ ] **Step 2: Update `loadCanvas` to remove Blob restoration**

```typescript
export async function loadCanvas(): Promise<{ nodes: Node[]; edges: Edge[] }> {
  // Remove fileBlobs restoration logic
  // Nodes keep their data.fileUrl which is now a relative path
}
```

- [ ] **Step 3: Remove `fileBlobs` from `clearCanvas`**

Update `clearCanvas` to only clear `STORE_NODES` and `STORE_EDGES`.

- [ ] **Step 4: Verify type check**

```bash
npx tsc --noEmit --pretty
```
Expected: errors in Detail.tsx (will fix in Task 4)

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts
git commit -m "refactor: store asset paths in IndexedDB instead of Blobs"
```

---

### Task 4: Update Detail.tsx upload and load flow

**Files:**
- Modify: `src/pages/detail/Detail.tsx`

**Interfaces:**
- Consumes: `saveAsset`, `loadAssetUrl`, `deleteAssetDir` from `assets.ts`; updated `saveCanvas`/`loadCanvas` from `db.ts`
- Produces: Files persisted to Documents directory on upload; file paths stored in node data; URLs loaded on mount

- [ ] **Step 1: Update imports**

In `Detail.tsx`:
- Add: `import { saveAsset, loadAssetUrl, deleteAssetDir } from "../../lib/assets";`
- Remove: `fileBlobs` ref (line 54)

- [ ] **Step 2: Update `handleFileChange`**

Replace:
```typescript
const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const type = file.type.startsWith("video/") ? "video-upload" : "image-upload";
    const fileUrl = URL.createObjectURL(file);
    const nodeId = addNode(type, uploadPosRef.current.x, uploadPosRef.current.y, fileUrl);
    fileBlobs.current.set(nodeId, file);
    e.target.value = "";
  }, [addNode]);
```

With:
```typescript
const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const type = file.type.startsWith("video/") ? "video-upload" : "image-upload";
    const nodeId = addNode(type, uploadPosRef.current.x, uploadPosRef.current.y, ""); // empty url first
    const path = await saveAsset(nodeId, file);
    // Update node with saved path
    setNodes((prev) => prev.map((n) => n.id === nodeId ? {
      ...n,
      data: { ...n.data, fileUrl: path }
    } : n));
    e.target.value = "";
  }, [addNode, setNodes]);
```

- [ ] **Step 3: Update `addNode` auto-resize**

The `addNode` function's auto-resize uses `fileUrl` to load media. Since `fileUrl` is now a relative path (or empty on initial creation), the auto-resize needs to work with the actual file. Update the auto-resize block:

```typescript
// In addNode, when media node and path is set:
if (fileUrl && isMedia) {
  const url = isTauri() ? await loadAssetUrl(fileUrl) : fileUrl;
  // ... existing resize logic using `url`
}
```

Wait - `addNode` is called before `saveAsset` returns. The node initially has empty fileUrl. After `saveAsset` completes, the node's data.fileUrl is updated via `setNodes`. So the auto-resize needs to happen AFTER the path is set.

Better approach: move auto-resize out of `addNode` and into `handleFileChange` after the node's fileUrl is updated.

In `handleFileChange`, after `setNodes` update:
```typescript
// Trigger auto-resize after path is set
if (type === "video-upload") {
  const v = document.createElement("video");
  const url = await loadAssetUrl(path);
  v.preload = "metadata";
  v.onloadedmetadata = () => {
    const maxW = 700;
    const w = Math.min(maxW, v.videoWidth);
    const h = v.videoWidth ? (v.videoHeight / v.videoWidth) * w : 400;
    setNodes((prev) => prev.map((n) => n.id === nodeId ? {
      ...n, data: { ...n.data, w, h },
      position: { x: n.position.x - w / 2, y: n.position.y - h / 2 }
    } : n));
  };
  v.src = url;
} else {
  const img = new Image();
  const url = await loadAssetUrl(path);
  img.onload = () => {
    const maxW = 700;
    const w = Math.min(maxW, img.naturalWidth);
    const h = (img.naturalHeight / img.naturalWidth) * w;
    setNodes((prev) => prev.map((n) => n.id === nodeId ? {
      ...n, data: { ...n.data, w, h },
      position: { x: n.position.x - w / 2, y: n.position.y - h / 2 }
    } : n));
  };
  img.src = url;
}
```

And simplify `addNode` to remove the auto-resize logic entirely:

```typescript
const addNode = useCallback((type: string, x: number, y: number, fileUrl?: string) => {
    const isMedia = type === "image-upload" || type === "video-upload";
    const id = `node-${++nodeIdCounter}`;
    const newNode: FlowNode = {
      id,
      type: type,
      position: { x, y },
      data: { type, content: "", fileUrl: fileUrl || "", w: isMedia ? undefined : 700, h: isMedia ? undefined : 400 },
    };
    setNodes((prev) => [...prev, newNode]);
    return id;
  }, [setNodes]);
```

- [ ] **Step 4: Update load effect to restore asset URLs**

In the IndexedDB load `useEffect`:
- Remove `fileBlobs.current = data.fileBlobs || new Map();`
- Remove the `URL.createObjectURL(blob)` call
- Instead, after loading nodes, resolve paths to URLs:

```typescript
loadCanvas().then(async (data) => {
  if (loadedRef.current) return;
  const restoredNodes = await Promise.all(data.nodes.map(async (n: any) => {
    const fileUrl: string = n.data?.fileUrl || "";
    if (fileUrl && !fileUrl.startsWith("blob:")) {
      const assetUrl = await loadAssetUrl(fileUrl);
      return { ...n, data: { ...n.data, fileUrl: assetUrl || fileUrl } };
    }
    return n;
  }));
  // ... rest of load logic
});
```

- [ ] **Step 5: Update save effect**

Remove `fileBlobs.current` from `saveCanvas` call:
```typescript
useEffect(() => {
    if (!loadedRef.current) return;
    const timer = setTimeout(() => {
      saveCanvas(nodes as any, edges as any);
    }, 500);
    return () => clearTimeout(timer);
  }, [nodes, edges]);
```

- [ ] **Step 6: Add `deleteAssetDir` call on node deletion**

In `deleteNode`:
```typescript
const deleteNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNode(null);
    deleteAssetDir(nodeId); // fire-and-forget
  }, [setNodes, setEdges]);
```

- [ ] **Step 7: Verify type check**

```bash
npx tsc --noEmit --pretty
```
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/pages/detail/Detail.tsx
git commit -m "feat: persist uploaded assets to Documents directory"
```

---

### Task 5: Handle Tauri vs Browser fallback

**Files:**
- Modify: `src/lib/assets.ts`

**Interfaces:**
- Consumes: `isTauri()` from `assets.ts`
- Produces: Seamless fallback to blob URLs when not in Tauri runtime

- [ ] **Step 1: Verify fallback behavior**

The `saveAsset` and `loadAssetUrl` functions already have `isTauri()` checks with blob URL fallbacks. This is already implemented in Task 2. No additional changes needed.

- [ ] **Step 2: Add cleanup for old blob URLs**

In `Detail.tsx`, the `loadAssetUrl` function converts relative paths to Tauri asset URLs. Old blob URLs (starting with `blob:`) should be ignored — they were temporary and are already revoked.

In the load effect, ensure we don't try to load blob URLs as file paths:

```typescript
const fileUrl: string = n.data?.fileUrl || "";
if (fileUrl && !fileUrl.startsWith("blob:") && !fileUrl.startsWith("http")) {
  // it's a relative path, resolve it
  const assetUrl = await loadAssetUrl(fileUrl);
  return { ...n, data: { ...n.data, fileUrl: assetUrl || fileUrl } };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/detail/Detail.tsx
git commit -m "fix: handle blob URL fallback for non-Tauri environments"
```

---

### Task 6: Remove old video/image nodes CSS references

**Files:**
- Cleanup: Remove any dead CSS rules referencing old node structures (if any)

- [ ] **Step 1: Scan and remove unused CSS**

```bash
grep -rn "canvas-video\|video-play-btn" src/pages/detail/Detail.css
```

If found, remove those rules.

- [ ] **Step 2: Final type check**

```bash
npx tsc --noEmit --pretty
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/pages/detail/Detail.css
git commit -m "chore: remove unused CSS rules"
```
