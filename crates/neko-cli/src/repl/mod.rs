pub mod cmd;
pub mod commands;
pub mod history;
pub mod printer;

use anyhow::Result;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use neko_core::session;
use neko_core::tools::{Message, MessageRole};
use neko_providers::provider::DEFAULT_THINKING_BUDGET;

use crate::agent::{AgentContext, AgentExecutor, TurnResult};
use crate::args::Args;
use crate::bootstrap::{self, BootstrappedRuntime};

use commands::CommandOutcome;
use history::History;

/// REPL 入口：先 bootstrap，再进入 TUI 或 plain 模式。
pub async fn run(_session_id: Option<Uuid>, args: &Args) -> Result<()> {
    let runtime = bootstrap::bootstrap(args).await?;

    if args.no_tui {
        run_plain(runtime, args).await
    } else {
        crate::tui::run_with_runtime(runtime, args).await
    }
}

/// Plain（无 TUI）模式 REPL。
pub async fn run_plain(mut runtime: BootstrappedRuntime, args: &Args) -> Result<()> {
    print_banner(&runtime);

    let mut ctx = AgentContext::from_session(
        &runtime.session,
        runtime.model.clone(),
        Some(runtime.system_prompt.clone()),
    );

    let mut hist = History::load().await;

    let stdin = tokio::io::stdin();
    let mut reader = tokio::io::BufReader::new(stdin);

    // 处理初始 prompt（来自命令行参数）
    if let Some(prompt) = &args.prompt {
        if !prompt.trim().is_empty() {
            hist.push(prompt).await;
            process_user_input(&mut runtime, &mut ctx, prompt.clone(), &mut reader).await?;
        }
    }

    loop {
        use tokio::io::AsyncBufReadExt;
        print_prompt(&runtime);

        let mut line = String::new();
        let n = reader.read_line(&mut line).await?;
        if n == 0 {
            // EOF (Ctrl+D)
            println!();
            break;
        }
        let input = line.trim_end_matches(['\n', '\r']).to_string();
        if input.trim().is_empty() {
            continue;
        }

        match commands::handle(&input, &runtime.skills) {
            CommandOutcome::NotACommand(text) => {
                hist.push(&text).await;
                process_user_input(&mut runtime, &mut ctx, text, &mut reader).await?;
            }
            CommandOutcome::RunSkill { prompt } => {
                process_user_input(&mut runtime, &mut ctx, prompt, &mut reader).await?;
            }
            CommandOutcome::SwitchMode(mode) => {
                runtime.mode = mode;
                runtime.permissions.lock().await.set_mode(mode);
                println!("[mode switched to {}]", mode);
            }
            CommandOutcome::SwitchModel(model) => {
                switch_model(&mut runtime, &mut ctx, model).await;
            }
            CommandOutcome::OpenModelPicker => {
                println!("usage: /model <provider/model-id>");
            }
            CommandOutcome::OpenProviderSetup => {
                println!("[/connect] the interactive wizard runs in the TUI.");
                println!("           plain mode: /connect <provider> <apiKey> [baseUrl]");
            }
            CommandOutcome::QuickConnect { provider, api_key, base_url } => {
                quick_connect(&mut runtime, &mut ctx, provider, api_key, base_url).await;
            }
            CommandOutcome::SwitchThinking { enabled, budget, show } => {
                let show_str = if show.unwrap_or(true) { "show" } else { "hide" };
                if enabled {
                    let budget = budget.unwrap_or(DEFAULT_THINKING_BUDGET);
                    println!("[thinking ON (budget: {} tokens, display: {})]", budget, show_str);
                } else {
                    println!("[thinking OFF]");
                }
            }
            CommandOutcome::Clear => {
                print!("\x1B[2J\x1B[H");
                use std::io::Write;
                let _ = std::io::stdout().flush();
            }
            CommandOutcome::Compact => {
                compact_context(&mut runtime, &mut ctx).await?;
            }
            CommandOutcome::Resume(id) => {
                resume_session(&mut runtime, &mut ctx, id).await?;
            }
            CommandOutcome::Quit => break,
            CommandOutcome::Handled => {
                let trimmed = input.trim();
                if trimmed == "/sessions" || trimmed == "/ls" {
                    commands::list_sessions().await?;
                } else if let Some(rest) = trimmed.strip_prefix("/memory").or_else(|| trimmed.strip_prefix("/mem")) {
                    commands::handle_memory(rest.trim()).await?;
                }
            }
        }
    }

    println!("[session {} saved]", runtime.session.meta.id);
    Ok(())
}

type StdinReader = tokio::io::BufReader<tokio::io::Stdin>;

/// 处理一条用户输入：持久化用户消息，运行 agent turn，流式打印事件。
async fn process_user_input(
    runtime: &mut BootstrappedRuntime,
    ctx:     &mut AgentContext,
    text:    String,
    reader:  &mut StdinReader,
) -> Result<()> {
    let user_msg = Message::user_text(text);
    ctx.add_message(user_msg.clone());
    session::append_message(runtime.session.meta.id, user_msg).await.ok();

    let signal = CancellationToken::new();
    let signal_for_ctrlc = signal.clone();

    // Ctrl+C 在本轮中取消 agent
    let ctrlc_task = tokio::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            signal_for_ctrlc.cancel();
        }
    });

    let result = run_agent_turn(runtime, ctx, signal, reader).await;
    ctrlc_task.abort();

    match result {
        TurnResult::Done { .. } => {}
        TurnResult::MaxTurns => {
            println!("\n[reached max turns limit]");
        }
        TurnResult::Cancelled => {
            println!("\n[cancelled]");
        }
        TurnResult::Error(e) => {
            println!("\n[error: {}]", e);
        }
        TurnResult::Continue => {}
    }

    Ok(())
}

/// 构建 executor 并运行一轮（含多 turn 工具循环），同时订阅事件总线打印，
/// 并在收到权限请求时通过 stdin 交互确认。
async fn run_agent_turn(
    runtime: &BootstrappedRuntime,
    ctx:     &mut AgentContext,
    signal:  CancellationToken,
    reader:  &mut StdinReader,
) -> TurnResult {
    let Some(provider) = runtime.provider.clone() else {
        println!("[no provider configured — run /connect <provider> <apiKey> first]");
        return TurnResult::Error("no provider configured".to_string());
    };

    let (perm_tx, mut perm_rx) = tokio::sync::mpsc::channel(8);

    let executor = build_orchestrator_executor(runtime, provider, Some(perm_tx));

    let mut sub = runtime.bus.subscribe();
    let mut printer = printer::PlainPrinter::new();

    let exec_fut = executor.run(ctx, signal);
    tokio::pin!(exec_fut);

    loop {
        tokio::select! {
            biased;
            Some(req) = perm_rx.recv() => {
                printer.finish();
                let decision = prompt_permission_stdin(&req, reader).await;
                let _ = req.responder.send(decision);
            }
            ev = sub.recv() => {
                // lagged/closed 时忽略
                if let Ok(ev) = ev {
                    printer.handle(&ev);
                }
            }
            result = &mut exec_fut => {
                // 排空剩余事件
                while let Ok(ev) = sub.try_recv() {
                    printer.handle(&ev);
                }
                printer.finish();
                return result;
            }
        }
    }
}

/// 在 plain 模式下通过 stdin 询问权限决定。
async fn prompt_permission_stdin(
    req:    &crate::agent::PermissionRequest,
    reader: &mut StdinReader,
) -> crate::agent::PermissionDecision {
    use crate::agent::PermissionDecision;
    use tokio::io::AsyncBufReadExt;
    use std::io::Write;

    println!();
    println!("\x1B[33mPermission required\x1B[0m: {} — {}", req.tool_name, req.input_preview);
    print!("  [y] allow once  [a] allow always  [d] deny  [x] deny always  (default y) > ");
    let _ = std::io::stdout().flush();

    let mut line = String::new();
    if reader.read_line(&mut line).await.unwrap_or(0) == 0 {
        // EOF：保守拒绝
        return PermissionDecision::DenyOnce;
    }

    match line.trim().to_lowercase().as_str() {
        "" | "y" | "yes" => PermissionDecision::AllowOnce,
        "a" | "always"   => PermissionDecision::AllowAlways,
        "x"              => PermissionDecision::DenyAlways,
        _                => PermissionDecision::DenyOnce,
    }
}

/// 切换模型（同 provider 内）或 provider/model。
async fn switch_model(runtime: &mut BootstrappedRuntime, ctx: &mut AgentContext, model_ref: String) {
    use crate::connect::SwitchResult;
    match crate::connect::switch_model(runtime, &model_ref).await {
        SwitchResult::Switched { provider, model } => {
            ctx.model = model.clone();
            ctx.system = Some(runtime.system_prompt.clone());
            println!("[switched to {provider}/{model}]");
        }
        SwitchResult::ModelOnly { model } => {
            ctx.model = model.clone();
            ctx.system = Some(runtime.system_prompt.clone());
            println!("[model switched to {model}]");
        }
        SwitchResult::ProviderMissing { provider } => {
            println!("[provider '{provider}' not available]");
        }
        SwitchResult::NoProvider => {
            println!("[no provider configured — run /connect first]");
        }
    }
}

/// `/connect <provider> <key> [url]` 快速配置（plain 模式无交互向导）。
async fn quick_connect(
    runtime:  &mut BootstrappedRuntime,
    ctx:      &mut AgentContext,
    provider: String,
    api_key:  Option<String>,
    base_url: Option<String>,
) {
    use crate::connect::ConnectResult;
    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    match crate::connect::quick_connect(runtime, &cwd, &provider, api_key, base_url).await {
        ConnectResult::Connected { provider, model } => {
            ctx.model = model.clone();
            ctx.system = Some(runtime.system_prompt.clone());
            println!("[connected — switched to {provider}/{model}]");
        }
        ConnectResult::Rejected(msg) => println!("[{msg}]"),
    }
}

/// 上下文压缩：用内置 compact 技能生成摘要，替换历史。
async fn compact_context(runtime: &mut BootstrappedRuntime, ctx: &mut AgentContext) -> Result<()> {
    if ctx.messages.len() < 4 {
        println!("[nothing to compact]");
        return Ok(());
    }

    println!("[compacting conversation...]");

    let compact_prompt = runtime.skills.get("compact")
        .map(|s| s.prompt.clone())
        .unwrap_or_else(|| "Summarize the conversation so far concisely.".to_string());

    // 临时上下文：发送压缩请求
    let mut compact_ctx = AgentContext {
        messages:      ctx.messages.clone(),
        system:        ctx.system.clone(),
        model:         ctx.model.clone(),
        input_tokens:  0,
        output_tokens: 0,
    };
    compact_ctx.add_message(Message::user_text(compact_prompt));

    let Some(provider) = runtime.provider.clone() else {
        println!("[no provider configured — run /connect first]");
        return Ok(());
    };

    let signal = CancellationToken::new();
    // 压缩是一次性总结，不持久化到会话 jsonl
    let mut executor = AgentExecutor::main(
        provider,
        runtime.tools.clone(),
        runtime.permissions.clone(),
        runtime.bus.clone(),
        runtime.session.meta.id,
        runtime.cwd.clone(),
        None,
    );
    executor.persist = false;

    let mut sub = runtime.bus.subscribe();
    let mut printer = printer::PlainPrinter::new();
    let exec_fut = executor.run(&mut compact_ctx, signal);
    tokio::pin!(exec_fut);

    let summary_text;
    loop {
        tokio::select! {
            biased;
            ev = sub.recv() => { if let Ok(ev) = ev { printer.handle(&ev); } }
            _ = &mut exec_fut => {
                while let Ok(ev) = sub.try_recv() { printer.handle(&ev); }
                printer.finish();
                summary_text = printer.take_assistant_text();
                break;
            }
        }
    }

    if summary_text.trim().is_empty() {
        println!("[compact produced no summary; keeping full history]");
        return Ok(());
    }

    // 用摘要替换历史：保留 system，注入一条 summary 作为 assistant 上下文
    let summary_msg = Message::new(
        MessageRole::Assistant,
        vec![neko_core::tools::ContentBlock::Text {
            text: format!("[Previous conversation summary]\n{}", summary_text),
        }],
    );
    ctx.replace_messages(vec![summary_msg.clone()]);

    // 持久化：重写会话消息
    session::replace_messages(runtime.session.meta.id, &ctx.messages).await.ok();

    println!("[context compacted: {} tokens summary]", summary_text.len() / 4);
    Ok(())
}

/// 恢复指定会话。
async fn resume_session(runtime: &mut BootstrappedRuntime, ctx: &mut AgentContext, id: Uuid) -> Result<()> {
    match session::load_session(id).await {
        Some(s) => {
            *ctx = AgentContext::from_session(&s, runtime.model.clone(), Some(runtime.system_prompt.clone()));
            runtime.session = s;
            println!("[resumed session {} with {} messages]", id, ctx.messages.len());
        }
        None => {
            println!("[session {} not found]", id);
        }
    }
    Ok(())
}

fn print_banner(runtime: &BootstrappedRuntime) {
    println!("neko v{} — terminal AI coding assistant", env!("CARGO_PKG_VERSION"));
    let prov_id = runtime.provider.as_ref().map(|p| p.id().to_string()).unwrap_or_else(|| "(none — /connect)".to_string());
    println!("provider: {}  model: {}  mode: {}", prov_id, runtime.model, runtime.mode);
    if runtime.skip_perms {
        println!("WARNING: --dangerously-skip-permissions active; all tool calls auto-approved");
    }
    println!("type /help for commands, /quit to exit");
    println!();
}

fn print_prompt(runtime: &BootstrappedRuntime) {
    use std::io::Write;
    print!("[{}] you> ", runtime.mode);
    let _ = std::io::stdout().flush();
}

/// 构建主 agent 的 orchestrator executor。
fn build_orchestrator_executor(
    runtime:  &BootstrappedRuntime,
    provider: std::sync::Arc<dyn neko_providers::Provider>,
    perm_tx:  Option<crate::agent::permission::PermissionSender>,
) -> AgentExecutor {
    crate::agent::orchestrator::build_executor(runtime, provider, perm_tx)
}
