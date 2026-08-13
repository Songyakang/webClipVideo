/// 画布增量保存的 SQL 语义测试
///
/// 测试 upsert_nodes / delete_nodes / upsert_edges / delete_edges
/// （增量保存的底层实现，被 db_upsert_canvas_* / db_delete_canvas_* 命令调用）

use editor_tarui_lib::commands::db::{delete_edges, delete_nodes, upsert_edges, upsert_nodes, CanvasEdgeInput, CanvasNodeInput};
use editor_tarui_lib::db::Database;
use serde_json::json;
use std::path::PathBuf;

fn temp_db_path(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join("editor-tarui-tests");
    std::fs::create_dir_all(&dir).ok();
    dir.join(format!("{}.db", name))
}

fn setup_db(name: &str) -> Database {
    let path = temp_db_path(name);
    let _ = std::fs::remove_file(&path);
    Database::open_at(&path).expect("open test db")
}

fn teardown(name: &str) {
    let _ = std::fs::remove_file(temp_db_path(name));
}

fn make_node(id: &str, x: f64, y: f64, data: serde_json::Value) -> CanvasNodeInput {
    CanvasNodeInput {
        id: id.to_string(),
        node_type: Some("text".to_string()),
        position: Some(editor_tarui_lib::commands::db::PositionInput { x, y }),
        data: Some(data),
        width: Some(680.0),
        height: Some(400.0),
        selected: Some(false),
    }
}

fn make_edge(id: &str, source: &str, target: &str) -> CanvasEdgeInput {
    CanvasEdgeInput {
        id: id.to_string(),
        source: source.to_string(),
        target: target.to_string(),
        source_handle: None,
        target_handle: None,
    }
}

fn count_nodes(db: &Database, clip_id: &str) -> i64 {
    let conn = db.conn.lock().unwrap();
    conn.query_row(
        "SELECT COUNT(*) FROM nodes WHERE clip_id = ?1",
        rusqlite::params![clip_id],
        |r| r.get(0),
    )
    .unwrap()
}

fn get_node_data(db: &Database, clip_id: &str, id: &str) -> Option<String> {
    let conn = db.conn.lock().unwrap();
    conn.query_row(
        "SELECT data FROM nodes WHERE clip_id = ?1 AND id = ?2",
        rusqlite::params![clip_id, id],
        |r| r.get(0),
    )
    .ok()
}

fn count_edges(db: &Database, clip_id: &str) -> i64 {
    let conn = db.conn.lock().unwrap();
    conn.query_row(
        "SELECT COUNT(*) FROM edges WHERE clip_id = ?1",
        rusqlite::params![clip_id],
        |r| r.get(0),
    )
    .unwrap()
}

#[test]
fn upsert_inserts_new_nodes() {
    let db = setup_db("inc_upsert_new");
    {
        let mut conn = db.conn.lock().unwrap();
        let nodes = vec![
            make_node("n1", 0.0, 0.0, json!({ "content": "a" })),
            make_node("n2", 100.0, 0.0, json!({ "content": "b" })),
        ];
        upsert_nodes(&mut conn, "clip-1", &nodes).expect("upsert");
    }
    assert_eq!(count_nodes(&db, "clip-1"), 2);
    teardown("inc_upsert_new");
}

#[test]
fn upsert_replaces_existing_node() {
    let db = setup_db("inc_upsert_replace");
    {
        let mut conn = db.conn.lock().unwrap();
        let nodes = vec![make_node("n1", 0.0, 0.0, json!({ "content": "v1" }))];
        upsert_nodes(&mut conn, "clip-1", &nodes).expect("first");
    }
    assert_eq!(
        get_node_data(&db, "clip-1", "n1").unwrap(),
        json!({ "content": "v1" }).to_string()
    );
    {
        let mut conn = db.conn.lock().unwrap();
        let nodes = vec![make_node("n1", 42.0, 42.0, json!({ "content": "v2" }))];
        upsert_nodes(&mut conn, "clip-1", &nodes).expect("second");
    }
    // 替换而非新增
    assert_eq!(count_nodes(&db, "clip-1"), 1);
    assert_eq!(
        get_node_data(&db, "clip-1", "n1").unwrap(),
        json!({ "content": "v2" }).to_string()
    );
    teardown("inc_upsert_replace");
}

#[test]
fn delete_nodes_removes_only_listed_ids() {
    let db = setup_db("inc_delete_nodes");
    {
        let mut conn = db.conn.lock().unwrap();
        let nodes = vec![
            make_node("n1", 0.0, 0.0, json!({})),
            make_node("n2", 0.0, 0.0, json!({})),
            make_node("n3", 0.0, 0.0, json!({})),
        ];
        upsert_nodes(&mut conn, "clip-1", &nodes).expect("upsert");
    }
    {
        let conn = db.conn.lock().unwrap();
        delete_nodes(&conn, "clip-1", &["n1".to_string(), "n3".to_string()]).expect("delete");
    }
    assert_eq!(count_nodes(&db, "clip-1"), 1);
    assert!(get_node_data(&db, "clip-1", "n2").is_some());
    assert!(get_node_data(&db, "clip-1", "n1").is_none());
    teardown("inc_delete_nodes");
}

#[test]
fn delete_nodes_only_affects_matching_clip() {
    let db = setup_db("inc_delete_clip");
    {
        let mut conn = db.conn.lock().unwrap();
        upsert_nodes(&mut conn, "clip-1", &[make_node("n1", 0.0, 0.0, json!({}))]).expect("c1");
        upsert_nodes(&mut conn, "clip-2", &[make_node("n1", 0.0, 0.0, json!({}))]).expect("c2");
    }
    {
        let conn = db.conn.lock().unwrap();
        delete_nodes(&conn, "clip-1", &["n1".to_string()]).expect("delete");
    }
    // 同 id 但不同 clip 的节点不受影响
    assert_eq!(count_nodes(&db, "clip-1"), 0);
    assert_eq!(count_nodes(&db, "clip-2"), 1);
    teardown("inc_delete_clip");
}

#[test]
fn delete_nodes_chunks_large_batches() {
    let db = setup_db("inc_delete_chunk");
    let ids: Vec<String> = (0..1200).map(|i| format!("node-{}", i)).collect();
    {
        let mut conn = db.conn.lock().unwrap();
        let nodes: Vec<CanvasNodeInput> = ids
            .iter()
            .map(|id| make_node(id, 0.0, 0.0, json!({})))
            .collect();
        upsert_nodes(&mut conn, "clip-1", &nodes).expect("upsert 1200");
    }
    {
        let conn = db.conn.lock().unwrap();
        delete_nodes(&conn, "clip-1", &ids).expect("delete 1200");
    }
    assert_eq!(count_nodes(&db, "clip-1"), 0);
    teardown("inc_delete_chunk");
}

#[test]
fn edges_upsert_and_delete_round_trip() {
    let db = setup_db("inc_edges");
    {
        let mut conn = db.conn.lock().unwrap();
        let edges = vec![
            make_edge("e1", "n1", "n2"),
            make_edge("e2", "n2", "n3"),
        ];
        upsert_edges(&mut conn, "clip-1", &edges).expect("upsert");
    }
    assert_eq!(count_edges(&db, "clip-1"), 2);
    {
        let mut conn = db.conn.lock().unwrap();
        // 替换 e1 的 target
        upsert_edges(&mut conn, "clip-1", &[make_edge("e1", "n1", "n3")]).expect("replace");
    }
    assert_eq!(count_edges(&db, "clip-1"), 2);
    {
        let conn = db.conn.lock().unwrap();
        delete_edges(&conn, "clip-1", &["e2".to_string()]).expect("delete");
    }
    assert_eq!(count_edges(&db, "clip-1"), 1);
    teardown("inc_edges");
}
