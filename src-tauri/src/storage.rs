use base64::Engine;
use serde::{Deserialize, Serialize};

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub provider: String,
    pub api_key: String,
    pub base_url: String,
    pub model: String,
    pub stream: bool,
    pub timeout: u32,
    pub max_retries: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub character_id: String,
    pub role: String,
    pub content: String,
    pub timestamp: i64,
}

/// 简单的加密/解密（用于敏感数据）
/// 注意：这只是基础实现，生产环境应使用更强的加密算法

pub fn simple_encrypt(data: &str) -> String {
    base64::engine::general_purpose::STANDARD.encode(data)
}

pub fn simple_decrypt(data: &str) -> Result<String, String> {
    base64::engine::general_purpose::STANDARD
        .decode(data)
        .map(|v| String::from_utf8(v).unwrap_or_default())
        .map_err(|e| e.to_string())
}
