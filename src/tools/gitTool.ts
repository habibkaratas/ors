import { execFile } from "child_process";
import type { Tool, ToolContext, ToolResult } from "./types";

const MAX_OUTPUT_CHARS = 20_000;
const TIMEOUT_MS = 30_000;

const SAFE_SUBCMDS = new Set([
  "status",
  "log",
  "diff",
  "show",
  "describe",
  "rev-parse",
  "shortlog",
  "blame",
  "ls-files",
  "ls-tree",
  "cat-file",
  "grep",
  "count-objects",
  "verify-commit",
  "notes",
]);

const RESTRICTED: Record<string, string[]> = {
  branch: ["", "-v", "--list", "--all", "-a", "-r", "--show-current"],
  tag: ["", "-l", "--list", "--contains", "--sort"],
  stash: ["list", "show"],
  remote: ["-v", "--verbose", "show", "get-url"],
  config: ["--list", "--get", "-l"],
  fetch: ["--dry-run"],
};

function hasDangerousArg(parts: string[]): boolean {
  return parts.slice(1).some((raw) => {
    if (raw.startsWith("-O")) return true;
    const t = raw.toLowerCase();
    return (
      t.startsWith("--open-files-in-pager") ||
      t.startsWith("--output")
    );
  });
}

function isSafeArgs(args: string): boolean {
  const trimmed = args.trim();
  if (!trimmed) return false;

  const parts = trimmed.split(/\s+/);
  const sub = parts[0].toLowerCase();
  const rest = parts.slice(1).join(" ").trim();

  if (hasDangerousArg(parts)) return false;

  if (SAFE_SUBCMDS.has(sub)) return true;

  if (sub in RESTRICTED) {
    const allowed = RESTRICTED[sub];
    if (allowed.length === 0) return true;
    return allowed.some((prefix) => rest === prefix || rest.startsWith(prefix + " ") || rest === "");
  }

  return false;
}

export const gitTool: Tool = {
  name: "git_run",
  category: "read",
  description:
    "Çalışma ağacını DEĞİŞTİRMEYEN salt-okunur git komutlarını çalıştırır: " +
    "status, log, diff, show, branch -v, blame, ls-files, stash list, remote -v, vb. " +
    "Commit, push, checkout, reset gibi mutasyon komutları için run_command kullan.",
  parameters: {
    type: "object",
    required: ["args"],
    properties: {
      args: {
        type: "string",
        description:
          "Git alt komutu ve argümanları (örn. 'log --oneline -10', 'diff HEAD', 'status').",
      },
      cwd: {
        type: "string",
        description:
          "Çalışma dizini. Belirtilmezse workspaceRoot kullanılır.",
      },
    },
  },
  summarize: (a) => `git ${String(a.args ?? "").slice(0, 50)}`,

  async invoke(args, ctx: ToolContext): Promise<ToolResult> {
    const rawArgs = String(args.args ?? "").trim();
    if (!rawArgs) {
      return { ok: false, content: "args zorunludur." };
    }

    if (!isSafeArgs(rawArgs)) {
      return {
        ok: false,
        content:
          `'git ${rawArgs}' mutasyon içerebilecek bir komut. ` +
          `Bunu çalıştırmak için run_command aracını kullan.`,
      };
    }

    let cwd: string;
    try {
      cwd = args.cwd
        ? ctx.resolvePath(String(args.cwd))
        : String(ctx.workspaceRoot ?? "").trim() || process.cwd();
    } catch (e) {
      return { ok: false, content: (e as Error).message };
    }
    const gitArgs = rawArgs.split(/\s+/);

    return await new Promise<ToolResult>((resolve) => {
      execFile("git", gitArgs, { cwd, timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT_CHARS * 2 }, (err, stdout, stderr) => {
        const output = (stdout + (stderr ? `\n[stderr]\n${stderr}` : "")).slice(0, MAX_OUTPUT_CHARS);

        if (err && !stdout) {
          resolve({
            ok: false,
            content: `git ${rawArgs}: ${err.message}${stderr ? `\n${stderr.slice(0, 500)}` : ""}`,
          });
          return;
        }

        resolve({
          ok: true,
          content: output || "(çıktı yok)",
          detail: `git ${rawArgs}`,
        });
      });
    });
  },
};
