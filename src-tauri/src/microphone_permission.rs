use serde::Serialize;
use tauri::{plugin::TauriPlugin, AppHandle, Runtime, WebviewWindow};

#[cfg(target_os = "android")]
use serde_json::{json, Value};
#[cfg(target_os = "android")]
use tauri::{plugin::PluginHandle, Manager};
#[cfg(target_os = "windows")]
use tauri_plugin_opener::OpenerExt;

#[cfg(target_os = "android")]
const ANDROID_PLUGIN_IDENTIFIER: &str = "com.chatapp.dev";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MicrophonePermissionRecoveryResult {
    action: String,
    platform: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

impl MicrophonePermissionRecoveryResult {
    fn new(action: &str, platform: &str) -> Self {
        Self {
            action: action.to_string(),
            platform: platform.to_string(),
            reason: None,
        }
    }

    fn settings_required(platform: &str, reason: impl Into<String>) -> Self {
        Self {
            action: "settings_required".to_string(),
            platform: platform.to_string(),
            reason: Some(reason.into()),
        }
    }
}

#[cfg(target_os = "android")]
struct AndroidMicrophonePermission<R: Runtime> {
    mobile_plugin_handle: PluginHandle<R>,
}

#[cfg(target_os = "android")]
fn android_permission_state(value: &Value) -> &str {
    value
        .get("microphone")
        .and_then(Value::as_str)
        .unwrap_or("prompt")
}

#[cfg(target_os = "android")]
fn prepare_android_retry<R: Runtime>(app: &AppHandle<R>) -> MicrophonePermissionRecoveryResult {
    let state = app.state::<AndroidMicrophonePermission<R>>();
    let checked: Result<Value, _> = state
        .mobile_plugin_handle
        .run_mobile_plugin("checkPermissions", json!({}));
    match checked {
        Ok(value) if android_permission_state(&value) == "granted" => {
            return MicrophonePermissionRecoveryResult::new("retry", "android");
        }
        Ok(value) if android_permission_state(&value) == "denied" => {
            return MicrophonePermissionRecoveryResult::settings_required(
                "android",
                "microphone_permission_permanently_denied",
            );
        }
        Err(error) => {
            return MicrophonePermissionRecoveryResult::settings_required(
                "android",
                format!("microphone_permission_check_failed:{error}"),
            );
        }
        _ => {}
    }

    let requested: Result<Value, _> = state.mobile_plugin_handle.run_mobile_plugin(
        "requestPermissions",
        json!({ "permissions": ["microphone"] }),
    );
    match requested {
        Ok(value) if android_permission_state(&value) == "granted" => {
            MicrophonePermissionRecoveryResult::new("retry", "android")
        }
        Ok(value) if android_permission_state(&value) == "denied" => {
            MicrophonePermissionRecoveryResult::settings_required(
                "android",
                "microphone_permission_permanently_denied",
            )
        }
        Ok(_) => MicrophonePermissionRecoveryResult::new("denied", "android"),
        Err(error) => MicrophonePermissionRecoveryResult::settings_required(
            "android",
            format!("microphone_permission_request_failed:{error}"),
        ),
    }
}

#[cfg(target_os = "windows")]
fn reset_windows_webview_permission<R: Runtime>(
    window: &WebviewWindow<R>,
    origin: String,
) -> Result<(), String> {
    use std::sync::mpsc;
    use std::time::Duration;
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::{
            ICoreWebView2Profile4, ICoreWebView2_13,
            COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
            COREWEBVIEW2_PERMISSION_STATE_DEFAULT,
        },
        SetPermissionStateCompletedHandler,
    };
    use windows::core::{Interface, PCWSTR};

    let normalized_origin = origin.trim().to_string();
    if !(normalized_origin.starts_with("http://") || normalized_origin.starts_with("https://")) {
        return Err("invalid_microphone_permission_origin".to_string());
    }

    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    window
        .with_webview(move |webview| unsafe {
            let result = (|| {
                let controller = webview.controller();
                let core_webview = controller
                    .CoreWebView2()
                    .map_err(|error| format!("microphone_webview_unavailable:{error}"))?;
                let core_webview_13: ICoreWebView2_13 = core_webview
                    .cast()
                    .map_err(|error| format!("microphone_profile_api_unavailable:{error}"))?;
                let profile: ICoreWebView2Profile4 = core_webview_13
                    .Profile()
                    .and_then(|value| value.cast())
                    .map_err(|error| format!("microphone_profile_unavailable:{error}"))?;
                let origin_wide: Vec<u16> = normalized_origin
                    .encode_utf16()
                    .chain(std::iter::once(0))
                    .collect();
                let callback_tx = tx.clone();
                let handler = SetPermissionStateCompletedHandler::create(Box::new(move |result| {
                    let outcome = result
                        .map_err(|error| format!("microphone_permission_reset_failed:{error}"));
                    let _ = callback_tx.send(outcome);
                    Ok(())
                }));
                profile
                    .SetPermissionState(
                        COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
                        PCWSTR(origin_wide.as_ptr()),
                        COREWEBVIEW2_PERMISSION_STATE_DEFAULT,
                        &handler,
                    )
                    .map_err(|error| format!("microphone_permission_reset_start_failed:{error}"))?;
                Ok::<(), String>(())
            })();
            if let Err(error) = result {
                let _ = tx.send(Err(error));
            }
        })
        .map_err(|error| format!("microphone_webview_access_failed:{error}"))?;

    rx.recv_timeout(Duration::from_secs(10))
        .map_err(|_| "microphone_permission_reset_timeout".to_string())?
}

#[tauri::command]
pub(crate) async fn prepare_microphone_permission_retry<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    origin: String,
) -> Result<MicrophonePermissionRecoveryResult, String> {
    #[cfg(target_os = "windows")]
    {
        let _ = app;
        return Ok(match reset_windows_webview_permission(&window, origin) {
            Ok(()) => MicrophonePermissionRecoveryResult::new("retry", "windows"),
            Err(error) => MicrophonePermissionRecoveryResult::settings_required("windows", error),
        });
    }
    #[cfg(target_os = "android")]
    {
        let _ = (window, origin);
        return Ok(prepare_android_retry(&app));
    }
    #[cfg(not(any(target_os = "windows", target_os = "android")))]
    {
        let _ = (app, window, origin);
        Ok(MicrophonePermissionRecoveryResult::new("retry", "webview"))
    }
}

#[tauri::command]
pub(crate) async fn open_microphone_permission_settings<R: Runtime>(
    app: AppHandle<R>,
) -> Result<MicrophonePermissionRecoveryResult, String> {
    #[cfg(target_os = "windows")]
    {
        app.opener()
            .open_url("ms-settings:privacy-microphone", None::<&str>)
            .map_err(|error| format!("microphone_settings_open_failed:{error}"))?;
        return Ok(MicrophonePermissionRecoveryResult::new("opened", "windows"));
    }
    #[cfg(target_os = "android")]
    {
        let state = app.state::<AndroidMicrophonePermission<R>>();
        let _: Value = state
            .mobile_plugin_handle
            .run_mobile_plugin("openSettings", json!({}))
            .map_err(|error| format!("microphone_settings_open_failed:{error}"))?;
        return Ok(MicrophonePermissionRecoveryResult::new("opened", "android"));
    }
    #[cfg(not(any(target_os = "windows", target_os = "android")))]
    {
        let _ = app;
        Err("microphone_settings_not_supported".to_string())
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::<R>::new("microphone-permission")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let handle = api.register_android_plugin(
                    ANDROID_PLUGIN_IDENTIFIER,
                    "MicrophonePermissionPlugin",
                )?;
                app.manage(AndroidMicrophonePermission {
                    mobile_plugin_handle: handle,
                });
            }
            #[cfg(not(target_os = "android"))]
            {
                let _ = (app, api);
            }
            Ok(())
        })
        .build()
}
