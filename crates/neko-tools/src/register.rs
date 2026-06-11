use neko_core::tools::{ToolRegistry, ToolRegistryExt};

use crate::tools::{
    bash::BashTool,
    edit_file::EditFileTool,
    glob::GlobTool,
    grep::GrepTool,
    lsp_diagnostics::LspDiagnosticsTool,
    lsp_refs::LspRefsTool,
    memory::MemoryTool,
    read_file::ReadFileTool,
    search_sessions::SearchSessionsTool,
    sessions::ListSessionsTool,
    todo::TodoTool,
    token_count::TokenCountTool,
    tree::TreeTool,
    web_fetch::WebFetchTool,
    web_search::WebSearchTool,
    write_file::WriteFileTool,
};

pub fn register_all(registry: &dyn ToolRegistry) {
    registry.register(BashTool);
    registry.register(ReadFileTool);
    registry.register(WriteFileTool);
    registry.register(EditFileTool);
    registry.register(TreeTool);
    registry.register(GlobTool);
    registry.register(GrepTool);
    registry.register(WebFetchTool);
    registry.register(WebSearchTool);
    registry.register(LspDiagnosticsTool);
    registry.register(LspRefsTool);
    registry.register(MemoryTool);
    registry.register(TodoTool);
    registry.register(TokenCountTool);
    registry.register(ListSessionsTool);
    registry.register(SearchSessionsTool);
}
