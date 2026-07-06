import type { Tool, ToolResult } from "./types";

export const enterPlanModeTool: Tool = {
  name: "enter_plan_mode",
  category: "list",
  description:
    "Ajanı plan moduna geçirir. Plan modunda yalnızca okuma araçları (read_file, " +
    "search, glob, list_dir, get_diagnostics vb.) aktiftir; " +
    "dosya yazma ve komut çalıştırma engellenir. " +
    "Görev karmaşıksa önce keşif yap ve plan sun, onay sonrası exit_plan_mode ile " +
    "act moduna geç ve uygulamaya başla.",
  parameters: {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Plan moduna geçiş gerekçesi — kullanıcıya bilgi olarak gösterilir (opsiyonel).",
      },
    },
    required: [],
  },
  summarize: (a) =>
    a.reason ? `Plan moduna geç: ${String(a.reason).slice(0, 60)}` : "Plan moduna geç",

  async invoke(args, ctx): Promise<ToolResult> {
    if (!ctx.setAgentMode) {
      return { ok: false, content: "Mod değiştirme bu ortamda desteklenmiyor." };
    }
    ctx.setAgentMode("plan");
    const reason = args.reason ? ` Gerekçe: ${args.reason}` : "";
    return {
      ok: true,
      content:
        `Plan moduna geçildi.${reason}\n` +
        "Artık yalnızca okuma araçları kullanabilirsin. " +
        "Kodu/projeyi keşfet, planını kullanıcıya sun, " +
        "onaylanınca exit_plan_mode ile act moduna dön.",
    };
  },
};

export const exitPlanModeTool: Tool = {
  name: "exit_plan_mode",
  category: "write",
  description:
    "Plan modundan çıkar ve act moduna geçer. Kullanıcı onayı gerektirir. " +
    "Plan hazırlandıktan sonra çağır; onay gelince dosya yazmaya ve komut " +
    "çalıştırmaya başlayabilirsin.",
  parameters: {
    type: "object",
    properties: {
      plan_summary: {
        type: "string",
        description:
          "Onay ekranında kullanıcıya gösterilecek kısa plan özeti. " +
          "Ne yapılacağını, hangi dosyaların değiştirileceğini özetle.",
      },
    },
    required: ["plan_summary"],
  },
  summarize: (a) =>
    `Act moduna geç: ${String(a.plan_summary ?? "").slice(0, 60)}`,

  preview: async (args) => ({
    title: "Ajan plan modundan çıkıp uygulamaya geçmek istiyor",
    kind: "text" as const,
    text: String(args.plan_summary ?? "(plan özeti verilmedi)"),
  }),

  async invoke(args, ctx): Promise<ToolResult> {
    if (!ctx.setAgentMode) {
      return { ok: false, content: "Mod değiştirme bu ortamda desteklenmiyor." };
    }
    if (!args.plan_summary || String(args.plan_summary).trim() === "") {
      return { ok: false, content: "plan_summary zorunludur: kullanıcıya gösterilecek plan özetini gir." };
    }
    ctx.setAgentMode("act");
    return {
      ok: true,
      content:
        "Act moduna geçildi. " +
        "Artık dosya yazabilir ve komut çalıştırabilirsin.",
    };
  },
};
