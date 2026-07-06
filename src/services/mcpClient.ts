import { spawn, ChildProcess } from "child_process";
import { buildSafeEnv } from "../tools/safeEnv";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}
interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface MCPToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export class MCPClient {
  private proc: ChildProcess | null = null;
  private seq = 0;
  private readonly pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private buffer = "";
  private stderrTail = "";
  public serverName = "";
  public tools: MCPToolDef[] = [];

  constructor(
    private readonly command: string,
    private readonly cmdArgs: string[]
  ) {}

  async connect(): Promise<void> {
    this.proc = spawn(this.command, this.cmdArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      env: buildSafeEnv(),
      shell: false,
    });

    this.proc.stdout!.on("data", (d: Buffer) => {
      this.buffer += d.toString();
      let nl: number;
      while ((nl = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, nl).trim();
        this.buffer = this.buffer.slice(nl + 1);
        if (line) this.handleLine(line);
      }
    });

    this.proc.stderr?.on("data", (d: Buffer) => {
      this.stderrTail = (this.stderrTail + d.toString()).slice(-2000);
    });

    this.proc.on("error", (e) => {
      for (const p of this.pending.values()) p.reject(e);
      this.pending.clear();
    });

    this.proc.on("close", (code) => {
      const detail = this.stderrTail.trim();
      const err = new Error(
        `MCP sunucu süreci sonlandı (kod ${code}).` +
          (detail ? ` stderr: ${detail.slice(-500)}` : "")
      );
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
      this.proc = null;
    });

    const init = await this.call<{ serverInfo?: { name?: string } }>(
      "initialize",
      {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "ors", version: "0.1.0" },
      }
    );
    this.serverName = init?.serverInfo?.name ?? this.command;

    this.notify("notifications/initialized", {});

    const toolsRes = await this.call<{ tools?: MCPToolDef[] }>("tools/list", {});
    this.tools = toolsRes?.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const res = await this.call<{
      content?: { type: string; text?: string }[];
      isError?: boolean;
    }>("tools/call", { name, arguments: args });
    const text = (res?.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");
    if (res?.isError) {
      throw new Error(text || "MCP aracı hata döndürdü.");
    }
    return text;
  }

  disconnect(): void {
    this.proc?.kill();
    this.proc = null;
    for (const p of this.pending.values()) {
      p.reject(new Error("MCP bağlantısı kapatıldı."));
    }
    this.pending.clear();
  }

  private handleLine(line: string): void {
    try {
      const msg = JSON.parse(line) as JsonRpcResponse;
      if (msg.id === undefined) return;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) {
        p.reject(new Error(`MCP ${msg.error.code}: ${msg.error.message}`));
      } else {
        p.resolve(msg.result);
      }
    } catch { }
  }

  private call<T>(method: string, params: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      });
      this.proc?.stdin?.write(JSON.stringify(req) + "\n");
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP zaman aşımı: ${method}`));
        }
      }, 30_000);
    });
  }

  private notify(method: string, params: unknown): void {
    const msg = { jsonrpc: "2.0", method, params };
    this.proc?.stdin?.write(JSON.stringify(msg) + "\n");
  }
}
