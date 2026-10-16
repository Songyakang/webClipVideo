export interface AssetDetails { name:string; category:string; style:string; description:string; tags:string; source:string; capabilities?:string[] }
export interface ImportRequest {path:string;collection:string;scale:number;rotation:number;ground:boolean;operation:"inspect"|"prepare";replacements:Record<string,string>}
export interface AssetReport {collections?:string[];missing?:{path:string;reason:string}[];warnings?:string[];dimensions?:number[];meshes?:number;vertices?:number;armatures?:number;animations?:{name:string;duration:number}[];thumbnailPath?:string;previewPath?:string;preparedPath?:string;renderStatus?:string;previewStatus?:string;fingerprint?:string;assetId?:string}
export interface AssetRecord extends AssetDetails {id:string;version:string;status:string;report:AssetReport}
export interface ImportJob {id:string;status:string;error:string;request:ImportRequest;report:AssetReport}
export interface LibraryState {assets:AssetRecord[];jobs:ImportJob[];directory:string}
export const categories=[{value:"character",label:"人物"},{value:"building",label:"建筑"},{value:"furniture",label:"家具"},{value:"plant",label:"植物"},{value:"vehicle",label:"交通工具"},{value:"prop",label:"道具"},{value:"other",label:"其他"}];
export const statuses:Record<string,string>={queued:"等待处理",processing:"正在解析 / 整理",inspected:"待确认导入内容",needs_input:"需要补全依赖",awaiting_confirmation:"待确认入库",publishing:"等待恢复发布",completed:"已入库",failed:"导入失败",cancelled:"已取消",interrupted:"上次任务中断",ready:"可使用",disabled:"已停用",missing:"文件缺失"};
export const emptyDetails:AssetDetails={name:"",category:"other",style:"未指定",description:"",tags:"",source:""};
export function filterAssets(assets:AssetRecord[],search:string,category:string,availability:string) {
 const query=search.trim().toLocaleLowerCase();
 return assets.filter(a=>(category==="all"||a.category===category)&&(availability==="all"||a.status===availability)&&[a.name,a.description,a.tags,a.style,categories.find(c=>c.value===a.category)?.label].join(" ").toLocaleLowerCase().includes(query));
}
