import { spawn } from "child_process";
import type { ApprovalPreview, Tool, ToolResult } from "./types";
import { buildSafeEnv } from "./safeEnv";
import { treeKill } from "./procKill";

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT = 30_000;

export const sshRunTool: Tool = {
  name: "ssh_run",
  category: "command",
  description:
    "Uzak bir makinada SSH ile komut çalıştırır ve çıktısını döndürür. host, ~/.ssh/config'deki bir takma ad veya user@host olabilir. Anahtar-tabanlı kimlik doğrulama gerekir (parola sorusu olan sunucular çalışmaz). Sunucu kurulumu, docker, servis yönetimi vb. için kullan.",
  parameters: {
    type: "object",
    properties: {
      host: { type: "string", description: "Hedef: 'user@host', IP, ya da ssh config takma adı." },
      command: { type: "string", description: "Uzak makinada çalıştırılacak komut." },
      timeout_ms: { type: "number", description: `Zaman aşımı (ms). Varsayılan ${DEFAULT_TIMEOUT_MS}.` },
    },
    required: ["host", "command"],
  },
  summarize: (a) => `SSH ${a.host}: ${String(a.command).slice(0, 50)}`,
  async preview(args): Promise<ApprovalPreview> {
    return {
      title: `SSH ile çalıştırılsın mı? (${args.host})`,
      kind: "command",
      text: `ssh ${args.host} "${args.command}"`,
    };
  },
  async invoke(args, ctx, token): Promise<ToolResult> {
    const host = String(args.host ?? "").trim();
    const command = String(args.command ?? "").trim();
    if (!host || !command) return { ok: false, content: "host ve command gerekli." };
    if (host.startsWith("-")) {
      return { ok: false, content: "Geçersiz host: '-' ile başlayamaz (seçenek enjeksiyonu)." };
    }
    const timeout = typeof args.timeout_ms === "number" ? args.timeout_ms : DEFAULT_TIMEOUT_MS;

    const sshArgs = [
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      `ConnectTimeout=15`,
      "--",
      host,
      command,
    ];

    return await new Promise<ToolResult>((resolve) => {
      const child = spawn("ssh", sshArgs, { cwd: ctx.workspaceRoot, env: buildSafeEnv() });
      let out = "";
      let killed = false;
      const append = (d: Buffer) => {
        if (out.length < MAX_OUTPUT) out += d.toString();
      };
      child.stdout.on("data", append);
      child.stderr.on("data", append);
      const timer = setTimeout(() => {
        killed = true;
        treeKill(child);
      }, timeout);
      const sub = token.onCancellationRequested(() => {
        killed = true;
        treeKill(child);
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        sub.dispose();
        resolve({
          ok: false,
          content: `ssh başlatılamadı: ${err.message}. Sistemde 'ssh' istemcisi kurulu mu?`,
        });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        sub.dispose();
        const text = out.slice(0, MAX_OUTPUT);
        if (killed) {
          resolve({ ok: false, content: `SSH durduruldu (zaman aşımı/iptal).\n${text}`, detail: "durduruldu" });
          return;
        }
        resolve({
          ok: code === 0,
          content: `ssh ${host} (çıkış kodu ${code}):\n${text || "(çıktı yok)"}`,
          detail: `çıkış kodu ${code}`,
        });
      });
    });
  },
};
