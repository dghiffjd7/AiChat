use rusqlite::{params, params_from_iter, Connection, OpenFlags, OptionalExtension};
use rusqlite::types::Value as SqlValue;
use serde::{Deserialize, Serialize};
#[cfg(not(target_os = "android"))]
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
#[cfg(not(target_os = "android"))]
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const SCHEMA_VERSION: i64 = 1;
const SCHEMA_SQL: &str = include_str!("memory_schema.sql");
const SCHEMA_KEY: &str = "schema_version";

struct Migration {
    from: i64,
    to: i64,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[];

static ID_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Deserialize)]
pub struct MemoryCreateInput {
    pub id: Option<String>,
    pub template_id: String,
    pub table_id: String,
    pub contact_id: Option<String>,
    pub group_id: Option<String>,
    pub row_data: serde_json::Value,
    pub is_active: Option<bool>,
    pub is_pinned: Option<bool>,
    pub priority: Option<i64>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct TemplateInput {
    pub id: String,
    pub name: String,
    pub author: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub schema: serde_json::Value,
    pub injection: Option<serde_json::Value>,
    pub is_default: Option<bool>,
    pub is_builtin: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct TemplateQuery {
    pub id: Option<String>,
    pub is_default: Option<bool>,
    pub is_builtin: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct TemplateRecord {
    pub id: String,
    pub name: String,
    pub author: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub schema: serde_json::Value,
    pub injection: Option<serde_json::Value>,
    pub created_at: i64,
    pub updated_at: i64,
    pub is_default: bool,
    pub is_builtin: bool,
}

#[derive(Debug, Deserialize)]
pub struct MemoryUpdateInput {
    pub id: String,
    pub row_data: Option<serde_json::Value>,
    pub is_active: Option<bool>,
    pub is_pinned: Option<bool>,
    pub priority: Option<i64>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct MemoryQuery {
    pub contact_id: Option<String>,
    pub group_id: Option<String>,
    pub template_id: Option<String>,
    pub scope: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MemoryRecord {
    pub id: String,
    pub template_id: String,
    pub table_id: String,
    pub contact_id: Option<String>,
    pub group_id: Option<String>,
    pub row_data: serde_json::Value,
    pub is_active: bool,
    pub is_pinned: bool,
    pub priority: i64,
    pub sort_order: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct MemoryDb {
    base_dir: PathBuf,
    #[cfg(not(target_os = "android"))]
    connections: Mutex<HashMap<String, Connection>>,
}

impl MemoryDb {
    pub fn new(app: &AppHandle) -> Result<Self, String> {
        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            base_dir: data_dir,
            #[cfg(not(target_os = "android"))]
            connections: Mutex::new(HashMap::new()),
        })
    }

    pub fn close_all(&self) {
        #[cfg(not(target_os = "android"))]
        {
            if let Ok(mut guard) = self.connections.lock() {
                guard.clear();
            }
        }
    }

    pub fn init_database(&self, scope_id: Option<String>) -> Result<(), String> {
        self.with_conn(scope_id, |_| Ok(()))
    }

    pub fn create_memory(&self, scope_id: Option<String>, input: MemoryCreateInput) -> Result<String, String> {
        self.with_conn(scope_id, |conn| {
            let now = now_ms();
            let id = input
                .id
                .as_deref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .map(String::from)
                .unwrap_or_else(generate_id);
            let row_data = serde_json::to_string(&input.row_data).map_err(|e| e.to_string())?;
            let is_active = bool_to_int(input.is_active.unwrap_or(true));
            let is_pinned = bool_to_int(input.is_pinned.unwrap_or(false));
            let priority = input.priority.unwrap_or(0);
            let sort_order = input.sort_order.unwrap_or(0);
            conn.execute(
                "INSERT INTO memories (id, template_id, table_id, contact_id, group_id, row_data, is_active, is_pinned, priority, sort_order, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                params![
                    id,
                    input.template_id,
                    input.table_id,
                    input.contact_id,
                    input.group_id,
                    row_data,
                    is_active,
                    is_pinned,
                    priority,
                    sort_order,
                    now,
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
            Ok(id)
        })
    }

    pub fn save_template(&self, scope_id: Option<String>, input: TemplateInput) -> Result<(), String> {
        self.with_conn(scope_id, |conn| {
            let now = now_ms();
            let schema = serde_json::to_string(&input.schema).map_err(|e| e.to_string())?;
            let injection = match input.injection {
                Some(value) => Some(serde_json::to_string(&value).map_err(|e| e.to_string())?),
                None => None,
            };
            let is_default = bool_to_int(input.is_default.unwrap_or(false));
            let is_builtin = bool_to_int(input.is_builtin.unwrap_or(false));

            conn.execute(
                "INSERT INTO templates (id, name, author, version, description, schema, injection, created_at, updated_at, is_default, is_builtin)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                   name = excluded.name,
                   author = excluded.author,
                   version = excluded.version,
                   description = excluded.description,
                   schema = excluded.schema,
                   injection = excluded.injection,
                   updated_at = excluded.updated_at,
                   is_default = excluded.is_default,
                   is_builtin = excluded.is_builtin",
                params![
                    input.id,
                    input.name,
                    input.author,
                    input.version,
                    input.description,
                    schema,
                    injection,
                    now,
                    now,
                    is_default,
                    is_builtin
                ],
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        })
    }

    pub fn get_templates(&self, scope_id: Option<String>, query: TemplateQuery) -> Result<Vec<TemplateRecord>, String> {
        self.with_conn(scope_id, |conn| {
            let mut sql = String::from(
                "SELECT id, name, author, version, description, schema, injection, created_at, updated_at, is_default, is_builtin FROM templates",
            );
            let mut clauses: Vec<String> = Vec::new();
            let mut values: Vec<SqlValue> = Vec::new();

            if let Some(id) = query.id {
                clauses.push("id = ?".to_string());
                values.push(SqlValue::Text(id));
            }
            if let Some(is_default) = query.is_default {
                clauses.push("is_default = ?".to_string());
                values.push(SqlValue::Integer(bool_to_int(is_default)));
            }
            if let Some(is_builtin) = query.is_builtin {
                clauses.push("is_builtin = ?".to_string());
                values.push(SqlValue::Integer(bool_to_int(is_builtin)));
            }

            if !clauses.is_empty() {
                sql.push_str(" WHERE ");
                sql.push_str(&clauses.join(" AND "));
            }
            sql.push_str(" ORDER BY updated_at DESC");

            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params_from_iter(values), |row| {
                    let schema_raw: String = row.get(5)?;
                    let injection_raw: Option<String> = row.get(6)?;
                    Ok(TemplateRecord {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        author: row.get(2)?,
                        version: row.get(3)?,
                        description: row.get(4)?,
                        schema: parse_json_value(schema_raw),
                        injection: parse_json_optional(injection_raw),
                        created_at: row.get(7)?,
                        updated_at: row.get(8)?,
                        is_default: row.get::<_, i64>(9)? != 0,
                        is_builtin: row.get::<_, i64>(10)? != 0,
                    })
                })
                .map_err(|e| e.to_string())?;

            let mut out = Vec::new();
            for row in rows {
                out.push(row.map_err(|e| e.to_string())?);
            }
            Ok(out)
        })
    }

    pub fn delete_template(&self, scope_id: Option<String>, id: String) -> Result<(), String> {
        self.with_conn(scope_id, |conn| {
            let affected = conn
                .execute("DELETE FROM templates WHERE id = ?", params![id])
                .map_err(|e| e.to_string())?;
            if affected == 0 {
                return Err("template not found".to_string());
            }
            Ok(())
        })
    }

    pub fn update_memory(&self, scope_id: Option<String>, input: MemoryUpdateInput) -> Result<(), String> {
        self.with_conn(scope_id, |conn| {
            let mut sets: Vec<String> = Vec::new();
            let mut values: Vec<SqlValue> = Vec::new();

            if let Some(row_data) = input.row_data {
                let raw = serde_json::to_string(&row_data).map_err(|e| e.to_string())?;
                sets.push("row_data = ?".to_string());
                values.push(SqlValue::Text(raw));
            }
            if let Some(is_active) = input.is_active {
                sets.push("is_active = ?".to_string());
                values.push(SqlValue::Integer(bool_to_int(is_active)));
            }
            if let Some(is_pinned) = input.is_pinned {
                sets.push("is_pinned = ?".to_string());
                values.push(SqlValue::Integer(bool_to_int(is_pinned)));
            }
            if let Some(priority) = input.priority {
                sets.push("priority = ?".to_string());
                values.push(SqlValue::Integer(priority));
            }
            if let Some(sort_order) = input.sort_order {
                sets.push("sort_order = ?".to_string());
                values.push(SqlValue::Integer(sort_order));
            }

            if sets.is_empty() {
                return Err("no fields to update".to_string());
            }

            sets.push("updated_at = ?".to_string());
            values.push(SqlValue::Integer(now_ms()));
            values.push(SqlValue::Text(input.id));

            let sql = format!("UPDATE memories SET {} WHERE id = ?", sets.join(", "));
            let affected = conn
                .execute(&sql, params_from_iter(values))
                .map_err(|e| e.to_string())?;
            if affected == 0 {
                return Err("memory not found".to_string());
            }
            Ok(())
        })
    }

    pub fn delete_memory(&self, scope_id: Option<String>, id: String) -> Result<(), String> {
        self.with_conn(scope_id, |conn| {
            let affected = conn
                .execute("DELETE FROM memories WHERE id = ?", params![id])
                .map_err(|e| e.to_string())?;
            if affected == 0 {
                return Err("memory not found".to_string());
            }
            Ok(())
        })
    }

    pub fn get_memories(&self, scope_id: Option<String>, query: MemoryQuery) -> Result<Vec<MemoryRecord>, String> {
        self.with_conn(scope_id, |conn| {
            let mut sql = String::from(
                "SELECT id, template_id, table_id, contact_id, group_id, row_data, is_active, is_pinned, priority, sort_order, created_at, updated_at FROM memories",
            );
            let mut clauses: Vec<String> = Vec::new();
            let mut values: Vec<SqlValue> = Vec::new();

            let scope = query
                .scope
                .unwrap_or_default()
                .trim()
                .to_lowercase();
            if scope == "global" {
                clauses.push("contact_id IS NULL AND group_id IS NULL".to_string());
            } else if scope == "contact" {
                let contact_id = query
                    .contact_id
                    .ok_or_else(|| "contact scope requires contact_id".to_string())?;
                clauses.push("contact_id = ?".to_string());
                values.push(SqlValue::Text(contact_id));
            } else if scope == "group" {
                let group_id = query
                    .group_id
                    .ok_or_else(|| "group scope requires group_id".to_string())?;
                clauses.push("group_id = ?".to_string());
                values.push(SqlValue::Text(group_id));
            } else {
                if let Some(contact_id) = query.contact_id {
                    clauses.push("contact_id = ?".to_string());
                    values.push(SqlValue::Text(contact_id));
                }
                if let Some(group_id) = query.group_id {
                    clauses.push("group_id = ?".to_string());
                    values.push(SqlValue::Text(group_id));
                }
            }
            if let Some(template_id) = query.template_id {
                clauses.push("template_id = ?".to_string());
                values.push(SqlValue::Text(template_id));
            }

            if !clauses.is_empty() {
                sql.push_str(" WHERE ");
                sql.push_str(&clauses.join(" AND "));
            }
            sql.push_str(
                " ORDER BY is_pinned DESC, priority DESC,
                  CASE WHEN sort_order IS NULL OR sort_order = 0 THEN created_at ELSE sort_order END ASC,
                  created_at ASC,
                  id ASC",
            );

            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params_from_iter(values), |row| {
                    let row_data: String = row.get(5)?;
                    Ok(MemoryRecord {
                        id: row.get(0)?,
                        template_id: row.get(1)?,
                        table_id: row.get(2)?,
                        contact_id: row.get(3)?,
                        group_id: row.get(4)?,
                        row_data: parse_row_data(row_data),
                        is_active: row.get::<_, i64>(6)? != 0,
                        is_pinned: row.get::<_, i64>(7)? != 0,
                        priority: row.get(8)?,
                        sort_order: row.get(9)?,
                        created_at: row.get(10)?,
                        updated_at: row.get(11)?,
                    })
                })
                .map_err(|e| e.to_string())?;

            let mut out = Vec::new();
            for row in rows {
                out.push(row.map_err(|e| e.to_string())?);
            }
            Ok(out)
        })
    }

    pub fn batch_create_memories(&self, scope_id: Option<String>, memories: Vec<MemoryCreateInput>) -> Result<usize, String> {
        self.with_conn(scope_id, |conn| {
            let tx = conn.transaction().map_err(|e| e.to_string())?;
            let mut count = 0;
            {
                let mut stmt = tx
                    .prepare(
                        "INSERT INTO memories (id, template_id, table_id, contact_id, group_id, row_data, is_active, is_pinned, priority, sort_order, created_at, updated_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    )
                    .map_err(|e| e.to_string())?;
                for input in memories {
                    let now = now_ms();
                    let id = input
                        .id
                        .as_deref()
                        .map(|s| s.trim())
                        .filter(|s| !s.is_empty())
                        .map(String::from)
                        .unwrap_or_else(generate_id);
                    let row_data = serde_json::to_string(&input.row_data).map_err(|e| e.to_string())?;
                    let is_active = bool_to_int(input.is_active.unwrap_or(true));
                    let is_pinned = bool_to_int(input.is_pinned.unwrap_or(false));
                    let priority = input.priority.unwrap_or(0);
                    let sort_order = input.sort_order.unwrap_or(0);
                    stmt.execute(params![
                        id,
                        input.template_id,
                        input.table_id,
                        input.contact_id,
                        input.group_id,
                        row_data,
                        is_active,
                        is_pinned,
                        priority,
                        sort_order,
                        now,
                        now
                    ])
                    .map_err(|e| e.to_string())?;
                    count += 1;
                }
            }
            tx.commit().map_err(|e| e.to_string())?;
            Ok(count)
        })
    }

    pub fn batch_delete_memories(&self, scope_id: Option<String>, ids: Vec<String>) -> Result<usize, String> {
        self.with_conn(scope_id, |conn| {
            let tx = conn.transaction().map_err(|e| e.to_string())?;
            let mut count = 0;
            {
                let mut stmt = tx
                    .prepare("DELETE FROM memories WHERE id = ?")
                    .map_err(|e| e.to_string())?;
                for id in ids {
                    count += stmt.execute(params![id]).map_err(|e| e.to_string())?;
                }
            }
            tx.commit().map_err(|e| e.to_string())?;
            Ok(count)
        })
    }

    fn with_conn<F, T>(&self, scope_id: Option<String>, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut Connection) -> Result<T, String>,
    {
        let scope_key = normalize_scope_id(scope_id);
        #[cfg(target_os = "android")]
        {
            let path = self.db_path_for(&scope_key);
            let existed = path.exists();
            let mut conn = open_connection(&path)?;
            ensure_schema(&mut conn, &path, existed)?;
            return f(&mut conn);
        }
        #[cfg(not(target_os = "android"))]
        {
            let mut guard = self
                .connections
                .lock()
                .map_err(|_| "db lock poisoned".to_string())?;
            if !guard.contains_key(&scope_key) {
                let path = self.db_path_for(&scope_key);
                let existed = path.exists();
                let mut conn = open_connection(&path)?;
                ensure_schema(&mut conn, &path, existed)?;
                guard.insert(scope_key.clone(), conn);
            }
            let conn = guard
                .get_mut(&scope_key)
                .ok_or_else(|| "db unavailable".to_string())?;
            f(conn)
        }
    }

    fn db_path_for(&self, scope_key: &str) -> PathBuf {
        if scope_key.is_empty() {
            self.base_dir.join("memories.db")
        } else {
            self.base_dir.join(format!("memories__{}.db", scope_key))
        }
    }
}

fn open_connection(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_FULL_MUTEX,
    )
    .map_err(|e| e.to_string())?;
    conn.busy_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", &"WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "synchronous", &"NORMAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", &"ON")
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn ensure_schema(conn: &mut Connection, path: &Path, existed: bool) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_info (key TEXT PRIMARY KEY, value TEXT);",
    )
    .map_err(|e| e.to_string())?;

    let version: Option<String> = conn
        .query_row(
            "SELECT value FROM schema_info WHERE key = ?",
            params![SCHEMA_KEY],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let current_version = version
        .as_deref()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);

    if current_version == 0 {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(SCHEMA_SQL).map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT OR REPLACE INTO schema_info (key, value) VALUES (?, ?)",
            params![SCHEMA_KEY, SCHEMA_VERSION.to_string()],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        return Ok(());
    }

    if current_version > SCHEMA_VERSION {
        return Err(format!(
            "db schema too new: {} > {}",
            current_version, SCHEMA_VERSION
        ));
    }

    if current_version < SCHEMA_VERSION {
        run_migrations(conn, current_version, SCHEMA_VERSION, path, existed)?;
    }

    if existed {
        ensure_db_health(conn, path)?;
    }

    Ok(())
}

fn generate_id() -> String {
    let now = now_ms();
    let seq = ID_COUNTER.fetch_add(1, Ordering::Relaxed) % 1000;
    format!("mem_{}_{}", now, seq)
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn bool_to_int(value: bool) -> i64 {
    if value { 1 } else { 0 }
}

fn parse_row_data(raw: String) -> serde_json::Value {
    serde_json::from_str(&raw).unwrap_or(serde_json::Value::String(raw))
}

fn parse_json_value(raw: String) -> serde_json::Value {
    serde_json::from_str(&raw).unwrap_or(serde_json::Value::String(raw))
}

fn parse_json_optional(raw: Option<String>) -> Option<serde_json::Value> {
    raw.and_then(|value| serde_json::from_str(&value).ok())
}

fn normalize_scope_id(scope_id: Option<String>) -> String {
    let raw = scope_id.unwrap_or_default();
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let mut out = String::with_capacity(trimmed.len());
    for ch in trimmed.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    if out.len() > 80 {
        out.truncate(80);
    }
    out.trim_matches('_').to_string()
}

fn run_migrations(
    conn: &mut Connection,
    current_version: i64,
    target_version: i64,
    path: &Path,
    existed: bool,
) -> Result<(), String> {
    if current_version >= target_version {
        return Ok(());
    }
    let mut version = current_version;
    let mut backed_up = false;
    while version < target_version {
        let next_version = version + 1;
        let migration = MIGRATIONS
            .iter()
            .find(|m| m.from == version && m.to == next_version)
            .ok_or_else(|| format!("missing migration path: {} -> {}", version, next_version))?;
        if existed && !backed_up {
            let _ = backup_database(path, "pre_migrate")?;
            backed_up = true;
        }
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(migration.sql)
            .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT OR REPLACE INTO schema_info (key, value) VALUES (?, ?)",
            params![SCHEMA_KEY, next_version.to_string()],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        version = next_version;
    }
    Ok(())
}

fn ensure_db_health(conn: &mut Connection, path: &Path) -> Result<(), String> {
    match quick_check(conn) {
        Ok(()) => Ok(()),
        Err(err) => {
            let _ = backup_database(path, "corrupt")?;
            Err(format!("memory db integrity check failed: {}", err))
        }
    }
}

fn quick_check(conn: &mut Connection) -> Result<(), String> {
    let mut stmt = conn
        .prepare("PRAGMA quick_check")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let msg: String = row.get(0).map_err(|e| e.to_string())?;
        if msg.to_lowercase() != "ok" {
            return Err(msg);
        }
    }
    Ok(())
}

fn backup_database(path: &Path, label: &str) -> Result<PathBuf, String> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "db path missing file name".to_string())?;
    let stamp = now_ms();
    let backup_name = format!("{}.{}.{}.bak", file_name, label, stamp);
    let backup_path = path.with_file_name(backup_name);
    fs::copy(path, &backup_path).map_err(|e| e.to_string())?;
    Ok(backup_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_temp_dir(tag: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let mut dir = std::env::temp_dir();
        dir.push(format!("memdb_test_{}_{}_{}", tag, stamp, std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn new_test_db(tag: &str) -> (MemoryDb, PathBuf) {
        let base_dir = make_temp_dir(tag);
        let db = MemoryDb {
            base_dir: base_dir.clone(),
            connections: Mutex::new(HashMap::new()),
        };
        (db, base_dir)
    }

    fn seed_template(db: &MemoryDb, scope_id: Option<String>, template_id: &str) {
        let schema = json!({
            "meta": { "id": template_id, "name": "Test Template" },
            "tables": []
        });
        db.save_template(
            scope_id,
            TemplateInput {
                id: template_id.to_string(),
                name: "Test Template".to_string(),
                author: None,
                version: Some("1".to_string()),
                description: None,
                schema,
                injection: None,
                is_default: Some(true),
                is_builtin: Some(false),
            },
        )
        .unwrap();
    }

    #[test]
    fn memory_crud_roundtrip() {
        let (db, base_dir) = new_test_db("crud");
        seed_template(&db, None, "tpl_crud");

        let id = db
            .create_memory(
                None,
                MemoryCreateInput {
                    id: None,
                    template_id: "tpl_crud".to_string(),
                    table_id: "relationship".to_string(),
                    contact_id: Some("contact_1".to_string()),
                    group_id: None,
                    row_data: json!({ "relation": "friend" }),
                    is_active: Some(true),
                    is_pinned: Some(false),
                    priority: Some(1),
                    sort_order: Some(0),
                },
            )
            .unwrap();

        let list = db
            .get_memories(
                None,
                MemoryQuery {
                    contact_id: Some("contact_1".to_string()),
                    group_id: None,
                    template_id: Some("tpl_crud".to_string()),
                    scope: None,
                },
            )
            .unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, id);

        db.update_memory(
            None,
            MemoryUpdateInput {
                id: id.clone(),
                row_data: Some(json!({ "relation": "best friend" })),
                is_active: Some(false),
                is_pinned: Some(true),
                priority: Some(7),
                sort_order: Some(3),
            },
        )
        .unwrap();

        let updated = db
            .get_memories(
                None,
                MemoryQuery {
                    contact_id: Some("contact_1".to_string()),
                    group_id: None,
                    template_id: Some("tpl_crud".to_string()),
                    scope: None,
                },
            )
            .unwrap();
        assert_eq!(updated[0].row_data["relation"], "best friend");
        assert!(!updated[0].is_active);
        assert!(updated[0].is_pinned);
        assert_eq!(updated[0].priority, 7);
        assert_eq!(updated[0].sort_order, 3);

        db.delete_memory(None, id).unwrap();
        let empty = db
            .get_memories(
                None,
                MemoryQuery {
                    contact_id: Some("contact_1".to_string()),
                    group_id: None,
                    template_id: Some("tpl_crud".to_string()),
                    scope: None,
                },
            )
            .unwrap();
        assert!(empty.is_empty());

        drop(db);
        fs::remove_dir_all(base_dir).ok();
    }

    #[test]
    fn memory_scope_isolation() {
        let (db, base_dir) = new_test_db("scope");
        seed_template(&db, None, "tpl_scope");
        seed_template(&db, Some("persona_a".to_string()), "tpl_scope");

        db.create_memory(
            None,
            MemoryCreateInput {
                id: None,
                template_id: "tpl_scope".to_string(),
                table_id: "profile".to_string(),
                contact_id: Some("contact_a".to_string()),
                group_id: None,
                row_data: json!({ "name": "A" }),
                is_active: None,
                is_pinned: None,
                priority: None,
                sort_order: None,
            },
        )
        .unwrap();

        db.create_memory(
            Some("persona_a".to_string()),
            MemoryCreateInput {
                id: None,
                template_id: "tpl_scope".to_string(),
                table_id: "profile".to_string(),
                contact_id: Some("contact_b".to_string()),
                group_id: None,
                row_data: json!({ "name": "B" }),
                is_active: None,
                is_pinned: None,
                priority: None,
                sort_order: None,
            },
        )
        .unwrap();

        let default_rows = db
            .get_memories(
                None,
                MemoryQuery {
                    contact_id: None,
                    group_id: None,
                    template_id: Some("tpl_scope".to_string()),
                    scope: None,
                },
            )
            .unwrap();
        let scoped_rows = db
            .get_memories(
                Some("persona_a".to_string()),
                MemoryQuery {
                    contact_id: None,
                    group_id: None,
                    template_id: Some("tpl_scope".to_string()),
                    scope: None,
                },
            )
            .unwrap();
        assert_eq!(default_rows.len(), 1);
        assert_eq!(scoped_rows.len(), 1);
        assert_ne!(default_rows[0].contact_id, scoped_rows[0].contact_id);

        drop(db);
        fs::remove_dir_all(base_dir).ok();
    }

    #[test]
    fn batch_create_and_delete() {
        let (db, base_dir) = new_test_db("batch");
        let scope_id = Some("batch_scope".to_string());
        seed_template(&db, scope_id.clone(), "tpl_batch");

        let items = vec![
            MemoryCreateInput {
                id: None,
                template_id: "tpl_batch".to_string(),
                table_id: "profile".to_string(),
                contact_id: Some("contact_1".to_string()),
                group_id: None,
                row_data: json!({ "name": "A" }),
                is_active: None,
                is_pinned: None,
                priority: None,
                sort_order: None,
            },
            MemoryCreateInput {
                id: None,
                template_id: "tpl_batch".to_string(),
                table_id: "profile".to_string(),
                contact_id: Some("contact_2".to_string()),
                group_id: None,
                row_data: json!({ "name": "B" }),
                is_active: None,
                is_pinned: None,
                priority: None,
                sort_order: None,
            },
        ];
        let count = db.batch_create_memories(scope_id.clone(), items).unwrap();
        assert_eq!(count, 2);

        let list = db
            .get_memories(
                scope_id.clone(),
                MemoryQuery {
                    contact_id: None,
                    group_id: None,
                    template_id: Some("tpl_batch".to_string()),
                    scope: None,
                },
            )
            .unwrap();
        assert_eq!(list.len(), 2);
        let ids: Vec<String> = list.iter().map(|row| row.id.clone()).collect();

        let deleted = db.batch_delete_memories(scope_id, ids).unwrap();
        assert_eq!(deleted, 2);

        drop(db);
        fs::remove_dir_all(base_dir).ok();
    }
}
