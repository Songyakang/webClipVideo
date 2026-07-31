/// SQLite database Tauri commands.
///
/// These commands replace the browser IndexedDB layer.
/// Each command maps 1:1 to a function previously in src/lib/db.ts.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

use crate::db::Database;

// ---------------------------------------------------------------------------
// Input types (matching frontend data shapes)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionInput {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasNodeInput {
    id: String,
    #[serde(rename = "type", default)]
    node_type: Option<String>,
    #[serde(default)]
    position: Option<PositionInput>,
    #[serde(default)]
    data: Option<Value>,
    #[serde(default)]
    width: Option<f64>,
    #[serde(default)]
    height: Option<f64>,
    #[serde(default)]
    selected: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasEdgeInput {
    id: String,
    source: String,
    target: String,
    #[serde(default)]
    source_handle: Option<String>,
    #[serde(default)]
    target_handle: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasLoadResult {
    nodes: Vec<Value>,
    edges: Vec<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipInput {
    id: String,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    thumbnail: Option<String>,
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    tags: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipOutput {
    id: String,
    title: String,
    description: String,
    url: String,
    thumbnail: String,
    duration: f64,
    tags: Vec<String>,
    #[serde(rename = "createdAt")]
    created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipUpdateInput {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    thumbnail: Option<String>,
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleInput {
    id: String,
    #[serde(default)]
    items: Option<Value>,
    #[serde(default)]
    language: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    clip_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineInput {
    #[serde(rename = "projectId")]
    project_id: String,
    data: Value,
    #[serde(rename = "updatedAt")]
    updated_at: i64,
}

// ---------------------------------------------------------------------------
// Helper: build a clip JSON object from a row
// ---------------------------------------------------------------------------

fn row_to_clip(row: &rusqlite::Row) -> rusqlite::Result<ClipOutput> {
    let tags_str: String = row.get("tags")?;
    let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
    Ok(ClipOutput {
        id: row.get("id")?,
        title: row.get("title")?,
        description: row.get("description")?,
        url: row.get("url")?,
        thumbnail: row.get("thumbnail")?,
        duration: row.get("duration")?,
        tags,
        created_at: row.get("created_at")?,
    })
}

// ---------------------------------------------------------------------------
// Canvas commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn db_save_canvas(
    db: State<Database>,
    clip_id: String,
    nodes: Vec<CanvasNodeInput>,
    edges: Vec<CanvasEdgeInput>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("lock: {}", e))?;

    // Delete existing records for this clip
    conn.execute("DELETE FROM nodes WHERE clip_id = ?1", rusqlite::params![clip_id])
        .map_err(|e| format!("delete nodes: {}", e))?;
    conn.execute(
        "DELETE FROM edges WHERE clip_id = ?1",
        rusqlite::params![clip_id],
    )
    .map_err(|e| format!("delete edges: {}", e))?;

    // Insert nodes
    for n in &nodes {
        let pos_x = n.position.as_ref().map_or(0.0, |p| p.x);
        let pos_y = n.position.as_ref().map_or(0.0, |p| p.y);
        let data_json = n
            .data
            .as_ref()
            .map_or_else(|| "{}".to_string(), |v| v.to_string());
        conn.execute(
            "INSERT INTO nodes (id, type, pos_x, pos_y, data, width, height, selected, clip_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                n.id,
                n.node_type.as_deref().unwrap_or("text"),
                pos_x,
                pos_y,
                data_json,
                n.width,
                n.height,
                n.selected.unwrap_or(false),
                clip_id,
            ],
        )
        .map_err(|e| format!("insert node {}: {}", n.id, e))?;
    }

    // Insert edges
    for e in &edges {
        conn.execute(
            "INSERT INTO edges (id, source, target, source_handle, target_handle, clip_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                e.id,
                e.source,
                e.target,
                e.source_handle.as_deref().unwrap_or(""),
                e.target_handle.as_deref().unwrap_or(""),
                clip_id,
            ],
        )
        .map_err(|e| format!("insert edge: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn db_load_canvas(
    db: State<Database>,
    clip_id: String,
) -> Result<CanvasLoadResult, String> {
    let conn = db.conn.lock().map_err(|e| format!("lock: {}", e))?;

    // Load nodes
    let mut stmt = conn
        .prepare("SELECT id, type, pos_x, pos_y, data, width, height, selected FROM nodes WHERE clip_id = ?1")
        .map_err(|e| format!("prepare: {}", e))?;

    let nodes: Vec<Value> = stmt
        .query_map(rusqlite::params![clip_id], |row| {
            let id: String = row.get("id")?;
            let node_type: String = row.get("type")?;
            let pos_x: f64 = row.get("pos_x")?;
            let pos_y: f64 = row.get("pos_y")?;
            let data_str: String = row.get("data")?;
            let data: Value = serde_json::from_str(&data_str).unwrap_or(Value::Object(Default::default()));
            let width: Option<f64> = row.get("width")?;
            let height: Option<f64> = row.get("height")?;
            let selected: bool = row.get("selected")?;

            Ok(serde_json::json!({
                "id": id,
                "type": node_type,
                "position": { "x": pos_x, "y": pos_y },
                "data": data,
                "width": width,
                "height": height,
                "selected": selected,
            }))
        })
        .map_err(|e| format!("query nodes: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    // Load edges
    let mut stmt = conn
        .prepare("SELECT id, source, target, source_handle, target_handle FROM edges WHERE clip_id = ?1")
        .map_err(|e| format!("prepare: {}", e))?;

    let edges: Vec<Value> = stmt
        .query_map(rusqlite::params![clip_id], |row| {
            let id: String = row.get("id")?;
            let source: String = row.get("source")?;
            let target: String = row.get("target")?;
            let source_handle: String = row.get("source_handle")?;
            let target_handle: String = row.get("target_handle")?;

            Ok(serde_json::json!({
                "id": id,
                "source": source,
                "target": target,
                "sourceHandle": source_handle,
                "targetHandle": target_handle,
            }))
        })
        .map_err(|e| format!("query edges: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(CanvasLoadResult { nodes, edges })
}

#[tauri::command]
pub fn db_clear_canvas(db: State<Database>, clip_id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("lock: {}", e))?;
    conn.execute("DELETE FROM nodes WHERE clip_id = ?1", rusqlite::params![clip_id])
        .map_err(|e| format!("delete nodes: {}", e))?;
    conn.execute("DELETE FROM edges WHERE clip_id = ?1", rusqlite::params![clip_id])
        .map_err(|e| format!("delete edges: {}", e))?;
    conn.execute(
        "DELETE FROM subtitles WHERE clip_id = ?1",
        rusqlite::params![clip_id],
    )
    .map_err(|e| format!("delete subtitles: {}", e))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Clip commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn db_get_all_clips(db: State<Database>) -> Result<Vec<ClipOutput>, String> {
    let conn = db.conn.lock().map_err(|e| format!("lock: {}", e))?;
    let mut stmt = conn
        .prepare("SELECT id, title, description, url, thumbnail, duration, tags, created_at FROM clips ORDER BY created_at DESC")
        .map_err(|e| format!("prepare: {}", e))?;
    let clips: Vec<ClipOutput> = stmt
        .query_map([], row_to_clip)
        .map_err(|e| format!("query: {}", e))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(clips)
}

#[tauri::command]
pub fn db_get_clip_by_id(db: State<Database>, id: String) -> Result<Option<ClipOutput>, String> {
    let conn = db.conn.lock().map_err(|e| format!("lock: {}", e))?;
    let mut stmt = conn
        .prepare("SELECT id, title, description, url, thumbnail, duration, tags, created_at FROM clips WHERE id = ?1")
        .map_err(|e| format!("prepare: {}", e))?;
    let result: Option<ClipOutput> = stmt
        .query_row(rusqlite::params![id], row_to_clip)
        .ok();
    Ok(result)
}

#[tauri::command]
pub fn db_add_clip(db: State<Database>, data: ClipInput) -> Result<ClipOutput, String> {
    let conn = db.conn.lock().map_err(|e| format!("lock: {}", e))?;
    let created_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let tags = data.tags.clone().unwrap_or_default();
    let tags_json = serde_json::to_string(&tags).unwrap_or_default();

    conn.execute(
        "INSERT INTO clips (id, title, description, url, thumbnail, duration, tags, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            data.id,
            data.title.as_deref().unwrap_or(""),
            data.description.as_deref().unwrap_or(""),
            data.url.as_deref().unwrap_or(""),
            data.thumbnail.as_deref().unwrap_or(""),
            data.duration.unwrap_or(0.0),
            tags_json,
            created_at,
        ],
    )
    .map_err(|e| format!("insert clip: {}", e))?;

    Ok(ClipOutput {
        id: data.id,
        title: data.title.unwrap_or_default(),
        description: data.description.unwrap_or_default(),
        url: data.url.unwrap_or_default(),
        thumbnail: data.thumbnail.unwrap_or_default(),
        duration: data.duration.unwrap_or(0.0),
        tags,
        created_at,
    })
}

#[tauri::command]
pub fn db_update_clip(
    db: State<Database>,
    id: String,
    data: ClipUpdateInput,
) -> Result<Option<ClipOutput>, String> {
    let conn = db.conn.lock().map_err(|e| format!("lock: {}", e))?;

    // Check exists
    let exists: bool = conn
        .query_row("SELECT COUNT(*) FROM clips WHERE id = ?1", rusqlite::params![id], |r| {
            r.get::<_, i64>(0).map(|c| c > 0)
        })
        .unwrap_or(false);

    if !exists {
        return Ok(None);
    }

    // Build dynamic UPDATE
    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref v) = data.title {
        sets.push("title = ?".to_string());
        params.push(Box::new(v.clone()));
    }
    if let Some(ref v) = data.description {
        sets.push("description = ?".to_string());
        params.push(Box::new(v.clone()));
    }
    if let Some(ref v) = data.url {
        sets.push("url = ?".to_string());
        params.push(Box::new(v.clone()));
    }
    if let Some(ref v) = data.thumbnail {
        sets.push("thumbnail = ?".to_string());
        params.push(Box::new(v.clone()));
    }
    if let Some(v) = data.duration {
        sets.push("duration = ?".to_string());
        params.push(Box::new(v));
    }
    if let Some(ref v) = data.tags {
        let json = serde_json::to_string(v).unwrap_or_default();
        sets.push("tags = ?".to_string());
        params.push(Box::new(json));
    }

    if !sets.is_empty() {
        let sql = format!("UPDATE clips SET {} WHERE id = ?", sets.join(", "));
        params.push(Box::new(id.clone()));

        // Convert to slice of &dyn ToSql
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice())
            .map_err(|e| format!("update clip: {}", e))?;
    }

    // Return updated record
    let mut stmt = conn
        .prepare("SELECT id, title, description, url, thumbnail, duration, tags, created_at FROM clips WHERE id = ?1")
        .map_err(|e| format!("prepare: {}", e))?;
    let result = stmt.query_row(rusqlite::params![id], row_to_clip).ok();
    Ok(result)
}

#[tauri::command]
pub fn db_delete_clip(db: State<Database>, id: String) -> Result<bool, String> {
    let conn = db.conn.lock().map_err(|e| format!("lock: {}", e))?;
    let affected = conn
        .execute("DELETE FROM clips WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("delete clip: {}", e))?;
    Ok(affected > 0)
}

#[tauri::command]
pub fn db_search_clips(db: State<Database>, query: String) -> Result<Vec<ClipOutput>, String> {
    let conn = db.conn.lock().map_err(|e| format!("lock: {}", e))?;
    let pattern = format!("%{}%", query.to_lowercase());
    let mut stmt = conn
        .prepare(
            "SELECT id, title, description, url, thumbnail, duration, tags, created_at
             FROM clips
             WHERE LOWER(title) LIKE ?1
                OR LOWER(description) LIKE ?1
                OR LOWER(tags) LIKE ?1
             ORDER BY created_at DESC",
        )
        .map_err(|e| format!("prepare: {}", e))?;
    let clips: Vec<ClipOutput> = stmt
        .query_map(rusqlite::params![pattern], row_to_clip)
        .map_err(|e| format!("query: {}", e))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(clips)
}

// ---------------------------------------------------------------------------
// Subtitle commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn db_save_subtitle(db: State<Database>, track: SubtitleInput) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("lock: {}", e))?;
    let items_json = track
        .items
        .as_ref()
        .map_or_else(|| "[]".to_string(), |v| v.to_string());
    conn.execute(
        "INSERT OR REPLACE INTO subtitles (id, items, language, status, clip_id)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![
            track.id,
            items_json,
            track.language.as_deref().unwrap_or(""),
            track.status.as_deref().unwrap_or(""),
            track.clip_id.as_deref().unwrap_or(""),
        ],
    )
    .map_err(|e| format!("save subtitle: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn db_load_subtitle(
    db: State<Database>,
    node_id: String,
) -> Result<Option<Value>, String> {
    let conn = db.conn.lock().map_err(|e| format!("lock: {}", e))?;
    let mut stmt = conn
        .prepare("SELECT id, items, language, status FROM subtitles WHERE id = ?1")
        .map_err(|e| format!("prepare: {}", e))?;

    let result: Option<Value> = stmt
        .query_row(rusqlite::params![node_id], |row| {
            let id: String = row.get("id")?;
            let items_str: String = row.get("items")?;
            let items: Value =
                serde_json::from_str(&items_str).unwrap_or(Value::Array(vec![]));
            let language: String = row.get("language")?;
            let status: String = row.get("status")?;

            Ok(serde_json::json!({
                "id": id,
                "items": items,
                "language": language,
                "status": status,
            }))
        })
        .ok();
    Ok(result)
}

// ---------------------------------------------------------------------------
// Timeline commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn db_save_timeline(db: State<Database>, record: TimelineInput) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("lock: {}", e))?;
    let data_json = record.data.to_string();
    conn.execute(
        "INSERT OR REPLACE INTO timelines (project_id, data, updated_at)
         VALUES (?1, ?2, ?3)",
        rusqlite::params![record.project_id, data_json, record.updated_at],
    )
    .map_err(|e| format!("save timeline: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn db_load_timeline(
    db: State<Database>,
    project_id: String,
) -> Result<Option<Value>, String> {
    let conn = db.conn.lock().map_err(|e| format!("lock: {}", e))?;
    let mut stmt = conn
        .prepare("SELECT project_id, data, updated_at FROM timelines WHERE project_id = ?1")
        .map_err(|e| format!("prepare: {}", e))?;

    let result: Option<Value> = stmt
        .query_row(rusqlite::params![project_id], |row| {
            let pid: String = row.get("project_id")?;
            let data_str: String = row.get("data")?;
            let data: Value =
                serde_json::from_str(&data_str).unwrap_or(Value::Object(Default::default()));
            let updated_at: i64 = row.get("updated_at")?;

            Ok(serde_json::json!({
                "projectId": pid,
                "data": data,
                "updatedAt": updated_at,
            }))
        })
        .ok();
    Ok(result)
}

#[tauri::command]
pub fn db_delete_timeline(db: State<Database>, project_id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("lock: {}", e))?;
    conn.execute(
        "DELETE FROM timelines WHERE project_id = ?1",
        rusqlite::params![project_id],
    )
    .map_err(|e| format!("delete timeline: {}", e))?;
    Ok(())
}
