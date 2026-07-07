import type { Tool, ToolResult } from "./types";

export const askUserTool: Tool = {
  name: "ask_user",
  category: "list",
  description:
    "Görev ortasında durur ve kullanıcıya çoklu-seçenekli yapılandırılmış soru sorar. " +
    "Kullanıcı bir seçenek seçene kadar ajan döngüsü bekler (max 60 saniye). " +
    "Belirsizlik çözme, tercih öğrenme veya kritik karar onayı için kullan. " +
    "Opsiyonlar kısa ve açık olmalı; en fazla 6 seçenek önerilir.",
  parameters: {
    type: "object",
    properties: {
      title:   { type: "string", description: "Kullanıcıya gösterilecek soru metni." },
      options: {
        type: "array",
        items: { type: "string" },
        description: "Seçenek listesi (en az 2, en fazla 6 önerilir).",
      },
    },
    required: ["title", "options"],
  },
  summarize: (a) => `Kullanıcı sorusu: ${String(a.title ?? "").slice(0, 60)}`,

  async invoke(args, ctx): Promise<ToolResult> {
    if (!ctx.askUser) {
      return { ok: false, content: "ask_user bu ortamda desteklenmiyor." };
    }
    const title = String(args.title ?? "").trim();
    const options = Array.isArray(args.options)
      ? (args.options as unknown[]).map(String).filter(Boolean)
      : [];
    if (!title) return { ok: false, content: "title zorunludur." };
    if (options.length < 2) return { ok: false, content: "En az 2 seçenek gerekli." };

    const answer = await ctx.askUser(title, options);
    if (!answer) {
      return { ok: false, content: "Kullanıcı yanıt vermedi (zaman aşımı veya iptal)." };
    }
    return { ok: true, content: `Kullanıcının seçimi: ${answer}`, detail: answer };
  },
};
