import type { ApprovalPreview } from "../tools/types";
import type { AgentMode } from "../shared/protocol";

export interface AgentEvents {
  status(state: "idle" | "thinking" | "running"): void;
  assistantStart(): void;
  assistantToken(text: string): void;
  assistantEnd(): void;
  assistantDiscard(): void;
  toolStart(id: string, name: string, summary: string): void;
  toolEnd(id: string, ok: boolean, detail: string): void;
  info(text: string): void;
  error(text: string): void;
}

export interface ApprovalGate {
  request(
    tool: string,
    args: Record<string, unknown>,
    preview: ApprovalPreview
  ): Promise<boolean>;
}

export interface AgentConfig {
  model: string;
  temperature: number;
  numCtx: number;
  maxIterations: number;
  autoApprove: Record<string, boolean>;
  mode: AgentMode;
  commandAllowlist: string[];
  commandDenylist: string[];
}
