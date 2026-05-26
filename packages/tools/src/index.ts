export { bashTool } from './bash/index.js'
export { readFileTool } from './file/read.js'
export { editFileTool } from './file/edit.js'
export { writeFileTool } from './file/write.js'
export { treeTool } from './file/tree.js'
export { globTool } from './search/glob.js'
export { grepTool } from './search/grep.js'
export { webFetchTool } from './web/fetch.js'
export { webSearchTool } from './web/search.js'
export { lspDiagnosticsTool, lspRefsTool } from './lsp/index.js'
export { todoTool } from './todo/index.js'
export { tokenCountTool } from './tokens/index.js'
export { listSessionsTool, searchSessionsTool } from './sessions/index.js'

import { bashTool } from './bash/index.js'
import { readFileTool } from './file/read.js'
import { editFileTool } from './file/edit.js'
import { writeFileTool } from './file/write.js'
import { treeTool } from './file/tree.js'
import { globTool } from './search/glob.js'
import { grepTool } from './search/grep.js'
import { webFetchTool } from './web/fetch.js'
import { webSearchTool } from './web/search.js'
import { lspDiagnosticsTool, lspRefsTool } from './lsp/index.js'
import { todoTool } from './todo/index.js'
import { tokenCountTool } from './tokens/index.js'
import { listSessionsTool, searchSessionsTool } from './sessions/index.js'
import type { Tool } from '@nekocode/core/tools/types'

export const ALL_TOOLS: Tool<never>[] = [
  bashTool,
  readFileTool,
  editFileTool,
  writeFileTool,
  treeTool,
  globTool,
  grepTool,
  webFetchTool,
  webSearchTool,
  lspDiagnosticsTool,
  lspRefsTool,
  todoTool,
  tokenCountTool,
  listSessionsTool,
  searchSessionsTool,
]
