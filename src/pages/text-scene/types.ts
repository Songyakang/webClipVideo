export type Vec3 = [number, number, number];
export interface SceneTransform { position: Vec3; rotation: Vec3; scale: Vec3 }
export interface ScenePart extends SceneTransform {
  shape: "box" | "sphere" | "cylinder" | "cone";
  color: string;
  metallic?: number | null;
  roughness?: number | null;
  bevel?: number | null;
}
export interface ObjectKeyframe extends SceneTransform { time: number }
export interface SceneObject extends SceneTransform {
  name: string;
  role?: "subject" | "prop" | "architecture";
  parts: ScenePart[];
  keyframes: ObjectKeyframe[];
}
export interface TextScene {
  title: string;
  note: string;
  duration: number;
  background: string;
  camera: { position: Vec3; target: Vec3; keyframes?: import("./camera").CameraKeyframe[] };
  objects: SceneObject[];
}

/** Absolute sampling makes pause, replay and backwards seeking deterministic. */
export function sampleTransform(object: SceneObject, time: number): SceneTransform {
  const keys = object.keyframes;
  if (!keys.length) return object;
  if (time <= keys[0].time) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (time <= b.time) {
      const t = (time - a.time) / (b.time - a.time);
      const mix = (x: Vec3, y: Vec3) => x.map((v, axis) => v + (y[axis] - v) * t) as Vec3;
      return { position: mix(a.position, b.position), rotation: mix(a.rotation, b.rotation), scale: mix(a.scale, b.scale) };
    }
  }
  return keys[keys.length - 1];
}

export interface BlenderResult { jobId: string; modelPath: string; blendPath: string; prefix: string }
export interface BlenderStatus { available: boolean; version: string | null; message: string }
