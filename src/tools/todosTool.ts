import type { TodoItem } from "../shared/protocol";
import type { Tool, ToolResult } from "./types";

export const todosTool: Tool = {
  name: "manage_todos",
  category: "list",
  description:
    "Çok adımlı bir görevi planlamak ve ilerlemeyi takip etmek için yapılacaklar listesini oluşturur/günceller. Her çağrıda TÜM listeyi gönder; tek seferde yalnızca bir öğe 'in_progress' olmalı. Karmaşık görevlerin başında listeyi kur, adım bitince güncelle.",
  parameters: {
    type: "object",
    properties: {
      todos: {
        type: "array",
        description: "Görev öğeleri listesi.",
        items: {
          type: "object",
          properties: {
            content: { type: "string", description: "Görev açıklaması." },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed"],
              description: "Öğe durumu.",
            },
          },
          required: ["content", "status"],
        },
      },
    },
    required: ["todos"],
  },
  summarize: () => "Görev listesi güncelleniyor",
  async invoke(args, ctx): Promise<ToolResult> {
    const raw = Array.isArray(args.todos) ? args.todos : [];
    const items: TodoItem[] = raw
      .map((t: any) => ({
        content: String(t?.content ?? "").trim(),
        status: normalizeStatus(t?.status),
      }))
      .filter((t) => t.content.length > 0);
    ctx.onTodos?.(items);
    const done = items.filter((t) => t.status === "completed").length;
    return {
      ok: true,
      content: `Görev listesi güncellendi (${done}/${items.length} tamamlandı).`,
      detail: `${done}/${items.length}`,
    };
  },
};

function normalizeStatus(s: unknown): TodoItem["status"] {
  return s === "in_progress" || s === "completed" ? s : "pending";
}
