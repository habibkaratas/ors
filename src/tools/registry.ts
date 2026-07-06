import type { ToolSpec } from "../llm/types";
import type { Tool } from "./types";
import type { AgentMode } from "../shared/protocol";
import { readFileTool, writeFileTool, editFileTool, listDirTool } from "./fsTools";
import { searchTool } from "./searchTool";
import { globTool } from "./globTool";
import { runCommandTool } from "./commandTool";
import { todosTool } from "./todosTool";
import { startProcessTool, checkProcessTool, stopProcessTool } from "./processTools";
import { sshRunTool } from "./sshTool";
import { webFetchTool, webSearchTool } from "./webTools";
import { memoryTool } from "./memoryTool";
import { projectMemoryTool } from "./projectMemoryTool";
import { getDiagnosticsTool } from "./diagnosticsTool";
import { runInTerminalTool } from "./terminalTool";
import { describeImageTool } from "./imageTool";
import { readPdfTool } from "./pdfTool";
import { spawnAgentTool } from "./subAgentTool";
import { askUserTool } from "./askUserTool";
import { enterPlanModeTool, exitPlanModeTool } from "./planModeTools";
import {
  lspGoToDefinitionTool,
  lspFindReferencesTool,
  lspHoverTool,
  lspRenameSymbolTool,
} from "./lspTools";
import { enterWorktreeTool, exitWorktreeTool } from "./worktreeTools";
import { watchFileTool, pollUntilTool } from "./watchTools";
import { gitTool } from "./gitTool";
import type { MCPClient } from "../services/mcpClient";
import type { TaskScheduler } from "../services/taskScheduler";
import { makeMcpTools } from "./mcpTools";
import { makeSchedulerTools } from "./schedulerTools";

const READ_ONLY: ReadonlySet<string> = new Set(["read", "search", "list"]);

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  constructor(tools: Tool[]) {
    for (const t of tools) {
      this.tools.set(t.name, t);
    }
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  all(): Tool[] {
    return [...this.tools.values()];
  }

  forMode(mode: AgentMode): Tool[] {
    if (mode === "plan") return this.all().filter((t) => READ_ONLY.has(t.category));
    return this.all();
  }

  specs(tools: Tool[] = this.all()): ToolSpec[] {
    return tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }
}

export function defaultTools(): Tool[] {
  return [
    readFileTool,
    writeFileTool,
    editFileTool,
    listDirTool,
    searchTool,
    globTool,
    gitTool,
    runCommandTool,
    runInTerminalTool,
    startProcessTool,
    checkProcessTool,
    stopProcessTool,
    sshRunTool,
    webSearchTool,
    webFetchTool,
    describeImageTool,
    readPdfTool,
    getDiagnosticsTool,
    spawnAgentTool,
    askUserTool,
    enterPlanModeTool,
    exitPlanModeTool,
    lspGoToDefinitionTool,
    lspFindReferencesTool,
    lspHoverTool,
    lspRenameSymbolTool,
    enterWorktreeTool,
    exitWorktreeTool,
    watchFileTool,
    pollUntilTool,
    memoryTool,
    projectMemoryTool,
    todosTool,
  ];
}

export function buildDynamicTools(
  mcpClients: Map<string, MCPClient>,
  scheduler: TaskScheduler
): Tool[] {
  return [
    ...makeMcpTools(mcpClients),
    ...makeSchedulerTools(scheduler),
  ];
}
