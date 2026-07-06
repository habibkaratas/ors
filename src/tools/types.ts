import type { CancellationToken } from "vscode";
import type { TodoItem } from "../shared/protocol";
import type { ProcessManager } from "../services/processManager";
import type { MemoryStore } from "../services/memoryStore";
import type { ProjectMemoryStore } from "../services/projectMemoryStore";

export interface DiagnosticEntry {
  severity: "error" | "warning" | "info";
  source?: string;
  message: string;
  file: string;
  line: number;
}

export type ToolCategory = "read" | "search" | "list" | "write" | "command";

export interface ToolResult {
  ok: boolean;
  content: string;
  detail?: string;
}

export interface ApprovalPreview {
  title: string;
  kind: "diff" | "command" | "text";
  text: string;
}

export interface FileChange {
  absPath: string;
  original: string | null;
  proposed: string;
}

export interface ToolContext {
  workspaceRoot: string;
  resolvePath(rel: string): string;
  recordCheckpoint?(absPath: string, before: string | null): void;
  onTodos?(items: TodoItem[]): void;
  background?: ProcessManager;
  memory?: MemoryStore;
  projectMemory?: ProjectMemoryStore;
  getDiagnostics?(absPath?: string): DiagnosticEntry[];
  runInTerminal?(command: string, terminalName?: string): void;
  ollamaBaseUrl?: string;
  visionModel?: string;
  spawnSubAgent?(
    task: string,
    toolNames: string[],
    token: CancellationToken
  ): Promise<string>;
  askUser?(title: string, options: string[]): Promise<string>;
  setAgentMode?(mode: "plan" | "act"): void;
  lspExecute?(
    command: string,
    filePath: string,
    line: number,
    character: number,
    extra?: unknown
  ): Promise<unknown>;
  lspApplyRename?(
    filePath: string,
    line: number,
    character: number,
    newName: string
  ): Promise<string>;
  setWorktreeRoot?(path: string | null): void;
}

export interface Tool {
  name: string;
  category: ToolCategory;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  summarize(args: Record<string, unknown>): string;
  preview?(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ApprovalPreview>;
  previewChange?(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<FileChange | undefined>;
  invoke(
    args: Record<string, unknown>,
    ctx: ToolContext,
    token: CancellationToken
  ): Promise<ToolResult>;
}
