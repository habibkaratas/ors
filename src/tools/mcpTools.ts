import type { Tool, ToolResult } from "./types";
import type { MCPClient } from "../services/mcpClient";

export function makeMcpTools(clients: Map<string, MCPClient>): Tool[] {
  return [
    {
      name: "connect_mcp",
      category: "command",
      description:
        "Bir MCP (Model Context Protocol) sunucusuna stdio üzerinden bağlanır. " +
        "MCP sunucusu bir CLI süreci olabilir (ör. `npx @modelcontextprotocol/server-filesystem /path`). " +
        "Bağlandıktan sonra call_mcp_tool ile araçlarını kullanabilirsin.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Bu bağlantıya verilecek takma ad (sonraki çağrılarda referans).",
          },
          command: {
            type: "string",
            description: "Çalıştırılacak MCP sunucu komutu.",
          },
          args: {
            type: "array",
            items: { type: "string" },
            description: "Komut argümanları (opsiyonel).",
          },
        },
        required: ["name", "command"],
      },
      summarize: (a) => `MCP bağlan: ${a.command}`,
      preview: async (args) => ({
        title: `MCP sunucu başlat`,
        kind: "command" as const,
        text: `${args.command} ${(args.args as string[] | undefined ?? []).join(" ")}`.trim(),
      }),
      async invoke(args): Promise<ToolResult> {
        const name = String(args.name ?? "").trim();
        const command = String(args.command ?? "").trim();
        const cmdArgs = Array.isArray(args.args) ? (args.args as unknown[]).map(String) : [];
        if (!name || !command) {
          return { ok: false, content: "name ve command gerekli." };
        }
        clients.get(name)?.disconnect();
        const { MCPClient: Cls } = await import("../services/mcpClient");
        const client = new Cls(command, cmdArgs);
        try {
          await client.connect();
          clients.set(name, client);
          const toolNames = client.tools.map((t) => t.name).join(", ") || "yok";
          return {
            ok: true,
            content:
              `MCP sunucusuna bağlanıldı: ${client.serverName}\n` +
              `Araçlar: ${toolNames}`,
            detail: `${client.tools.length} araç`,
          };
        } catch (e) {
          return { ok: false, content: `MCP bağlantı hatası: ${(e as Error).message}` };
        }
      },
    },

    {
      name: "call_mcp_tool",
      category: "command",
      description:
        "Bağlı bir MCP sunucusundaki aracı çağırır. " +
        "Önce connect_mcp ile bağlanın; ardından list_mcp_tools ile araç adlarını görün.",
      parameters: {
        type: "object",
        properties: {
          server: { type: "string", description: "connect_mcp'deki takma ad." },
          tool: { type: "string", description: "Çağrılacak araç adı." },
          args: {
            type: "object",
            description: "Araç argümanları (araç şemasına göre).",
          },
        },
        required: ["server", "tool"],
      },
      summarize: (a) => `MCP: ${a.server}.${a.tool}`,
      preview: async (args) => ({
        title: `MCP araç: ${args.server}.${args.tool}`,
        kind: "text" as const,
        text: JSON.stringify(args.args ?? {}, null, 2),
      }),
      async invoke(args): Promise<ToolResult> {
        const serverName = String(args.server ?? "");
        const toolName = String(args.tool ?? "");
        const toolArgs = (args.args ?? {}) as Record<string, unknown>;
        const client = clients.get(serverName);
        if (!client) {
          return {
            ok: false,
            content:
              `'${serverName}' adında bağlı MCP sunucusu yok. ` +
              `Önce connect_mcp çalıştırın.`,
          };
        }
        try {
          const result = await client.callTool(toolName, toolArgs);
          return {
            ok: true,
            content: result || "(boş MCP yanıtı)",
            detail: "mcp",
          };
        } catch (e) {
          return { ok: false, content: `MCP araç hatası: ${(e as Error).message}` };
        }
      },
    },

    {
      name: "list_mcp_tools",
      category: "list",
      description:
        "Bağlı tüm MCP sunucularını ve her birinin araçlarını listeler.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
      summarize: () => "MCP araç listesi",
      async invoke(): Promise<ToolResult> {
        if (clients.size === 0) {
          return {
            ok: true,
            content: "Bağlı MCP sunucusu yok. connect_mcp ile bağlanın.",
            detail: "0 sunucu",
          };
        }
        const lines: string[] = [];
        for (const [name, client] of clients) {
          lines.push(`## ${name} (${client.serverName})`);
          for (const t of client.tools) {
            lines.push(`  - **${t.name}**: ${t.description}`);
          }
        }
        return {
          ok: true,
          content: lines.join("\n"),
          detail: `${clients.size} sunucu`,
        };
      },
    },
  ];
}
