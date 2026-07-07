import type { Tool, ToolResult } from "./types";

export const spawnAgentTool: Tool = {
  name: "spawn_agent",
  category: "command",
  description:
    "Belirli bir alt-görevi bağımsız bir alt-ajan ile çalıştırır ve sonucu döndürür. " +
    "Uzun veya bölünebilir görevler için kullan. " +
    "Alt-ajan tüm araçlara sahiptir; 'tools' ile kısıtlanabilir. " +
    "Örnek: farklı dosya kümelerini aynı anda düzenleme.",
  parameters: {
    type: "object",
    properties: {
      task: {
        type: "string",
        description: "Alt-ajana verilecek görev açıklaması (tam ve bağımsız olmalı).",
      },
      tools: {
        type: "string",
        description:
          "Kullanılacak araç isimleri virgülle ayrılmış (opsiyonel). " +
          "Ör: 'read_file,write_file,run_command'. Verilmezse tüm araçlar kullanılır.",
      },
    },
    required: ["task"],
  },
  summarize: (a) => `Alt-ajan: ${String(a.task ?? "").slice(0, 50)}…`,
  async invoke(args, ctx, token): Promise<ToolResult> {
    if (!ctx.spawnSubAgent) {
      return { ok: false, content: "Alt-ajan bu ortamda desteklenmiyor." };
    }
    const task = String(args.task ?? "").trim();
    if (!task) return { ok: false, content: "task boş." };
    const toolNames = args.tools
      ? String(args.tools)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    try {
      const result = await ctx.spawnSubAgent(task, toolNames, token);
      return {
        ok: true,
        content: result || "(alt-ajan çıktı üretmedi)",
        detail: "alt-ajan",
      };
    } catch (e) {
      return { ok: false, content: `Alt-ajan hatası: ${(e as Error).message}` };
    }
  },
};
