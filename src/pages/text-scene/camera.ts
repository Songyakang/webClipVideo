import { Box3, Euler, Matrix4, Ray, Vector3 } from "three";
import type { ScenePart, SceneTransform, TextScene, Vec3 } from "./types";

export interface CameraPose { position: Vec3; target: Vec3 }
export interface CameraKeyframe extends CameraPose { time: number }
export function sampleCamera(camera: TextScene["camera"], time: number): CameraPose {
  const keys = camera.keyframes;
  if (!keys?.length) return camera;
  if (time <= keys[0].time) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (time <= b.time) {
      const t = (time - a.time) / (b.time - a.time);
      const mix = (x: Vec3, y: Vec3) => x.map((v, j) => v + (y[j] - v) * t) as Vec3;
      return { position: mix(a.position, b.position), target: mix(a.target, b.target) };
    }
  }
  return keys[keys.length - 1];
}
function matrix(t: SceneTransform) {
  const m = new Matrix4().makeRotationFromEuler(new Euler(...t.rotation.map(v => v * Math.PI / 180) as Vec3, "XYZ"));
  m.scale(new Vector3(...t.scale));
  m.setPosition(...t.position);
  return m;
}
const unitBox = new Box3(new Vector3(-0.5,-0.5,-0.5), new Vector3(0.5,0.5,0.5));
/** Only architectural solids can be cut away; never hide the person or props. */
export function blocksCamera(part: ScenePart, parent: SceneTransform, camera: CameraPose): boolean {
  if (part.shape !== "box") return false;
  const inverse = matrix(parent).multiply(matrix(part)).invert();
  const eye = new Vector3(...camera.position).applyMatrix4(inverse);
  const target = new Vector3(...camera.target).applyMatrix4(inverse);
  if (unitBox.containsPoint(eye)) return true;
  const distance = eye.distanceTo(target);
  if (distance < 1e-6) return false;
  const ray = new Ray(eye, target.clone().sub(eye).normalize());
  const hit = ray.intersectBox(unitBox, new Vector3());
  return !!hit && eye.distanceTo(hit) < distance - 0.01;
}
export function isArchitecture(object: TextScene["objects"][number]): boolean {
  if (object.role != null) return object.role === "architecture";
  if (/人物|角色|男人|女人|男孩|女孩|person|character|human|家具|沙发|桌|椅|sofa|chair|table/i.test(object.name)) return false;
  return /墙|天花|屋顶|房间|客厅|wall|ceiling|room|roof/i.test(object.name);
}
