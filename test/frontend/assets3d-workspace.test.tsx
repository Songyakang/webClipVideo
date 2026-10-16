import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {invoke} from '@tauri-apps/api/core';
import {open} from '@tauri-apps/plugin-dialog';
import AssetLibraryWorkspace from '../../src/pages/AssetLibraryWorkspace';
import {filterAssets,type LibraryState} from '../../src/pages/assets3d/types';
vi.mock('@tauri-apps/api/core',()=>({invoke:vi.fn(),isTauri:()=>true}));
vi.mock('@tauri-apps/plugin-dialog',()=>({open:vi.fn()}));
vi.mock('@tauri-apps/api/webview',()=>({getCurrentWebview:()=>({onDragDropEvent:async()=>()=>{}})}));
vi.mock('../../src/lib/assets',()=>({getAssetSrc:async(p:string)=>'/'+p}));
let state:LibraryState;
beforeEach(()=>{
 vi.clearAllMocks();state={assets:[],jobs:[],directory:'/assets/3d-library'};
 vi.mocked(invoke).mockImplementation(async(cmd,args:any)=>{
  if(cmd==='assets3d_list')return structuredClone(state) as any;
  if(cmd==='assets3d_start'){state.jobs=[{id:'abc',request:args.request,status:'inspected',error:'',report:{collections:['Bench'],dimensions:[1,2,3],missing:[]}}];return 'abc' as any}
  if(cmd==='assets3d_publish')return 'abc' as any;
  if(cmd==='assets3d_scan')return [] as any;
 });
});
afterEach(cleanup);
const setup=()=>render(<MemoryRouter><AssetLibraryWorkspace/></MemoryRouter>);
describe('3D 资产库',()=>{
 it('通过应用选择文件后先检查，不直接发布资产',async()=>{
  vi.mocked(open).mockResolvedValue(['/models/person.glb']);setup();fireEvent.click(screen.getByText('导入 3D 资产'));
  await screen.findByText('person.glb');
  expect(invoke).toHaveBeenCalledWith('assets3d_start',expect.objectContaining({request:expect.objectContaining({path:'/models/person.glb',operation:'inspect'})}));
  expect(invoke).not.toHaveBeenCalledWith('assets3d_publish',expect.anything());
  fireEvent.click(screen.getByText('整理模型并生成预览'));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('assets3d_start',expect.objectContaining({jobId:'abc',request:expect.objectContaining({operation:'prepare'})})));
 });
 it('等待确认的任务须填写名称才入库',async()=>{
  state.jobs=[{id:'abc',status:'awaiting_confirmation',error:'',request:{path:'/models/bench.blend',collection:'',scale:1,rotation:0,ground:true,replacements:{},operation:'prepare'},report:{previewStatus:'unavailable',warnings:['GLB 预览转换失败'],renderStatus:'ready'}}];setup();fireEvent.click(await screen.findByText('bench.blend'));expect(screen.getByText('GLB 预览转换失败')).toBeTruthy();
  fireEvent.click(screen.getByText('确认入库'));await waitFor(()=>expect(invoke).toHaveBeenCalledWith('assets3d_publish',expect.objectContaining({jobId:'abc',details:expect.objectContaining({name:'bench'}),assetId:null})));
 });
 it('显示依赖缺失，保留替代路径并支持重新检查',async()=>{
  state.jobs=[{id:'abc',status:'needs_input',error:'',request:{path:'/x.blend',collection:'',scale:1,rotation:0,ground:true,replacements:{},operation:'inspect'},report:{missing:[{path:'/wood.png',reason:'依赖文件不存在'}]}}];setup();fireEvent.click(await screen.findByText('x.blend'));fireEvent.change(screen.getByLabelText('替代路径 /wood.png'),{target:{value:'/fixed/wood.png'}});fireEvent.click(screen.getByText('重新检查'));await waitFor(()=>expect(invoke).toHaveBeenCalledWith('assets3d_start',expect.objectContaining({request:expect.objectContaining({replacements:{'/wood.png':'/fixed/wood.png'}})})));
 });
 it('搜索组合分类、标签和停用状态',()=>{
  const base={id:'a',name:'长椅',category:'furniture',style:'写实',description:'木制坐板',tags:'户外,bench',source:'',version:'v1',status:'ready',report:{}};
  expect(filterAssets([base],'BENCH','furniture','ready')).toHaveLength(1);
  expect(filterAssets([base],'','character','all')).toHaveLength(0);
  expect(filterAssets([{...base,status:'disabled'}],'木制','all','ready')).toHaveLength(0);
 });
 it('导入失败明确显示，不伪装成功',async()=>{
  vi.mocked(open).mockResolvedValue(['/bad.glb']);vi.mocked(invoke).mockImplementation(async cmd=>{if(cmd==='assets3d_list')return state as any;throw new Error('Blender 不可用')});setup();fireEvent.click(screen.getByText('导入 3D 资产'));expect((await screen.findByRole('alert')).textContent).toContain('Blender 不可用');
 });
});
