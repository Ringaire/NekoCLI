//! Slash 命令：解析、执行分派、帮助，以及 TUI 内联补全所需的元数据。
//!
//! `COMMANDS` 是命令元数据的**单一来源**——帮助文本、`/` 输入时的补全建议、
//! 参数提示都从这里派生，避免多处重复、不一致。
//!
//! 命令的实际副作用分两类：
//!   - 纯展示/会话控制（help / sessions / memory …）在此或调用方就地处理；
//!   - 需要改运行时状态（mode / model / resume / compact …）通过
//!     [`CommandOutcome`] 回传给主循环（TUI `app.rs` 或 plain `repl/mod.rs`）执行。

use anyhow::Result;

use neko_core::permissions::ModeName;
use neko_core::skills::SkillRegistry;
use neko_core::{delete_memory, list_memory, search_memory};
use uuid::Uuid;

// ── 命令元数据（单一来源）────────────────────────────────────────────────────

/// 一条 slash 命令的静态元数据。
pub struct CommandMeta {
    /// 规范名（不含前导 `/`）。
    pub name:        &'static str,
    /// 帮助 / 补全里展示的一行描述。
    pub description: &'static str,
    /// 参数提示（命令名敲完后展示），无参数则为 `None`。
    pub arg_hint:    Option<&'static str>,
}

/// 全部内置命令。顺序即帮助与补全的展示顺序。
pub const COMMANDS: &[CommandMeta] = &[
    CommandMeta { name: "help",     description: "Show command list",                     arg_hint: None },
    CommandMeta { name: "mode",     description: "Switch permission mode",                arg_hint: Some("build|edit|ask") },
    CommandMeta { name: "model",    description: "Show or switch model",                  arg_hint: Some("[provider/model-id]") },
    CommandMeta { name: "connect",  description: "Configure provider connection",         arg_hint: Some("[provider] [key] [url]") },
    CommandMeta { name: "think",    description: "Control thinking mode (on/off/show/hide/budget)", arg_hint: Some("on|off [budget] | show|hide") },
    CommandMeta { name: "sessions", description: "List saved sessions",                   arg_hint: None },
    CommandMeta { name: "resume",   description: "Resume a saved session",                arg_hint: Some("<session-uuid>") },
    CommandMeta { name: "compact",  description: "Summarize & compact the conversation",  arg_hint: None },
    CommandMeta { name: "clear",    description: "Clear the screen / chat",               arg_hint: None },
    CommandMeta { name: "memory",   description: "List / search / delete memories",       arg_hint: Some("[search <q> | rm <id>]") },
    CommandMeta { name: "quit",     description: "Exit neko",                             arg_hint: None },
];

/// 命令别名 → 规范名（用于解析，不进入补全/帮助列表）。
const ALIASES: &[(&str, &str)] = &[
    ("h", "help"),
    ("?", "help"),
    ("ls", "sessions"),
    ("cls", "clear"),
    ("mem", "memory"),
    ("exit", "quit"),
    ("q", "quit"),
];

fn canonical(cmd: &str) -> &str {
    ALIASES
        .iter()
        .find(|(alias, _)| *alias == cmd)
        .map(|(_, name)| *name)
        .unwrap_or(cmd)
}

// ── 命令处理结果 ──────────────────────────────────────────────────────────────

/// `handle` 的结果：要么就地处理完（`Handled`），要么回传给主循环执行。
pub enum CommandOutcome {
    /// 不是命令，原样作为 prompt 发送。
    NotACommand(String),
    /// 展开技能为 prompt 发送。
    RunSkill { prompt: String },
    /// 切换权限模式。
    SwitchMode(ModeName),
    /// 切换模型（`provider/model` 或裸 `model`）。
    SwitchModel(String),
    /// 打开交互式模型选择器（/model 无参数时）。
    OpenModelPicker,
    /// 打开 `/connect` provider 配置向导（无参数时）。
    OpenProviderSetup,
    /// `/connect <provider> <key> [url]` 快速配置。
    QuickConnect { provider: String, api_key: Option<String>, base_url: Option<String> },
    /// 控制 thinking 模式与可见性。
    /// 字段：(enabled, budget_tokens, show_reasoning)
    SwitchThinking { enabled: bool, budget: Option<u32>, show: Option<bool> },
    /// 清屏 / 清空对话。
    Clear,
    /// 压缩上下文。
    Compact,
    /// 恢复指定会话。
    Resume(Uuid),
    /// 退出。
    Quit,
    /// 已就地处理（或需主循环按命令名做 async 收尾，如 /sessions、/memory）。
    Handled,
}

// ── 解析与分派 ────────────────────────────────────────────────────────────────

/// 解析一行输入。非 `/` 开头视为普通消息。
pub fn handle(text: &str, skills: &SkillRegistry) -> CommandOutcome {
    let trimmed = text.trim();
    if !trimmed.starts_with('/') {
        return CommandOutcome::NotACommand(text.to_string());
    }

    let body = &trimmed[1..];
    let mut parts = body.splitn(2, char::is_whitespace);
    let raw_cmd = parts.next().unwrap_or("");
    let rest = parts.next().unwrap_or("").trim();
    let lower_cmd = raw_cmd.to_lowercase();
    let cmd = canonical(&lower_cmd);

    match cmd {
        "help" => {
            print_help(skills);
            CommandOutcome::Handled
        }
        "mode" => match rest.parse::<ModeName>() {
            Ok(mode) => CommandOutcome::SwitchMode(mode),
            Err(_) => {
                println!("usage: /mode build|edit|ask");
                CommandOutcome::Handled
            }
        },
        "model" => {
            if rest.is_empty() {
                CommandOutcome::OpenModelPicker
            } else {
                CommandOutcome::SwitchModel(rest.to_string())
            }
        }
        "connect" => {
            let mut parts = rest.split_whitespace();
            match parts.next() {
                None => CommandOutcome::OpenProviderSetup,
                Some(provider) => CommandOutcome::QuickConnect {
                    provider: provider.to_lowercase(),
                    api_key:  parts.next().map(str::to_string),
                    base_url: parts.next().map(str::to_string),
                },
            }
        }
        "think" => {
            let mut parts = rest.split_whitespace();
            let sub = parts.next().unwrap_or("").to_lowercase();
            match sub.as_str() {
                "on" => {
                    let budget: Option<u32> = parts.next().and_then(|s| s.parse().ok());
                    CommandOutcome::SwitchThinking { enabled: true, budget, show: None }
                }
                "off" => {
                    CommandOutcome::SwitchThinking { enabled: false, budget: None, show: None }
                }
                "show" => {
                    CommandOutcome::SwitchThinking { enabled: true, budget: None, show: Some(true) }
                }
                "hide" => {
                    CommandOutcome::SwitchThinking { enabled: true, budget: None, show: Some(false) }
                }
                "" => {
                    println!("usage: /think on|off [budget] | show|hide");
                    CommandOutcome::Handled
                }
                _ => {
                    // 尝试把第一个词当作 budget 数字；否则报错
                    if let Ok(n) = sub.parse::<u32>() {
                        CommandOutcome::SwitchThinking { enabled: true, budget: Some(n), show: None }
                    } else {
                        println!("usage: /think on|off [budget] | show|hide");
                        CommandOutcome::Handled
                    }
                }
            }
        }
        // 列表在主循环里异步执行（需读盘）。
        "sessions" => CommandOutcome::Handled,
        "resume" => {
            if rest.is_empty() {
                // 无参 = 打开交互式会话选择器，同 /sessions
                CommandOutcome::Handled
            } else {
                match Uuid::parse_str(rest) {
                    Ok(id) => CommandOutcome::Resume(id),
                    Err(_) => {
                        println!("usage: /resume <session-uuid>");
                        CommandOutcome::Handled
                    }
                }
            }
        },
        "clear" => CommandOutcome::Clear,
        "compact" => CommandOutcome::Compact,
        // memory 子命令在主循环里异步执行。
        "memory" => CommandOutcome::Handled,
        "quit" => CommandOutcome::Quit,
        // 其余：尝试作为技能名。
        other => {
            if let Some(skill) = skills.get(other) {
                let mut prompt = skill.prompt.clone();
                if !rest.is_empty() {
                    prompt.push_str("\n\nUser arguments: ");
                    prompt.push_str(rest);
                }
                CommandOutcome::RunSkill { prompt }
            } else {
                println!("unknown command or skill: /{other}  (try /help)");
                CommandOutcome::Handled
            }
        }
    }
}

// ── 帮助 ──────────────────────────────────────────────────────────────────────

fn print_help(skills: &SkillRegistry) {
    println!("Commands:");
    for c in COMMANDS {
        let usage = match c.arg_hint {
            Some(h) => format!("/{} {}", c.name, h),
            None => format!("/{}", c.name),
        };
        println!("  {:<28} {}", usage, c.description);
    }
    let skill_list = skills.list();
    if !skill_list.is_empty() {
        println!("Skills:");
        for s in skill_list {
            println!("  /{:<26} {}", s.name, s.description);
        }
    }
}

// ── 异步收尾（主循环在 `Handled` 后按命令名调用）──────────────────────────────

/// 已保存会话的格式化展示行（单一来源，供 plain REPL 与 TUI 复用）。
/// 无会话时返回单行 `(no sessions)`。
pub async fn session_lines() -> Vec<String> {
    let sessions = neko_core::session::list_sessions().await;
    if sessions.is_empty() {
        return vec!["(no sessions)".to_string()];
    }
    sessions.iter().map(|s| {
        let when = chrono::DateTime::from_timestamp_millis(s.updated_at)
            .map(|d: chrono::DateTime<chrono::Utc>| d.format("%Y-%m-%d %H:%M").to_string())
            .unwrap_or_else(|| "-".to_string());
        format!(
            "{} | {} | {} msgs | {}",
            s.id,
            s.title.as_deref().unwrap_or("(untitled)"),
            s.message_count,
            when,
        )
    }).collect()
}

/// 列出已保存会话（plain 模式打印）。
pub async fn list_sessions() -> Result<()> {
    for line in session_lines().await {
        println!("{line}");
    }
    Ok(())
}

/// 处理 `/memory` 子命令：`search <q>`、`rm <id>`，或裸 `/memory` 列出全部。
pub async fn handle_memory(rest: &str) -> Result<()> {
    if let Some(id_str) = rest.strip_prefix("rm").map(str::trim).filter(|s| !s.is_empty()) {
        match Uuid::parse_str(id_str) {
            Ok(id) => {
                if delete_memory(id).await? {
                    println!("[memory {id} deleted]");
                } else {
                    println!("[memory {id} not found]");
                }
            }
            Err(_) => println!("usage: /memory rm <uuid>"),
        }
        return Ok(());
    }

    let entries = if let Some(q) = rest.strip_prefix("search").map(str::trim).filter(|s| !s.is_empty()) {
        search_memory(q).await
    } else {
        list_memory().await
    };

    if entries.is_empty() {
        println!("(no memories)");
    } else {
        for e in &entries {
            println!("[{:?}] {} — {}  ({})", e.memory_type, e.title, e.body, e.id);
        }
    }
    Ok(())
}

// ── 内联补全（供 TUI 使用）────────────────────────────────────────────────────

/// 一条补全建议。
#[derive(Debug, Clone)]
pub struct Suggestion {
    /// 接受后填入输入框的完整值，如 `/model`。
    pub value:       String,
    /// 列表中展示的标签，如 `/model`。
    pub label:       String,
    /// 一行描述。
    pub description: String,
}

/// 输入 `/前缀`（尚未输入空格）时的命令 + 技能建议。
pub fn command_suggestions(input: &str, skills: &SkillRegistry) -> Vec<Suggestion> {
    if !input.starts_with('/') || input[1..].contains(char::is_whitespace) {
        return Vec::new();
    }
    let prefix = input[1..].to_lowercase();
    let mut out = Vec::new();

    for c in COMMANDS {
        if c.name.starts_with(&prefix) {
            out.push(Suggestion {
                value:       format!("/{}", c.name),
                label:       format!("/{}", c.name),
                description: c.description.to_string(),
            });
        }
    }
    for s in skills.list() {
        let lname = s.name.to_lowercase();
        let is_builtin = COMMANDS.iter().any(|c| c.name == lname);
        if lname.starts_with(&prefix) && !is_builtin {
            out.push(Suggestion {
                value:       format!("/{}", s.name),
                label:       format!("/{}", s.name),
                description: s.description.clone(),
            });
        }
    }
    out
}

/// 行内幽灵补全：首个候选相对当前输入多出的后缀（用于灰字提示）。
pub fn inline_ghost(input: &str, suggestions: &[Suggestion]) -> String {
    if !input.starts_with('/') {
        return String::new();
    }
    match suggestions.first() {
        Some(s) if s.value.starts_with(input) && s.value != input => s.value[input.len()..].to_string(),
        _ => String::new(),
    }
}

/// 命令名敲完（已含空格）后的参数提示。
pub fn argument_hint(input: &str) -> Option<&'static str> {
    if !input.starts_with('/') {
        return None;
    }
    let body = &input[1..];
    if !body.contains(char::is_whitespace) {
        return None; // 还在敲命令名
    }
    let first = body.split_whitespace().next().unwrap_or("").to_lowercase();
    let name = canonical(&first);
    COMMANDS.iter().find(|c| c.name == name).and_then(|c| c.arg_hint)
}
