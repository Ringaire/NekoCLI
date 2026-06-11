use ratatui::layout::{Constraint, Direction, Layout, Rect};

pub struct AppLayout {
    pub chat:   Rect,
    pub input:  Rect,
    pub footer: Rect,
}

impl AppLayout {
    /// 顶部对齐布局（对标 Claude Code inline 风格）：内容从上往下流，输入框紧贴内容，
    /// 多余空间留到屏幕**底部**。中间无状态栏——所有信息集中在输入框下方的 footer。
    ///
    /// - `content_lines`：chat 内容按宽度软换行后的行数（welcome 或消息）。
    /// - `input_lines`：输入框视觉行数（不含边框）。
    pub fn compute(area: Rect, content_lines: u16, input_lines: u16) -> Self {
        // 输入框高度 = 视觉行数 + 上下边框(2)；上限按屏高比例（不超过一半）。
        let max_h = (area.height / 2).max(3);
        let input_h = (input_lines + 2).clamp(3, max_h);

        // chat 可用高度 = 总高 - input - footer(1)；chat 实占 = min(内容, 可用)。
        let avail_chat = area.height.saturating_sub(input_h + 1).max(1);
        let chat_h = content_lines.clamp(1, avail_chat);

        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(chat_h),    // chat（顶部对齐，按内容高度）
                Constraint::Length(input_h),   // input（上下边框）
                Constraint::Length(1),         // footer（模式 / 模型 / 状态 / 快捷键）
                Constraint::Min(0),            // 底部留白
            ])
            .split(area);

        Self {
            chat:   chunks[0],
            input:  chunks[1],
            footer: chunks[2],
        }
    }
}
