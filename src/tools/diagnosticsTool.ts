import type { Tool, ToolResult } from "./types";

export const getDiagnosticsTool: Tool = {
  name: "get_diagnostics",
  category: "read",
  description:
    "VSCode'un lint/compiler tanılama mesajlarını (hata, uyarı) okur. " +
    "TypeScript derleme hataları, ESLint uyarıları, Python hataları vb. için kullan. " +
    "path verilmezse tüm workspace'in sorunlarını döndürür.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Belirli bir dosyanın yolu (opsiyonel; verilmezse workspace geneli).",
      },
      severity: {
        type: "string",
        enum: ["error", "warning", "all"],
        description: "'error' yalnızca hatalar, 'warning' yalnızca uyarılar, 'all' hepsi (varsayılan).",
      },
    },
    required: [],
  },
  summarize: (a) => (a.path ? `Tanılama: ${a.path}` : "Workspace tanılamaları"),
  async invoke(args, ctx): Promise<ToolResult> {
    if (!ctx.getDiagnostics) {
      return { ok: false, content: "Tanılama API bu ortamda mevcut değil." };
    }
    const severity = String(args.severity ?? "all") as "error" | "warning" | "all";
    let absPath: string | undefined;
    if (args.path) {
      try {
        absPath = ctx.resolvePath(String(args.path));
      } catch (e) {
        return { ok: false, content: (e as Error).message };
      }
    }
    const entries = ctx.getDiagnostics(absPath);
    const filtered = entries.filter((e) => {
      if (severity === "error") return e.severity === "error";
      if (severity === "warning") return e.severity === "warning";
      return true;
    });
    if (filtered.length === 0) {
      return { ok: true, content: "Tanılama yok — temiz.", detail: "0 sorun" };
    }
    const lines = filtered.map((e) => {
      const sev = e.severity === "error" ? "HATA" : e.severity === "warning" ? "UYARI" : "BİLGİ";
      const src = e.source ? `[${e.source}] ` : "";
      return `${sev} ${src}${e.file}:${e.line}: ${e.message}`;
    });
    return {
      ok: true,
      content: lines.join("\n"),
      detail: `${filtered.length} sorun`,
    };
  },
};
