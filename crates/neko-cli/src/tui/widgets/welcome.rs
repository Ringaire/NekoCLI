use ratatui::{
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Paragraph, Wrap},
};

const VERSION: &str = env!("CARGO_PKG_VERSION");

use crate::tui::theme::{mode_color, ACCENT_ORANGE};

fn mode_desc(mode: &str) -> &'static str {
    match mode {
        "build" => "all tools allowed",
        "edit"  => "no shell execution",
        "ask"   => "read-only, no writes",
        _       => "",
    }
}

/// 欢迎屏的行数（供布局顶部对齐时测高）。
pub fn welcome_height(model: &str, mode: &str, cwd: &str) -> usize {
    welcome_lines(model, mode, cwd).len()
}

pub fn render_welcome(model: &str, mode: &str, cwd: &str) -> Paragraph<'static> {
    Paragraph::new(welcome_lines(model, mode, cwd)).wrap(Wrap { trim: false })
}

fn welcome_lines(model: &str, mode: &str, cwd: &str) -> Vec<Line<'static>> {
    let mcolor = mode_color(mode);
    let mdesc  = mode_desc(mode);
    let model  = model.to_string();
    let mode_s = mode.to_string();
    let cwd_s  = cwd.to_string();

    let mut lines: Vec<Line<'static>> = Vec::new();

    // ── cat + header ──────────────────────────────────────────────────────────
    // 猫占 3 行，右侧信息同行排列
    lines.push(Line::from(vec![
        Span::styled("  /\\  /\\   ", Style::default().fg(Color::Cyan)),
        Span::styled("✻ ", Style::default().fg(ACCENT_ORANGE)),
        Span::styled("Welcome to NekoCode", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
        Span::styled(format!(" v{VERSION}"), Style::default().fg(Color::DarkGray)),
    ]));
    lines.push(Line::from(vec![
        Span::styled(" ( o  o )  ", Style::default().fg(Color::Cyan)),
        Span::styled("Model   ", Style::default().fg(Color::DarkGray)),
        Span::styled(model, Style::default().fg(Color::White)),
    ]));
    lines.push(Line::from(vec![
        Span::styled("  \\ ^^ /   ", Style::default().fg(Color::Cyan)),
        Span::styled("Mode    ", Style::default().fg(Color::DarkGray)),
        Span::styled(mode_s.to_uppercase(), Style::default().fg(mcolor).add_modifier(Modifier::BOLD)),
        Span::styled(format!("  {}", mdesc), Style::default().fg(Color::DarkGray)),
    ]));
    lines.push(Line::from(vec![
        Span::styled("           ", Style::default()),
        Span::styled("CWD     ", Style::default().fg(Color::DarkGray)),
        Span::styled(cwd_s, Style::default().fg(Color::White)),
    ]));

    lines.push(Line::from(""));

    // ── Quick start ───────────────────────────────────────────────────────────
    lines.push(Line::from(Span::styled(
        "  Quick start",
        Style::default().fg(Color::DarkGray).add_modifier(Modifier::BOLD),
    )));
    lines.push(Line::from(""));

    let tips: &[(&str, &str)] = &[
        ("Tab",             "cycle mode: build → edit → ask"),
        ("↑ / ↓",          "browse input history"),
        ("@file.ts",        "attach file or directory to message"),
        ("Ctrl+A / Ctrl+E", "line start / end"),
        ("Ctrl+C",          "clear input, or press twice to exit"),
    ];
    for (key, desc) in tips {
        lines.push(Line::from(vec![
            Span::styled(format!("    {:<22}", key), Style::default().fg(Color::Cyan)),
            Span::styled(desc.to_string(), Style::default().fg(Color::DarkGray)),
        ]));
    }

    lines.push(Line::from(""));

    // ── Commands ──────────────────────────────────────────────────────────────
    lines.push(Line::from(Span::styled(
        "  Commands  (/ to see all)",
        Style::default().fg(Color::DarkGray).add_modifier(Modifier::BOLD),
    )));
    lines.push(Line::from(""));

    let cmds: &[(&str, &str)] = &[
        ("/help",     "full command list"),
        ("/model",    "switch model"),
        ("/sessions", "list saved sessions"),
        ("/memory",   "manage persistent memory"),
        ("/clear",    "clear the screen"),
        ("/quit",     "exit neko"),
    ];
    for chunk in cmds.chunks(2) {
        let mut spans = vec![Span::raw("    ")];
        for (name, desc) in chunk {
            spans.push(Span::styled(format!("{:<12}", name), Style::default().fg(Color::Cyan)));
            spans.push(Span::styled(format!("{:<28}", desc), Style::default().fg(Color::DarkGray)));
        }
        lines.push(Line::from(spans));
    }

    lines.push(Line::from(""));

    // ── Separator ─────────────────────────────────────────────────────────────
    lines.push(Line::from(Span::styled(
        format!("  {}", "─".repeat(52)),
        Style::default().fg(Color::DarkGray),
    )));
    lines.push(Line::from(Span::styled(
        "  Start typing to chat  ·  / for commands  ·  Tab to switch mode",
        Style::default().fg(Color::DarkGray),
    )));

    lines
}
