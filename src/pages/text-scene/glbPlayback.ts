/** Blender's GLB is the source of truth. No scene-plan geometry or motion is used here. */
export interface GlbTrack {
  node: number;
  path: "translation" | "rotation" | "scale";
  times: number[];
  values: number[][];
  interpolation: "LINEAR" | "STEP";
}
interface GlbNode { name?: string; camera?: number }
interface Perspective { yfov: number; znear: number; zfar?: number }
export interface GlbPlayback {
  nodes: GlbNode[];
  camera: { node: number; perspective: Perspective };
  tracks: GlbTrack[];
  duration: number;
}
export function parseGlbPlayback(buffer: ArrayBuffer): GlbPlayback {
  const view = new DataView(buffer);
  if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength) throw new Error("GLB 文件头无效");
  let json: any, binary: DataView | undefined;
  for (let offset = 12; offset < buffer.byteLength;) {
    if (offset + 8 > buffer.byteLength) throw new Error("GLB 数据不完整");
    const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
    offset += 8;
    if (offset + length > buffer.byteLength) throw new Error("GLB 数据不完整");
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, offset, length)));
    if (type === 0x004e4942) binary = new DataView(buffer, offset, length);
    offset += length;
  }
  if (!json?.nodes || !binary) throw new Error("GLB 缺少场景或二进制数据");
  const read = (index: number, width: number): number[][] => {
    const a = json.accessors?.[index], b = json.bufferViews?.[a?.bufferView];
    if (!a || !b || (b.buffer ?? 0) !== 0 || a.componentType !== 5126 || a.sparse || a.type !== ({1:"SCALAR",3:"VEC3",4:"VEC4"} as Record<number,string>)[width]) throw new Error("GLB 动画数据格式不受支持");
    const stride = b.byteStride ?? width * 4, start = (b.byteOffset ?? 0) + (a.byteOffset ?? 0);
    if (!Number.isInteger(a.count) || a.count < 1 || stride < width * 4 || start + (a.count - 1) * stride + width * 4 > binary!.byteLength) throw new Error("GLB 动画数据越界");
    return Array.from({length:a.count}, (_, i) => Array.from({length:width}, (_, j) => {
      const value = binary!.getFloat32(start + i * stride + j * 4, true);
      if (!Number.isFinite(value)) throw new Error("GLB 动画包含无效数字");
      return value;
    }));
  };
  const tracks: GlbTrack[] = [];
  // Blender may emit separate clips per independently animated node.
  // Combine disjoint channels; ambiguous alternate takes must be rejected.
  const targets = new Set<string>();
  for (const animation of json.animations ?? []) for (const channel of animation.channels ?? []) {
    const {node, path} = channel.target;
    if (!["translation","rotation","scale"].includes(path)) throw new Error(`暂不支持 GLB 动画轨道：${path}`);
    if (!json.nodes[node]) throw new Error("GLB 动画引用了不存在的节点");
    const key = `${node}:${path}`;
    if (targets.has(key)) throw new Error("GLB 包含同一物体的多个动作片段，请导出为单一场景动画");
    targets.add(key);
    const sampler = animation.samplers[channel.sampler];
    const interpolation = sampler.interpolation ?? "LINEAR";
    if (!["LINEAR","STEP"].includes(interpolation)) throw new Error("请在 Blender 中将动画烘焙为逐帧关键帧后导出");
    const times = read(sampler.input, 1).map(v => v[0]);
    const values = read(sampler.output, path === "rotation" ? 4 : 3);
    if (times.length !== values.length || times[0] < 0 || times.some((t,i) => i > 0 && t <= times[i-1])) throw new Error("GLB 动画时间序列无效");
    tracks.push({node,path,times,values,interpolation});
  }
  // Blender starts at frame 1. Shift the shared timeline origin, preserving
  // relative timing between object and camera tracks.
  const origin = tracks.length ? Math.min(...tracks.map(t => t.times[0])) : 0;
  for (const track of tracks) track.times = track.times.map(t => t - origin);
  const node = json.nodes.findIndex((n: GlbNode) => n.camera !== undefined);
  const camera = json.cameras?.[json.nodes[node]?.camera];
  if (camera?.type !== "perspective") throw new Error("GLB 未包含可用的透视相机");
  return { nodes: json.nodes, camera:{node,perspective:camera.perspective}, tracks, duration:Math.max(0,...tracks.map(t => t.times[t.times.length-1])) };
}
export function sampleGlbTrack(track: GlbTrack, time: number): number[] {
  const {times,values} = track;
  if (time <= times[0]) return values[0];
  if (time >= times[times.length-1]) return values[values.length-1];
  let lo = 0, hi = times.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] <= time) lo = mid; else hi = mid; }
  if (track.interpolation === "STEP") return values[lo];
  const t = (time-times[lo])/(times[hi]-times[lo]), a=values[lo], b=values[hi];
  if (track.path !== "rotation") return a.map((v,i) => v+(b[i]-v)*t);
  let dot=a.reduce((sum,v,i)=>sum+v*b[i],0), sign=dot<0?-1:1;
  dot=Math.min(1,Math.abs(dot));
  const theta=Math.acos(dot), sine=Math.sin(theta);
  const x=sine>1e-6?Math.sin((1-t)*theta)/sine:1-t;
  const y=(sine>1e-6?Math.sin(t*theta)/sine:t)*sign;
  const result=a.map((v,i)=>v*x+b[i]*y), length=Math.hypot(...result);
  return result.map(v=>v/length);
}
