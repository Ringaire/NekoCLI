use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tracing::debug;
use uuid::Uuid;

use crate::error::McpError;
use crate::protocol::{JsonRpcRequest, JsonRpcResponse, McpRequest, McpResponse, McpTool};
use crate::transport::Transport;

const CALL_TIMEOUT_SECS: u64 = 60;

pub struct McpClient {
    transport: Arc<Mutex<Box<dyn Transport>>>,
    tools:     Vec<McpTool>,
}

impl McpClient {
    pub async fn new(transport: Box<dyn Transport>) -> Result<Self, McpError> {
        let mut client = Self {
            transport: Arc::new(Mutex::new(transport)),
            tools:     Vec::new(),
        };
        client.initialize().await?;
        Ok(client)
    }

    async fn initialize(&mut self) -> Result<(), McpError> {
        let req = JsonRpcRequest::new(
            Uuid::new_v4().to_string(),
            "initialize",
            Some(serde_json::json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "neko", "version": env!("CARGO_PKG_VERSION") }
            })),
        );
        self.call_raw(req).await?;

        let notify = JsonRpcRequest::notification("notifications/initialized", None);
        self.transport.lock().await.send(notify).await?;

        self.refresh_tools().await?;
        Ok(())
    }

    pub async fn refresh_tools(&mut self) -> Result<(), McpError> {
        let req = JsonRpcRequest::new(Uuid::new_v4().to_string(), "tools/list", None);
        let resp = self.call_raw(req).await?;
        if let Some(result) = resp.result {
            if let Ok(tools) = serde_json::from_value::<Vec<McpTool>>(result["tools"].clone()) {
                self.tools = tools;
                debug!(count = self.tools.len(), "MCP tools refreshed");
            }
        }
        Ok(())
    }

    pub fn tools(&self) -> &[McpTool] {
        &self.tools
    }

    pub async fn call(&self, req: &McpRequest) -> Result<McpResponse, McpError> {
        let rpc = JsonRpcRequest::new(
            Uuid::new_v4().to_string(),
            "tools/call",
            Some(serde_json::json!({ "name": req.tool, "arguments": req.params })),
        );
        let resp = self.call_raw(rpc).await?;

        if let Some(err) = resp.error {
            return Err(McpError::Rpc { code: err.code, message: err.message });
        }

        let result = resp.result.unwrap_or_default();
        let is_error = result["isError"].as_bool().unwrap_or(false);
        let content = result["content"]
            .as_array()
            .map(|arr| arr.iter().filter_map(|v| serde_json::from_value(v.clone()).ok()).collect())
            .unwrap_or_default();
        Ok(McpResponse { content, is_error })
    }

    async fn call_raw(&self, req: JsonRpcRequest) -> Result<JsonRpcResponse, McpError> {
        let mut transport = self.transport.lock().await;
        transport.send(req).await?;
        tokio::time::timeout(
            Duration::from_secs(CALL_TIMEOUT_SECS),
            transport.recv(),
        )
        .await
        .map_err(|_| McpError::Timeout)?
    }
}
