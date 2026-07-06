import type { ApprovalPreview, Tool, ToolResult } from "./types";
import { runShellCapture } from "./shellRun";

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 30_000;

export const runCommandTool: Tool = {
  name: "run_command",
  category: "command",
  description:
    "Workspace kökünde bir shell komutu çalıştırır ve stdout/stderr + çıkış kodunu döndürür. Testler, build, git, paket kurulumu vb. için kullan. Uzun süren/etkileşimli komutlardan kaçın.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Çalıştırılacak shell komutu." },
      timeout_ms: {
        type: "number",
        description: `Zaman aşımı (ms). Varsayılan ${DEFAULT_TIMEOUT_MS}.`,
      },
    },
    required: ["command"],
  },
  summarize: (a) => String(a.command ?? ""),
  async preview(args): Promise<ApprovalPreview> {
    return {
      title: "Komut çalıştırılsın mı?",
      kind: "command",
      text: String(args.command ?? ""),
    };
  },
  async invoke(args, ctx, token): Promise<ToolResult> {
    const command = String(args.command ?? "").trim();
    if (!command) {
      return { ok: false, content: "Boş komut." };
    }
    const timeout =
      typeof args.timeout_ms === "number" ? args.timeout_ms : DEFAULT_TIMEOUT_MS;

    const r = await runShellCapture(command, {
      cwd: ctx.workspaceRoot,
      timeoutMs: timeout,
      maxChars: MAX_OUTPUT_CHARS,
      token,
    });
    if (r.error) {
      return { ok: false, content: `Komut başlatılamadı: ${r.error}` };
    }
    const text = r.output + (r.truncated ? "\n… (çıktı kırpıldı)" : "");
    if (r.killed) {
      return {
        ok: false,
        content: `Komut durduruldu (zaman aşımı/iptal).\n${text}`,
        detail: "durduruldu",
      };
    }
    const header = `$ ${command}\n(çıkış kodu: ${r.code})\n`;
    const outText = r.output.trim() || "(çıktı yok)";
    const detailPreview = outText.length > 400 ? outText.slice(0, 400) + "…" : outText;
    return {
      ok: r.code === 0,
      content: header + (r.output || "(çıktı yok)"),
      detail: detailPreview,
    };
  },
};
