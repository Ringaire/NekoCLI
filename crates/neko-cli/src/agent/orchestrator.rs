// 编排器：把主 agent 装配为 orchestrator —— 注入 spawn_agent 工具 + 编排系统提示词，
// 使主 agent 能把自包含子任务委派给按 role 选出的子 agent。

use std::sync::Arc;

use neko_core::agent::{ModelCatalogEntry, ModelRole};
use neko_core::tools::{AugmentedToolRegistry, ToolRegistry};
use neko_providers::Provider;

use crate::agent::executor::AgentExecutor;
use crate::agent::permission::PermissionSender;
use crate::agent::spawn::SpawnAgentTool;
use crate::bootstrap::BootstrappedRuntime;

/// 子 agent 最大派生深度（含主 agent 之下的层数）。
pub const DEFAULT_MAX_DEPTH: usize = 2;

/// 构建主 agent 的 orchestrator executor：在基础工具集之上叠加 spawn_agent。
///
/// `provider` 由调用方显式传入（须在 provider 已配置时才调用——见 app.rs / repl 的 setup 门控）。
pub fn build_executor(
    runtime:          &BootstrappedRuntime,
    provider:         Arc<dyn Provider>,
    perm_tx:          Option<PermissionSender>,
) -> AgentExecutor {
    let spawn = SpawnAgentTool {
        provider:      provider.clone(),
        base_tools:    runtime.tools.clone(),
        permissions:   runtime.permissions.clone(),
        bus:           runtime.bus.clone(),
        permission_tx: perm_tx.clone(),
        catalog:       runtime.catalog.clone(),
        current_model: runtime.model.clone(),
        depth:         0,
        max_depth:     DEFAULT_MAX_DEPTH,
    };

    let aug: Arc<dyn ToolRegistry> = Arc::new(AugmentedToolRegistry::new(
        runtime.tools.clone(),
        vec![Arc::new(spawn)],
    ));

    let mut exec = AgentExecutor::main(
        provider,
        aug,
        runtime.permissions.clone(),
        runtime.bus.clone(),
        runtime.session.meta.id,
        runtime.cwd.clone(),
        perm_tx,
    );
    exec.max_output_tokens = runtime.config.session.max_tokens.clamp(1, u32::MAX as u64) as u32;
    exec
}

/// 构建编排系统提示词：在基础提示词后追加 sub-agent 模型目录与编排准则。
pub fn build_orchestrator_prompt(
    catalog:       &[ModelCatalogEntry],
    current_model: &str,
    base_prompt:   &str,
) -> String {
    let mut lines: Vec<String> = vec!["## Available sub-agent models".to_string()];

    for role in ModelRole::all() {
        let models: Vec<&str> = catalog.iter()
            .filter(|m| m.role == role)
            .map(|m| m.id.as_str())
            .take(4)
            .collect();
        if !models.is_empty() {
            lines.push(format!("**{}** ({}):", role.as_str(), role.description()));
            lines.push(format!("  {}", models.join(", ")));
        }
    }
    lines.push(format!("\nYou are running as: **{current_model}**"));

    let section = format!(
        "You are an orchestrator agent. You can delegate self-contained sub-tasks to specialized \
sub-agents using the `spawn_agent` tool.\n\n\
{}\n\n\
## Orchestration guidelines\n\
- Break complex tasks into independent sub-tasks and delegate them to appropriate models\n\
- Choose model role by task complexity: `heavy` for deep reasoning, `light` for simple lookups, `coding` for code work\n\
- Pass ALL necessary context in the `task` field — sub-agents have no shared memory or conversation history\n\
- Synthesize sub-agent outputs into a single cohesive final response\n\
- If a task is straightforward, handle it yourself without spawning sub-agents\n\
- Prefer `role` over explicit `model` unless you need a specific model's capabilities",
        lines.join("\n"),
    );

    if base_prompt.is_empty() {
        section
    } else {
        format!("{base_prompt}\n\n---\n\n{section}")
    }
}
