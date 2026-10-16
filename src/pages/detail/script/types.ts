export interface ScriptShot {
  id: string;
  title: string;
  description: string;
  duration: number;
  camera: string;
  dialogue: string;
  sound: string;
  prompt: string;
  assetNodeId?: string;
}

export interface ScriptDocument {
  version: 1;
  title: string;
  brief: string;
  source: string;
  targetDuration: number;
  aspectRatio: string;
  shots: ScriptShot[];
}

export function createShot(): ScriptShot {
  return { id: crypto.randomUUID(), title: "", description: "", duration: 5, camera: "", dialogue: "", sound: "", prompt: "" };
}

export function createScript(): ScriptDocument {
  return { version: 1, title: "未命名脚本", brief: "", source: "", targetDuration: 30, aspectRatio: "16:9", shots: [] };
}

export function createExampleScript(): ScriptDocument {
  return {
    ...createScript(),
    title: "把清晨，留给一杯咖啡",
    brief: "一支 30 秒的咖啡店短片。温暖、安静、有生活感，以细节串起清晨的仪式感。",
    source: "城市还没完全醒来，街角的咖啡店已亮起暖灯。\n\n推门而入，咖啡豆落进磨豆机。水流穿过咖啡粉，第一缕香气在晨光中升起。\n\n店员把咖啡轻轻放在窗边。捧起杯子，看着窗外慢慢热闹起来的街道。\n\n旁白：不必急着出发。把清晨，留给一杯咖啡。",
    shots: [
      { ...createShot(), title: "城市醒来之前", duration: 6, camera: "远景 · 缓慢推进", description: "清晨的街角，咖啡店的暖灯透过玻璃窗。街道安静，阳光刚刚落在门前。", dialogue: "城市还没醒来，有些温暖已经准备好了。", sound: "轻微街道环境音，钢琴缓缓进入", prompt: "清晨街角咖啡店，暖色灯光，柔和晨光，安静街道，电影感，远景" },
      { ...createShot(), title: "第一缕香气", duration: 8, camera: "特写 · 固定镜头", description: "咖啡豆落入磨豆机，水流缓缓注入滤杯。镜头停留在蒸汽升起的瞬间。", dialogue: "", sound: "磨豆声、注水声", prompt: "手冲咖啡特写，水流注入滤杯，蒸汽，浅景深，自然晨光" },
      { ...createShot(), title: "慢下来的片刻", duration: 10, camera: "中景 · 轻微横移", description: "店员将咖啡放在窗边的木桌上。一双手捧起杯子，窗外的行人慢慢走过。", dialogue: "不必急着出发。", sound: "杯子轻触木桌，舒缓钢琴", prompt: "窗边木桌，热咖啡，双手捧杯，窗外行人虚化，温暖生活感" },
      { ...createShot(), title: "把清晨留给自己", duration: 6, camera: "特写 · 缓慢拉远", description: "咖啡杯静置在晨光里，画面留出文字空间，结束在温暖的日常细节。", dialogue: "把清晨，留给一杯咖啡。", sound: "音乐渐弱", prompt: "晨光中的咖啡杯，木质桌面，极简构图，文字留白，暖色调" },
    ],
  };
}
