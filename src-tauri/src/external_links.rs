use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

const ALLOWED_EXTERNAL_URLS: [&str; 2] = [
    "https://github.com/dghiffjd7",
    "https://github.com/dghiffjd7/OmniTavern",
];

fn is_allowed_external_url(url: &str) -> bool {
    ALLOWED_EXTERNAL_URLS.contains(&url)
}

#[tauri::command]
pub fn open_external_url(app: AppHandle, url: String) -> Result<(), String> {
    let normalized_url = url.trim();
    if !is_allowed_external_url(normalized_url) {
        return Err("external_url_not_allowed".to_string());
    }

    app.opener()
        .open_url(normalized_url, None::<&str>)
        .map_err(|error| format!("failed_to_open_external_url:{error}"))
}

#[cfg(test)]
mod tests {
    use super::is_allowed_external_url;

    #[test]
    fn allows_only_the_developer_github_pages() {
        assert!(is_allowed_external_url("https://github.com/dghiffjd7"));
        assert!(is_allowed_external_url(
            "https://github.com/dghiffjd7/OmniTavern"
        ));
        assert!(!is_allowed_external_url("http://github.com/dghiffjd7"));
        assert!(!is_allowed_external_url(
            "https://github.com/dghiffjd7/OmniTavern/issues"
        ));
        assert!(!is_allowed_external_url("https://example.com/dghiffjd7"));
    }
}
