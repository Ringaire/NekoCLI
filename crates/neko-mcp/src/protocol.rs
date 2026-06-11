use serde::{Deserialize, Serialize};
use serde_json::Value;

// ── JSON-RPC 2.0 ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id:      Option<Value>,
    pub method:  String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params:  Option<Value>,
}

impl JsonRpcRequest {
    pub fn new(id: impl Into<Value>, method: impl Into<String>, params: Option<Value>) -> Self {
        Self { jsonrpc: "2.0".into(), id: Some(id.into()), method: method.into(), params }
    }

    pub fn notification(method: impl Into<String>, params: Option<Value>) -> Self {
        Self { jsonrpc: "2.0".into(), id: None, method: method.into(), params }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id:      Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result:  Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error:   Option<JsonRpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code:    i64,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data:    Option<Value>,
}

// ── MCP Tool ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpTool {
    pub name:        String,
    pub description: Option<String>,
    #[serde(rename = "inputSchema")]
    pub input_schema: Value,
}

// ── Request/Response wrappers ─────────────────────────────────────────────────

pub struct McpRequest {
    pub tool:   String,
    pub params: Value,
}

pub struct McpResponse {
    pub content: Vec<McpContent>,
    pub is_error: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum McpContent {
    Text { text: String },
    Image { mime_type: String, data: String },
}
