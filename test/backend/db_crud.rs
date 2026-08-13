/// Integration tests — full CRUD round-trips through the SQLite database.
///
/// Each test uses a temporary database file to avoid touching real user data.
/// The temp file is cleaned up after each test.

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
    // Remove stale file from previous run
    let _ = std::fs::remove_file(&path);
    Database::open_at(&path).expect("open test db")
}

fn teardown(name: &str) {
    let _ = std::fs::remove_file(temp_db_path(name));
}

// ─── Canvas round-trip ───────────────────────────────────────────────

#[test]
fn canvas_save_and_load() {
    let db = setup_db("canvas_rtt");
    let conn = db.conn.lock().unwrap();

    let clip_id = "project-1";
    let node_json = json!({
        "id": "node-001",
        "type": "video-upload",
        "position": { "x": 100.0, "y": 200.0 },
        "data": { "type": "video-upload", "fileUrl": "", "assetPath": "p1/n1/file.mp4" },
        "width": 640.0,
        "height": 360.0,
        "selected": false,
    });
    let edge_json = json!({
        "id": "edge-001",
        "source": "node-001",
        "target": "node-002",
        "sourceHandle": "",
        "targetHandle": "",
    });

    // Insert a node and edge
    conn.execute(
        "INSERT INTO nodes (id, type, pos_x, pos_y, data, width, height, selected, clip_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            node_json["id"].as_str().unwrap(),
            node_json["type"].as_str().unwrap(),
            node_json["position"]["x"].as_f64().unwrap(),
            node_json["position"]["y"].as_f64().unwrap(),
            node_json["data"].to_string(),
            node_json["width"].as_f64(),
            node_json["height"].as_f64(),
            node_json["selected"].as_bool().unwrap(),
            clip_id,
        ],
    )
    .unwrap();

    conn.execute(
        "INSERT INTO edges (id, source, target, source_handle, target_handle, clip_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            edge_json["id"].as_str().unwrap(),
            edge_json["source"].as_str().unwrap(),
            edge_json["target"].as_str().unwrap(),
            edge_json["sourceHandle"].as_str().unwrap_or(""),
            edge_json["targetHandle"].as_str().unwrap_or(""),
            clip_id,
        ],
    )
    .unwrap();

    // Load back
    let node_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM nodes WHERE clip_id = ?1",
            rusqlite::params![clip_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(node_count, 1);

    let edge_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM edges WHERE clip_id = ?1",
            rusqlite::params![clip_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(edge_count, 1);

    // Clear canvas
    conn.execute("DELETE FROM nodes WHERE clip_id = ?1", rusqlite::params![clip_id]).unwrap();
    conn.execute("DELETE FROM edges WHERE clip_id = ?1", rusqlite::params![clip_id]).unwrap();

    let after: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM nodes WHERE clip_id = ?1",
            rusqlite::params![clip_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(after, 0);

    teardown("canvas_rtt");
}

// ─── Clip round-trip ─────────────────────────────────────────────────

#[test]
fn clip_crud_cycle() {
    let db = setup_db("clip_crud");
    let conn = db.conn.lock().unwrap();

    // Create
    let id = "clip-test-1";
    let now = 1700000000000i64;
    conn.execute(
        "INSERT INTO clips (id, title, description, duration, tags, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, "Test Clip", "A test", 30.0, r#"["ai","video"]"#, now],
    )
    .unwrap();

    // Read
    let title: String = conn
        .query_row(
            "SELECT title FROM clips WHERE id = ?1",
            rusqlite::params![id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(title, "Test Clip");

    // Update
    conn.execute(
        "UPDATE clips SET title = ?1 WHERE id = ?2",
        rusqlite::params!["Updated Clip", id],
    )
    .unwrap();

    let updated: String = conn
        .query_row(
            "SELECT title FROM clips WHERE id = ?1",
            rusqlite::params![id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(updated, "Updated Clip");

    // Search (LIKE)
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM clips WHERE LOWER(title) LIKE ?1",
            rusqlite::params!["%updated%"],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(count, 1);

    // Delete
    conn.execute("DELETE FROM clips WHERE id = ?1", rusqlite::params![id])
        .unwrap();

    let remaining: i64 = conn
        .query_row("SELECT COUNT(*) FROM clips WHERE id = ?1", rusqlite::params![id], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(remaining, 0);

    teardown("clip_crud");
}

// ─── Subtitle round-trip ─────────────────────────────────────────────

#[test]
fn subtitle_insert_or_replace() {
    let db = setup_db("subtitle_rtt");
    let conn = db.conn.lock().unwrap();

    let subtitle_id = "sub-001";
    let items_json = json!([
        { "id": "s1", "startTime": 1.2, "endTime": 3.5, "text": "Hello" }
    ]);

    // Insert
    conn.execute(
        "INSERT OR REPLACE INTO subtitles (id, items, language, status, clip_id)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![subtitle_id, items_json.to_string(), "zh", "ready", "project-1"],
    )
    .unwrap();

    // Read back
    let loaded_items: String = conn
        .query_row(
            "SELECT items FROM subtitles WHERE id = ?1",
            rusqlite::params![subtitle_id],
            |r| r.get(0),
        )
        .unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&loaded_items).unwrap();
    assert_eq!(parsed[0]["text"].as_str().unwrap(), "Hello");

    // Replace
    let new_items = json!([{ "id": "s2", "startTime": 5.0, "endTime": 7.0, "text": "World" }]);
    conn.execute(
        "INSERT OR REPLACE INTO subtitles (id, items, language, status, clip_id)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![subtitle_id, new_items.to_string(), "en", "draft", "project-1"],
    )
    .unwrap();

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM subtitles", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 1); // Replaced, not duplicated

    teardown("subtitle_rtt");
}

// ─── Timeline round-trip ─────────────────────────────────────────────

#[test]
fn timeline_save_and_load() {
    let db = setup_db("timeline_rtt");
    let conn = db.conn.lock().unwrap();

    let project_id = "proj-tl-1";
    let data = json!({
        "tracks": [
            {
                "id": "track-1",
                "name": "视频轨",
                "type": "video",
                "clips": [],
                "order": 0
            }
        ],
        "fps": 30
    });
    let now = 1700000000000i64;

    // Save
    conn.execute(
        "INSERT OR REPLACE INTO timelines (project_id, data, updated_at)
         VALUES (?1, ?2, ?3)",
        rusqlite::params![project_id, data.to_string(), now],
    )
    .unwrap();

    // Load
    let loaded_data: String = conn
        .query_row(
            "SELECT data FROM timelines WHERE project_id = ?1",
            rusqlite::params![project_id],
            |r| r.get(0),
        )
        .unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&loaded_data).unwrap();
    assert_eq!(parsed["tracks"][0]["name"].as_str().unwrap(), "视频轨");
    assert_eq!(parsed["fps"].as_i64().unwrap(), 30);

    // Delete
    conn.execute(
        "DELETE FROM timelines WHERE project_id = ?1",
        rusqlite::params![project_id],
    )
    .unwrap();

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM timelines", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 0);

    teardown("timeline_rtt");
}

// ─── Cascade clear canvas ────────────────────────────────────────────

#[test]
fn clear_canvas_removes_nodes_edges_and_subtitles() {
    let db = setup_db("clear_canvas");
    let conn = db.conn.lock().unwrap();
    let clip_id = "proj-clear";

    // Seed nodes, edges, subtitles for this clip
    for table in &["nodes", "edges", "subtitles"] {
        conn.execute(
            &format!(
                "INSERT INTO {} (id, clip_id) VALUES (?1, ?2)",
                table
            ),
            rusqlite::params![format!("rec-{}", table), clip_id],
        )
        .unwrap();
    }

    // Also seed for another clip (should NOT be deleted)
    let other = "proj-other";
    conn.execute(
        "INSERT INTO nodes (id, clip_id) VALUES ('other-node', ?1)",
        rusqlite::params![other],
    )
    .unwrap();

    // Clear the first clip
    conn.execute("DELETE FROM nodes WHERE clip_id = ?1", rusqlite::params![clip_id]).unwrap();
    conn.execute("DELETE FROM edges WHERE clip_id = ?1", rusqlite::params![clip_id]).unwrap();
    conn.execute(
        "DELETE FROM subtitles WHERE clip_id = ?1",
        rusqlite::params![clip_id],
    )
    .unwrap();

    // First clip's records should be gone
    for table in &["nodes", "edges", "subtitles"] {
        let count: i64 = conn
            .query_row(
                &format!("SELECT COUNT(*) FROM {} WHERE clip_id = ?1", table),
                rusqlite::params![clip_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0, "table {} should be empty for cleared clip", table);
    }

    // Other clip's records should remain
    let other_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM nodes WHERE clip_id = ?1",
            rusqlite::params![other],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(other_count, 1);

    teardown("clear_canvas");
}
