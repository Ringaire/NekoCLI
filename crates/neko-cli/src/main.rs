mod args;
mod agent;
mod bootstrap;
mod config;
mod connect;
mod config_watch;
mod mcp_manager;
mod repl;
mod tui;

use anyhow::Result;
use tracing::info;

#[tokio::main]
async fn main() -> Result<()> {
    let args = args::parse();
    config::setup_tracing(&args);
    neko_core::session::init_dirs().await?;

    info!(version = env!("CARGO_PKG_VERSION"), "neko starting");

    if args.list_sessions {
        return repl::cmd::list_sessions().await;
    }
    if let Some(resume_id) = &args.resume {
        return repl::run(Some(*resume_id), &args).await;
    }

    repl::run(None, &args).await
}
