//! TUI 共享主题常量与样式 helper（集中单一来源，避免各 widget 复制）。

use ratatui::style::Color;

/// 运行中 spinner 帧。
pub const SPINNER: &[&str] = &["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/// 强调橙（AI 圆点 / 进行中标记 / 欢迎语）。
pub const ACCENT_ORANGE: Color = Color::Rgb(214, 142, 104);

/// 权限模式 → 颜色。
pub fn mode_color(mode: &str) -> Color {
    match mode {
        "build" => Color::Green,
        "edit"  => Color::Yellow,
        "ask"   => Color::Blue,
        _       => Color::White,
    }
}
