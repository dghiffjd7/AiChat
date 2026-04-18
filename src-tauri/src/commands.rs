use crate::memory_db::{
    MemoryCreateInput, MemoryDb, MemoryQuery, MemoryRecord, MemoryUpdateInput, TemplateInput,
    TemplateQuery, TemplateRecord,
};
use crate::storage::{simple_decrypt, simple_encrypt, ChatMessage};
use base64::engine::general_purpose::STANDARD as BASE64_ENGINE;
use base64::Engine;
use gif::{Encoder as GifEncoder, Frame as GifFrame, Repeat as GifRepeat};
use image::imageops::overlay;
use image::RgbaImage;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::fs::OpenOptions;
use std::io::Cursor;
use std::io::{Read, Seek, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use zip::write::FileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

#[cfg(target_os = "android")]
use jni::objects::{JObject, JString, JValue};
#[cfg(target_os = "android")]
use jni::{JNIEnv, JavaVM};
#[cfg(target_os = "android")]
use ndk_context::android_context;
#[cfg(target_os = "android")]
use std::os::unix::io::{AsRawFd, FromRawFd};

/// 获取数据目录
fn get_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn sanitize_segment(input: &str) -> String {
    let raw = input.trim();
    let mut out = String::with_capacity(raw.len());
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    let trimmed = out.trim_matches('_');
    let mut cleaned = if trimmed.is_empty() {
        "default".to_string()
    } else {
        out
    };
    const MAX_LEN: usize = 80;
    if cleaned.len() > MAX_LEN {
        cleaned.truncate(MAX_LEN);
    }
    cleaned
}

fn sanitize_download_name(input: &str) -> String {
    let raw = input.trim();
    let mut out = String::with_capacity(raw.len());
    for ch in raw.chars() {
        if matches!(
            ch,
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0'
        ) {
            out.push('_');
        } else {
            out.push(ch);
        }
    }
    let trimmed = out.trim_matches('_');
    let mut cleaned = if trimmed.is_empty() {
        "download".to_string()
    } else {
        out
    };
    const MAX_LEN: usize = 80;
    if cleaned.len() > MAX_LEN {
        cleaned = cleaned.chars().take(MAX_LEN).collect();
    }
    cleaned
}

fn normalize_scope_id(input: &str) -> String {
    let raw = input.trim();
    if raw.is_empty() {
        return String::new();
    }
    let mut out = String::with_capacity(raw.len());
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    const MAX_LEN: usize = 64;
    if out.len() > MAX_LEN {
        out.truncate(MAX_LEN);
    }
    out
}

fn validate_safe_key(raw: &str, label: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(format!("{label} empty"));
    }
    const MAX_LEN: usize = 120;
    if trimmed.len() > MAX_LEN {
        return Err(format!("{label} too long"));
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(format!("{label} contains invalid characters"));
    }
    Ok(trimmed.to_string())
}

fn chat_store_v2_base(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = get_data_dir(app)?;
    Ok(data_dir.join("chat_store_v2"))
}

fn chat_store_v2_scope_dir(app: &AppHandle, scope: &str) -> Result<PathBuf, String> {
    let scope_key = if scope.trim().is_empty() {
        "default".to_string()
    } else {
        validate_safe_key(scope, "scope")?
    };
    let base = chat_store_v2_base(app)?;
    Ok(base.join(format!("scope_{scope_key}")))
}

fn chat_store_v2_thread_dir(
    app: &AppHandle,
    scope: &str,
    session_dir: &str,
    thread_dir: &str,
) -> Result<PathBuf, String> {
    let scope_dir = chat_store_v2_scope_dir(app, scope)?;
    let session_key = validate_safe_key(session_dir, "session_dir")?;
    let thread_key = validate_safe_key(thread_dir, "thread_dir")?;
    Ok(scope_dir
        .join(format!("session_{session_key}"))
        .join(format!("thread_{thread_key}")))
}

fn write_json_file(path: &Path, data: &Value) -> Result<(), String> {
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, json).map_err(|e| e.to_string())?;
    #[cfg(target_os = "android")]
    {
        if let Ok(f) = fs::File::open(path) {
            unsafe {
                libc::fsync(f.as_raw_fd());
            }
        }
    }
    Ok(())
}

fn write_bytes_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, bytes).map_err(|e| e.to_string())?;
    #[cfg(target_os = "android")]
    {
        if let Ok(f) = fs::File::open(path) {
            unsafe {
                libc::fsync(f.as_raw_fd());
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn write_text_file(path: String, text: String) -> Result<(), String> {
    let raw = path.trim();
    if raw.is_empty() {
        return Err("path empty".to_string());
    }
    let file = PathBuf::from(raw);
    write_bytes_file(&file, text.as_bytes())
}

fn decode_data_url(data_url: &str) -> Result<(Vec<u8>, Option<String>), String> {
    let raw = data_url.trim();
    if !raw.starts_with("data:") {
        return Err("invalid data url".to_string());
    }
    let mut parts = raw.splitn(2, ',');
    let meta = parts.next().unwrap_or("");
    let payload = parts.next().unwrap_or("");
    if payload.is_empty() {
        return Err("empty data payload".to_string());
    }
    let mime = meta.strip_prefix("data:").unwrap_or("");
    let mut mime_parts = mime.split(';');
    let mime_type = mime_parts.next().unwrap_or("");
    let ext = match mime_type {
        "image/png" => Some("png".to_string()),
        "image/jpeg" => Some("jpg".to_string()),
        "image/jpg" => Some("jpg".to_string()),
        "image/webp" => Some("webp".to_string()),
        "image/gif" => Some("gif".to_string()),
        _ => None,
    };
    let bytes = BASE64_ENGINE.decode(payload).map_err(|e| e.to_string())?;
    Ok((bytes, ext))
}

fn extension_from_name(name: &str) -> Option<String> {
    let raw = name.trim();
    if raw.is_empty() {
        return None;
    }
    let ext = Path::new(raw).extension()?.to_string_lossy().to_string();
    if ext.is_empty() {
        None
    } else {
        Some(ext)
    }
}

fn mime_from_extension(ext: &str) -> Option<String> {
    match ext.to_lowercase().as_str() {
        "png" => Some("image/png".to_string()),
        "jpg" | "jpeg" => Some("image/jpeg".to_string()),
        "webp" => Some("image/webp".to_string()),
        "gif" => Some("image/gif".to_string()),
        "zip" => Some("application/zip".to_string()),
        "bmp" => Some("image/bmp".to_string()),
        "svg" => Some("image/svg+xml".to_string()),
        _ => None,
    }
}

fn is_image_mime(mime: &str) -> bool {
    mime.starts_with("image/")
}

fn mime_from_data_url(data_url: &str) -> Option<String> {
    let raw = data_url.trim();
    if !raw.starts_with("data:") {
        return None;
    }
    let mut parts = raw.splitn(2, ',');
    let meta = parts.next().unwrap_or("");
    let mime = meta
        .strip_prefix("data:")
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("");
    if mime.is_empty() {
        None
    } else {
        Some(mime.to_string())
    }
}

fn ensure_extension(name: &str, ext: Option<&str>) -> String {
    if extension_from_name(name).is_some() {
        name.to_string()
    } else if let Some(ext) = ext {
        format!("{name}.{ext}")
    } else {
        name.to_string()
    }
}

fn raw_reply_path(app: &AppHandle, session_id: &str, message_id: &str) -> Result<PathBuf, String> {
    let data_dir = get_data_dir(app)?;
    let sid = sanitize_segment(session_id);
    let mid = sanitize_segment(message_id);
    Ok(data_dir
        .join("raw_replies")
        .join(sid)
        .join(format!("{mid}.txt")))
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.exists() {
        return Err(format!("source directory missing: {}", src.display()));
    }
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let target = dst.join(entry.file_name());
        if path.is_dir() {
            copy_dir_recursive(&path, &target)?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::copy(&path, &target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[derive(serde::Serialize)]
pub struct MediaBundleInfo {
    pub ready: bool,
    pub copied: bool,
    pub base_dir: String,
    pub manifest: Option<Value>,
    pub warning: Option<String>,
}

#[derive(serde::Serialize)]
pub struct WallpaperSaveResult {
    pub path: String,
    pub bytes: usize,
}

#[derive(serde::Serialize)]
pub struct AttachmentSaveResult {
    pub path: String,
    pub bytes: usize,
}

#[derive(serde::Deserialize)]
pub struct StickerZipEntry {
    pub name: String,
    #[serde(rename = "path")]
    pub path: Option<String>,
    #[serde(rename = "dataUrl")]
    pub data_url: Option<String>,
}

#[derive(Default)]
pub struct WallpaperStreamState {
    inner: Mutex<HashMap<String, WallpaperStreamEntry>>,
}

struct WallpaperStreamEntry {
    path: PathBuf,
    previous_path: Option<String>,
}

#[derive(Default)]
pub struct AttachmentStreamState {
    inner: Mutex<HashMap<String, AttachmentStreamEntry>>,
}

struct AttachmentStreamEntry {
    path: PathBuf,
}

#[derive(Default)]
pub struct HttpAbortState {
    inner: Mutex<HashMap<String, tokio::task::AbortHandle>>,
}

#[derive(serde::Serialize)]
pub struct WallpaperStreamStartResult {
    pub upload_id: String,
    pub path: String,
}

#[derive(serde::Serialize)]
pub struct AttachmentStreamStartResult {
    pub upload_id: String,
    pub path: String,
}

#[derive(serde::Serialize)]
pub struct WallpaperCleanupResult {
    pub removed: usize,
    pub kept: usize,
}

#[derive(serde::Serialize)]
pub struct DataBundleResult {
    pub path: String,
    pub bytes: u64,
    pub files: usize,
}

#[derive(serde::Serialize)]
pub struct DataBundleImportResult {
    pub files: usize,
    pub skipped: usize,
}

fn decode_base64_payload(payload: &str) -> Result<Vec<u8>, String> {
    let raw = payload.trim();
    if raw.is_empty() {
        return Err("empty base64 payload".to_string());
    }
    let data = if raw.starts_with("data:") {
        let mut parts = raw.splitn(2, ',');
        let _meta = parts.next().unwrap_or("");
        parts.next().unwrap_or("")
    } else {
        raw
    };
    if data.is_empty() {
        return Err("empty base64 payload".to_string());
    }
    BASE64_ENGINE.decode(data).map_err(|e| e.to_string())
}

#[cfg(target_os = "android")]
fn resolve_export_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = get_data_dir(app).ok();
    let is_private = |dir: &PathBuf| {
        if let Some(base) = &app_data {
            if dir.starts_with(base) {
                return true;
            }
        }
        let raw = dir.to_string_lossy().to_lowercase();
        raw.contains("/android/data/") || raw.contains("/android/obb/")
    };
    if let Ok(dir) = app.path().download_dir() {
        if !is_private(&dir) {
            return Ok(dir);
        }
    }
    let mut candidates = Vec::new();
    if let Ok(base) = std::env::var("EXTERNAL_STORAGE") {
        candidates.push(PathBuf::from(base).join("Download"));
    }
    candidates.push(PathBuf::from("/storage/emulated/0/Download"));
    candidates.push(PathBuf::from("/sdcard/Download"));
    for dir in candidates {
        if fs::create_dir_all(&dir).is_ok() {
            return Ok(dir);
        }
    }
    Err("无法定位可写的下载目录，请检查系统权限".to_string())
}

#[cfg(not(target_os = "android"))]
fn resolve_export_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(dir) = app.path().download_dir() {
        return Ok(dir);
    }
    if let Ok(dir) = app.path().document_dir() {
        return Ok(dir);
    }
    get_data_dir(app)
}

#[cfg(target_os = "android")]
fn android_sdk_int(env: &mut JNIEnv) -> Result<i32, String> {
    let class = env
        .find_class("android/os/Build$VERSION")
        .map_err(|e| e.to_string())?;
    env.get_static_field(class, "SDK_INT", "I")
        .and_then(|value| value.i())
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "android")]
fn android_scan_file(env: &mut JNIEnv, context: &JObject, path: &Path) -> Result<(), String> {
    let scan_class = env
        .find_class("android/media/MediaScannerConnection")
        .map_err(|e| e.to_string())?;
    let path_str = path.to_string_lossy();
    let path_java = env
        .new_string(path_str.as_ref())
        .map_err(|e| e.to_string())?;
    let array = env
        .new_object_array(1, "java/lang/String", JObject::from(path_java))
        .map_err(|e| e.to_string())?;
    let null_obj = JObject::null();
    env.call_static_method(
        scan_class,
        "scanFile",
        "(Landroid/content/Context;[Ljava/lang/String;[Ljava/lang/String;Landroid/media/MediaScannerConnection$OnScanCompletedListener;)V",
        &[
            JValue::Object(context),
            JValue::Object(&array),
            JValue::Object(&null_obj),
            JValue::Object(&null_obj),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(target_os = "android")]
fn android_public_download_dir(env: &mut JNIEnv) -> Result<PathBuf, String> {
    let env_class = env
        .find_class("android/os/Environment")
        .map_err(|e| e.to_string())?;
    let dir_key = env
        .get_static_field(&env_class, "DIRECTORY_DOWNLOADS", "Ljava/lang/String;")
        .and_then(|value| value.l())
        .map_err(|e| e.to_string())?;
    let dir_file = env
        .call_static_method(
            env_class,
            "getExternalStoragePublicDirectory",
            "(Ljava/lang/String;)Ljava/io/File;",
            &[JValue::Object(&dir_key)],
        )
        .and_then(|value| value.l())
        .map_err(|e| e.to_string())?;
    let dir_path = env
        .call_method(dir_file, "getAbsolutePath", "()Ljava/lang/String;", &[])
        .and_then(|value| value.l())
        .map_err(|e| e.to_string())?;
    let dir_str: String = env
        .get_string(&JString::from(dir_path))
        .map_err(|e| e.to_string())?
        .into();
    Ok(PathBuf::from(dir_str))
}

#[cfg(target_os = "android")]
fn publish_bundle_legacy(
    app: &AppHandle,
    source_path: &Path,
    file_name: &str,
) -> Result<String, String> {
    let export_dir = resolve_export_dir(app)?;
    let target = export_dir.join(file_name);
    if source_path != target {
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::copy(source_path, &target).map_err(|e| e.to_string())?;
    }
    let ctx = android_context();
    let vm = unsafe { JavaVM::from_raw(ctx.vm().cast()) }.map_err(|e| e.to_string())?;
    let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;
    let context = unsafe { JObject::from_raw(ctx.context().cast()) };
    let _ = android_scan_file(&mut env, &context, &target);
    Ok(target.to_string_lossy().to_string())
}

#[cfg(target_os = "android")]
fn publish_bundle_mediastore(
    env: &mut JNIEnv,
    context: JObject,
    source_path: &Path,
    file_name: &str,
) -> Result<String, String> {
    let resolver = env
        .call_method(
            &context,
            "getContentResolver",
            "()Landroid/content/ContentResolver;",
            &[],
        )
        .and_then(|value| value.l())
        .map_err(|e| e.to_string())?;
    let values = env
        .new_object("android/content/ContentValues", "()V", &[])
        .map_err(|e| e.to_string())?;
    let media_columns = env
        .find_class("android/provider/MediaStore$MediaColumns")
        .map_err(|e| e.to_string())?;
    let display_key = env
        .get_static_field(&media_columns, "DISPLAY_NAME", "Ljava/lang/String;")
        .and_then(|value| value.l())
        .map_err(|e| e.to_string())?;
    let mime_key = env
        .get_static_field(&media_columns, "MIME_TYPE", "Ljava/lang/String;")
        .and_then(|value| value.l())
        .map_err(|e| e.to_string())?;
    let display_value = env.new_string(file_name).map_err(|e| e.to_string())?;
    let display_value_obj = JObject::from(display_value);
    env.call_method(
        &values,
        "put",
        "(Ljava/lang/String;Ljava/lang/String;)V",
        &[
            JValue::Object(&display_key),
            JValue::Object(&display_value_obj),
        ],
    )
    .map_err(|e| e.to_string())?;
    let mime_guess = extension_from_name(file_name)
        .and_then(|ext| mime_from_extension(&ext))
        .unwrap_or_else(|| "application/octet-stream".to_string());
    let mime_value = env.new_string(mime_guess).map_err(|e| e.to_string())?;
    let mime_value_obj = JObject::from(mime_value);
    env.call_method(
        &values,
        "put",
        "(Ljava/lang/String;Ljava/lang/String;)V",
        &[JValue::Object(&mime_key), JValue::Object(&mime_value_obj)],
    )
    .map_err(|e| e.to_string())?;
    if let Ok(relative_key) = env
        .get_static_field(&media_columns, "RELATIVE_PATH", "Ljava/lang/String;")
        .and_then(|value| value.l())
    {
        if let Ok(relative_value) = env.new_string("Download/") {
            let relative_value_obj = JObject::from(relative_value);
            let _ = env.call_method(
                &values,
                "put",
                "(Ljava/lang/String;Ljava/lang/String;)V",
                &[
                    JValue::Object(&relative_key),
                    JValue::Object(&relative_value_obj),
                ],
            );
        }
    }
    if let Ok(pending_key) = env
        .get_static_field(&media_columns, "IS_PENDING", "Ljava/lang/String;")
        .and_then(|value| value.l())
    {
        if let Ok(int_class) = env.find_class("java/lang/Integer") {
            if let Ok(pending_value) = env
                .call_static_method(
                    int_class,
                    "valueOf",
                    "(I)Ljava/lang/Integer;",
                    &[JValue::from(1)],
                )
                .and_then(|value| value.l())
            {
                let _ = env.call_method(
                    &values,
                    "put",
                    "(Ljava/lang/String;Ljava/lang/Integer;)V",
                    &[JValue::Object(&pending_key), JValue::Object(&pending_value)],
                );
            }
        }
    }
    let downloads_class = env
        .find_class("android/provider/MediaStore$Downloads")
        .map_err(|e| e.to_string())?;
    let base_uri = env
        .get_static_field(downloads_class, "EXTERNAL_CONTENT_URI", "Landroid/net/Uri;")
        .and_then(|value| value.l())
        .map_err(|e| e.to_string())?;
    let inserted = env
        .call_method(
            &resolver,
            "insert",
            "(Landroid/net/Uri;Landroid/content/ContentValues;)Landroid/net/Uri;",
            &[JValue::Object(&base_uri), JValue::Object(&values)],
        )
        .and_then(|value| value.l())
        .map_err(|e| e.to_string())?;
    if inserted.is_null() {
        return Err("无法写入下载目录".to_string());
    }
    let mode = env.new_string("w").map_err(|e| e.to_string())?;
    let mode_obj = JObject::from(mode);
    let pfd = env
        .call_method(
            &resolver,
            "openFileDescriptor",
            "(Landroid/net/Uri;Ljava/lang/String;)Landroid/os/ParcelFileDescriptor;",
            &[JValue::Object(&inserted), JValue::Object(&mode_obj)],
        )
        .and_then(|value| value.l())
        .map_err(|e| e.to_string())?;
    if pfd.is_null() {
        return Err("无法打开下载文件".to_string());
    }
    let fd = env
        .call_method(&pfd, "detachFd", "()I", &[])
        .and_then(|value| value.i())
        .map_err(|e| e.to_string())?;
    if fd < 0 {
        return Err("无法创建下载文件".to_string());
    }
    {
        let mut input = fs::File::open(source_path).map_err(|e| e.to_string())?;
        let mut output = unsafe { fs::File::from_raw_fd(fd) };
        std::io::copy(&mut input, &mut output).map_err(|e| e.to_string())?;
        output.sync_all().map_err(|e| e.to_string())?;
    }
    let _ = env.call_method(&pfd, "close", "()V", &[]);
    if let Ok(pending_key) = env
        .get_static_field(&media_columns, "IS_PENDING", "Ljava/lang/String;")
        .and_then(|value| value.l())
    {
        if let Ok(values) = env.new_object("android/content/ContentValues", "()V", &[]) {
            if let Ok(int_class) = env.find_class("java/lang/Integer") {
                if let Ok(pending_value) = env
                    .call_static_method(
                        int_class,
                        "valueOf",
                        "(I)Ljava/lang/Integer;",
                        &[JValue::from(0)],
                    )
                    .and_then(|value| value.l())
                {
                    let _ = env.call_method(
                        &values,
                        "put",
                        "(Ljava/lang/String;Ljava/lang/Integer;)V",
                        &[JValue::Object(&pending_key), JValue::Object(&pending_value)],
                    );
                    let null_obj = JObject::null();
                    let _ = env.call_method(
                        &resolver,
                        "update",
                        "(Landroid/net/Uri;Landroid/content/ContentValues;Ljava/lang/String;[Ljava/lang/String;)I",
                        &[
                            JValue::Object(&inserted),
                            JValue::Object(&values),
                            JValue::Object(&null_obj),
                            JValue::Object(&null_obj),
                        ],
                    );
                }
            }
        }
    }
    let download_path = android_public_download_dir(env)
        .map(|dir| dir.join(file_name))
        .unwrap_or_else(|_| PathBuf::from("Download").join(file_name));
    let _ = android_scan_file(env, &context, &download_path);
    Ok(download_path.to_string_lossy().to_string())
}

#[cfg(target_os = "android")]
fn publish_bundle_to_downloads(
    app: &AppHandle,
    source_path: &Path,
    file_name: &str,
) -> Result<String, String> {
    let ctx = android_context();
    let vm = unsafe { JavaVM::from_raw(ctx.vm().cast()) }.map_err(|e| e.to_string())?;
    let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;
    let context = unsafe { JObject::from_raw(ctx.context().cast()) };
    let sdk_int = android_sdk_int(&mut env).unwrap_or(29);
    if sdk_int < 29 {
        return publish_bundle_legacy(app, source_path, file_name);
    }
    publish_bundle_mediastore(&mut env, context, source_path, file_name)
        .or_else(|_| publish_bundle_legacy(app, source_path, file_name))
}

#[cfg(not(target_os = "android"))]
fn publish_bundle_to_downloads(
    app: &AppHandle,
    source_path: &Path,
    file_name: &str,
) -> Result<String, String> {
    let export_dir = resolve_export_dir(app)?;
    let target = export_dir.join(file_name);
    if source_path != target {
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::copy(source_path, &target).map_err(|e| e.to_string())?;
    }
    Ok(target.to_string_lossy().to_string())
}

#[cfg(target_os = "android")]
fn publish_image_to_gallery_bytes(
    bytes: &[u8],
    file_name: &str,
    mime_type: &str,
) -> Result<String, String> {
    let ctx = android_context();
    let vm = unsafe { JavaVM::from_raw(ctx.vm().cast()) }.map_err(|e| e.to_string())?;
    let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;
    let context = unsafe { JObject::from_raw(ctx.context().cast()) };
    let resolver = env
        .call_method(
            &context,
            "getContentResolver",
            "()Landroid/content/ContentResolver;",
            &[],
        )
        .and_then(|value| value.l())
        .map_err(|e| e.to_string())?;
    let values = env
        .new_object("android/content/ContentValues", "()V", &[])
        .map_err(|e| e.to_string())?;
    let media_columns = env
        .find_class("android/provider/MediaStore$MediaColumns")
        .map_err(|e| e.to_string())?;
    let display_key = env
        .get_static_field(&media_columns, "DISPLAY_NAME", "Ljava/lang/String;")
        .and_then(|value| value.l())
        .map_err(|e| e.to_string())?;
    let mime_key = env
        .get_static_field(&media_columns, "MIME_TYPE", "Ljava/lang/String;")
        .and_then(|value| value.l())
        .map_err(|e| e.to_string())?;
    let display_value = env.new_string(file_name).map_err(|e| e.to_string())?;
    let display_value_obj = JObject::from(display_value);
    env.call_method(
        &values,
        "put",
        "(Ljava/lang/String;Ljava/lang/String;)V",
        &[
            JValue::Object(&display_key),
            JValue::Object(&display_value_obj),
        ],
    )
    .map_err(|e| e.to_string())?;
    let mime_value = env.new_string(mime_type).map_err(|e| e.to_string())?;
    let mime_value_obj = JObject::from(mime_value);
    env.call_method(
        &values,
        "put",
        "(Ljava/lang/String;Ljava/lang/String;)V",
        &[JValue::Object(&mime_key), JValue::Object(&mime_value_obj)],
    )
    .map_err(|e| e.to_string())?;
    if let Ok(relative_key) = env
        .get_static_field(&media_columns, "RELATIVE_PATH", "Ljava/lang/String;")
        .and_then(|value| value.l())
    {
        if let Ok(relative_value) = env.new_string("Pictures/") {
            let relative_value_obj = JObject::from(relative_value);
            let _ = env.call_method(
                &values,
                "put",
                "(Ljava/lang/String;Ljava/lang/String;)V",
                &[
                    JValue::Object(&relative_key),
                    JValue::Object(&relative_value_obj),
                ],
            );
        }
    }
    if let Ok(pending_key) = env
        .get_static_field(&media_columns, "IS_PENDING", "Ljava/lang/String;")
        .and_then(|value| value.l())
    {
        if let Ok(int_class) = env.find_class("java/lang/Integer") {
            if let Ok(pending_value) = env
                .call_static_method(
                    int_class,
                    "valueOf",
                    "(I)Ljava/lang/Integer;",
                    &[JValue::from(1)],
                )
                .and_then(|value| value.l())
            {
                let _ = env.call_method(
                    &values,
                    "put",
                    "(Ljava/lang/String;Ljava/lang/Integer;)V",
                    &[JValue::Object(&pending_key), JValue::Object(&pending_value)],
                );
            }
        }
    }
    let images_class = env
        .find_class("android/provider/MediaStore$Images$Media")
        .map_err(|e| e.to_string())?;
    let base_uri = env
        .get_static_field(images_class, "EXTERNAL_CONTENT_URI", "Landroid/net/Uri;")
        .and_then(|value| value.l())
        .map_err(|e| e.to_string())?;
    let inserted = env
        .call_method(
            &resolver,
            "insert",
            "(Landroid/net/Uri;Landroid/content/ContentValues;)Landroid/net/Uri;",
            &[JValue::Object(&base_uri), JValue::Object(&values)],
        )
        .and_then(|value| value.l())
        .map_err(|e| e.to_string())?;
    if inserted.is_null() {
        return Err("无法写入相簿".to_string());
    }
    let mode = env.new_string("w").map_err(|e| e.to_string())?;
    let mode_obj = JObject::from(mode);
    let pfd = env
        .call_method(
            &resolver,
            "openFileDescriptor",
            "(Landroid/net/Uri;Ljava/lang/String;)Landroid/os/ParcelFileDescriptor;",
            &[JValue::Object(&inserted), JValue::Object(&mode_obj)],
        )
        .and_then(|value| value.l())
        .map_err(|e| e.to_string())?;
    if pfd.is_null() {
        return Err("无法打开相簿文件".to_string());
    }
    let fd = env
        .call_method(&pfd, "detachFd", "()I", &[])
        .and_then(|value| value.i())
        .map_err(|e| e.to_string())?;
    if fd < 0 {
        return Err("无法创建相簿文件".to_string());
    }
    {
        let mut output = unsafe { fs::File::from_raw_fd(fd) };
        output.write_all(bytes).map_err(|e| e.to_string())?;
        output.sync_all().map_err(|e| e.to_string())?;
    }
    let _ = env.call_method(&pfd, "close", "()V", &[]);
    if let Ok(pending_key) = env
        .get_static_field(&media_columns, "IS_PENDING", "Ljava/lang/String;")
        .and_then(|value| value.l())
    {
        if let Ok(values) = env.new_object("android/content/ContentValues", "()V", &[]) {
            if let Ok(int_class) = env.find_class("java/lang/Integer") {
                if let Ok(pending_value) = env
                    .call_static_method(
                        int_class,
                        "valueOf",
                        "(I)Ljava/lang/Integer;",
                        &[JValue::from(0)],
                    )
                    .and_then(|value| value.l())
                {
                    let _ = env.call_method(
                        &values,
                        "put",
                        "(Ljava/lang/String;Ljava/lang/Integer;)V",
                        &[JValue::Object(&pending_key), JValue::Object(&pending_value)],
                    );
                    let _ = env.call_method(
                        &resolver,
                        "update",
                        "(Landroid/net/Uri;Landroid/content/ContentValues;Ljava/lang/String;[Ljava/lang/String;)I",
                        &[
                            JValue::Object(&inserted),
                            JValue::Object(&values),
                            JValue::Object(&JObject::null()),
                            JValue::Object(&JObject::null()),
                        ],
                    );
                }
            }
        }
    }
    Ok(format!("Pictures/{}", file_name))
}

fn clear_data_dir(dir: &Path) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
        } else {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn is_sensitive_bundle_path(path: &Path) -> bool {
    let name = match path.file_name().and_then(|s| s.to_str()) {
        Some(value) => value,
        None => return false,
    };
    matches!(
        name,
        "config.json"
            | "llm_profiles_v1.json"
            | "llm_keyring_v1.json"
            | "llm_keyring_master_v1.json"
    )
}

fn add_dir_to_zip<W: Write + Seek>(
    writer: &mut ZipWriter<W>,
    base: &Path,
    dir: &Path,
    options: FileOptions,
    skip: Option<&Path>,
) -> Result<usize, String> {
    if is_sensitive_bundle_path(dir) {
        return Ok(0);
    }
    if let Some(skip_path) = skip {
        if dir == skip_path {
            return Ok(0);
        }
    }
    if dir.is_dir() {
        let rel = dir
            .strip_prefix(base)
            .map_err(|_| "invalid base path".to_string())?;
        if !rel.as_os_str().is_empty() {
            let name = format!("{}/", rel.to_string_lossy().replace('\\', "/"));
            writer
                .add_directory(name, options)
                .map_err(|e| e.to_string())?;
        }
        let mut count = 0;
        for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            count += add_dir_to_zip(writer, base, &entry.path(), options, skip)?;
        }
        return Ok(count);
    }
    let rel = dir
        .strip_prefix(base)
        .map_err(|_| "invalid base path".to_string())?;
    let name = rel.to_string_lossy().replace('\\', "/");
    writer
        .start_file(name, options)
        .map_err(|e| e.to_string())?;
    let mut file = fs::File::open(dir).map_err(|e| e.to_string())?;
    std::io::copy(&mut file, writer).map_err(|e| e.to_string())?;
    Ok(1)
}

fn import_bundle_from_reader<R: Read + Seek>(
    data_dir: &Path,
    memory_db: &MemoryDb,
    reader: R,
    mode: &str,
) -> Result<DataBundleImportResult, String> {
    memory_db.close_all();
    if mode != "merge" {
        clear_data_dir(data_dir)?;
    }
    let mut archive = ZipArchive::new(reader).map_err(|e| e.to_string())?;
    let mut files = 0usize;
    let mut skipped = 0usize;
    for i in 0..archive.len() {
        let mut file = match archive.by_index(i) {
            Ok(entry) => entry,
            Err(err) => {
                skipped += 1;
                eprintln!("[import_bundle] read entry failed: {}", err);
                continue;
            }
        };
        let name = file.name().to_string();
        if name == "bundle.json" {
            continue;
        }
        if is_sensitive_bundle_path(Path::new(&name)) {
            continue;
        }
        if name.ends_with('/') {
            let Some(rel) = file.enclosed_name() else {
                skipped += 1;
                eprintln!("[import_bundle] unsafe path: {}", name);
                continue;
            };
            let out_dir = data_dir.join(rel);
            if let Err(err) = fs::create_dir_all(&out_dir) {
                skipped += 1;
                eprintln!("[import_bundle] mkdir failed: {} ({})", name, err);
            }
            continue;
        }
        let Some(rel) = file.enclosed_name() else {
            skipped += 1;
            eprintln!("[import_bundle] unsafe path: {}", name);
            continue;
        };
        let out_path = data_dir.join(rel);
        if let Some(parent) = out_path.parent() {
            if let Err(err) = fs::create_dir_all(parent) {
                skipped += 1;
                eprintln!("[import_bundle] mkdir failed: {} ({})", name, err);
                continue;
            }
        }
        let mut outfile = match fs::File::create(&out_path) {
            Ok(f) => f,
            Err(err) => {
                skipped += 1;
                eprintln!("[import_bundle] create file failed: {} ({})", name, err);
                continue;
            }
        };
        if let Err(err) = std::io::copy(&mut file, &mut outfile) {
            skipped += 1;
            eprintln!("[import_bundle] write failed: {} ({})", name, err);
            continue;
        }
        files += 1;
    }
    Ok(DataBundleImportResult { files, skipped })
}

/// Ensure bundled media assets exist in app data dir.
#[tauri::command]
pub async fn ensure_media_bundle(app: AppHandle) -> Result<MediaBundleInfo, String> {
    let data_dir = get_data_dir(&app)?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    let target_dir = data_dir.join("media");
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    let manifest_path = target_dir.join("manifest.json");

    let mut copied = false;
    let mut warning = None;

    if !manifest_path.exists() {
        match app.path().resource_dir() {
            Ok(resource_dir) => {
                let candidates = [
                    resource_dir.join("media"),
                    resource_dir.join("resources").join("media"),
                    resource_dir
                        .join("src-tauri")
                        .join("resources")
                        .join("media"),
                ];
                let mut picked = None;
                for dir in candidates {
                    if dir.exists() {
                        picked = Some(dir);
                        break;
                    }
                }
                if let Some(src_dir) = picked {
                    if let Err(err) = copy_dir_recursive(&src_dir, &target_dir) {
                        warning = Some(format!("copy media bundle failed: {}", err));
                    } else {
                        copied = true;
                    }
                } else {
                    warning = Some("media bundle not found in resources".to_string());
                }
            }
            Err(err) => {
                warning = Some(format!("resource_dir unavailable: {}", err));
            }
        }
    }

    let manifest = if manifest_path.exists() {
        match fs::read_to_string(&manifest_path) {
            Ok(json) => serde_json::from_str::<Value>(&json).ok(),
            Err(err) => {
                warning = Some(format!("read media manifest failed: {}", err));
                None
            }
        }
    } else {
        None
    };

    Ok(MediaBundleInfo {
        ready: manifest.is_some(),
        copied,
        base_dir: target_dir.to_string_lossy().to_string(),
        manifest,
        warning,
    })
}

/// 保存聊天壁纸到本地（AppData）
#[tauri::command]
pub async fn save_wallpaper(
    app: AppHandle,
    session_id: String,
    data_url: String,
    file_name: Option<String>,
    previous_path: Option<String>,
) -> Result<WallpaperSaveResult, String> {
    let data_dir = get_data_dir(&app)?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let safe_sid = sanitize_segment(&session_id);
    let wallpaper_root = data_dir.join("wallpapers").join(&safe_sid);
    fs::create_dir_all(&wallpaper_root).map_err(|e| e.to_string())?;

    let (bytes, ext_from_mime) = decode_data_url(&data_url)?;
    let ext_from_name = file_name.as_deref().and_then(extension_from_name);
    let ext = ext_from_mime
        .or(ext_from_name)
        .unwrap_or_else(|| "png".to_string());
    let stem = sanitize_segment(file_name.as_deref().unwrap_or("wallpaper"));
    let ts = chrono::Utc::now().timestamp();
    let file = wallpaper_root.join(format!("wallpaper_{safe_sid}_{stem}_{ts}.{ext}"));
    fs::write(&file, &bytes).map_err(|e| e.to_string())?;

    if let Some(prev) = previous_path {
        let prev_path = PathBuf::from(prev);
        if prev_path.starts_with(&wallpaper_root) && prev_path.exists() {
            let _ = fs::remove_file(prev_path);
        }
    }

    Ok(WallpaperSaveResult {
        path: file.to_string_lossy().to_string(),
        bytes: bytes.len(),
    })
}

/// 保存聊天壁纸（分块传输，支持原图无损保存）
#[tauri::command]
pub async fn save_wallpaper_chunked(
    app: AppHandle,
    session_id: String,
    chunks: Vec<String>,
    file_name: Option<String>,
    mime_type: Option<String>,
    previous_path: Option<String>,
) -> Result<WallpaperSaveResult, String> {
    let data_dir = get_data_dir(&app)?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let safe_sid = sanitize_segment(&session_id);
    let wallpaper_root = data_dir.join("wallpapers").join(&safe_sid);
    fs::create_dir_all(&wallpaper_root).map_err(|e| e.to_string())?;

    // 合并所有Base64块并解码
    let combined = chunks.join("");
    let bytes = BASE64_ENGINE
        .decode(&combined)
        .map_err(|e| format!("Base64解码失败: {}", e))?;

    // 确定扩展名
    let ext_from_mime = mime_type.as_deref().and_then(|m| match m {
        "image/png" => Some("png".to_string()),
        "image/jpeg" | "image/jpg" => Some("jpg".to_string()),
        "image/webp" => Some("webp".to_string()),
        "image/gif" => Some("gif".to_string()),
        _ => None,
    });
    let ext_from_name = file_name.as_deref().and_then(extension_from_name);
    let ext = ext_from_mime
        .or(ext_from_name)
        .unwrap_or_else(|| "png".to_string());

    let stem = sanitize_segment(file_name.as_deref().unwrap_or("wallpaper"));
    let ts = chrono::Utc::now().timestamp();
    let file = wallpaper_root.join(format!("wallpaper_{safe_sid}_{stem}_{ts}.{ext}"));

    fs::write(&file, &bytes).map_err(|e| e.to_string())?;

    // 删除旧壁纸
    if let Some(prev) = previous_path {
        let prev_path = PathBuf::from(prev);
        if prev_path.starts_with(&wallpaper_root) && prev_path.exists() {
            let _ = fs::remove_file(prev_path);
        }
    }

    Ok(WallpaperSaveResult {
        path: file.to_string_lossy().to_string(),
        bytes: bytes.len(),
    })
}

/// 保存聊天壁纸（流式分块，避免大 payload）
#[tauri::command]
pub async fn save_wallpaper_stream_start(
    app: AppHandle,
    session_id: String,
    file_name: Option<String>,
    mime_type: Option<String>,
    previous_path: Option<String>,
    state: State<'_, WallpaperStreamState>,
) -> Result<WallpaperStreamStartResult, String> {
    let data_dir = get_data_dir(&app)?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let safe_sid = sanitize_segment(&session_id);
    let wallpaper_root = data_dir.join("wallpapers").join(&safe_sid);
    fs::create_dir_all(&wallpaper_root).map_err(|e| e.to_string())?;

    let ext_from_mime = mime_type.as_deref().and_then(|m| match m {
        "image/png" => Some("png".to_string()),
        "image/jpeg" | "image/jpg" => Some("jpg".to_string()),
        "image/webp" => Some("webp".to_string()),
        "image/gif" => Some("gif".to_string()),
        _ => None,
    });
    let ext_from_name = file_name.as_deref().and_then(extension_from_name);
    let ext = ext_from_mime
        .or(ext_from_name)
        .unwrap_or_else(|| "png".to_string());
    let stem = sanitize_segment(file_name.as_deref().unwrap_or("wallpaper"));
    let ts = chrono::Utc::now().timestamp_millis();
    let file = wallpaper_root.join(format!("wallpaper_{safe_sid}_{stem}_{ts}.{ext}"));

    fs::write(&file, &[]).map_err(|e| e.to_string())?;

    let upload_id = format!("{safe_sid}_{ts}");
    let entry = WallpaperStreamEntry {
        path: file.clone(),
        previous_path,
    };
    let mut map = state
        .inner
        .lock()
        .map_err(|_| "stream state lock poisoned".to_string())?;
    map.insert(upload_id.clone(), entry);

    Ok(WallpaperStreamStartResult {
        upload_id,
        path: file.to_string_lossy().to_string(),
    })
}

/// 追加壁纸分块
#[tauri::command]
pub async fn save_wallpaper_stream_chunk(
    upload_id: String,
    chunk: String,
    state: State<'_, WallpaperStreamState>,
) -> Result<(), String> {
    let (path, _) = {
        let map = state
            .inner
            .lock()
            .map_err(|_| "stream state lock poisoned".to_string())?;
        let entry = map
            .get(upload_id.trim())
            .ok_or("invalid upload id".to_string())?;
        (entry.path.clone(), entry.previous_path.clone())
    };

    let bytes = decode_base64_payload(&chunk)?;
    let mut file = OpenOptions::new()
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    Ok(())
}

/// 完成保存壁纸
#[tauri::command]
pub async fn save_wallpaper_stream_finish(
    upload_id: String,
    state: State<'_, WallpaperStreamState>,
) -> Result<WallpaperSaveResult, String> {
    let entry = {
        let mut map = state
            .inner
            .lock()
            .map_err(|_| "stream state lock poisoned".to_string())?;
        map.remove(upload_id.trim())
            .ok_or("invalid upload id".to_string())?
    };

    if let Some(prev) = entry.previous_path.clone() {
        let prev_path = PathBuf::from(prev);
        if prev_path.starts_with(entry.path.parent().unwrap_or(Path::new(""))) && prev_path.exists()
        {
            let _ = fs::remove_file(prev_path);
        }
    }

    let bytes = fs::metadata(&entry.path).map_err(|e| e.to_string())?.len() as usize;

    Ok(WallpaperSaveResult {
        path: entry.path.to_string_lossy().to_string(),
        bytes,
    })
}

/// 删除聊天壁纸文件
#[tauri::command]
pub async fn delete_wallpaper(
    app: AppHandle,
    session_id: String,
    path: Option<String>,
) -> Result<bool, String> {
    let raw = path.unwrap_or_default();
    if raw.trim().is_empty() {
        return Ok(false);
    }
    let data_dir = get_data_dir(&app)?;
    let safe_sid = sanitize_segment(&session_id);
    let wallpaper_root = data_dir.join("wallpapers").join(&safe_sid);
    let target = PathBuf::from(raw);
    if !target.starts_with(&wallpaper_root) {
        return Err("invalid wallpaper path".to_string());
    }
    if target.exists() {
        fs::remove_file(&target).map_err(|e| e.to_string())?;
        return Ok(true);
    }
    Ok(false)
}

/// 保存附件图片到本地（AppData）
#[tauri::command]
pub async fn save_attachment(
    app: AppHandle,
    session_id: String,
    data_url: String,
    file_name: Option<String>,
) -> Result<AttachmentSaveResult, String> {
    let data_dir = get_data_dir(&app)?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let safe_sid = sanitize_segment(&session_id);
    let attach_root = data_dir.join("attachments").join(&safe_sid);
    fs::create_dir_all(&attach_root).map_err(|e| e.to_string())?;

    let (bytes, ext_from_mime) = decode_data_url(&data_url)?;
    let ext_from_name = file_name.as_deref().and_then(extension_from_name);
    let ext = ext_from_mime
        .or(ext_from_name)
        .unwrap_or_else(|| "png".to_string());
    let stem = sanitize_segment(file_name.as_deref().unwrap_or("attachment"));
    let ts = chrono::Utc::now().timestamp_millis();
    let file = attach_root.join(format!("attachment_{safe_sid}_{stem}_{ts}.{ext}"));
    fs::write(&file, &bytes).map_err(|e| e.to_string())?;

    Ok(AttachmentSaveResult {
        path: file.to_string_lossy().to_string(),
        bytes: bytes.len(),
    })
}

/// 保存附件（base64 字节，用于非图片文件）
#[tauri::command]
pub async fn save_attachment_bytes(
    app: AppHandle,
    session_id: String,
    base64: String,
    file_name: Option<String>,
) -> Result<AttachmentSaveResult, String> {
    let data_dir = get_data_dir(&app)?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let safe_sid = sanitize_segment(&session_id);
    let attach_root = data_dir.join("attachments").join(&safe_sid);
    fs::create_dir_all(&attach_root).map_err(|e| e.to_string())?;

    let bytes = decode_base64_payload(&base64)?;
    let ext_from_name = file_name.as_deref().and_then(extension_from_name);
    let ext = ext_from_name.unwrap_or_else(|| "bin".to_string());
    let stem = sanitize_segment(file_name.as_deref().unwrap_or("attachment"));
    let ts = chrono::Utc::now().timestamp_millis();
    let file = attach_root.join(format!("attachment_{safe_sid}_{stem}_{ts}.{ext}"));
    write_bytes_file(&file, &bytes)?;

    Ok(AttachmentSaveResult {
        path: file.to_string_lossy().to_string(),
        bytes: bytes.len(),
    })
}

/// 保存附件（流式分块，避免超大 payload）
#[tauri::command]
pub async fn save_attachment_stream_start(
    app: AppHandle,
    session_id: String,
    file_name: Option<String>,
    mime_type: Option<String>,
    state: State<'_, AttachmentStreamState>,
) -> Result<AttachmentStreamStartResult, String> {
    let data_dir = get_data_dir(&app)?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let safe_sid = sanitize_segment(&session_id);
    let attach_root = data_dir.join("attachments").join(&safe_sid);
    fs::create_dir_all(&attach_root).map_err(|e| e.to_string())?;

    let ext_from_mime = mime_type.as_deref().and_then(|m| match m {
        "image/png" => Some("png".to_string()),
        "image/jpeg" | "image/jpg" => Some("jpg".to_string()),
        "image/webp" => Some("webp".to_string()),
        "image/gif" => Some("gif".to_string()),
        _ => None,
    });
    let ext_from_name = file_name.as_deref().and_then(extension_from_name);
    let ext = ext_from_mime
        .or(ext_from_name)
        .unwrap_or_else(|| "png".to_string());
    let stem = sanitize_segment(file_name.as_deref().unwrap_or("attachment"));
    let ts = chrono::Utc::now().timestamp_millis();
    let file = attach_root.join(format!("attachment_{safe_sid}_{stem}_{ts}.{ext}"));

    fs::write(&file, &[]).map_err(|e| e.to_string())?;

    let upload_id = format!("{safe_sid}_{ts}");
    let entry = AttachmentStreamEntry { path: file.clone() };
    let mut map = state
        .inner
        .lock()
        .map_err(|_| "stream state lock poisoned".to_string())?;
    map.insert(upload_id.clone(), entry);

    Ok(AttachmentStreamStartResult {
        upload_id,
        path: file.to_string_lossy().to_string(),
    })
}

/// 追加附件分块
#[tauri::command]
pub async fn save_attachment_stream_chunk(
    upload_id: String,
    chunk: String,
    state: State<'_, AttachmentStreamState>,
) -> Result<(), String> {
    let path = {
        let map = state
            .inner
            .lock()
            .map_err(|_| "stream state lock poisoned".to_string())?;
        let entry = map
            .get(upload_id.trim())
            .ok_or("invalid upload id".to_string())?;
        entry.path.clone()
    };

    let bytes = decode_base64_payload(&chunk)?;
    let mut file = OpenOptions::new()
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    Ok(())
}

/// 完成附件分块保存
#[tauri::command]
pub async fn save_attachment_stream_finish(
    upload_id: String,
    state: State<'_, AttachmentStreamState>,
) -> Result<AttachmentSaveResult, String> {
    let entry = {
        let mut map = state
            .inner
            .lock()
            .map_err(|_| "stream state lock poisoned".to_string())?;
        map.remove(upload_id.trim())
            .ok_or("invalid upload id".to_string())?
    };

    let bytes = fs::metadata(&entry.path).map_err(|e| e.to_string())?.len() as usize;

    Ok(AttachmentSaveResult {
        path: entry.path.to_string_lossy().to_string(),
        bytes,
    })
}

/// 删除附件文件
#[tauri::command]
pub async fn delete_attachment(
    app: AppHandle,
    session_id: String,
    path: String,
) -> Result<bool, String> {
    let raw = path.trim();
    if raw.is_empty() {
        return Ok(false);
    }
    let data_dir = get_data_dir(&app)?;
    let safe_sid = sanitize_segment(&session_id);
    let attach_root = data_dir.join("attachments").join(&safe_sid);
    let target = PathBuf::from(raw);
    if !target.starts_with(&attach_root) {
        return Err("invalid attachment path".to_string());
    }
    if target.exists() {
        fs::remove_file(&target).map_err(|e| e.to_string())?;
        return Ok(true);
    }
    Ok(false)
}

/// 导出附件到下载目录或指定路径
#[tauri::command]
pub async fn export_attachment(
    app: AppHandle,
    source_path: Option<String>,
    data_url: Option<String>,
    file_name: Option<String>,
    path: Option<String>,
) -> Result<AttachmentSaveResult, String> {
    let raw_name = file_name.as_deref().unwrap_or("download");
    let name_with_ext = ensure_extension(raw_name, None);
    let mut safe_name = sanitize_download_name(&name_with_ext);
    let target_path = path.unwrap_or_default();
    let source = source_path.unwrap_or_default();
    let data = data_url.unwrap_or_default();

    if !source.trim().is_empty() {
        let src_path = PathBuf::from(source.trim());
        if !src_path.exists() {
            return Err("source file missing".to_string());
        }
        let ext = extension_from_name(raw_name).or_else(|| {
            src_path
                .extension()
                .map(|v| v.to_string_lossy().to_string())
        });
        let mime = ext.as_ref().and_then(|v| mime_from_extension(v));
        if let Some(mime) = &mime {
            if is_image_mime(mime) && target_path.trim().is_empty() && mime != "image/gif" {
                safe_name = sanitize_download_name(&ensure_extension(raw_name, ext.as_deref()));
                #[cfg(target_os = "android")]
                {
                    let bytes = fs::read(&src_path).map_err(|e| e.to_string())?;
                    let published = publish_image_to_gallery_bytes(&bytes, &safe_name, mime)?;
                    return Ok(AttachmentSaveResult {
                        path: published,
                        bytes: bytes.len(),
                    });
                }
            }
        }
        let bytes = fs::metadata(&src_path).map_err(|e| e.to_string())?.len() as usize;
        if !target_path.trim().is_empty() {
            let dst = PathBuf::from(target_path.trim());
            if let Some(parent) = dst.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            if src_path != dst {
                fs::copy(&src_path, &dst).map_err(|e| e.to_string())?;
            }
            return Ok(AttachmentSaveResult {
                path: dst.to_string_lossy().to_string(),
                bytes,
            });
        }
        let published = publish_bundle_to_downloads(&app, &src_path, &safe_name)?;
        return Ok(AttachmentSaveResult {
            path: published,
            bytes,
        });
    }

    if data.trim().is_empty() {
        return Err("missing export data".to_string());
    }
    let (bytes, ext_from_mime) = decode_data_url(&data)?;
    let data_mime = mime_from_data_url(&data)
        .or_else(|| ext_from_mime.as_ref().and_then(|v| mime_from_extension(v)));
    if let Some(mime) = data_mime {
        if is_image_mime(&mime) && target_path.trim().is_empty() && mime != "image/gif" {
            safe_name =
                sanitize_download_name(&ensure_extension(raw_name, ext_from_mime.as_deref()));
            #[cfg(target_os = "android")]
            {
                let published = publish_image_to_gallery_bytes(&bytes, &safe_name, &mime)?;
                return Ok(AttachmentSaveResult {
                    path: published,
                    bytes: bytes.len(),
                });
            }
        }
    }
    if !target_path.trim().is_empty() {
        let dst = PathBuf::from(target_path.trim());
        write_bytes_file(&dst, &bytes)?;
        return Ok(AttachmentSaveResult {
            path: dst.to_string_lossy().to_string(),
            bytes: bytes.len(),
        });
    }
    let data_dir = get_data_dir(&app)?;
    let temp_dir = data_dir.join("exports_tmp");
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let temp_name = if ext_from_mime.is_some() {
        sanitize_download_name(&ensure_extension(raw_name, ext_from_mime.as_deref()))
    } else {
        safe_name
    };
    let temp_path = temp_dir.join(&temp_name);
    write_bytes_file(&temp_path, &bytes)?;
    let published = publish_bundle_to_downloads(&app, &temp_path, &temp_name)?;
    Ok(AttachmentSaveResult {
        path: published,
        bytes: bytes.len(),
    })
}

/// 导出贴图帧序列为 GIF
#[tauri::command]
pub async fn export_sticker_gif(
    app: AppHandle,
    frames: Vec<String>,
    fps: Option<u16>,
    file_name: Option<String>,
    path: Option<String>,
) -> Result<AttachmentSaveResult, String> {
    if frames.is_empty() {
        return Err("no sticker frames".to_string());
    }
    let fps = fps.unwrap_or(12).clamp(1, 60);
    let delay = ((100.0 / fps as f32).round() as u16).max(1);
    let mut images: Vec<RgbaImage> = Vec::new();
    let mut max_w = 0u32;
    let mut max_h = 0u32;
    for frame in frames.iter() {
        let raw = frame.trim();
        if raw.is_empty() {
            continue;
        }
        let img = if raw.starts_with("data:") {
            let (bytes, _ext) = decode_data_url(raw)?;
            image::load_from_memory(&bytes).map_err(|e| e.to_string())?
        } else {
            let mut normalized = raw.to_string();
            if let Some(stripped) = normalized.strip_prefix("file:///") {
                normalized = stripped.to_string();
            } else if let Some(stripped) = normalized.strip_prefix("file://") {
                normalized = stripped.to_string();
            }
            let candidate = PathBuf::from(normalized);
            if !candidate.exists() {
                return Err(format!("frame missing: {}", raw));
            }
            image::open(&candidate).map_err(|e| e.to_string())?
        };
        let rgba = img.to_rgba8();
        max_w = max_w.max(rgba.width());
        max_h = max_h.max(rgba.height());
        images.push(rgba);
    }
    if images.is_empty() || max_w == 0 || max_h == 0 {
        return Err("invalid sticker frames".to_string());
    }

    let raw_name = file_name.unwrap_or_else(|| "sticker.gif".to_string());
    let safe_name = sanitize_download_name(&ensure_extension(&raw_name, Some("gif")));
    let target_path = path.unwrap_or_default();
    let mut publish_download = false;
    let output_path = if target_path.trim().is_empty() {
        let data_dir = get_data_dir(&app)?;
        let temp_dir = data_dir.join("exports_tmp");
        fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
        publish_download = true;
        temp_dir.join(&safe_name)
    } else {
        PathBuf::from(target_path.trim())
    };
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut file = fs::File::create(&output_path).map_err(|e| e.to_string())?;
    {
        let mut encoder = GifEncoder::new(&mut file, max_w as u16, max_h as u16, &[])
            .map_err(|e| e.to_string())?;
        encoder
            .set_repeat(GifRepeat::Infinite)
            .map_err(|e| e.to_string())?;
        for rgba in images {
            let canvas = if rgba.width() == max_w && rgba.height() == max_h {
                rgba
            } else {
                let mut base = RgbaImage::from_pixel(max_w, max_h, image::Rgba([0, 0, 0, 0]));
                let x = ((max_w - rgba.width()) / 2) as i64;
                let y = ((max_h - rgba.height()) / 2) as i64;
                overlay(&mut base, &rgba, x, y);
                base
            };
            let mut raw = canvas.into_raw();
            let mut frame = GifFrame::from_rgba_speed(max_w as u16, max_h as u16, &mut raw, 10);
            frame.delay = delay;
            encoder.write_frame(&frame).map_err(|e| e.to_string())?;
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    let bytes = fs::metadata(&output_path).map_err(|e| e.to_string())?.len() as usize;
    if publish_download {
        let published = publish_bundle_to_downloads(&app, &output_path, &safe_name)?;
        return Ok(AttachmentSaveResult {
            path: published,
            bytes,
        });
    }
    Ok(AttachmentSaveResult {
        path: output_path.to_string_lossy().to_string(),
        bytes,
    })
}

/// 导出切割结果为 ZIP
#[tauri::command]
pub async fn export_sticker_zip(
    app: AppHandle,
    entries: Vec<StickerZipEntry>,
    file_name: Option<String>,
    path: Option<String>,
) -> Result<AttachmentSaveResult, String> {
    if entries.is_empty() {
        return Err("no zip entries".to_string());
    }
    let safe_name = sanitize_segment(file_name.as_deref().unwrap_or("sticker_slices.zip"));
    let target_path = path.unwrap_or_default();
    let data_dir = get_data_dir(&app)?;
    let mut publish_download = false;
    let output_path = if target_path.trim().is_empty() {
        let temp_dir = data_dir.join("exports_tmp");
        fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
        publish_download = true;
        temp_dir.join(&safe_name)
    } else {
        PathBuf::from(target_path.trim())
    };

    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let file = fs::File::create(&output_path).map_err(|e| e.to_string())?;
    let mut writer = ZipWriter::new(file);
    let options = FileOptions::default().compression_method(CompressionMethod::Deflated);
    for (idx, entry) in entries.iter().enumerate() {
        let name_raw = if entry.name.trim().is_empty() {
            format!("slice_{}.png", idx + 1)
        } else {
            entry.name.trim().to_string()
        };
        let entry_name = sanitize_segment(&name_raw);
        let payload = if let Some(path) = &entry.path {
            let src = PathBuf::from(path.trim());
            if !src.exists() {
                continue;
            }
            fs::read(&src).map_err(|e| e.to_string())?
        } else if let Some(data_url) = &entry.data_url {
            let (bytes, _ext) = decode_data_url(data_url)?;
            bytes
        } else {
            continue;
        };
        writer
            .start_file(entry_name, options)
            .map_err(|e| e.to_string())?;
        writer.write_all(&payload).map_err(|e| e.to_string())?;
    }
    writer.finish().map_err(|e| e.to_string())?;
    let bytes = fs::metadata(&output_path).map_err(|e| e.to_string())?.len() as usize;

    if publish_download {
        let published = publish_bundle_to_downloads(&app, &output_path, &safe_name)?;
        return Ok(AttachmentSaveResult {
            path: published,
            bytes,
        });
    }
    Ok(AttachmentSaveResult {
        path: output_path.to_string_lossy().to_string(),
        bytes,
    })
}

/// 清理未引用的壁纸文件
#[tauri::command]
pub async fn cleanup_wallpapers(
    app: AppHandle,
    referenced_paths: Vec<String>,
) -> Result<WallpaperCleanupResult, String> {
    let data_dir = get_data_dir(&app)?;
    let wallpaper_root = data_dir.join("wallpapers");
    if !wallpaper_root.exists() {
        return Ok(WallpaperCleanupResult {
            removed: 0,
            kept: 0,
        });
    }

    let mut referenced = std::collections::HashSet::new();
    for raw in referenced_paths {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        referenced.insert(trimmed.to_string());
        if let Ok(canon) = PathBuf::from(trimmed).canonicalize() {
            referenced.insert(canon.to_string_lossy().to_string());
        }
    }

    let mut removed = 0usize;
    let mut kept = 0usize;
    let mut stack = vec![wallpaper_root.clone()];
    while let Some(dir) = stack.pop() {
        let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let raw_path = path.to_string_lossy().to_string();
            let mut in_use = referenced.contains(&raw_path);
            if !in_use {
                if let Ok(canon) = path.canonicalize() {
                    let canon_str = canon.to_string_lossy().to_string();
                    if referenced.contains(&canon_str) {
                        in_use = true;
                    }
                }
            }
            if in_use {
                kept += 1;
            } else {
                fs::remove_file(&path).map_err(|e| e.to_string())?;
                removed += 1;
            }
        }
    }

    Ok(WallpaperCleanupResult { removed, kept })
}

/// 导出本地资料包（聊天记录/联系人/壁纸/记忆表格等）
#[tauri::command]
pub async fn export_data_bundle(
    app: AppHandle,
    state: State<'_, MemoryDb>,
    path: Option<String>,
) -> Result<DataBundleResult, String> {
    state.close_all();
    let data_dir = get_data_dir(&app)?;
    let ts = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let file_name = format!("chatapp_backup_{ts}.zip");
    let mut output_path: PathBuf;
    #[cfg(target_os = "android")]
    let mut publish_download = false;
    let raw_path = path.unwrap_or_default();
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        #[cfg(target_os = "android")]
        {
            let temp_dir = data_dir.join("exports_tmp");
            output_path = temp_dir.join(&file_name);
            publish_download = true;
        }
        #[cfg(not(target_os = "android"))]
        {
            output_path = resolve_export_dir(&app)?.join(&file_name);
        }
    } else {
        output_path = PathBuf::from(trimmed);
        if output_path.extension().is_none() {
            output_path.set_extension("zip");
        }
        if output_path.is_dir() {
            output_path = output_path.join(&file_name);
        }
    }
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let file = fs::File::create(&output_path).map_err(|e| e.to_string())?;
    let mut writer = ZipWriter::new(file);
    let options = FileOptions::default().compression_method(CompressionMethod::Deflated);

    let manifest = serde_json::json!({
        "format": "tauri-chat-app-backup-v1",
        "createdAt": chrono::Utc::now().to_rfc3339(),
        "appVersion": env!("CARGO_PKG_VERSION"),
        "excluded": [
            "config.json",
            "llm_profiles_v1.json",
            "llm_keyring_v1.json",
            "llm_keyring_master_v1.json"
        ]
    });
    writer
        .start_file("bundle.json", options)
        .map_err(|e| e.to_string())?;
    writer
        .write_all(manifest.to_string().as_bytes())
        .map_err(|e| e.to_string())?;

    let files = add_dir_to_zip(
        &mut writer,
        &data_dir,
        &data_dir,
        options,
        Some(&output_path),
    )?;
    writer.finish().map_err(|e| e.to_string())?;
    let bytes = fs::metadata(&output_path).map_err(|e| e.to_string())?.len();
    let mut result_path = output_path.to_string_lossy().to_string();
    #[cfg(target_os = "android")]
    {
        if publish_download {
            let published = publish_bundle_to_downloads(&app, &output_path, &file_name)?;
            let _ = fs::remove_file(&output_path);
            result_path = published;
        }
    }

    Ok(DataBundleResult {
        path: result_path,
        bytes,
        files,
    })
}

/// 导入本地资料包
#[tauri::command]
pub async fn import_data_bundle(
    app: AppHandle,
    path: String,
    mode: Option<String>,
    state: State<'_, MemoryDb>,
) -> Result<DataBundleImportResult, String> {
    let mode = mode.unwrap_or_else(|| "replace".to_string()).to_lowercase();
    let data_dir = get_data_dir(&app)?;
    let path_buf = PathBuf::from(path);
    if mode != "merge" && path_buf.starts_with(&data_dir) {
        let bytes = fs::read(&path_buf).map_err(|e| e.to_string())?;
        let cursor = std::io::Cursor::new(bytes);
        return import_bundle_from_reader(&data_dir, &state, cursor, &mode);
    }
    let file = fs::File::open(&path_buf).map_err(|e| e.to_string())?;
    import_bundle_from_reader(&data_dir, &state, file, &mode)
}

/// 导入本地资料包（base64/dataURL）
#[tauri::command]
pub async fn import_data_bundle_bytes(
    app: AppHandle,
    data: String,
    mode: Option<String>,
    state: State<'_, MemoryDb>,
) -> Result<DataBundleImportResult, String> {
    let mode = mode.unwrap_or_else(|| "replace".to_string()).to_lowercase();
    let data_dir = get_data_dir(&app)?;
    let bytes = decode_base64_payload(&data)?;
    let cursor = std::io::Cursor::new(bytes);
    import_bundle_from_reader(&data_dir, &state, cursor, &mode)
}

/// 保存配置
#[tauri::command]
pub async fn save_config(app: AppHandle, config: Value) -> Result<(), String> {
    let data_dir = get_data_dir(&app)?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    let config_path = data_dir.join("config.json");

    // 加密敏感字段
    let mut config_to_save = config.clone();
    if let Some(api_key) = config_to_save.get("apiKey").and_then(|v| v.as_str()) {
        let encrypted = simple_encrypt(api_key);
        if let Some(obj) = config_to_save.as_object_mut() {
            obj.insert("apiKey".to_string(), Value::String(encrypted));
            obj.insert("_encrypted".to_string(), Value::Bool(true));
        }
    }

    let json = serde_json::to_string_pretty(&config_to_save).map_err(|e| e.to_string())?;
    fs::write(config_path, json).map_err(|e| e.to_string())?;

    Ok(())
}

/// 加载配置
#[tauri::command]
pub async fn load_config(app: AppHandle) -> Result<Value, String> {
    let data_dir = get_data_dir(&app)?;
    let config_path = data_dir.join("config.json");

    if !config_path.exists() {
        // 返回默认配置
        return Ok(serde_json::json!({
            "provider": "openai",
            "baseUrl": "https://api.openai.com/v1",
            "model": "gpt-3.5-turbo",
            "stream": true,
            "apiKey": ""
        }));
    }

    let json = fs::read_to_string(config_path).map_err(|e| e.to_string())?;
    let mut config: Value = serde_json::from_str(&json).map_err(|e| e.to_string())?;

    // 解密 API Key
    if let Some(obj) = config.as_object_mut() {
        if obj
            .get("_encrypted")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            if let Some(api_key) = obj.get("apiKey").and_then(|v| v.as_str()) {
                match simple_decrypt(api_key) {
                    Ok(decrypted) => {
                        obj.insert("apiKey".to_string(), Value::String(decrypted));
                    }
                    Err(_) => {}
                }
            }
            obj.remove("_encrypted");
        }
    }

    Ok(config)
}

/// 保存聊天历史
#[tauri::command]
pub async fn save_chat_history(
    app: AppHandle,
    character_id: String,
    messages: Vec<ChatMessage>,
) -> Result<(), String> {
    let data_dir = get_data_dir(&app)?;
    let chat_dir = data_dir.join("chats");
    fs::create_dir_all(&chat_dir).map_err(|e| e.to_string())?;

    let chat_file = chat_dir.join(format!("{}.json", character_id));

    // 读取现有记录
    let mut all_messages: Vec<ChatMessage> = if chat_file.exists() {
        let json = fs::read_to_string(&chat_file).map_err(|e| e.to_string())?;
        serde_json::from_str(&json).unwrap_or_default()
    } else {
        Vec::new()
    };

    // 添加新消息
    all_messages.extend(messages);

    // 保存
    let json = serde_json::to_string_pretty(&all_messages).map_err(|e| e.to_string())?;
    fs::write(chat_file, json).map_err(|e| e.to_string())?;

    Ok(())
}

/// 获取聊天历史
#[tauri::command]
pub async fn get_chat_history(
    app: AppHandle,
    character_id: String,
    limit: Option<i64>,
) -> Result<Vec<ChatMessage>, String> {
    let data_dir = get_data_dir(&app)?;
    let chat_file = data_dir
        .join("chats")
        .join(format!("{}.json", character_id));

    if !chat_file.exists() {
        return Ok(Vec::new());
    }

    let json = fs::read_to_string(chat_file).map_err(|e| e.to_string())?;
    let mut messages: Vec<ChatMessage> = serde_json::from_str(&json).unwrap_or_default();

    // 限制数量
    if let Some(limit) = limit {
        let start = messages.len().saturating_sub(limit as usize);
        messages = messages[start..].to_vec();
    }

    Ok(messages)
}

/// 清除聊天历史
#[tauri::command]
pub async fn clear_chat_history(app: AppHandle, character_id: String) -> Result<(), String> {
    let data_dir = get_data_dir(&app)?;
    let chat_file = data_dir
        .join("chats")
        .join(format!("{}.json", character_id));

    if chat_file.exists() {
        fs::remove_file(chat_file).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// 保存世界书数据
#[tauri::command]
pub async fn save_world_info(
    app: AppHandle,
    character_id: String,
    data: Value,
) -> Result<(), String> {
    let data_dir = get_data_dir(&app)?;
    let world_dir = data_dir.join("worldinfo");
    fs::create_dir_all(&world_dir).map_err(|e| e.to_string())?;

    let world_file = world_dir.join(format!("{}.json", character_id));
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(world_file, json).map_err(|e| e.to_string())?;

    Ok(())
}

/// 获取世界书数据
#[tauri::command]
pub async fn get_world_info(app: AppHandle, character_id: String) -> Result<Value, String> {
    let data_dir = get_data_dir(&app)?;
    let world_file = data_dir
        .join("worldinfo")
        .join(format!("{}.json", character_id));

    if !world_file.exists() {
        return Ok(serde_json::json!({}));
    }

    let json = fs::read_to_string(world_file).map_err(|e| e.to_string())?;
    let data: Value = serde_json::from_str(&json).unwrap_or(serde_json::json!({}));

    Ok(data)
}

/// 保存角色信息
#[tauri::command]
pub async fn save_character(
    app: AppHandle,
    id: String,
    name: String,
    description: Option<String>,
    avatar_url: Option<String>,
    system_prompt: Option<String>,
) -> Result<(), String> {
    let data_dir = get_data_dir(&app)?;
    let char_dir = data_dir.join("characters");
    fs::create_dir_all(&char_dir).map_err(|e| e.to_string())?;

    let char_file = char_dir.join(format!("{}.json", id));
    let character = serde_json::json!({
        "id": id,
        "name": name,
        "description": description,
        "avatarUrl": avatar_url,
        "systemPrompt": system_prompt
    });

    let json = serde_json::to_string_pretty(&character).map_err(|e| e.to_string())?;
    fs::write(char_file, json).map_err(|e| e.to_string())?;

    Ok(())
}

/// 获取所有角色
#[tauri::command]
pub async fn get_characters(app: AppHandle) -> Result<Vec<Value>, String> {
    let data_dir = get_data_dir(&app)?;
    let char_dir = data_dir.join("characters");

    if !char_dir.exists() {
        return Ok(Vec::new());
    }

    let mut characters = Vec::new();

    for entry in fs::read_dir(char_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            let json = fs::read_to_string(path).map_err(|e| e.to_string())?;
            if let Ok(character) = serde_json::from_str::<Value>(&json) {
                characters.push(character);
            }
        }
    }

    Ok(characters)
}

/// 保存 Persona 原始角色卡（单独文件，避免 KV 体积上限）
#[tauri::command]
pub async fn save_persona_card(app: AppHandle, id: String, data: Value) -> Result<Value, String> {
    let data_dir = get_data_dir(&app)?;
    let card_dir = data_dir.join("persona_cards");
    fs::create_dir_all(&card_dir).map_err(|e| e.to_string())?;
    let safe_id = sanitize_segment(&id);
    let file = card_dir.join(format!("{}.json", safe_id));
    let json = serde_json::to_string(&data).map_err(|e| e.to_string())?;
    fs::write(&file, &json).map_err(|e| e.to_string())?;

    #[cfg(target_os = "android")]
    {
        if let Ok(f) = fs::File::open(&file) {
            unsafe {
                libc::fsync(f.as_raw_fd());
            }
        }
    }

    Ok(serde_json::json!({
        "path": file.to_string_lossy().to_string(),
        "bytes": json.len(),
        "id": safe_id
    }))
}

/// 读取 Persona 原始角色卡
#[tauri::command]
pub async fn load_persona_card(app: AppHandle, id: String) -> Result<Value, String> {
    let data_dir = get_data_dir(&app)?;
    let card_dir = data_dir.join("persona_cards");
    let safe_id = sanitize_segment(&id);
    let file = card_dir.join(format!("{}.json", safe_id));
    if !file.exists() {
        return Ok(serde_json::json!({}));
    }
    let max_len: u64 = 30 * 1024 * 1024; // 30 MiB safety cap
    if let Ok(meta) = fs::metadata(&file) {
        let len = meta.len();
        if len > max_len {
            eprintln!(
                "[load_persona_card] 文件过大，跳过加载: {:?}, {} bytes",
                file, len
            );
            return Ok(serde_json::json!({ "_tooLarge": true, "size": len }));
        }
    }
    let json = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    let data: Value = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    Ok(data)
}

/// 删除 Persona 原始角色卡
#[tauri::command]
pub async fn delete_persona_card(app: AppHandle, id: String) -> Result<bool, String> {
    let data_dir = get_data_dir(&app)?;
    let card_dir = data_dir.join("persona_cards");
    let safe_id = sanitize_segment(&id);
    let file = card_dir.join(format!("{}.json", safe_id));
    if file.exists() {
        fs::remove_file(&file).map_err(|e| e.to_string())?;
        return Ok(true);
    }
    Ok(false)
}

/// 通用 KV 持久化（前端清缓存后仍可讀）
#[tauri::command]
pub async fn save_kv(app: AppHandle, name: String, data: Value) -> Result<(), String> {
    let data_dir = get_data_dir(&app)?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let file = data_dir.join(format!("{name}.json"));
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;

    // 写入文件并强制刷新到磁盘
    fs::write(&file, &json).map_err(|e| e.to_string())?;

    // Android 上强制同步到磁盘
    #[cfg(target_os = "android")]
    {
        if let Ok(f) = fs::File::open(&file) {
            unsafe {
                libc::fsync(f.as_raw_fd());
            }
        }
    }

    // 记录保存的文件路径和数据摘要（用于调试）
    eprintln!("[save_kv] 文件: {:?}, 大小: {} bytes", file, json.len());
    if name == "llm_profiles_v1" {
        if let Some(obj) = data.as_object() {
            if let Some(active_id) = obj.get("activeProfileId") {
                eprintln!("[save_kv] activeProfileId: {}", active_id);
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn load_kv(app: AppHandle, name: String) -> Result<Value, String> {
    let data_dir = get_data_dir(&app)?;
    let file = data_dir.join(format!("{name}.json"));

    if !file.exists() {
        eprintln!("[load_kv] 文件不存在: {:?}", file);
        return Ok(serde_json::json!({}));
    }

    let max_len: u64 = 10 * 1024 * 1024; // 10 MiB
    if let Ok(meta) = fs::metadata(&file) {
        let len = meta.len();
        if len > max_len {
            eprintln!("[load_kv] 文件过大，跳过加载: {:?}, {} bytes", file, len);
            return Ok(serde_json::json!({ "_tooLarge": true, "size": len }));
        }
    }

    let json = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    let data: Value = serde_json::from_str(&json).map_err(|e| e.to_string())?;

    // 记录加载的文件路径和数据摘要（用于调试）
    eprintln!("[load_kv] 文件: {:?}, 大小: {} bytes", file, json.len());
    if name == "llm_profiles_v1" {
        if let Some(obj) = data.as_object() {
            if let Some(active_id) = obj.get("activeProfileId") {
                eprintln!("[load_kv] activeProfileId: {}", active_id);
            }
            if let Some(profiles) = obj.get("profiles") {
                if let Some(profiles_obj) = profiles.as_object() {
                    eprintln!("[load_kv] profiles数量: {}", profiles_obj.len());
                }
            }
        }
    }

    Ok(data)
}

#[tauri::command]
pub async fn list_contacts_by_scopes(
    app: AppHandle,
    scopes: Vec<String>,
    limit_per_scope: Option<usize>,
) -> Result<Value, String> {
    let data_dir = get_data_dir(&app)?;
    let limit = limit_per_scope.unwrap_or(usize::MAX);
    let mut results: Vec<Value> = Vec::new();

    for raw_scope in scopes {
        let scope = normalize_scope_id(&raw_scope);
        if scope.is_empty() {
            continue;
        }
        let mut file = data_dir.join(format!("contacts_store_v1__{scope}.json"));
        if !file.exists() && scope == "default" {
            let legacy = data_dir.join("contacts_store_v1.json");
            if legacy.exists() {
                file = legacy;
            }
        }
        if !file.exists() {
            continue;
        }

        let json = match fs::read_to_string(&file) {
            Ok(val) => val,
            Err(_) => continue,
        };
        let max_len: usize = 30 * 1024 * 1024; // 30 MiB safety cap
        if json.len() > max_len {
            results.push(serde_json::json!({
                "scopeId": scope,
                "contacts": [],
                "_tooLarge": true,
                "size": json.len(),
            }));
            continue;
        }
        let data: Value = serde_json::from_str(&json).unwrap_or(serde_json::json!({}));
        let obj = match data.as_object() {
            Some(val) => val,
            None => continue,
        };
        let scope_id = obj
            .get("scopeId")
            .and_then(|v| v.as_str())
            .unwrap_or(scope.as_str());

        let mut contacts_out: Vec<Value> = Vec::new();
        if let Some(contacts) = obj.get("contacts").and_then(|v| v.as_object()) {
            for (key, value) in contacts.iter() {
                if contacts_out.len() >= limit {
                    break;
                }
                let map = match value.as_object() {
                    Some(v) => v,
                    None => continue,
                };
                let id = map
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or(key)
                    .trim()
                    .to_string();
                if id.is_empty() {
                    continue;
                }
                let name = map
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or(id.as_str())
                    .to_string();
                let mut avatar = map
                    .get("avatar")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                if avatar.len() > 200_000 {
                    avatar.clear();
                }
                let is_group = map
                    .get("isGroup")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(id.starts_with("group:"));
                let members = map
                    .get("members")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect::<Vec<String>>()
                    })
                    .unwrap_or_else(Vec::new);
                let added_at = map.get("addedAt").and_then(|v| v.as_i64()).unwrap_or(0);
                let description = map
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                contacts_out.push(serde_json::json!({
                    "id": id,
                    "name": name,
                    "avatar": avatar,
                    "isGroup": is_group,
                    "members": members,
                    "addedAt": added_at,
                    "description": description,
                }));
            }
        }

        results.push(serde_json::json!({
            "scopeId": scope_id,
            "contacts": contacts_out,
        }));
    }

    Ok(serde_json::json!(results))
}

const PERSONA_SCOPED_JSON_BASES: &[&str] = &[
    "contacts_store_v1",
    "contact_groups_v1",
    "chat_store_v1",
    "moments_store_v1",
    "moment_summary_store_v1",
    "rp_session_v1",
    "world_session_map_v1",
    "global_world_id_v1",
    "world_global_settings_v1",
];

fn extract_scoped_json_scope(file_name: &str, base: &str) -> Option<String> {
    let prefix = format!("{base}__");
    if !file_name.starts_with(&prefix) || !file_name.ends_with(".json") {
        return None;
    }
    let raw_scope = &file_name[prefix.len()..file_name.len().saturating_sub(5)];
    let scope = normalize_scope_id(raw_scope);
    if scope.is_empty() {
        return None;
    }
    Some(scope)
}

fn extract_memory_db_scope(file_name: &str) -> Option<String> {
    if !file_name.starts_with("memories__") || !file_name.ends_with(".db") {
        return None;
    }
    let raw_scope = &file_name["memories__".len()..file_name.len().saturating_sub(3)];
    let scope = normalize_scope_id(raw_scope);
    if scope.is_empty() {
        return None;
    }
    Some(scope)
}

fn is_managed_persona_scope(scope: &str, explicit_scopes: &HashSet<String>) -> bool {
    let normalized = normalize_scope_id(scope);
    if normalized.is_empty() {
        return false;
    }
    explicit_scopes.contains(&normalized) || normalized.starts_with("persona_")
}

fn read_json_file(path: &Path) -> Option<Value> {
    let json = fs::read_to_string(path).ok()?;
    serde_json::from_str(&json).ok()
}

fn collect_scope_session_ids(app: &AppHandle, data_dir: &Path, scope: &str) -> HashSet<String> {
    let mut session_ids: HashSet<String> = HashSet::new();

    let contacts_file = data_dir.join(format!("contacts_store_v1__{scope}.json"));
    if let Some(value) = read_json_file(&contacts_file) {
        if let Some(contacts) = value.get("contacts").and_then(|v| v.as_object()) {
            for (key, item) in contacts {
                let id = item
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or(key)
                    .trim();
                if !id.is_empty() {
                    session_ids.insert(id.to_string());
                }
            }
        }
    }

    let chat_v1_file = data_dir.join(format!("chat_store_v1__{scope}.json"));
    if let Some(value) = read_json_file(&chat_v1_file) {
        if let Some(sessions) = value.get("sessions").and_then(|v| v.as_object()) {
            for key in sessions.keys() {
                let id = key.trim();
                if !id.is_empty() {
                    session_ids.insert(id.to_string());
                }
            }
        }
    }

    let world_map_file = data_dir.join(format!("world_session_map_v1__{scope}.json"));
    if let Some(value) = read_json_file(&world_map_file) {
        if let Some(map) = value.as_object() {
            for key in map.keys() {
                let id = key.trim();
                if !id.is_empty() {
                    session_ids.insert(id.to_string());
                }
            }
        }
    }

    if let Ok(scope_dir) = chat_store_v2_scope_dir(app, scope) {
        let index_file = scope_dir.join("index.json");
        if let Some(value) = read_json_file(&index_file) {
            if let Some(sessions) = value.get("sessions").and_then(|v| v.as_object()) {
                for key in sessions.keys() {
                    let id = key.trim();
                    if !id.is_empty() {
                        session_ids.insert(id.to_string());
                    }
                }
            }
        }
    }

    session_ids
}

fn delete_path_if_exists(path: &Path, deleted_paths: &mut Vec<String>) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    deleted_paths.push(path.to_string_lossy().to_string());
    Ok(())
}

fn purge_persona_scope_data(
    app: &AppHandle,
    memory_db: &MemoryDb,
    scope: &str,
    deleted_paths: &mut Vec<String>,
) -> Result<(), String> {
    let normalized_scope = normalize_scope_id(scope);
    if normalized_scope.is_empty() {
        return Ok(());
    }
    let data_dir = get_data_dir(app)?;
    let session_ids = collect_scope_session_ids(app, &data_dir, &normalized_scope);

    memory_db.close_all();

    for base in PERSONA_SCOPED_JSON_BASES {
        let file = data_dir.join(format!("{base}__{normalized_scope}.json"));
        delete_path_if_exists(&file, deleted_paths)?;
    }

    let memory_db_path = data_dir.join(format!("memories__{normalized_scope}.db"));
    delete_path_if_exists(&memory_db_path, deleted_paths)?;
    let memory_db_wal = data_dir.join(format!("memories__{normalized_scope}.db-wal"));
    delete_path_if_exists(&memory_db_wal, deleted_paths)?;
    let memory_db_shm = data_dir.join(format!("memories__{normalized_scope}.db-shm"));
    delete_path_if_exists(&memory_db_shm, deleted_paths)?;

    let chat_v2_dir = chat_store_v2_scope_dir(app, &normalized_scope)?;
    delete_path_if_exists(&chat_v2_dir, deleted_paths)?;

    for session_id in session_ids {
        let safe_sid = sanitize_segment(&session_id);
        let raw_reply_dir = data_dir.join("raw_replies").join(&safe_sid);
        delete_path_if_exists(&raw_reply_dir, deleted_paths)?;
        let wallpaper_dir = data_dir.join("wallpapers").join(&safe_sid);
        delete_path_if_exists(&wallpaper_dir, deleted_paths)?;
        let attachment_dir = data_dir.join("attachments").join(&safe_sid);
        delete_path_if_exists(&attachment_dir, deleted_paths)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn cleanup_persona_scoped_data(
    app: AppHandle,
    db: State<'_, MemoryDb>,
    keep_persona_ids: Vec<String>,
    delete_persona_ids: Vec<String>,
) -> Result<Value, String> {
    let keep_scopes: HashSet<String> = keep_persona_ids
        .into_iter()
        .map(|id| normalize_scope_id(&id))
        .filter(|scope| !scope.is_empty())
        .collect();
    let explicit_delete_scopes: HashSet<String> = delete_persona_ids
        .into_iter()
        .map(|id| normalize_scope_id(&id))
        .filter(|scope| !scope.is_empty())
        .collect();

    let data_dir = get_data_dir(&app)?;
    let mut candidate_scopes: HashSet<String> = explicit_delete_scopes.clone();

    if let Ok(entries) = fs::read_dir(&data_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            for base in PERSONA_SCOPED_JSON_BASES {
                if let Some(scope) = extract_scoped_json_scope(&name, base) {
                    if is_managed_persona_scope(&scope, &explicit_delete_scopes) {
                        candidate_scopes.insert(scope);
                    }
                }
            }
            if let Some(scope) = extract_memory_db_scope(&name) {
                if is_managed_persona_scope(&scope, &explicit_delete_scopes) {
                    candidate_scopes.insert(scope);
                }
            }
        }
    }

    let chat_v2_base = chat_store_v2_base(&app)?;
    if let Ok(entries) = fs::read_dir(chat_v2_base) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            let Some(raw_scope) = name.strip_prefix("scope_") else {
                continue;
            };
            let scope = normalize_scope_id(raw_scope);
            if scope.is_empty() {
                continue;
            }
            if is_managed_persona_scope(&scope, &explicit_delete_scopes) {
                candidate_scopes.insert(scope);
            }
        }
    }

    let mut scopes_to_delete: Vec<String> = candidate_scopes
        .into_iter()
        .filter(|scope| !keep_scopes.contains(scope))
        .collect();
    scopes_to_delete.sort();

    let mut deleted_scopes: Vec<String> = Vec::new();
    let mut deleted_paths: Vec<String> = Vec::new();
    let mut failed_scopes: Vec<Value> = Vec::new();

    for scope in scopes_to_delete {
        match purge_persona_scope_data(&app, &db, &scope, &mut deleted_paths) {
            Ok(()) => deleted_scopes.push(scope),
            Err(err) => failed_scopes.push(serde_json::json!({
                "scope": scope,
                "error": err,
            })),
        }
    }

    Ok(serde_json::json!({
        "deletedScopes": deleted_scopes,
        "deletedPaths": deleted_paths,
        "failedScopes": failed_scopes,
    }))
}

/// 读取分片聊天索引
#[tauri::command]
pub async fn chat_store_v2_read_index(app: AppHandle, scope: String) -> Result<Value, String> {
    let dir = chat_store_v2_scope_dir(&app, &scope)?;
    let file = dir.join("index.json");
    if !file.exists() {
        return Ok(serde_json::json!({}));
    }
    let json = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

/// 写入分片聊天索引
#[tauri::command]
pub async fn chat_store_v2_write_index(
    app: AppHandle,
    scope: String,
    data: Value,
) -> Result<(), String> {
    let dir = chat_store_v2_scope_dir(&app, &scope)?;
    let file = dir.join("index.json");
    write_json_file(&file, &data)
}

/// 读取分片文件
#[tauri::command]
pub async fn chat_store_v2_read_part(
    app: AppHandle,
    scope: String,
    session_dir: String,
    thread_dir: String,
    part_id: String,
) -> Result<Value, String> {
    let dir = chat_store_v2_thread_dir(&app, &scope, &session_dir, &thread_dir)?;
    let part = validate_safe_key(&part_id, "part_id")?;
    let file = dir.join(format!("{part}.json"));
    if !file.exists() {
        return Ok(serde_json::json!([]));
    }
    let json = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

/// 写入分片文件
#[tauri::command]
pub async fn chat_store_v2_write_part(
    app: AppHandle,
    scope: String,
    session_dir: String,
    thread_dir: String,
    part_id: String,
    data: Value,
) -> Result<(), String> {
    let dir = chat_store_v2_thread_dir(&app, &scope, &session_dir, &thread_dir)?;
    let part = validate_safe_key(&part_id, "part_id")?;
    let file = dir.join(format!("{part}.json"));
    write_json_file(&file, &data)
}

/// 删除分片文件
#[tauri::command]
pub async fn chat_store_v2_delete_part(
    app: AppHandle,
    scope: String,
    session_dir: String,
    thread_dir: String,
    part_id: String,
) -> Result<(), String> {
    let dir = chat_store_v2_thread_dir(&app, &scope, &session_dir, &thread_dir)?;
    let part = validate_safe_key(&part_id, "part_id")?;
    let file = dir.join(format!("{part}.json"));
    if file.exists() {
        fs::remove_file(file).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 删除会话内的某个线程（当前/存档）
#[tauri::command]
pub async fn chat_store_v2_delete_thread(
    app: AppHandle,
    scope: String,
    session_dir: String,
    thread_dir: String,
) -> Result<(), String> {
    let dir = chat_store_v2_thread_dir(&app, &scope, &session_dir, &thread_dir)?;
    if dir.exists() {
        fs::remove_dir_all(dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 删除会话目录（含全部分片/存档）
#[tauri::command]
pub async fn chat_store_v2_delete_session(
    app: AppHandle,
    scope: String,
    session_dir: String,
) -> Result<(), String> {
    let scope_dir = chat_store_v2_scope_dir(&app, &scope)?;
    let session_key = validate_safe_key(&session_dir, "session_dir")?;
    let dir = scope_dir.join(format!("session_{session_key}"));
    if dir.exists() {
        fs::remove_dir_all(dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 保存原始回复（用于富文本/创意写作回溯）
#[tauri::command]
pub async fn save_raw_reply(
    app: AppHandle,
    session_id: String,
    message_id: String,
    text: String,
) -> Result<(), String> {
    let file = raw_reply_path(&app, &session_id, &message_id)?;
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&file, text).map_err(|e| e.to_string())?;

    #[cfg(target_os = "android")]
    {
        if let Ok(f) = fs::File::open(&file) {
            unsafe {
                libc::fsync(f.as_raw_fd());
            }
        }
    }

    Ok(())
}

/// 读取原始回复
#[tauri::command]
pub async fn load_raw_reply(
    app: AppHandle,
    session_id: String,
    message_id: String,
) -> Result<Option<String>, String> {
    let file = raw_reply_path(&app, &session_id, &message_id)?;
    if !file.exists() {
        return Ok(None);
    }
    let text = fs::read_to_string(file).map_err(|e| e.to_string())?;
    Ok(Some(text))
}

/// 删除原始回复
#[tauri::command]
pub async fn delete_raw_reply(
    app: AppHandle,
    session_id: String,
    message_id: String,
) -> Result<(), String> {
    let file = raw_reply_path(&app, &session_id, &message_id)?;
    if file.exists() {
        fs::remove_file(file).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn read_plugin_zip(bytes: Vec<u8>) -> Result<serde_json::Value, String> {
    if bytes.is_empty() {
        return Err("zip bytes empty".to_string());
    }
    let cursor = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;

    let mut manifest_name: Option<String> = None;
    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().replace('\\', "/");
        if name.to_lowercase().ends_with("manifest.json") {
            let pick = match &manifest_name {
                None => true,
                Some(existing) => name.len() < existing.len(),
            };
            if pick {
                manifest_name = Some(name);
            }
        }
    }
    let manifest_path = manifest_name.ok_or_else(|| "manifest.json not found".to_string())?;

    let manifest_text = {
        let mut file = archive
            .by_name(&manifest_path)
            .map_err(|e| format!("read manifest failed: {e}"))?;
        let mut text = String::new();
        file.read_to_string(&mut text).map_err(|e| e.to_string())?;
        text
    };

    let manifest_json: serde_json::Value =
        serde_json::from_str(&manifest_text).map_err(|e| format!("manifest json invalid: {e}"))?;
    let main_raw = manifest_json
        .get("main")
        .and_then(|v| v.as_str())
        .unwrap_or("index.js");

    let normalize_path = |raw: &str| -> String {
        let mut out = raw.replace('\\', "/");
        while out.starts_with("./") {
            out = out.trim_start_matches("./").to_string();
        }
        while out.starts_with('/') {
            out = out.trim_start_matches('/').to_string();
        }
        let mut parts: Vec<&str> = Vec::new();
        for part in out.split('/') {
            if part.is_empty() || part == "." {
                continue;
            }
            if part == ".." {
                parts.pop();
                continue;
            }
            parts.push(part);
        }
        parts.join("/")
    };

    let base_dir = match manifest_path.rsplit_once('/') {
        Some((dir, _)) => format!("{dir}/"),
        None => String::new(),
    };
    let main_path = format!("{}{}", base_dir, normalize_path(main_raw));

    let main_text = {
        let mut file = archive
            .by_name(&main_path)
            .map_err(|e| format!("main file not found: {e}"))?;
        let mut text = String::new();
        file.read_to_string(&mut text).map_err(|e| e.to_string())?;
        text
    };

    Ok(serde_json::json!({
        "manifestPath": manifest_path,
        "manifestText": manifest_text,
        "mainPath": main_path,
        "mainText": main_text
    }))
}

#[derive(serde::Serialize)]
pub struct ZipEntryPayload {
    pub name: String,
    pub size: usize,
    pub is_text: bool,
    pub text: Option<String>,
    pub base64: Option<String>,
}

#[tauri::command]
pub async fn read_zip_entries(bytes: Vec<u8>) -> Result<Vec<ZipEntryPayload>, String> {
    if bytes.is_empty() {
        return Err("zip bytes empty".to_string());
    }
    let cursor = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
    let mut out: Vec<ZipEntryPayload> = Vec::new();
    let mut total: usize = 0;
    const MAX_TOTAL: usize = 30 * 1024 * 1024;
    const MAX_FILE: usize = 12 * 1024 * 1024;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        if file.is_dir() {
            continue;
        }
        let name = file.name().replace('\\', "/");
        let mut buf: Vec<u8> = Vec::new();
        file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        if buf.len() > MAX_FILE {
            return Err(format!("zip entry too large: {}", name));
        }
        total = total.saturating_add(buf.len());
        if total > MAX_TOTAL {
            return Err("zip too large".to_string());
        }
        let lower = name.to_lowercase();
        let is_text = lower.ends_with(".json")
            || lower.ends_with(".txt")
            || lower.ends_with(".md")
            || lower.ends_with(".js")
            || lower.ends_with(".yaml")
            || lower.ends_with(".yml");
        if is_text {
            if let Ok(text) = String::from_utf8(buf.clone()) {
                out.push(ZipEntryPayload {
                    name,
                    size: buf.len(),
                    is_text: true,
                    text: Some(text),
                    base64: None,
                });
                continue;
            }
        }
        let encoded = BASE64_ENGINE.encode(&buf);
        out.push(ZipEntryPayload {
            name,
            size: buf.len(),
            is_text: false,
            text: None,
            base64: Some(encoded),
        });
    }
    Ok(out)
}

#[derive(serde::Serialize)]
pub struct HttpResponse {
    pub status: u16,
    pub ok: bool,
    pub headers: HashMap<String, String>,
    pub body: String,
}

/// Native HTTP request to bypass WebView CORS (used by OpenAI-compatible providers like DeepSeek).
#[tauri::command]
pub async fn http_request(
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    timeout_ms: Option<u64>,
    request_id: Option<String>,
    abort_state: State<'_, HttpAbortState>,
) -> Result<HttpResponse, String> {
    let request_key = match request_id {
        Some(raw) => Some(validate_safe_key(&raw, "request_id")?),
        None => None,
    };

    let task = tokio::spawn(async move {
        let method = reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;

        let mut header_map = reqwest::header::HeaderMap::new();
        for (k, v) in headers {
            let name =
                reqwest::header::HeaderName::from_bytes(k.as_bytes()).map_err(|e| e.to_string())?;
            let value = reqwest::header::HeaderValue::from_str(&v).map_err(|e| e.to_string())?;
            header_map.insert(name, value);
        }

        let mut builder = reqwest::Client::builder();
        if let Some(ms) = timeout_ms {
            builder = builder.timeout(std::time::Duration::from_millis(ms));
        }
        let client = builder.build().map_err(|e| e.to_string())?;

        let mut req = client.request(method, url).headers(header_map);
        if let Some(body) = body {
            req = req.body(body);
        }

        let resp = req.send().await.map_err(|e| e.to_string())?;
        let status = resp.status();
        let mut out_headers: HashMap<String, String> = HashMap::new();
        for (k, v) in resp.headers().iter() {
            if let Ok(vs) = v.to_str() {
                out_headers.insert(k.as_str().to_string(), vs.to_string());
            }
        }
        let body = resp.text().await.map_err(|e| e.to_string())?;

        Ok(HttpResponse {
            status: status.as_u16(),
            ok: status.is_success(),
            headers: out_headers,
            body,
        })
    });

    if let Some(key) = request_key.clone() {
        let abort_handle = task.abort_handle();
        let mut map = abort_state
            .inner
            .lock()
            .map_err(|_| "http abort state lock poisoned".to_string())?;
        if let Some(prev) = map.insert(key, abort_handle) {
            prev.abort();
        }
    }

    let joined = task.await;

    if let Some(key) = request_key {
        if let Ok(mut map) = abort_state.inner.lock() {
            map.remove(&key);
        }
    }

    match joined {
        Ok(result) => result,
        Err(err) if err.is_cancelled() => Err("aborted".to_string()),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
pub async fn http_abort_request(
    request_id: String,
    abort_state: State<'_, HttpAbortState>,
) -> Result<bool, String> {
    let key = validate_safe_key(&request_id, "request_id")?;
    let handle = {
        let mut map = abort_state
            .inner
            .lock()
            .map_err(|_| "http abort state lock poisoned".to_string())?;
        map.remove(&key)
    };
    if let Some(handle) = handle {
        handle.abort();
        return Ok(true);
    }
    Ok(false)
}

/// JS -> Rust log bridge (prints to logcat via stderr on Android)
#[tauri::command]
pub async fn log_js(
    tag: String,
    level: Option<String>,
    message: String,
    data: Option<Value>,
) -> Result<(), String> {
    let tag = tag.trim();
    if tag.is_empty() {
        return Ok(());
    }
    let lvl = level.unwrap_or_else(|| "info".to_string());
    let mut msg = message;
    // Avoid huge logcat entries (e.g. prompt blobs)
    const MAX_LEN: usize = 2000;
    if msg.len() > MAX_LEN {
        msg.truncate(MAX_LEN);
        msg.push_str("…");
    }
    if let Some(d) = data {
        let dv = serde_json::to_string(&d).unwrap_or_else(|_| "\"<unserializable>\"".to_string());
        let mut ds = dv;
        if ds.len() > MAX_LEN {
            ds.truncate(MAX_LEN);
            ds.push_str("…");
        }
        eprintln!("[js][{}][{}] {} {}", tag, lvl, msg, ds);
    } else {
        eprintln!("[js][{}][{}] {}", tag, lvl, msg);
    }
    Ok(())
}

#[tauri::command]
pub async fn init_database(
    db: State<'_, MemoryDb>,
    scope_id: Option<String>,
) -> Result<(), String> {
    db.init_database(scope_id)
}

#[tauri::command]
pub async fn create_memory(
    db: State<'_, MemoryDb>,
    scope_id: Option<String>,
    input: MemoryCreateInput,
) -> Result<String, String> {
    db.create_memory(scope_id, input)
}

#[tauri::command]
pub async fn update_memory(
    db: State<'_, MemoryDb>,
    scope_id: Option<String>,
    input: MemoryUpdateInput,
) -> Result<(), String> {
    db.update_memory(scope_id, input)
}

#[tauri::command]
pub async fn delete_memory(
    db: State<'_, MemoryDb>,
    scope_id: Option<String>,
    id: String,
) -> Result<(), String> {
    db.delete_memory(scope_id, id)
}

#[tauri::command]
pub async fn get_memories(
    db: State<'_, MemoryDb>,
    scope_id: Option<String>,
    query: MemoryQuery,
) -> Result<Vec<MemoryRecord>, String> {
    db.get_memories(scope_id, query)
}

#[tauri::command]
pub async fn batch_create_memories(
    db: State<'_, MemoryDb>,
    scope_id: Option<String>,
    memories: Vec<MemoryCreateInput>,
) -> Result<usize, String> {
    db.batch_create_memories(scope_id, memories)
}

#[tauri::command]
pub async fn batch_delete_memories(
    db: State<'_, MemoryDb>,
    scope_id: Option<String>,
    ids: Vec<String>,
) -> Result<usize, String> {
    db.batch_delete_memories(scope_id, ids)
}

#[tauri::command]
pub async fn save_template(
    db: State<'_, MemoryDb>,
    scope_id: Option<String>,
    input: TemplateInput,
) -> Result<(), String> {
    db.save_template(scope_id, input)
}

#[tauri::command]
pub async fn get_templates(
    db: State<'_, MemoryDb>,
    scope_id: Option<String>,
    query: TemplateQuery,
) -> Result<Vec<TemplateRecord>, String> {
    db.get_templates(scope_id, query)
}

#[tauri::command]
pub async fn delete_template(
    db: State<'_, MemoryDb>,
    scope_id: Option<String>,
    id: String,
) -> Result<(), String> {
    db.delete_template(scope_id, id)
}
