import type { CancellationToken } from "vscode";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: string[];
  tool_calls?: ToolCall[];
  tool_name?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  temperature: number;
  numCtx: number;
  onToken?: (text: string) => void;
  token?: CancellationToken;
}

export interface LLMClient {
  chat(opts: ChatOptions): Promise<ChatResult>;
  listModels(): Promise<string[]>;
  supportsTools(model: string): Promise<boolean>;
  supportsVision(model: string): Promise<boolean>;
}
