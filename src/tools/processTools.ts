import type { ApprovalPreview, Tool, ToolResult } from "./types";

export const startProcessTool: Tool = {
  name: "start_process",
  category: "command",
  description:
    "Uzun süren/bloklayan bir komutu ARKA PLANDA başlatır ve bir süreç id döndürür (ör. 'npm run dev', 'docker compose up', 'python -m http.server'). Çıktısını check_process ile izle, stop_process ile durdur. Kısa/tek seferlik komutlar için run_command kullan.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Arka planda çalıştırılacak komut." },
    },
    required: ["command"],
  },
  summarize: (a) => `Arka plan: ${String(a.command).slice(0, 60)}`,
  async preview(args): Promise<ApprovalPreview> {
    return { title: "Arka planda başlatılsın mı?", kind: "command", text: String(args.command ?? "") };
  },
  async invoke(args, ctx): Promise<ToolResult> {
    if (!ctx.background) return { ok: false, content: "Arka plan yöneticisi mevcut değil." };
    const command = String(args.command ?? "").trim();
    if (!command) return { ok: false, content: "Boş komut." };
    const { id } = ctx.background.start(command, ctx.workspaceRoot);
    return {
      ok: true,
      content: `Arka planda başlatıldı. Süreç id: ${id}. Çıktıyı check_process("${id}") ile izle.`,
      detail: id,
    };
  },
};

export const checkProcessTool: Tool = {
  name: "check_process",
  category: "read",
  description: "Bir arka plan sürecinin çalışıp çalışmadığını ve o ana kadarki çıktısını döndürür.",
  parameters: {
    type: "object",
    properties: { id: { type: "string", description: "start_process'in döndürdüğü süreç id." } },
    required: ["id"],
  },
  summarize: (a) => `Kontrol: ${a.id}`,
  async invoke(args, ctx): Promise<ToolResult> {
    if (!ctx.background) return { ok: false, content: "Arka plan yöneticisi mevcut değil." };
    const r = ctx.background.check(String(args.id));
    if (!r.found) return { ok: false, content: `Süreç bulunamadı: ${args.id}` };
    const status = r.running ? "çalışıyor" : `bitti (çıkış kodu ${r.code})`;
    return {
      ok: true,
      content: `Durum: ${status}\n--- çıktı ---\n${r.output || "(çıktı yok)"}`,
      detail: status,
    };
  },
};

export const stopProcessTool: Tool = {
  name: "stop_process",
  category: "command",
  description: "Bir arka plan sürecini durdurur (öldürür).",
  parameters: {
    type: "object",
    properties: { id: { type: "string", description: "Durdurulacak süreç id." } },
    required: ["id"],
  },
  summarize: (a) => `Durdur: ${a.id}`,
  async preview(args): Promise<ApprovalPreview> {
    return { title: "Süreç durdurulsun mu?", kind: "text", text: `Süreç: ${args.id}` };
  },
  async invoke(args, ctx): Promise<ToolResult> {
    if (!ctx.background) return { ok: false, content: "Arka plan yöneticisi mevcut değil." };
    const ok = ctx.background.stop(String(args.id));
    return ok
      ? { ok: true, content: `Durduruldu: ${args.id}`, detail: "durduruldu" }
      : { ok: false, content: `Süreç bulunamadı: ${args.id}` };
  },
};
