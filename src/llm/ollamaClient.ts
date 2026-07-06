import type {
  ChatOptions,
  ChatResult,
  LLMClient,
  ToolCall,
} from "./types";

export class OllamaClient implements LLMClient {
  private idCounter = 0;
  private readonly capCache = new Map<string, string[]>();

  constructor(private readonly getBaseUrl: () => string) {}

  private async capabilities(model: string): Promise<string[]> {
    if (!model) return [];
    const cached = this.capCache.get(model);
    if (cached) return cached;
    try {
      const res = await fetch(`${this.base()}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      if (res.ok) {
        const data = (await res.json()) as { capabilities?: string[] };
        const caps = Array.isArray(data.capabilities) ? data.capabilities : [];
        this.capCache.set(model, caps);
        return caps;
      }
    } catch {
    }
    return [];
  }

  private base(): string {
    return this.getBaseUrl().replace(/\/+$/, "");
  }

  async chat(opts: ChatOptions): Promise<ChatResult> {
    const controller = new AbortController();
    const sub = opts.token?.onCancellationRequested(() => controller.abort());

    const caps = await this.capabilities(opts.model);
    const knownNoTools = caps.length > 0 && !caps.includes("tools");
    let includeTools = opts.tools.length > 0 && !knownNoTools;

    const doFetch = () =>
      fetch(`${this.base()}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: opts.model,
          messages: opts.messages.map(toWireMessage),
          tools: includeTools ? opts.tools : undefined,
          stream: true,
          keep_alive: "5m",
          options: {
            temperature: opts.temperature,
            num_ctx: opts.numCtx,
          },
        }),
      });

    let res: Response;
    try {
      res = await doFetch();
    } catch (err) {
      sub?.dispose();
      if (controller.signal.aborted) {
        throw new CancelledError();
      }
      throw new Error(
        `Ollama'ya bağlanılamadı (${this.base()}). Ollama çalışıyor mu? ` +
          `Ayrıntı: ${(err as Error).message}`
      );
    }

    if (!res.ok && res.status === 400 && includeTools) {
      const body = await res.text().catch(() => "");
      if (/does not support tools/i.test(body)) {
        this.capCache.set(opts.model, caps.length ? caps.filter((c) => c !== "tools") : ["completion"]);
        includeTools = false;
        try {
          res = await doFetch();
        } catch (err) {
          sub?.dispose();
          if (controller.signal.aborted) throw new CancelledError();
          throw new Error(
            `Ollama'ya bağlanılamadı (${this.base()}). Ayrıntı: ${(err as Error).message}`
          );
        }
      }
    }

    if (!res.ok) {
      sub?.dispose();
      const body = await res.text().catch(() => "");
      throw new Error(
        `Ollama /api/chat ${res.status} döndürdü. ${body.slice(0, 400)}`
      );
    }
    if (!res.body) {
      sub?.dispose();
      throw new Error("Ollama yanıtında gövde yok.");
    }

    try {
      return await this.streamChat(res, opts, controller);
    } catch (err) {
      if (
        err instanceof ToolsUnsupportedError &&
        includeTools &&
        !controller.signal.aborted
      ) {
        this.capCache.set(opts.model, caps.length ? caps.filter((c) => c !== "tools") : ["completion"]);
        includeTools = false;
        let retryRes: Response;
        try {
          retryRes = await doFetch();
        } catch (e) {
          sub?.dispose();
          if (controller.signal.aborted) throw new CancelledError();
          throw new Error(`Ollama'ya bağlanılamadı (${this.base()}). Ayrıntı: ${(e as Error).message}`);
        }
        if (!retryRes.ok || !retryRes.body) {
          sub?.dispose();
          throw new Error(`Ollama /api/chat ${retryRes.status} (araçsız yeniden deneme).`);
        }
        return await this.streamChat(retryRes, opts, controller);
      }
      throw err;
    } finally {
      sub?.dispose();
    }
  }

  private async streamChat(
    res: Response,
    opts: ChatOptions,
    controller: AbortController
  ): Promise<ChatResult> {
    const chunks: string[] = [];
    const toolCalls: ToolCall[] = [];
    for await (const line of readNdjson(res.body!)) {
      if (opts.token?.isCancellationRequested) {
        controller.abort();
        throw new CancelledError();
      }
      let chunk: OllamaChatChunk;
      try {
        chunk = JSON.parse(line);
      } catch {
        continue;
      }
      if (chunk.error) {
        if (/does not support tools/i.test(chunk.error)) {
          throw new ToolsUnsupportedError();
        }
        throw new Error(`Ollama: ${chunk.error}`);
      }
      const msg = chunk.message;
      if (msg?.content) {
        chunks.push(msg.content);
        opts.onToken?.(msg.content);
      }
      if (msg?.tool_calls?.length) {
        for (const tc of msg.tool_calls) {
          toolCalls.push({
            id: `call_${++this.idCounter}`,
            name: tc.function?.name ?? "",
            arguments: normalizeArgs(tc.function?.arguments),
          });
        }
      }
      if (chunk.done) {
        break;
      }
    }
    return { content: chunks.join(""), toolCalls };
  }

  async listModels(): Promise<string[]> {
    const res = await fetch(`${this.base()}/api/tags`);
    if (!res.ok) {
      throw new Error(`Ollama /api/tags ${res.status}`);
    }
    const data = (await res.json()) as { models?: { name: string }[] };
    return (data.models ?? []).map((m) => m.name).sort();
  }

  async supportsTools(model: string): Promise<boolean> {
    return (await this.capabilities(model)).includes("tools");
  }

  async supportsVision(model: string): Promise<boolean> {
    return (await this.capabilities(model)).includes("vision");
  }
}

export class CancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "CancelledError";
  }
}

class ToolsUnsupportedError extends Error {
  constructor() {
    super("tools-unsupported");
    this.name = "ToolsUnsupportedError";
  }
}

function toWireMessage(m: import("./types").ChatMessage): Record<string, unknown> {
  const wire: Record<string, unknown> = { role: m.role, content: m.content };
  if (m.images?.length) {
    wire.images = m.images.map((img) =>
      typeof img === "string" && img.startsWith("data:")
        ? img.replace(/^data:[^;]+;base64,/, "")
        : img
    );
  }
  if (m.tool_name) wire.tool_name = m.tool_name;
  if (m.tool_calls?.length) {
    wire.tool_calls = m.tool_calls.map((tc) => ({
      function: { name: tc.name, arguments: tc.arguments },
    }));
  }
  return wire;
}

interface OllamaChatChunk {
  message?: {
    role: string;
    content?: string;
    tool_calls?: {
      function?: { name?: string; arguments?: unknown };
    }[];
  };
  done?: boolean;
  error?: string;
}

function normalizeArgs(args: unknown): Record<string, unknown> {
  if (args && typeof args === "object") {
    return args as Record<string, unknown>;
  }
  if (typeof args === "string") {
    try {
      return JSON.parse(args);
    } catch {
      return {};
    }
  }
  return {};
}

async function* readNdjson(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) {
          yield line;
        }
      }
    }
    const rest = buffer.trim();
    if (rest) {
      yield rest;
    }
  } finally {
    reader.releaseLock();
  }
}
