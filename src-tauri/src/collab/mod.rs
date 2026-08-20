//! 宿主内嵌协作中继（方案 v2 §8）：axum WebSocket + yrs（Yjs Rust 实现）。
//! 服务端不感知画布业务，只做四件事：接入与房间、同步中继、updates 落盘（P0 内存态）、资产服务（后续）。
//! 协议对齐 y-websocket（前端用官方 y-websocket 包直连）。

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use tokio::sync::{broadcast, oneshot, RwLock};
use yrs::{Doc, ReadTxn, StateVector, Transact, Update};
use yrs::updates::decoder::Decode;

// ---- y-websocket 协议常量 ----
const MSG_SYNC: u64 = 0;
const SYNC_UPDATE: u64 = 0; // 常规 update
const SYNC_STEP1: u64 = 1; // sync1：缺失 updates（服务端 → 客户端）
const SYNC_STEP2: u64 = 2; // sync2：state vector（客户端 → 服务端）

/// 广播给房间成员的消息（区分帧类型）
#[derive(Clone, Debug)]
enum RelayMsg {
    Binary(Vec<u8>),
    Text(String),
}

pub struct Room {
    doc: Mutex<Doc>,
    tx: broadcast::Sender<RelayMsg>,
}

impl Room {
    fn new() -> Arc<Self> {
        let doc = Doc::new();
        let (tx, _) = broadcast::channel(256);
        Arc::new(Self { doc: Mutex::new(doc), tx })
    }
}

/// 管理态：当前运行的协作服务（None = 未发起协作）
#[derive(Default)]
pub struct CollabState {
    inner: tokio::sync::Mutex<Option<RunningServer>>,
}

struct RunningServer {
    code: String,
    port: u16,
    // 持有房间表引用以维持生命周期（axum State 亦持有 clone）
    #[allow(dead_code)]
    rooms: Arc<RwLock<HashMap<String, Arc<Room>>>>,
    shutdown: Option<oneshot::Sender<()>>,
}

#[derive(Serialize, Clone)]
pub struct CollabStartInfo {
    pub code: String,
    pub port: u16,
}

// ---- 协议编解码 ----

fn read_var_uint(buf: &[u8]) -> Option<(u64, usize)> {
    let mut value: u64 = 0;
    let mut shift = 0u32;
    let mut i = 0;
    while i < buf.len() {
        let b = buf[i];
        value |= ((b & 0x7f) as u64) << shift;
        i += 1;
        if b & 0x80 == 0 {
            return Some((value, i));
        }
        shift += 7;
    }
    None
}

fn write_var_uint(buf: &mut Vec<u8>, mut v: u64) {
    loop {
        let b = (v & 0x7f) as u8;
        v >>= 7;
        if v == 0 {
            buf.push(b);
            break;
        }
        buf.push(b | 0x80);
    }
}

/// [Sync, subtype, len-prefixed payload]
fn encode_sync(subtype: u64, payload: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(payload.len() + 16);
    write_var_uint(&mut out, MSG_SYNC);
    write_var_uint(&mut out, subtype);
    write_var_uint(&mut out, payload.len() as u64);
    out.extend_from_slice(payload);
    out
}

fn encode_update(update: &[u8]) -> Vec<u8> {
    encode_sync(SYNC_UPDATE, update)
}

fn decode_sync(data: &[u8]) -> Option<(u64, &[u8])> {
    let (subtype, n1) = read_var_uint(data)?;
    let rest = &data[n1..];
    let (len, n2) = read_var_uint(rest)?;
    let payload = rest.get(n2..n2 + len as usize)?;
    Some((subtype, payload))
}

/// 邀请码：3 字母 + 3 数字（去易混字符），时间+线性同余生成，无需 rand 依赖
fn generate_code() -> String {
    const ALPHA: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ";
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let mut v = nanos ^ (nanos >> 17) ^ (nanos >> 31);
    let mut code = String::with_capacity(7);
    for _ in 0..3 {
        code.push(ALPHA[(v % ALPHA.len() as u64) as usize] as char);
        v = v.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    }
    code.push('-');
    for _ in 0..3 {
        code.push(char::from(b'0' + ((v >> 33) % 10) as u8));
        v = v.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    }
    code
}

// ---- HTTP/WS 路由 ----

async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(room_id): Path<String>,
    Query(params): Query<HashMap<String, String>>,
    State(rooms): State<Arc<RwLock<HashMap<String, Arc<Room>>>>>,
) -> impl IntoResponse {
    // P0：邀请码即凭证（token == room_id）；宿主审批留待 P2
    let token_ok = params.get("token").map(|t| t == &room_id).unwrap_or(false);
    let room = rooms.read().await.get(&room_id).cloned();
    if !token_ok || room.is_none() {
        return (StatusCode::FORBIDDEN, "invalid room or token").into_response();
    }
    ws.on_upgrade(move |socket| handle_socket(socket, room.unwrap()))
}

async fn handle_socket(socket: WebSocket, room: Arc<Room>) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = room.tx.subscribe();

    // 单循环同时处理广播转发与接收：sync1 回复与广播共用同一 sender
    loop {
        tokio::select! {
            broadcast_msg = rx.recv() => {
                match broadcast_msg {
                    Ok(RelayMsg::Binary(bytes)) => {
                        if sender.send(Message::Binary(bytes.into())).await.is_err() { break; }
                    }
                    Ok(RelayMsg::Text(text)) => {
                        if sender.send(Message::Text(text.into())).await.is_err() { break; }
                    }
                    Err(_) => break, // 房间销毁
                }
            }
            recv = receiver.next() => {
                let Some(Ok(msg)) = recv else { break };
                match msg {
                    Message::Binary(data) => {
                        let Some((msg_type, _)) = read_var_uint(&data) else { continue };
                        if msg_type != MSG_SYNC { continue; }
                        let Some((subtype, payload)) = decode_sync(&data[1..]) else { continue };
                        match subtype {
                            SYNC_UPDATE => {
                                // 应用 update 成功后显式广播原字节（含自己，客户端会去重）。
                                // P0 更新入口仅客户端消息，显式广播与 observer 语义等价且线程安全。
                                if let Ok(update) = Update::decode_v1(payload) {
                                    let applied = {
                                        let doc = room.doc.lock().unwrap();
                                        let mut txn = doc.transact_mut();
                                        txn.apply_update(update).is_ok()
                                    };
                                    if applied {
                                        let _ = room.tx.send(RelayMsg::Binary(encode_update(payload)));
                                    }
                                }
                            }
                            SYNC_STEP2 => {
                                // 客户端发来 state vector：回发缺失部分（sync1，仅此 socket）
                                let reply = {
                                    let doc = room.doc.lock().unwrap();
                                    let txn = doc.transact();
                                    match StateVector::decode_v1(payload) {
                                        Ok(sv) => Some(txn.encode_state_as_update_v1(&sv)),
                                        Err(_) => None,
                                    }
                                };
                                if let Some(bytes) = reply {
                                    if sender.send(Message::Binary(encode_sync(SYNC_STEP1, &bytes).into())).await.is_err() {
                                        break;
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                    Message::Text(text) => {
                        // presence：只转发给其他成员，不落盘
                        let _ = room.tx.send(RelayMsg::Text(text.to_string()));
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }
        }
    }
}

// ---- Tauri 命令 ----

#[tauri::command]
pub async fn collab_start(
    state: tauri::State<'_, CollabState>,
) -> Result<CollabStartInfo, String> {
    let mut guard = state.inner.lock().await;
    if guard.is_some() {
        return Err("协作服务已在运行".into());
    }

    let code = generate_code();
    let rooms: Arc<RwLock<HashMap<String, Arc<Room>>>> = Arc::default();
    let room = Room::new();
    rooms.write().await.insert(code.clone(), room);

    let rooms_axum = rooms.clone();
    let app = Router::new()
        .route("/ws/{room_id}", get(ws_handler))
        .route("/health", get(|| async { "ok" }))
        .with_state(rooms_axum);

    // 默认端口 48662，被占用则随机回退（实际端口随状态返回）
    let listener = match tokio::net::TcpListener::bind(("0.0.0.0", 48662)).await {
        Ok(l) => l,
        Err(_) => tokio::net::TcpListener::bind(("0.0.0.0", 0))
            .await
            .map_err(|e| format!("bind failed: {e}"))?,
    };
    let port = listener.local_addr().map_err(|e| format!("local addr: {e}"))?.port();

    let (tx, rx) = oneshot::channel();
    tokio::spawn(async move {
        let _ = axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = rx.await;
            })
            .await;
    });

    *guard = Some(RunningServer { code: code.clone(), port, rooms, shutdown: Some(tx) });
    Ok(CollabStartInfo { code, port })
}

#[tauri::command]
pub async fn collab_stop(state: tauri::State<'_, CollabState>) -> Result<(), String> {
    let mut guard = state.inner.lock().await;
    if let Some(server) = guard.take() {
        if let Some(tx) = server.shutdown {
            let _ = tx.send(());
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn collab_status(
    state: tauri::State<'_, CollabState>,
) -> Result<Option<CollabStartInfo>, String> {
    let guard = state.inner.lock().await;
    Ok(guard
        .as_ref()
        .map(|s| CollabStartInfo { code: s.code.clone(), port: s.port }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::StreamExt;
    use tokio_tungstenite::connect_async;
    use tokio_tungstenite::tungstenite::Message as WsMessage;
    use yrs::updates::encoder::Encode;
    use yrs::GetString;
    use yrs::Text;

    async fn spawn_test_server() -> (u16, Arc<RwLock<HashMap<String, Arc<Room>>>>) {
        let rooms: Arc<RwLock<HashMap<String, Arc<Room>>>> = Arc::default();
        rooms.write().await.insert("TEST-123".into(), Room::new());
        let app = Router::new()
            .route("/ws/{room_id}", get(ws_handler))
            .with_state(rooms.clone());
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });
        (port, rooms)
    }

    fn url(port: u16, token: &str) -> String {
        format!("ws://127.0.0.1:{port}/ws/TEST-123?token={token}")
    }

    /// 本地 doc 写入文本，返回全量 state update
    fn update_with_text(text: &str) -> Vec<u8> {
        let doc = Doc::new();
        let txt = doc.get_or_insert_text("t");
        {
            let mut txn = doc.transact_mut();
            txt.insert(&mut txn, 0, text);
        }
        let txn = doc.transact();
        txn.encode_state_as_update_v1(&StateVector::default())
    }

    /// 空 state vector 的合法编码（新客户端：从零同步）
    fn empty_state_vector() -> Vec<u8> {
        StateVector::default().encode_v1()
    }

    #[tokio::test]
    async fn empty_room_replies_empty_sync1() {
        let (port, _) = spawn_test_server().await;
        let (mut ws, _) = connect_async(url(port, "TEST-123")).await.unwrap();
        ws.send(WsMessage::Binary(encode_sync(SYNC_STEP2, &empty_state_vector()).into())).await.unwrap();
        let msg = ws.next().await.unwrap().unwrap();
        let WsMessage::Binary(data) = msg else { panic!("expected binary") };
        let (subtype, payload) = decode_sync(&data[1..]).unwrap();
        assert_eq!(subtype, SYNC_STEP1);
        // 空房间：sync1 是合法空 update（v1 编码带 1 字节头，不能断言零长）
        assert!(Update::decode_v1(payload).is_ok());
    }

    #[tokio::test]
    async fn update_reaches_late_joiner() {
        let (port, rooms) = spawn_test_server().await;

        // 客户端 A：sync2 → 收 sync1（空）→ 发一条 update
        let (mut ws_a, _) = connect_async(url(port, "TEST-123")).await.unwrap();
        ws_a.send(WsMessage::Binary(encode_sync(SYNC_STEP2, &empty_state_vector()).into())).await.unwrap();
        let _ = ws_a.next().await; // sync1 空
        let update = update_with_text("hello");
        ws_a.send(WsMessage::Binary(encode_sync(SYNC_UPDATE, &update).into())).await.unwrap();

        // 客户端 B 晚加入：sync2 空 sv → sync1 应含 A 的内容
        let (mut ws_b, _) = connect_async(url(port, "TEST-123")).await.unwrap();
        ws_b.send(WsMessage::Binary(encode_sync(SYNC_STEP2, &empty_state_vector()).into())).await.unwrap();
        let msg = ws_b.next().await.unwrap().unwrap();
        let WsMessage::Binary(data) = msg else { panic!("expected binary") };
        let (subtype, payload) = decode_sync(&data[1..]).unwrap();
        assert_eq!(subtype, SYNC_STEP1);
        assert!(!payload.is_empty());

        // 应用到本地 doc 验证内容
        let doc_b = Doc::new();
        doc_b.transact_mut().apply_update(Update::decode_v1(payload).unwrap()).unwrap();
        let txt = doc_b.get_or_insert_text("t");
        assert_eq!(txt.get_string(&doc_b.transact()), "hello");

        // 服务端房间 doc 亦应有内容
        let room = rooms.read().await.get("TEST-123").unwrap().clone();
        let doc = room.doc.lock().unwrap();
        let txt = doc.get_or_insert_text("t");
        assert_eq!(txt.get_string(&doc.transact()), "hello");
    }

    #[tokio::test]
    async fn bad_token_rejected() {
        let (port, _) = spawn_test_server().await;
        let res = connect_async(url(port, "WRONG")).await;
        assert!(res.is_err(), "错误 token 应被拒绝");
    }
}
