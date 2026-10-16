import { describe, expect, it } from "vitest";
import { blocksCamera, isArchitecture, sampleCamera } from "../../src/pages/text-scene/camera";
import type { ScenePart, SceneTransform } from "../../src/pages/text-scene/types";
const transform: SceneTransform = { position:[0,0,0], rotation:[0,0,0], scale:[1,1,1] };
const wall: ScenePart = { ...transform, shape:"box", color:"#888888", position:[0,1.5,4], scale:[8,3,0.2] };
const camera = { position:[0,1.6,5] as [number,number,number], target:[0,1.2,0] as [number,number,number] };
describe("室内镜头与遮挡", () => {
  it("剖开入口墙，保留人物后方墙体及不遮挡镜头的地板", () => {
    expect(blocksCamera(wall,transform,camera)).toBe(true);
    expect(blocksCamera({...wall,position:[0,1.5,-4]},transform,camera)).toBe(false);
    expect(blocksCamera({...wall,position:[0,-0.1,0],scale:[8,0.2,8]},transform,camera)).toBe(false);
  });
  it("处理相机在实体房间盒子内部以及父对象变换", () => {
    expect(blocksCamera({...wall,position:[0,2,0],scale:[12,4,12]},transform,camera)).toBe(true);
    expect(blocksCamera({...wall,position:[0,0,0]}, {...transform,position:[0,1.5,4]},camera)).toBe(true);
    expect(blocksCamera({...wall,position:[0,1.5,0],rotation:[0,90,0]}, {...transform,position:[0,0,4]},camera)).toBe(true);
  });
  it("只识别建筑结构，不隐藏命名为客厅人物的主体", () => {
    const base={...transform,name:"客厅人物",parts:[wall],keyframes:[]};
    expect(isArchitecture({...base,role:"subject"})).toBe(false);
    expect(isArchitecture(base)).toBe(false);
    expect(isArchitecture({...base,name:"入口墙"})).toBe(true);
    expect(isArchitecture({...base,name:"房间",role:"architecture"})).toBe(true);
  });
  it("推进镜头可暂停、向后拖动及回放，兼容旧固定镜头", () => {
    const moving={...camera,keyframes:[{...camera,time:0},{position:[0,1.6,2] as [number,number,number],target:camera.target,time:6}]};
    expect(sampleCamera(moving,3).position).toEqual([0,1.6,3.5]);
    expect(sampleCamera(moving,6).position).toEqual([0,1.6,2]);
    expect(sampleCamera(moving,0).position).toEqual(camera.position);
    expect(sampleCamera(camera,3)).toEqual(camera);
    // Once the camera is through the entrance, its wall no longer obstructs the shot.
    expect(blocksCamera(wall,transform,sampleCamera(moving,6))).toBe(false);
  });
});
