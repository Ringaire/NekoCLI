use async_trait::async_trait;
use neko_core::tools::{Tool, ToolContext, ToolResult};
use serde_json::{json, Value};
use std::time::Duration;
use tracing::debug;

pub struct BashTool;

const TIMEOUT_DEFAULT_SECS: u64 = 120;
const MAX_OUTPUT_BYTES: usize = 1_048_576; // 1 MiB

#[async_trait]
impl Tool for BashTool {
    fn name(&self) -> &str { "bash" }

    fn description(&self) -> &str {
        "Run a shell command and return its stdout and stderr. Avoid interactive commands."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The shell command to run"
                },
                "timeout": {
                    "type": "integer",
                    "description": "Timeout in seconds (default 120, max 600)",
                    "minimum": 1,
                    "maximum": 600
                },
                "cwd": {
                    "type": "string",
                    "description": "Working directory override (defaults to session cwd)"
                }
            },
            "required": ["command"]
        })
    }

    async fn execute(&self, input: Value, ctx: &ToolContext) -> ToolResult {
        let command = match input["command"].as_str() {
            Some(c) => c.to_string(),
            None => return ToolResult::err("missing 'command' field"),
        };

        let timeout_secs = input["timeout"].as_u64().unwrap_or(TIMEOUT_DEFAULT_SECS).min(600);
        let cwd = input["cwd"]
            .as_str()
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| ctx.cwd.clone());

        debug!(cmd = %command, timeout = timeout_secs, "bash execute");

        let signal = ctx.signal.clone();
        let result = tokio::select! {
            r = run_command(&command, &cwd, timeout_secs) => r,
            _ = signal.cancelled() => {
                return ToolResult::err("command cancelled");
            }
        };

        match result {
            Ok((stdout, stderr, code)) => {
                let truncated_stdout = truncate_output(&stdout);
                let truncated_stderr = truncate_output(&stderr);
                let mut out = String::new();
                if !truncated_stdout.is_empty() {
                    out.push_str(&truncated_stdout);
                }
                if !truncated_stderr.is_empty() {
                    if !out.is_empty() { out.push('\n'); }
                    out.push_str("[stderr]\n");
                    out.push_str(&truncated_stderr);
                }
                if code != 0 {
                    if !out.is_empty() { out.push('\n'); }
                    out.push_str(&format!("[exit code: {}]", code));
                }
                if out.is_empty() { out = "(no output)".into(); }
                ToolResult::ok_text(out)
            }
            Err(e) => ToolResult::err(e.to_string()),
        }
    }
}

async fn run_command(
    command: &str,
    cwd:     &std::path::Path,
    timeout_secs: u64,
) -> Result<(String, String, i32), std::io::Error> {
    let child = tokio::process::Command::new("bash")
        .args(["-c", command])
        .current_dir(cwd)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?;

    let timeout = Duration::from_secs(timeout_secs);
    let result = tokio::time::timeout(timeout, child.wait_with_output()).await;

    match result {
        Ok(Ok(out)) => {
            let stdout = String::from_utf8_lossy(&out.stdout).into_owned();
            let stderr = String::from_utf8_lossy(&out.stderr).into_owned();
            let code   = out.status.code().unwrap_or(-1);
            Ok((stdout, stderr, code))
        }
        Ok(Err(e)) => Err(e),
        Err(_) => Err(std::io::Error::new(std::io::ErrorKind::TimedOut, "command timed out")),
    }
}

fn truncate_output(s: &str) -> String {
    if s.len() <= MAX_OUTPUT_BYTES {
        s.to_string()
    } else {
        let truncated = &s[..MAX_OUTPUT_BYTES];
        format!("{}\n[... output truncated at 1 MiB ...]", truncated)
    }
}
