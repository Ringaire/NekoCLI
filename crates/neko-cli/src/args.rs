use clap::Parser;
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Parser, Debug, Clone)]
#[command(name = "neko", about = "NekoCode — terminal AI coding assistant", version)]
pub struct Args {
    #[arg(help = "Initial prompt to send")]
    pub prompt: Option<String>,

    #[arg(long, default_value = "build", help = "Permission mode: build | edit | ask")]
    pub mode: String,

    #[arg(long, help = "Resume a previous session by UUID")]
    pub resume: Option<Uuid>,

    #[arg(long, help = "List saved sessions")]
    pub list_sessions: bool,

    #[arg(long, help = "Model to use (overrides config)")]
    pub model: Option<String>,

    #[arg(long, help = "Provider to use (overrides config)")]
    pub provider: Option<String>,

    #[arg(long, help = "Working directory (default: current dir)")]
    pub cwd: Option<PathBuf>,

    #[arg(long = "dangerously-skip-permissions", help = "Skip all permission checks")]
    pub dangerously_skip_permissions: bool,

    #[arg(long, help = "Enable extended thinking (Anthropic only)")]
    pub extended_thinking: bool,

    #[arg(long, help = "Enable verbose debug logging")]
    pub verbose: bool,

    #[arg(long = "no-tui", help = "Disable TUI, use plain output")]
    pub no_tui: bool,
}

pub fn parse() -> Args {
    Args::parse()
}
