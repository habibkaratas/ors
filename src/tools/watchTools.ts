import * as fs from "fs";
import { runShellCapture } from "./shellRun";
import type { Tool, ToolResult } from "./types";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const watchFileTool: Tool = {
  name: "watch_file",
  category: "read",
  description:
    "Bir dosyayı izler; yeni içerik eklenince (tail -f gibi) döner. " +
    "condition regex verilirse yalnızca eşleşen yeni içerik gelince durur. " +
    "Derleme çıktısı, log dosyaları, CI sonuçları için kullan. " +
    "max_seconds aşılırsa hata döner.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "İzlenecek dosyanın yolu.",
      },
      max_seconds: {
        type: "number",
        description: "Maksimum bekleme süresi (saniye, varsayılan 30, max 120).",
      },
      condition: {
        type: "string",
        description: "Yeni içerikle eşleşmesi gereken regex koşulu (opsiyonel).",
      },
    },
    required: ["path"],
  },
  summarize: (a) => `Dosya izle: ${a.path}`,

  async invoke(args, ctx, token): Promise<ToolResult> {
    let absPath: string;
    try {
      absPath = ctx.resolvePath(String(args.path));
    } catch (e) {
      return { ok: false, content: (e as Error).message };
    }

    const maxMs = Math.min(Number(args.max_seconds ?? 30), 120) * 1000;
    const condStr = args.condition ? String(args.condition) : null;
    let condition: RegExp | null = null;
    if (condStr) {
      try { condition = new RegExp(condStr); }
      catch { return { ok: false, content: `Geçersiz regex: ${condStr}` }; }
    }

    let initial = "";
    try {
      if (fs.existsSync(absPath)) initial = fs.readFileSync(absPath, "utf8");
    } catch { }

    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline && !token.isCancellationRequested) {
      await sleep(500);
      try {
        if (!fs.existsSync(absPath)) continue;
        const current = fs.readFileSync(absPath, "utf8");
        if (current.length <= initial.length) continue;
        const newContent = current.slice(initial.length);
        if (!condition || condition.test(newContent)) {
          const snippet = newContent.length > 4096
            ? "…" + newContent.slice(-4096)
            : newContent;
          return {
            ok: true,
            content: snippet,
            detail: `${newContent.length} yeni bayt`,
          };
        }
      } catch { }
    }

    return {
      ok: false,
      content: `Zaman aşımı (${Number(args.max_seconds ?? 30)}s): koşul karşılanmadı.`,
    };
  },
};

export const pollUntilTool: Tool = {
  name: "poll_until",
  category: "command",
  description:
    "Bir komutu belirli aralıklarla çalıştırır; çıktısı beklenen regex koşulunu " +
    "karşılayana kadar tekrar eder. " +
    "Servis hazır-kontrol (port açıldı mı?), CI sonucu bekleme, " +
    "derleme tamamlanma izleme için kullan.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Periyodik olarak çalıştırılacak kabuk komutu.",
      },
      condition: {
        type: "string",
        description: "Çıktıda aranacak regex koşulu; eşleşince araç döner.",
      },
      interval_seconds: {
        type: "number",
        description: "Denemeler arası bekleme süresi (saniye, varsayılan 5).",
      },
      max_seconds: {
        type: "number",
        description: "Toplam maksimum bekleme süresi (saniye, varsayılan 60, max 300).",
      },
    },
    required: ["command", "condition"],
  },
  summarize: (a) => `Poll: ${String(a.command ?? "").slice(0, 50)}`,

  async invoke(args, ctx, token): Promise<ToolResult> {
    const command = String(args.command ?? "").trim();
    const condStr = String(args.condition ?? "").trim();
    if (!command) return { ok: false, content: "command zorunludur." };
    if (!condStr)  return { ok: false, content: "condition zorunludur." };

    let condition: RegExp;
    try { condition = new RegExp(condStr); }
    catch { return { ok: false, content: `Geçersiz regex: ${condStr}` }; }

    const intervalMs = Math.max(1000, Number(args.interval_seconds ?? 5) * 1000);
    const maxMs = Math.min(300_000, Number(args.max_seconds ?? 60) * 1000);

    const deadline = Date.now() + maxMs;
    let attempts = 0;
    let lastOutput = "";

    while (Date.now() < deadline && !token.isCancellationRequested) {
      attempts++;
      const r = await runShellCapture(command, {
        cwd: ctx.workspaceRoot,
        timeoutMs: Math.min(intervalMs, 30_000),
        maxChars: 10_000,
        token,
      });
      lastOutput = r.output;

      if (condition.test(lastOutput)) {
        return {
          ok: true,
          content: lastOutput,
          detail: `${attempts} denemede koşul karşılandı`,
        };
      }

      const remaining = deadline - Date.now();
      if (remaining > 0 && !token.isCancellationRequested) {
        await sleep(Math.min(intervalMs, remaining));
      }
    }

    return {
      ok: false,
      content:
        `Zaman aşımı: ${attempts} denemede '${condStr}' koşulu karşılanmadı.\n` +
        `Son çıktı:\n${lastOutput.slice(-2000)}`,
    };
  },
};
