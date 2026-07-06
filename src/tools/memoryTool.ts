import type { Tool, ToolResult } from "./types";

export const memoryTool: Tool = {
  name: "manage_memory",
  category: "list",
  description:
    "Kalıcı hafızayı yönetir (projeler-arası). action='add' ile kalıcı bir not ekle (kullanıcı tercihi, önemli karar, sık kullanılan yol/host). action='list' ile mevcut notları gör. action='remove' ile index'e göre sil. Kalıcı notlar sonraki oturumlarda da hatırlanır.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["add", "list", "remove"], description: "Yapılacak işlem." },
      text: { type: "string", description: "action='add' için saklanacak not." },
      index: { type: "number", description: "action='remove' için silinecek notun index'i (0-tabanlı)." },
    },
    required: ["action"],
  },
  summarize: (a) => `Hafıza: ${a.action}`,
  async invoke(args, ctx): Promise<ToolResult> {
    if (!ctx.memory) return { ok: false, content: "Hafıza servisi mevcut değil." };
    const action = String(args.action);
    if (action === "add") {
      const text = String(args.text ?? "").trim();
      if (!text) return { ok: false, content: "Eklenecek not boş." };
      ctx.memory.add(text);
      return { ok: true, content: `Hafızaya eklendi: "${text}"`, detail: "eklendi" };
    }
    if (action === "remove") {
      const idx = Number(args.index);
      const ok = ctx.memory.remove(idx);
      return ok
        ? { ok: true, content: `Not silindi (index ${idx}).`, detail: "silindi" }
        : { ok: false, content: `Geçersiz index: ${args.index}` };
    }
    const items = ctx.memory.list();
    if (items.length === 0) return { ok: true, content: "Hafıza boş.", detail: "0 not" };
    return {
      ok: true,
      content: items.map((m, i) => `${i}. ${m}`).join("\n"),
      detail: `${items.length} not`,
    };
  },
};
