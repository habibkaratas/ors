import type { Tool, ToolResult } from "./types";

export const projectMemoryTool: Tool = {
  name: "project_memory",
  category: "list",
  description:
    "Bu projeye özel kalıcı hafızayı yönetir (aktif workspace için). " +
    "action='remember' ile projeye dair kalıcı bir gerçek ekle (konvansiyon, mimari karar, önemli yol/komut). " +
    "action='summary' ile projeyi tek satırda özetle. " +
    "action='list' ile bu projenin kayıtlı hafızasını gör. " +
    "action='forget' ile index'e göre bir gerçeği sil. action='clear' ile bu projenin hafızasını temizle. " +
    "Kayıtlar sonraki oturumların başında otomatik hatırlanır — kalıcı öğrendiklerini buraya yaz.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["remember", "summary", "list", "forget", "clear"],
        description: "Yapılacak işlem.",
      },
      text: {
        type: "string",
        description: "action='remember' için gerçek, action='summary' için tek satır özet.",
      },
      index: { type: "number", description: "action='forget' için silinecek gerçeğin index'i (0-tabanlı)." },
    },
    required: ["action"],
  },
  summarize: (a) => `Proje hafızası: ${a.action}`,
  async invoke(args, ctx): Promise<ToolResult> {
    if (!ctx.projectMemory) return { ok: false, content: "Proje hafızası servisi mevcut değil." };
    const root = ctx.workspaceRoot;
    const action = String(args.action);

    if (action === "remember") {
      const text = String(args.text ?? "").trim();
      if (!text) return { ok: false, content: "Eklenecek gerçek boş." };
      const added = ctx.projectMemory.addFact(root, text);
      return added
        ? { ok: true, content: `Proje hafızasına eklendi: "${text}"`, detail: "eklendi" }
        : { ok: true, content: "Bu gerçek zaten kayıtlı.", detail: "yinelenen" };
    }

    if (action === "summary") {
      const text = String(args.text ?? "").trim();
      if (!text) return { ok: false, content: "Özet boş." };
      ctx.projectMemory.setSummary(root, text);
      return { ok: true, content: `Proje özeti ayarlandı: "${text}"`, detail: "özet" };
    }

    if (action === "forget") {
      const idx = Number(args.index);
      const ok = ctx.projectMemory.removeFact(root, idx);
      return ok
        ? { ok: true, content: `Gerçek silindi (index ${idx}).`, detail: "silindi" }
        : { ok: false, content: `Geçersiz index: ${args.index}` };
    }

    if (action === "clear") {
      ctx.projectMemory.clear(root);
      return { ok: true, content: "Bu projenin hafızası temizlendi.", detail: "temizlendi" };
    }

    const mem = ctx.projectMemory.get(root);
    if (!mem || (!mem.summary && mem.facts.length === 0)) {
      return { ok: true, content: "Bu proje için hafıza boş.", detail: "boş" };
    }
    const parts: string[] = [];
    if (mem.summary) parts.push(`Özet: ${mem.summary}`);
    if (mem.facts.length) {
      parts.push(mem.facts.map((f, i) => `${i}. ${f}`).join("\n"));
    }
    return { ok: true, content: parts.join("\n"), detail: `${mem.facts.length} gerçek` };
  },
};
