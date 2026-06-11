//! 终端 Markdown 渲染器。
//!
//! 委托 `tui-markdown`（基于 pulldown-cmark）完成 CommonMark 解析与样式化，
//! 返回已 owned 的 `Vec<Line<'static>>` 供 chat 区直接拼接。

use ratatui::text::{Line, Span};

/// 把 Markdown 文本渲染为样式化行。
///
/// `width` 当前未使用（保留签名以兼容 chat.rs 调用方）；
/// 软换行由 chat 区 Paragraph 的 ratatui 原生 wrap 处理。
pub fn render_markdown(text: &str, _width: usize) -> Vec<Line<'static>> {
    let rendered = tui_markdown::from_str(text);
    rendered
        .lines
        .into_iter()
        .map(|line| {
            Line::from(
                line.spans
                    .into_iter()
                    .map(|span| Span::styled(span.content.into_owned(), span.style))
                    .collect::<Vec<_>>(),
            )
        })
        .collect()
}
