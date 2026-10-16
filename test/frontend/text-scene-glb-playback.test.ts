import { describe, expect, it } from "vitest";
import { parseGlbPlayback, sampleGlbTrack, type GlbTrack } from "../../src/pages/text-scene/glbPlayback";
function fixture(origin=0) {
  const data = new Float32Array([origin,8+origin,0,1.6,3,0,4,10]);
  const json = {nodes:[{name:"arbitrary-camera",camera:0}],cameras:[{type:"perspective",perspective:{yfov:Math.PI/4,znear:0.1}}],buffers:[{byteLength:data.byteLength}],bufferViews:[{buffer:0,byteOffset:0,byteLength:8},{buffer:0,byteOffset:8,byteLength:24}],accessors:[{bufferView:0,componentType:5126,count:2,type:"SCALAR"},{bufferView:1,componentType:5126,count:2,type:"VEC3"}],animations:[{samplers:[{input:0,output:1}],channels:[{sampler:0,target:{node:0,path:"translation"}}]}]};
  const encoded = new TextEncoder().encode(JSON.stringify(json)), length=Math.ceil(encoded.length/4)*4;
  const buffer=new ArrayBuffer(28+length+data.byteLength), v=new DataView(buffer);
  v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,buffer.byteLength,true);
  v.setUint32(12,length,true);v.setUint32(16,0x4e4f534a,true);
  new Uint8Array(buffer,20,length).fill(32);new Uint8Array(buffer,20,encoded.length).set(encoded);
  v.setUint32(20+length,data.byteLength,true);v.setUint32(24+length,0x004e4942,true);
  new Uint8Array(buffer,28+length).set(new Uint8Array(data.buffer));return buffer;
}
describe("Blender GLB 动画（不依赖场景 JSON 或语义名称）",()=>{
  it("读取镜头、8 秒时长，支持前进、倒退跳转和终点停留",()=>{
    const p=parseGlbPlayback(fixture()); expect(p.duration).toBe(8);expect(p.camera.node).toBe(0);
    expect(sampleGlbTrack(p.tracks[0],8)).toEqual([0,4,10]);
    expect(sampleGlbTrack(p.tracks[0],4)[2]).toBe(6.5);
    expect(sampleGlbTrack(p.tracks[0],0)[2]).toBe(3);
    expect(sampleGlbTrack(p.tracks[0],20)).toEqual([0,4,10]);
  });
  it("将 Blender 帧 1 的偏移归零，同时保留总时长",()=>{
    const p=parseGlbPlayback(fixture(1/24));
    expect(p.tracks[0].times[0]).toBe(0);expect(p.duration).toBeCloseTo(8,5);
  });
  it("四元数插值保持单位长度并走最短弧",()=>{
    const t:GlbTrack={node:0,path:"rotation",times:[0,1],values:[[0,0,0,1],[0,1,0,0]],interpolation:"LINEAR"};
    const q=sampleGlbTrack(t,0.5);expect(q[1]).toBeCloseTo(Math.SQRT1_2);expect(Math.hypot(...q)).toBeCloseTo(1);
    t.values[1]=[0,0,0,-1];expect(sampleGlbTrack(t,0.5)).toEqual([0,0,0,1]);
  });
  it("STEP 保持上一帧；损坏文件应报错",()=>{
    const p=parseGlbPlayback(fixture());p.tracks[0].interpolation="STEP";
    expect(sampleGlbTrack(p.tracks[0],4)[2]).toBe(3);
    expect(()=>parseGlbPlayback(fixture().slice(0,30))).toThrow();
  });
});
