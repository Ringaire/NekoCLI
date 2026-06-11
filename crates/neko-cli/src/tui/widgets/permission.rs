// 权限确认：垂直 Select 列表。
//
//   Do you want to proceed?
//     {tool}  {preview}
//   ❯ 1. Yes
//     2. Yes, and don't ask again for {tool}
//     3. No, and tell neko what to do differently

use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Clear, Paragraph},
};

use super::core::scroll_list::{anchor_above, label, pointer, ScrollList};

/// 选项数。0=Yes 1=Always 2=No
const OPTION_COUNT: usize = 3;
/// 浮层内容高度（问题 + 工具行 + 3 选项）。
const CONTENT_LINES: u16 = 5;

pub struct PermissionModal {
    pub tool_name: String,
    pub preview:   String,
    list:          ScrollList,
}

impl PermissionModal {
    pub fn new(tool_name: impl Into<String>, preview: impl Into<String>) -> Self {
        Self {
            tool_name: tool_name.into(),
            preview:   preview.into(),
            list:      ScrollList::wrapping(OPTION_COUNT),
        }
    }

    /// 当前选中项（0=Yes 1=Always 2=No）。
    pub fn cursor(&self) -> usize {
        self.list.cursor()
    }

    pub fn move_up(&mut self) {
        self.list.up(OPTION_COUNT);
    }

    pub fn move_down(&mut self) {
        self.list.down(OPTION_COUNT);
    }

    /// 浮层总高度。
    pub fn height() -> u16 {
        CONTENT_LINES
    }

    /// 锚定在输入框上方的全宽区域。
    pub fn area(parent: Rect, input_y: u16) -> Rect {
        anchor_above(parent, input_y, Self::height())
    }

    pub fn render(&self) -> Paragraph<'static> {
        let opts = [
            "Yes".to_string(),
            format!("Yes, and don't ask again for {}", self.tool_name),
            "No, and tell neko what to do differently".to_string(),
        ];

        // 问题 + 工具/预览（固定 header）
        let mut lines: Vec<Line<'static>> = vec![Line::from(Span::styled(
            "Do you want to proceed?",
            Style::default().fg(Color::White).add_modifier(Modifier::BOLD),
        ))];
        let mut tool_line = vec![Span::styled(self.tool_name.clone(), Style::default().fg(Color::Yellow))];
        if !self.preview.is_empty() {
            tool_line.push(Span::styled(format!("  {}", self.preview), Style::default().fg(Color::DarkGray)));
        }
        lines.push(Line::from(tool_line));

        // 选项行（复用 ScrollList，行号取自 RowState.index）
        let dim = Style::default().fg(Color::DarkGray);
        lines.extend(self.list.render_rows(&opts, dim, |opt, rs| {
            Line::from(vec![
                pointer(rs.selected),
                label(rs.selected, format!("{}. {}", rs.index + 1, opt)),
            ])
        }));

        Paragraph::new(lines)
    }

    /// 渲染前用于清屏的组件。
    pub fn clear() -> Clear {
        Clear
    }
}
