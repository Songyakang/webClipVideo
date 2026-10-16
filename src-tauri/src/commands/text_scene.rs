use super::llm::{resolve, send};
use serde::{Deserialize, Serialize};
use serde_json::json;

const SYSTEM: &str = r##"根据用户文本生成可直接搭建的 3D 动画场景。只返回 JSON，不能返回代码、资源路径或 URL。
严格按用户内容安排主体、环境、动作顺序，不擅自增加情节。能力范围是几何组合建模、物体变换动画和相机关键帧运动，不支持骨骼、物理模拟、纹理或精细雕刻；用多个几何零件组合出可辨识的简化模型，在 note 中如实说明无法表达的内容。
结构：
{"title":"场景标题","note":"建模说明及必要的简化","duration":8,"background":"#182030","camera":{"position":[8,6,12],"target":[0,1,0],"keyframes":[]},"objects":[{"name":"主体名称","role":"subject","position":[0,0,0],"rotation":[0,0,0],"scale":[1,1,1],"parts":[{"shape":"box","color":"#ee8844","position":[0,0.5,0],"rotation":[0,0,0],"scale":[1,1,1]}],"keyframes":[{"time":0,"position":[0,0,0],"rotation":[0,0,0],"scale":[1,1,1]},{"time":8,"position":[3,0,0],"rotation":[0,180,0],"scale":[1,1,1]}]}]}
约束：
- duration 1~60 秒。title 不超过 80 字，note 不超过 1000 字。
- objects 1~24 个；每个物体 parts 1~32 个；总零件不超过 256 个。name 不超过 80 字。
- 质量目标是比例准确、轮廓清晰的精致低多边形场景。按用户描述拆分结构：人物分开头、躯干、手臂、腿和鞋；长椅分开坐板、靠背和支架。只细化已要求的物体，不增添场景元素。
- parts 可额外指定 metallic（0~1）、roughness（0.04~1）、bevel（0~0.1，米，默认按零件尺寸小幅倒角，0表示锐边）。木材 metallic=0/roughness=0.65，金属 metallic=0.8/roughness=0.3，衣物 roughness=0.9，皮肤 roughness=0.55；根据描述合理选择，不用颜色代替材质。
- shape 只能是 box/sphere/cylinder/cone。标准 box 边长为1，sphere直径1，cylinder/cone直径1高1，均以中心为原点，圆柱/圆锥轴为Y轴。用 scale 控制尺寸。
- Y轴向上，地面Y=0，物体位置和相机坐标在 -100~100；scale 每轴 0.02~50；rotation 是 XYZ 欧拉角，单位度，范围 -3600~3600。所有向量必须是3个有限数字。
- parts 的变换相对于所属物体；物体关键帧是完整的世界变换，物体基础变换必须等于首帧。旋转直接按角度线性插值，360表示一整圈。
- 静态物体 keyframes 为 []；有动作的物体需要 2~16 个关键帧，时间严格递增，首帧 time=0，末帧 time=duration。用中间关键帧表现文本中的运动路径、起落和动作先后；不要给所有主体同一种动作。非动作段保持相同变换。
- 每个物体必须标明 role：subject（人物/主体）、prop（道具）、architecture（墙体/地面/天花板）。人物与房间结构必须是不同物体，不得将人物放进 architecture 物体。
- 房间必须由薄地板和分开的薄墙板组成，禁止用一个实心大立方体代表房间内部空间。门口必须留出真实开口；不要在相机与人物之间放置完整封闭的前墙。相机和整个推进路径必须位于可通行空间内，不得放在墙内或穿过墙。
- camera.keyframes：静止镜头为 []；用户要求推进、拉远、环绕等运镜时必须提供 2~16 个关键帧，每帧为 {"time":0,"position":[0,1.6,5],"target":[0,1.2,0]}，首帧0秒、末帧duration，时间严格递增，基础position/target必须等于首帧。推进通过相机位置逐渐靠近主体实现，不能改成人物移动。人物站立时保持人物静止。
- camera 要能完整看到主要物体和整段动作，position 不能等于 target，避免沿Y轴垂直俯视。颜色必须是 #RRGGBB。
- 环境如地面、房屋、树木也由 objects/parts 表达。只在文本需要时生成。所有字段都必须提供。"##;

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Transform {
    position: [f64; 3],
    rotation: [f64; 3],
    scale: [f64; 3],
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Shape {
    Box,
    Sphere,
    Cylinder,
    Cone,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Part {
    shape: Shape,
    color: String,
    #[serde(default)]
    metallic: Option<f64>,
    #[serde(default)]
    roughness: Option<f64>,
    #[serde(default)]
    bevel: Option<f64>,
    #[serde(flatten)]
    transform: Transform,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Keyframe {
    time: f64,
    #[serde(flatten)]
    transform: Transform,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ObjectRole {
    Subject,
    Prop,
    Architecture,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct SceneObject {
    name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    role: Option<ObjectRole>,
    #[serde(flatten)]
    transform: Transform,
    parts: Vec<Part>,
    keyframes: Vec<Keyframe>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CameraKeyframe {
    time: f64,
    position: [f64; 3],
    target: [f64; 3],
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Camera {
    position: [f64; 3],
    target: [f64; 3],
    #[serde(default)]
    keyframes: Vec<CameraKeyframe>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TextScene {
    title: String,
    note: String,
    duration: f64,
    background: String,
    camera: Camera,
    objects: Vec<SceneObject>,
}

fn bounded(values: &[f64], min: f64, max: f64) -> bool {
    values
        .iter()
        .all(|v| v.is_finite() && *v >= min && *v <= max)
}
fn color(value: &str) -> bool {
    value.len() == 7 && value.starts_with('#') && value[1..].bytes().all(|c| c.is_ascii_hexdigit())
}
fn label(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.chars().count() <= max
}
impl Transform {
    fn valid(&self) -> bool {
        bounded(&self.position, -100., 100.)
            && bounded(&self.rotation, -3600., 3600.)
            && bounded(&self.scale, 0.02, 50.)
    }
}

pub(super) fn parse_scene(content: &str) -> Result<TextScene, String> {
    if content.len() > 200_000 {
        return Err("模型返回的场景过大，请简化描述后重试".into());
    }
    let text = content.trim().trim_start_matches('\u{feff}');
    let text = if let Some(body) = text
        .strip_prefix("```json")
        .or_else(|| text.strip_prefix("```"))
    {
        body.trim()
            .strip_suffix("```")
            .ok_or("场景 JSON 不完整，请重试")?
            .trim()
    } else {
        text
    };
    let scene: TextScene = serde_json::from_str(text)
        .map_err(|_| "模型未返回有效的场景结构，请重新生成".to_string())?;
    if !label(&scene.title, 80)
        || scene.note.chars().count() > 1000
        || !bounded(&[scene.duration], 1., 60.)
        || !color(&scene.background)
    {
        return Err("场景标题、时长或背景颜色无效，请重新生成".into());
    }
    let cam = &scene.camera;
    let valid_pose = |position: &[f64; 3], target: &[f64; 3]| {
        bounded(position, -100., 100.)
            && bounded(target, -100., 100.)
            && (position[0] - target[0]).powi(2) + (position[2] - target[2]).powi(2) >= 0.01
    };
    if !valid_pose(&cam.position, &cam.target) {
        return Err("场景相机位置无效，请重新生成".into());
    }
    let keys = &cam.keyframes;
    if !keys.is_empty()
        && (!(2..=16).contains(&keys.len())
            || keys[0].time != 0.
            || keys.last().unwrap().time != scene.duration
            || keys[0].position != cam.position
            || keys[0].target != cam.target
            || keys.iter().any(|k| {
                !bounded(&[k.time], 0., scene.duration) || !valid_pose(&k.position, &k.target)
            })
            || keys.windows(2).any(|w| {
                if w[0].time >= w[1].time {
                    return true;
                }
                // Reject a look direction that degenerates anywhere during interpolation.
                let a = [
                    w[0].position[0] - w[0].target[0],
                    w[0].position[2] - w[0].target[2],
                ];
                let d = [
                    w[1].position[0] - w[1].target[0] - a[0],
                    w[1].position[2] - w[1].target[2] - a[1],
                ];
                let length = d[0] * d[0] + d[1] * d[1];
                let t = if length > 0. {
                    (-(a[0] * d[0] + a[1] * d[1]) / length).clamp(0., 1.)
                } else {
                    0.
                };
                (a[0] + t * d[0]).powi(2) + (a[1] + t * d[1]).powi(2) < 0.01
            }))
    {
        return Err("镜头关键帧无效：须覆盖完整时长且全程朝向有效目标，请重新生成".into());
    }
    if scene.objects.is_empty()
        || scene.objects.len() > 24
        || scene.objects.iter().map(|o| o.parts.len()).sum::<usize>() > 256
    {
        return Err("场景需要 1 至 24 个物体，且总零件不超过 256 个".into());
    }
    for object in &scene.objects {
        if !label(&object.name, 80)
            || !object.transform.valid()
            || object.parts.is_empty()
            || object.parts.len() > 32
            || object.parts.iter().any(|p| {
                !p.transform.valid()
                    || !color(&p.color)
                    || p.metallic.is_some_and(|v| !bounded(&[v], 0., 1.))
                    || p.roughness.is_some_and(|v| !bounded(&[v], 0.04, 1.))
                    || p.bevel.is_some_and(|v| !bounded(&[v], 0., 0.1))
            })
        {
            return Err("模型返回了无效的物体或几何零件，请重新生成".into());
        }
        let keys = &object.keyframes;
        if keys.is_empty() {
            continue;
        }
        if !(2..=16).contains(&keys.len())
            || keys[0].time != 0.
            || keys.last().unwrap().time != scene.duration
            || keys
                .iter()
                .any(|k| !bounded(&[k.time], 0., scene.duration) || !k.transform.valid())
            || keys.windows(2).any(|w| w[0].time >= w[1].time)
            || keys[0].transform.position != object.transform.position
            || keys[0].transform.rotation != object.transform.rotation
            || keys[0].transform.scale != object.transform.scale
        {
            return Err(
                "动画关键帧无效：须覆盖完整时长、顺序递增且首帧与物体一致，请重新生成".into(),
            );
        }
    }
    Ok(scene)
}

#[tauri::command]
pub async fn generate_text_scene(
    provider: String,
    platform_id: Option<String>,
    request_id: String,
    text: String,
) -> Result<TextScene, String> {
    let text = text.trim();
    if text.is_empty() || text.chars().count() > 4000 {
        return Err("请输入 1 至 4000 字的场景描述".into());
    }
    let mut config = resolve(&provider, platform_id, "chat", None, None)?;
    if !config.params.contains_key("max_tokens")
        && !config.params.contains_key("max_completion_tokens")
    {
        config.params.insert("max_tokens".into(), json!(12000));
    }
    config
        .params
        .entry("temperature".into())
        .or_insert(json!(0.3));
    let content = send(
        config,
        json!([
            {"role":"system","content":SYSTEM},
            {"role":"user","content":text}
        ]),
        false,
        Some(request_id),
    )
    .await?;
    parse_scene(&content)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> serde_json::Value {
        json!({"title":"小球移动","note":"几何建模","duration":4,"background":"#182030",
            "camera":{"position":[6,4,8],"target":[0,0,0]},"objects":[{
                "name":"球","position":[0,1,0],"rotation":[0,0,0],"scale":[1,1,1],
                "parts":[{"shape":"sphere","color":"#ff8800","position":[0,0,0],"rotation":[0,0,0],"scale":[1,1,1]}],
                "keyframes":[{"time":0,"position":[0,1,0],"rotation":[0,0,0],"scale":[1,1,1]},
                    {"time":4,"position":[3,1,0],"rotation":[0,360,0],"scale":[1,1,1]}]}]})
    }
    #[test]
    fn accepts_complete_scene_and_json_fences() {
        let result = parse_scene(&format!("```json\n{}\n```", sample())).unwrap();
        assert_eq!(result.objects[0].keyframes[1].transform.rotation[1], 360.);
        let encoded = serde_json::to_string(&result).unwrap();
        assert!(parse_scene(&encoded).is_ok());
    }
    #[test]
    fn validates_camera_motion_and_legacy_static_camera() {
        let mut scene = sample();
        assert!(parse_scene(&scene.to_string()).is_ok());
        scene["camera"]["keyframes"] = json!([
            {"time":0,"position":[6,4,8],"target":[0,0,0]},
            {"time":4,"position":[3,2,4],"target":[0,0,0]}
        ]);
        assert!(parse_scene(&scene.to_string()).is_ok());
        scene["camera"]["keyframes"][1]["position"] = json!([-6, -4, -8]);
        assert!(parse_scene(&scene.to_string()).is_err());
        scene["camera"]["keyframes"][1]["position"] = json!([3, 2, 4]);
        scene["camera"]["keyframes"][1]["time"] = json!(0);
        assert!(parse_scene(&scene.to_string()).is_err());
    }
    #[test]
    fn validates_material_and_bevel_parameters() {
        let mut scene = sample();
        scene["objects"][0]["parts"][0]["roughness"] = json!(0.55);
        scene["objects"][0]["parts"][0]["metallic"] = json!(0.8);
        scene["objects"][0]["parts"][0]["bevel"] = json!(0.02);
        assert!(parse_scene(&scene.to_string()).is_ok());
        for (field, value) in [("roughness", 0.0), ("metallic", 1.1), ("bevel", -0.1)] {
            let mut invalid = scene.clone();
            invalid["objects"][0]["parts"][0][field] = json!(value);
            assert!(parse_scene(&invalid.to_string()).is_err());
        }
        scene["objects"][0]["parts"] = json!(vec![scene["objects"][0]["parts"][0].clone(); 32]);
        assert!(parse_scene(&scene.to_string()).is_ok());
        scene["objects"][0]["parts"]
            .as_array_mut()
            .unwrap()
            .push(json!({}));
        assert!(parse_scene(&scene.to_string()).is_err());
    }
    #[test]
    fn rejects_unsafe_or_unrenderable_scene_data() {
        for (path, value) in [
            ("/duration", json!(0)),
            ("/camera/position", json!([0, 1, 0])),
            ("/background", json!("red")),
            ("/objects/0/parts/0/shape", json!("javascript")),
            ("/objects/0/parts/0/scale", json!([0, 1, 1])),
            ("/objects/0/position", json!([101, 1, 0])),
            ("/objects/0/keyframes/1/time", json!(0)),
            ("/objects/0/keyframes/1/time", json!(5)),
            ("/objects/0/keyframes/0/position", json!([2, 1, 0])),
            ("/objects", json!([])),
        ] {
            let mut scene = sample();
            *scene.pointer_mut(path).unwrap() = value;
            assert!(parse_scene(&scene.to_string()).is_err(), "accepted {path}");
        }
        let mut scene = sample();
        scene["objects"] = json!(vec![scene["objects"][0].clone(); 25]);
        assert!(parse_scene(&scene.to_string()).is_err());
        assert!(parse_scene("```json\n{}").is_err());
    }
}
